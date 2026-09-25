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
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { istFristpflichtig } from "@/lib/dokument-fristen";
import { nachweiseAbgegeben } from "@/lib/onboarding-spuren";
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
import { SAMMELARTEN, type AuswahlEintrag, type EmpfaengerVorschlag } from "@/lib/unterlagen";
import type { UnterlagenModulBaustein, UnterlagenVorgang } from "@/lib/unterlagen-dienst";

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

function verfuegbar(v: OnboardingUnterlagenVorgang): { ok: true } | { ok: false; grund: string } {
  if (v.eingestellt) return { ok: false, grund: ONBOARDING_NICHT_VERFUEGBAR.VORGANG_EINGESTELLT };
  if (!nachweiseAbgegeben(v)) return { ok: false, grund: ONBOARDING_NICHT_VERFUEGBAR.FRAGEBOGEN_OFFEN };
  return { ok: true };
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
  portalPfad: (id) => `/dashboard/${id}`,
  apiBasis: (id) => `/api/onboarding/${id}/unterlagen`,
};
