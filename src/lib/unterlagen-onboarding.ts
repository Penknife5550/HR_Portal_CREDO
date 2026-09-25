/**
 * CREDO HR-Portal – Unterlagen nachfordern: Baustein ONBOARDING (Paket 4, nur Server)
 *
 * Alles, was an der Nachforderung NUR das Onboarding betrifft, steht hier —
 * der Dienst (src/lib/unterlagen-dienst.ts) und die reinen Regeln
 * (src/lib/unterlagen.ts) sind modulneutral. Stufe 2 legt je Vorgangsart einen
 * Baustein nach derselben Schnittstelle an (`UnterlagenModulBaustein`,
 * Feinplanung docs/module/onboarding/paket4-feinplanung.md, Abschnitt 7);
 * Vorbild ist die Aufteilung der Abteilungsaufgaben
 * (abteilungsaufgaben-onboarding.ts neben dem gemeinsamen Dienst).
 *
 * Die Regeln des Onboardings:
 *   - **Verfuegbar** ist die Nachforderung, sobald die Nachweise der Person
 *     „abgegeben" sind (`nachweiseAbgegeben`: Fragebogen abgesendet, oder
 *     REVIEWED/COMPLETED bei Bestandsakten) UND der Vorgang nicht EXPIRED ist
 *     (EP-3). `nachweiseAbgegeben` bleibt bei EXPIRED wahr — deshalb die
 *     zweite Bedingung. Auch nach dem Abschluss laesst sich nachfordern (P:1446).
 *   - **Sperre des Vorgangs:** `updateMany … status not EXPIRED`. Setzt HR
 *     gleichzeitig EXPIRED, gewinnt das sauber (0 Treffer → 409).
 *   - **Empfaenger:** zuerst `OnboardingProcess.email` (die Adresse im Vorgang,
 *     immer erlaubt). Ist eine Personalakte verknuepft und ihre
 *     `Employee.email` weicht ab, kommt sie als zweiter Vorschlag — NUR als
 *     Vorschlag, fuer den Server ist sie eine abweichende Adresse wie jede
 *     andere (Abschnitt 17, KO-K10).
 *   - **Auswahl:** vorgeschlagen sind die offenen Nachweise (`offeneNachweise`,
 *     dieselbe Rechnung wie der Kasten „Offene Nachweise"), darunter alle
 *     uebrigen Arten des Katalogs ohne `SONSTIGES`. Sensible Arten nur, wenn
 *     `sensibelAnforderbar` sie zulaesst (Abschnitt 11, E-1), Schriftform nach
 *     `SCHRIFTFORM_DOKUMENTTYPEN` (E-4), Ablaufdatum nach `istFristpflichtig`.
 *   - **Datensparsamkeit:** Die Aktionen laden den Vorgang mit eigenem
 *     `select`. Die Uebersicht nimmt die Zeile, die `GET /api/onboarding/[id]`
 *     ohnehin geladen hat — die noch verschluesselte, nie die entschluesselte
 *     Kopie —, und liest daraus nur `OnboardingUnterlagenQuelle`. Aus dem
 *     Fragebogen kommen nur die Angaben, aus denen sich die Pflichten ergeben,
 *     und der Name.
 *   - **Uebernahme beim Annehmen (4.4):** je Datei ein `Document` des
 *     Vorgangs, Status APPROVED (EP-7) mit `reviewedAt`/`reviewedById`, Pfad
 *     relativ `uploads/<onboardingId>/<dateiId>.<ext>`, Name = Anzeigename
 *     (Endung = erkannter Typ). Art: Katalogzeile ihre Art; freie Zeile die
 *     gewaehlte, sonst SONSTIGES — eine sensible nur, wenn `sensibelAnforderbar`
 *     sie zulaesst (Abschnitt 11), NIE still auf eine andere Art zurueck. Ein
 *     Ablaufdatum bzw. „unbefristet" (Z1) nur bei `istFristpflichtig`, geprueft
 *     mit `pruefeGueltigBis`. `PersonalData` (etwa `rvAntragEingangAm`) und
 *     die Checkliste fasst die Uebernahme nie an.
 */

import type { DocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ablaufKalendertag, istFristpflichtig, pruefeGueltigBis } from "@/lib/dokument-fristen";
import { nachweiseAbgegeben, type MitarbeiterSpur } from "@/lib/onboarding-spuren";
import {
  documentTypeLabel,
  effektivePflichtDokumente,
  NACHFORDERUNG_HINWEISE,
  offeneNachweise,
  pflichtDokumenteAusVorlage,
  pflichtEingabenAusVorgang,
  SCHRIFTFORM_DOKUMENTTYPEN,
  SELECTABLE_DOCUMENT_TYPES,
  SENSIBLE_DOKUMENTTYPEN,
  sensibelAnforderbar,
  type PflichtEingaben,
} from "@/lib/required-documents";
import { MELDUNGEN, SAMMELARTEN, type AuswahlEintrag, type EmpfaengerVorschlag } from "@/lib/unterlagen";
import type {
  AnnahmeEingabe,
  AnnahmePruefung,
  UebernahmeErgebnis,
  UebernahmeKontext,
  UnterlagenModulBaustein,
  UnterlagenVorgang,
} from "@/lib/unterlagen-dienst";

// =============================================
// Vorgang laden
// =============================================

/**
 * Was die Nachforderung vom Onboarding-Vorgang braucht — und nicht mehr.
 * Bewusst NICHT: Tokens, Bankverbindung, SV-Nummer, Steuer-ID, Verguetung,
 * Kostenstellen, die Modalitaeten der Fuehrungskraft. Von den Kindern nur die
 * IDs (fuer die Anzahl), wie die Vorgangsansicht sie als Liste hat.
 */
const ONBOARDING_UNTERLAGEN_AUSWAHL = {
  id: true,
  displayId: true,
  organizationId: true,
  status: true,
  email: true,
  firstName: true,
  lastName: true,
  submittedAt: true,
  questionnaireType: true,
  organization: { select: { name: true, type: true } },
  employee: { select: { email: true } },
  personalData: {
    select: {
      firstName: true,
      lastName: true,
      isComplete: true,
      birthDate: true,
      rvEntscheidung: true,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: true,
      severelyDisabled: true,
      children: { select: { id: true } },
    },
  },
  documents: { select: { type: true } },
} satisfies Prisma.OnboardingProcessSelect;

/**
 * Was `onboardingUnterlagenVorgang` vom Vorgang liest — erfuellt von der Zeile
 * aus `vorgangLaden` (eigenes select, oben) ebenso wie von der schon geladenen
 * Zeile der Vorgangsansicht (`GET /api/onboarding/[id]`). So laedt die
 * Uebersicht den Vorgang und die Formularvorlage nicht ein zweites Mal.
 * `employee` fehlt in der Zeile der Vorgangsansicht; die Adresse der
 * Personalakte laedt dann `onboardingVorgangAusAnsicht` nach.
 */
export interface OnboardingUnterlagenQuelle {
  id: string;
  displayId: string | null;
  organizationId: string;
  status: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  submittedAt: Date | null;
  organization: { name: string; type: string | null } | null;
  employee?: { email: string | null } | null;
  personalData: {
    firstName: string | null;
    lastName: string | null;
    isComplete: boolean | null;
    birthDate: Date | null;
    rvEntscheidung: string | null;
    aufenthaltstitelErforderlich: boolean | null;
    healthInsuranceType: string | null;
    severelyDisabled: boolean | null;
    children: readonly unknown[];
  } | null;
  documents: ReadonlyArray<{ type: string }>;
}

/** Der Onboarding-Vorgang, wie Dienst und Baustein ihn sehen. */
export interface OnboardingUnterlagenVorgang extends UnterlagenVorgang {
  modul: "ONBOARDING";
  /** Die Spur der Person (Tor `nachweiseAbgegeben`). */
  submittedAt: Date | null;
  personalData: { isComplete: boolean | null } | null;
  /** `Organization.type` — entscheidet ueber Masernschutz und Fuehrungszeugnis bei Kitas. */
  organisationstyp: string | null;
  /** `Employee.email` der verknuepften Personalakte (zweiter Vorschlag), sonst null. */
  personalakteEmail: string | null;
  /** Die Eingaben, aus denen sich die Pflichten ergeben (`pflichtEingabenAusVorgang`). */
  pflicht: PflichtEingaben;
  /** Die Typen ALLER Dokumente des Vorgangs, gleich in welchem Status (wie der Kasten). */
  vorhandeneTypen: string[];
  /** `PersonalData.severelyDisabled` — der SB-Ausweis nur mit dieser Angabe (E-1). */
  severelyDisabled: boolean | null;
}

function nameTeil(wert: string | null | undefined): string | null {
  return wert?.trim() || null;
}

/**
 * Bildet die geladene Zeile auf den Vorgang ab (rein). Der Name kommt wie
 * ueberall zuerst aus dem Fragebogen, sonst vom Vorgang (`mitarbeiterName`),
 * und nie aus der Adresse.
 */
export function onboardingUnterlagenVorgang(
  zeile: OnboardingUnterlagenQuelle,
  requiredDocuments: readonly string[],
): OnboardingUnterlagenVorgang {
  const pd = zeile.personalData;
  const ausFragebogen = !!(nameTeil(pd?.firstName) || nameTeil(pd?.lastName));
  return {
    modul: "ONBOARDING",
    id: zeile.id,
    organizationId: zeile.organizationId,
    displayId: zeile.displayId ?? null,
    status: zeile.status,
    einrichtung: zeile.organization?.name ?? "",
    vorname: ausFragebogen ? nameTeil(pd?.firstName) : nameTeil(zeile.firstName),
    nachname: ausFragebogen ? nameTeil(pd?.lastName) : nameTeil(zeile.lastName),
    email: zeile.email.trim(),
    eingestellt: zeile.status === "EXPIRED",
    submittedAt: zeile.submittedAt ?? null,
    personalData: pd ? { isComplete: pd.isComplete ?? null } : null,
    organisationstyp: zeile.organization?.type ?? null,
    personalakteEmail: nameTeil(zeile.employee?.email),
    pflicht: pflichtEingabenAusVorgang({
      required: requiredDocuments,
      anzahlKinder: pd?.children?.length ?? 0,
      organisationstyp: zeile.organization?.type,
      personalData: pd,
    }),
    vorhandeneTypen: (zeile.documents ?? []).map((d) => d.type),
    severelyDisabled: pd?.severelyDisabled ?? null,
  };
}

async function vorgangLaden(id: string): Promise<OnboardingUnterlagenVorgang | null> {
  const zeile = await prisma.onboardingProcess.findUnique({
    where: { id },
    select: ONBOARDING_UNTERLAGEN_AUSWAHL,
  });
  if (!zeile) return null;
  // Dieselbe Pflichtliste wie Fragebogen und Vorgangsansicht: die AKTUELLE
  // Vorlage samt Rueckfall ohne Vorlage (pflichtDokumenteAusVorlage).
  const vorlage = await prisma.formTemplate.findUnique({
    where: { questionnaireType: zeile.questionnaireType },
    select: { requiredDocuments: true },
  });
  return onboardingUnterlagenVorgang(zeile, pflichtDokumenteAusVorlage(vorlage));
}

/**
 * Der Vorgang fuer die Uebersicht in `GET /api/onboarding/[id]` — aus der
 * Zeile, die die Route ohnehin geladen hat, und ihrer Pflichtliste. Die
 * Adresse der Personalakte (zweiter Adressvorschlag) braucht nur der Dialog;
 * sie wird deshalb nur mit Bearbeitungsrecht nachgeladen (`mitPersonalakte`)
 * und steht nie in der Antwort fuer Rollen, die nur lesen.
 */
export async function onboardingVorgangAusAnsicht(
  zeile: OnboardingUnterlagenQuelle & { employeeId: string | null },
  requiredDocuments: readonly string[],
  mitPersonalakte: boolean,
): Promise<OnboardingUnterlagenVorgang> {
  const employee =
    mitPersonalakte && zeile.employeeId
      ? await prisma.employee.findUnique({ where: { id: zeile.employeeId }, select: { email: true } })
      : null;
  return onboardingUnterlagenVorgang({ ...zeile, employee }, requiredDocuments);
}

// =============================================
// Regeln
// =============================================

/** Warum „Unterlagen nachfordern…" (noch) nicht geht — im Klartext fuer Karte und 409. */
export const ONBOARDING_NICHT_VERFUEGBAR = {
  FRAGEBOGEN_OFFEN:
    "Unterlagen lassen sich nachfordern, sobald die Person ihren Personalfragebogen abgesendet hat. Bis dahin lädt sie ihre Nachweise dort selbst hoch.",
  VORGANG_EINGESTELLT:
    "Der Vorgang ist abgelaufen und wird nicht mehr bearbeitet. Unterlagen lassen sich nicht mehr nachfordern.",
} as const;

/** Die Arten des Onboarding-Katalogs, die sich anfordern lassen: alle Dokumenttypen ohne Sammelart. */
export const ONBOARDING_KATALOG: readonly string[] = SELECTABLE_DOCUMENT_TYPES.filter(
  (t) => !SAMMELARTEN.includes(t),
);

/**
 * Warum sich fuer diesen Vorgang (noch) nichts nachfordern laesst, oder null.
 * DIE Regel hinter `verfuegbar` — auch fuer Aufrufer ohne vollstaendigen
 * Vorgang: Der Lauf `dokument-ablauf` waehlt damit den Satz seiner HR-Mail
 * (`ONBOARDING_NACHFORDERUNG_GESPERRT_MAIL`), statt auf einen Knopf zu
 * verweisen, den das Portal fuer diesen Vorgang gar nicht anbietet.
 */
export function onboardingNachforderungGesperrt(
  v: MitarbeiterSpur,
): keyof typeof ONBOARDING_NICHT_VERFUEGBAR | null {
  if (v.status === "EXPIRED") return "VORGANG_EINGESTELLT";
  if (!nachweiseAbgegeben(v)) return "FRAGEBOGEN_OFFEN";
  return null;
}

/**
 * Der Satz der HR-Mails `dokument-ablauf-warnung`/`dokument-abgelaufen`
 * (`{{nachforderung_hinweis}}`), wenn „Unterlagen nachfordern" fuer den
 * Vorgang gesperrt ist — statt der Handlungsanweisung Z3.
 */
export const ONBOARDING_NACHFORDERUNG_GESPERRT_MAIL: Readonly<Record<keyof typeof ONBOARDING_NICHT_VERFUEGBAR, string>> = {
  FRAGEBOGEN_OFFEN:
    "Die Person hat ihren Personalfragebogen noch nicht abgesendet: Den Nachweis lädt sie dort selbst hoch, mit seinem Ablaufdatum. „Unterlagen nachfordern“ steht erst danach bereit.",
  VORGANG_EINGESTELLT:
    "Der Vorgang ist abgelaufen und wird nicht mehr bearbeitet – über „Unterlagen nachfordern“ lässt sich dort nichts mehr anfordern. Ist die Person weiterhin beschäftigt, klären Sie den Nachweis bitte direkt mit ihr.",
};

function verfuegbar(v: OnboardingUnterlagenVorgang): { ok: true } | { ok: false; grund: string } {
  const gesperrt = onboardingNachforderungGesperrt(v);
  return gesperrt ? { ok: false, grund: ONBOARDING_NICHT_VERFUEGBAR[gesperrt] } : { ok: true };
}

/**
 * Sperrt die Zeile des Vorgangs bis zum Ende der Transaktion — aber nur, wenn
 * er nicht EXPIRED ist. `false` heisst: HR hat ihn gerade eingestellt (oder es
 * gibt ihn nicht mehr); der Dienst antwortet dann 409 und schreibt nichts.
 * Muster: `letztenArbeitstagSperren` (abteilungsaufgaben-dienst.ts).
 */
async function vorgangSperren(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  const gesperrt = await tx.onboardingProcess.updateMany({
    where: { id, status: { not: "EXPIRED" } },
    data: { updatedAt: new Date() },
  });
  return gesperrt.count > 0;
}

function empfaengerVorschlaege(v: OnboardingUnterlagenVorgang): EmpfaengerVorschlag[] {
  const vorschlaege: EmpfaengerVorschlag[] = [{ adresse: v.email, quelle: "VORGANG" }];
  const akte = v.personalakteEmail;
  if (akte && akte.toLowerCase() !== v.email.toLowerCase()) {
    vorschlaege.push({ adresse: akte, quelle: "PERSONALAKTE" });
  }
  return vorschlaege;
}

/**
 * Die waehlbaren Arten im Dialog (10.1): zuerst die offenen Nachweise
 * (vorgeschlagen, vorangekreuzt), dann alle uebrigen Arten des Katalogs in
 * seiner Reihenfolge. Jede Art sagt, ob sie sensibel ist und ob sie
 * angefordert werden darf — dieselbe Antwort, mit der der Server beim
 * Anfordern und Ergaenzen 409 gibt.
 */
function auswahl(v: OnboardingUnterlagenVorgang): AuswahlEintrag[] {
  const pflicht = effektivePflichtDokumente(v.pflicht);
  const vorgeschlagen = offeneNachweise(v.pflicht, v.vorhandeneTypen).filter((t) => ONBOARDING_KATALOG.includes(t));
  const reihenfolge = [...vorgeschlagen, ...ONBOARDING_KATALOG.filter((t) => !vorgeschlagen.includes(t))];
  return reihenfolge.map((typ): AuswahlEintrag => {
    const sensibel = sensibelAnforderbar(typ, {
      pflicht,
      vorhanden: v.vorhandeneTypen,
      severelyDisabled: v.severelyDisabled,
      organisationstyp: v.organisationstyp,
    });
    return {
      typ,
      label: documentTypeLabel(typ),
      vorgeschlagen: vorgeschlagen.includes(typ),
      sensibel: SENSIBLE_DOKUMENTTYPEN.includes(typ),
      erlaubt: sensibel.ok,
      grund: sensibel.ok ? null : sensibel.text,
      originalErforderlich: SCHRIFTFORM_DOKUMENTTYPEN.includes(typ),
      fristpflichtig: istFristpflichtig(typ),
      hinweis: NACHFORDERUNG_HINWEISE[typ] ?? null,
    };
  });
}

// =============================================
// Annehmen und Annahme zuruecknehmen (Schritt 6, 4.4 und 4.5)
// =============================================

/** Die Art, unter der eine frei benannte Zeile ohne Wahl uebernommen wird (4.4). */
export const ONBOARDING_STANDARDART = "SONSTIGES";

/**
 * Art und Ablauf der Uebernahme (4.4, Z1) — dieselbe Pruefung vor jedem
 * Schreiben, rein bis auf die Uhr (`jetzt`):
 *
 * - **Katalogzeile:** ihre Art. Eine andere Art im Body ist ein Bedienfehler
 *   (400), keine stille Umdeutung.
 * - **Freie Zeile:** die gewaehlte Art, sonst SONSTIGES. Nur Arten des
 *   Katalogs (sonst 400). Eine sensible Art nur, wenn der Vorgang sie zulaesst
 *   (`auswahl`, also `sensibelAnforderbar`) — sonst 409 mit dem Grund.
 * - **Ablauf nur bei `istFristpflichtig`** (auch wenn eine freie Zeile eine
 *   fristpflichtige Art bekommt): „unbefristet" → kein Datum, Kennzeichen
 *   gesetzt; ein Datum → geprueft mit `pruefeGueltigBis` (mehr als 20 Jahre
 *   voraus → 400; ein vergangenes Datum ist erlaubt, der Dialog warnt);
 *   `null` („Datum später nachtragen") → weder Datum noch Kennzeichen; nicht
 *   angegeben → die Angabe der Person. Bei anderen Arten ergibt ein Datum
 *   oder „unbefristet" 400.
 */
function annahmePruefen(
  v: OnboardingUnterlagenVorgang,
  e: AnnahmeEingabe,
  jetzt: Date,
): AnnahmePruefung {
  let art: string;
  if (e.typ !== null) {
    if (e.dokumentTyp !== undefined && e.dokumentTyp !== e.typ) {
      return { ok: false, status: 400, grund: "ART_NICHT_WAEHLBAR", meldung: MELDUNGEN.ART_NICHT_WAEHLBAR };
    }
    art = e.typ;
  } else {
    art = e.dokumentTyp ?? ONBOARDING_STANDARDART;
    if (!(SELECTABLE_DOCUMENT_TYPES as readonly string[]).includes(art)) {
      return { ok: false, status: 400, grund: "TYP_UNBEKANNT", meldung: MELDUNGEN.TYP_UNBEKANNT };
    }
    const eintrag = auswahl(v).find((a) => a.typ === art);
    if (eintrag && !eintrag.erlaubt) {
      return {
        ok: false,
        status: 409,
        grund: "ART_NICHT_UEBERNEHMBAR",
        meldung: MELDUNGEN.ART_NICHT_UEBERNEHMBAR,
        ...(eintrag.grund ? { hinweis: eintrag.grund } : {}),
      };
    }
  }

  if (!istFristpflichtig(art)) {
    if (e.unbefristet === true) {
      return {
        ok: false,
        status: 400,
        grund: "UNBEFRISTET_OHNE_ABLAUFDATUM",
        meldung: MELDUNGEN.UNBEFRISTET_OHNE_ABLAUFDATUM,
      };
    }
    // Ein Datum an einer Art ohne Ablauf lehnt `pruefeGueltigBis` selbst ab.
    const pruefung = pruefeGueltigBis(e.gueltigBis ?? null, art, jetzt);
    if (!pruefung.ok) return { ok: false, status: 400, grund: "GUELTIG_BIS_UNGUELTIG", meldung: pruefung.fehler };
    return { ok: true, art, gueltigBis: null, unbefristet: false };
  }

  if (e.unbefristet === true) return { ok: true, art, gueltigBis: null, unbefristet: true };
  const roh = e.gueltigBis === undefined ? ablaufKalendertag(e.gueltigBisAngabe) : e.gueltigBis;
  const pruefung = pruefeGueltigBis(roh, art, jetzt);
  if (!pruefung.ok) return { ok: false, status: 400, grund: "GUELTIG_BIS_UNGUELTIG", meldung: pruefung.fehler };
  return { ok: true, art, gueltigBis: pruefung.gueltigBis, unbefristet: false };
}

/**
 * Je Datei ein `Document` (Tabelle in 4.4). `ablaufErinnert*` bleiben leer —
 * fuer den neuen Nachweis beginnt ein neuer Zyklus. `uploadedAt` ist der
 * Zeitpunkt, zu dem die Person die Datei uebermittelt hat.
 */
async function uebernehmen(tx: Prisma.TransactionClient, ctx: UebernahmeKontext): Promise<UebernahmeErgebnis> {
  const dokument = await tx.document.create({
    data: {
      onboardingId: ctx.vorgangId,
      // Geprueft in `annahmePruefen`: eine Art des Katalogs oder SONSTIGES.
      type: ctx.art as DocumentType,
      bezeichnung: ctx.bezeichnung,
      fileName: ctx.datei.anzeigeName,
      filePath: ctx.zielPfad,
      fileSize: ctx.datei.groesse,
      mimeType: ctx.datei.mimeType,
      gueltigBis: ctx.gueltigBis,
      unbefristet: ctx.unbefristet,
      ablaufErinnertAm: null,
      ablaufErinnertStufe: null,
      status: "APPROVED",
      reviewedAt: ctx.jetzt,
      reviewedById: ctx.entschiedenVonId,
      uploadedAt: ctx.datei.uebermitteltAm ?? ctx.jetzt,
    },
    select: { id: true },
  });
  return { ziel: "DOCUMENT", id: dokument.id, neuerPfad: ctx.zielPfad };
}

/** Die uebernommenen `Document`-Zeilen samt Pfad — nur solche DIESES Vorgangs. */
async function uebernahmeLaden(
  vorgangId: string,
  ids: readonly string[],
): Promise<Array<{ id: string; pfad: string | null }>> {
  const dokumente = await prisma.document.findMany({
    where: { id: { in: [...ids] }, onboardingId: vorgangId },
    select: { id: true, filePath: true },
  });
  return dokumente.map((d) => ({ id: d.id, pfad: d.filePath }));
}

/**
 * Loescht die uebernommenen `Document`-Zeilen, gebunden an den Vorgang — auch
 * wenn HR ihr Ablaufdatum inzwischen geaendert hat (E-3). Die Anzahl prueft
 * der Dienst.
 */
async function uebernahmeZuruecknehmen(
  tx: Prisma.TransactionClient,
  ctx: { vorgangId: string; ids: readonly string[] },
): Promise<number> {
  const r = await tx.document.deleteMany({ where: { id: { in: [...ctx.ids] }, onboardingId: ctx.vorgangId } });
  return r.count;
}

/**
 * Welche dieser Pfade im Vorgangsordner traegt noch ein `Document` DIESES
 * Vorgangs? Der Dienst loescht eine Kopie nur, wenn keines darauf zeigt —
 * dieselbe Frage, die der Lauf bei den Waisen stellt (4.5).
 */
async function zielPfadeVerwendet(vorgangId: string, pfade: readonly string[]): Promise<ReadonlySet<string>> {
  if (pfade.length === 0) return new Set();
  const dokumente = await prisma.document.findMany({
    where: { onboardingId: vorgangId, filePath: { in: [...pfade] } },
    select: { filePath: true },
  });
  return new Set(dokumente.map((d) => d.filePath));
}

// =============================================
// Der Baustein
// =============================================

export const onboardingBaustein: UnterlagenModulBaustein<OnboardingUnterlagenVorgang> = {
  modul: "ONBOARDING",
  vorgangLaden,
  verfuegbar,
  vorgangSperren,
  empfaengerVorschlaege,
  auswahl,
  // Stufe 2 (Mutterschutz) nennt weder Vorgangsnummer noch Unterlagen.
  mitDetails: () => true,
  bereichWhere: (id) => ({ modul: "ONBOARDING", onboardingId: id }),
  kopfDaten: (id) => ({ modul: "ONBOARDING", onboardingId: id }),
  vorgangIdAus: (bezug) => bezug.onboardingId ?? null,
  audit: (id) => ({ processType: "ONBOARDING", fk: { onboardingId: id } }),
  // Die HR-Mails („Im Portal prüfen") landen gleich im Reiter „Dokumente" bei
  // der Karte, nicht in der „Übersicht" (`reiterAusSuche` in detail-content.tsx;
  // Abweichung von Feinplanung 8.2, die `/dashboard/<id>` nennt).
  portalPfad: (id) => `/dashboard/${id}?tab=dokumente`,
  apiBasis: (id) => `/api/onboarding/${id}/unterlagen`,
  annahmePruefen,
  uebernehmen,
  uebernahmeLaden,
  uebernahmeZuruecknehmen,
  zielPfadeVerwendet,
};
