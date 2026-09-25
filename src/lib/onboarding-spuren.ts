/**
 * CREDO HR-Portal – Onboarding: zwei Spuren statt eines gemeinsamen Status
 *
 * Ein Onboarding-Vorgang hat zwei Links, die unabhaengig voneinander
 * ausgefuellt werden: den Personalfragebogen (Mitarbeiter/in, `token`) und die
 * Einstellungsmodalitaeten (Fuehrungskraft, `supervisorToken`). Frueher teilten
 * sich beide einen einzigen Vorgangsstatus, und der Modalitaeten-POST setzte
 * ihn hart auf SUPERVISOR_SUBMITTED. Sendete die Fuehrungskraft ZUERST ab, las
 * der Fragebogen-Link das als „bereits eingereicht" und sperrte — obwohl die
 * Person nichts abgesendet hatte. Der Vorgang hing dauerhaft fest.
 *
 * Seitdem gilt (Entscheidung 21.09.2026, Aenderungsplan Abschnitt 2):
 *
 *   - JEDE SPUR HAT IHREN EIGENEN ZEITSTEMPEL. `submittedAt` fuer den
 *     Fragebogen, `supervisorSubmittedAt` fuer die Modalitaeten. Zugriff und
 *     Schreibsperre eines Links haengen nur am eigenen Zeitstempel (plus den
 *     HR-Status), nie am Stand der anderen Spur.
 *   - DER STATUS IST NUR NOCH EINE ZUSAMMENFASSUNG. `gesamtStatus` leitet ihn
 *     aus den Zeitstempeln ab. Geschrieben wird er ausschliesslich ueber
 *     `statusAbgleichen` (src/lib/onboarding-status-abgleich.ts), nachdem die
 *     eigene Spur per bedingtem `updateMany` beansprucht wurde — sonst gehen
 *     zwei gleichzeitige Abgaben verloren.
 *   - HR-STATUS (REVIEWED, COMPLETED, EXPIRED) setzt nur HR. Keine
 *     Link-Aktion ueberschreibt sie, und sie sperren beide Links fuers
 *     Schreiben.
 *
 * Diese Datei ist REIN und CLIENT-SICHER: kein Prisma, kein `next/*`. Dieselben
 * Funktionen laufen in den Routen, in auth.ts, in der HR-Detailansicht und im
 * Erinnerungs-Cron. Eine JS-Kopie von `gesamtStatus` steht in
 * prisma/seed-check.js (im Container gibt es kein tsx); ein Test haelt beide
 * ueber die ganze Matrix zusammen (src/__tests__/lib/parallele-spuren-migration.test.ts).
 */

/** Alle Werte des Enums `OnboardingStatus` (prisma/schema.prisma). */
export const ONBOARDING_STATUS = [
  "INVITED",
  "IN_PROGRESS",
  "SUBMITTED",
  "SUPERVISOR_PENDING",
  "SUPERVISOR_SUBMITTED",
  "REVIEWED",
  "COMPLETED",
  "EXPIRED",
] as const;

export type OnboardingStatusWert = (typeof ONBOARDING_STATUS)[number];

/**
 * Die Status, die nur HR setzt.
 *
 * Alle Beanspruchungen (Fragebogen- und Modalitaeten-POST, Vorgesetzten-Link)
 * fuehren `status: { notIn: HR_STATUS }` im WHERE — ein Link kann einen
 * geprueften oder abgeschlossenen Vorgang also nie zurueck in einen
 * Link-Status schreiben.
 */
export const HR_STATUS = ["REVIEWED", "COMPLETED", "EXPIRED"] as const;

/**
 * Die Status, die sich aus den beiden Spuren ergeben. HR kann sie nicht von
 * Hand setzen (PATCH /api/onboarding/[id] antwortet 400) — sie waeren sofort
 * wieder falsch, weil der naechste Abgleich sie aus den Zeitstempeln neu
 * berechnet.
 */
export const LINK_STATUS = [
  "INVITED",
  "IN_PROGRESS",
  "SUBMITTED",
  "SUPERVISOR_PENDING",
  "SUPERVISOR_SUBMITTED",
] as const;

/** Zeitstempel, wie er aus Prisma (Date) oder aus einer JSON-Antwort (string) kommt. */
type Zeitpunkt = Date | string | null | undefined;

/**
 * Was die Regeln von einem Vorgang brauchen.
 *
 * Absichtlich locker typisiert: Dieselbe Funktion bekommt einen Prisma-Datensatz
 * (Date, Enum), die JSON-Antwort der Detailroute (string) und die schlanken
 * Fixtures der Tests. Fehlende Relationen zaehlen als „nicht vorhanden".
 */
export interface SpurenStand {
  status: string;
  submittedAt?: Zeitpunkt;
  supervisorSubmittedAt?: Zeitpunkt;
  supervisorToken?: string | null;
  /** Nur fuer den Hinweis „Link abgelaufen" in `pruefungNichtMoeglichGrund`. */
  supervisorTokenExpiresAt?: Zeitpunkt;
  personalData?: {
    currentStep?: number | null;
    isComplete?: boolean | null;
  } | null;
  supervisorData?: {
    isComplete?: boolean | null;
  } | null;
}

/**
 * Nur die Felder je einer Spur. Getrennt, weil Aufrufer oft nur eine Seite
 * geladen haben — der Vorgesetzten-Link etwa `personalData` nur mit den
 * Namen. Ein gemeinsamer Typ mit lauter optionalen Feldern wiese solche
 * Objekte ab („keine gemeinsamen Eigenschaften").
 */
export type MitarbeiterSpur = Pick<SpurenStand, "status" | "submittedAt" | "personalData">;
export type VorgesetztenSpur = Pick<
  SpurenStand,
  "status" | "supervisorSubmittedAt" | "supervisorData"
>;

/** Ist das ein Status, den nur HR setzt? */
export function istHrStatus(status: string): boolean {
  return (HR_STATUS as readonly string[]).includes(status);
}

/**
 * Hat die/der Mitarbeitende den Fragebogen selbst abgesendet?
 *
 * Anker ist `submittedAt`. `personalData.isComplete` ist der Altfall-Rueckfall:
 * Vor dem atomaren Absenden (Commit 611d34f) schrieb der POST erst
 * `isComplete`, dann in einem zweiten Aufruf Status und Zeitstempel. Brach er
 * dazwischen ab, stand eine abgegebene Erklaerung ohne `submittedAt` da. Ein
 * solcher Vorgang darf nicht als „offen" gelten — sonst oeffnete die Heilung
 * einen unterschriebenen Fragebogen wieder zum Bearbeiten.
 *
 * Bewusst NICHT der Status: Den konnte die Gegenspur (Modalitaeten) oder eine
 * Handkorrektur im HR-PATCH setzen, ohne dass hier je abgesendet wurde.
 */
export function mitarbeiterAbgesendet(v: MitarbeiterSpur): boolean {
  return Boolean(v.submittedAt) || v.personalData?.isComplete === true;
}

/**
 * HR-Status, bei denen der Fragebogen auch ohne Zeitstempel als abgegeben gilt:
 * die geprueften und abgeschlossenen Bestandsakten, fuer die der Kasten
 * „Offene Nachweise" gerade gebaut wurde.
 *
 * SUBMITTED, SUPERVISOR_PENDING und SUPERVISOR_SUBMITTED stehen hier NICHT:
 * Seit Fragebogen und Modalitaeten parallel laufen, konnte der Status
 * „Vorgesetzter fertig" lauten, waehrend die Person noch in Schritt 4 sass —
 * und der Kasten mahnte bei HR Nachweise an, die die Person gerade selbst
 * hochlaedt. Ein Link-Status ohne Zeitstempel ist ein festhaengender Vorgang,
 * den die Heil-Migration (ONBOARDING_PARALLELE_SPUREN_V1) zuruecksetzt.
 *
 * EXPIRED steht ebenfalls nicht hier. Das aendert am Ergebnis nur etwas fuer
 * einen Vorgang, den die Person nie abgesendet hat — und dessen Nachweise
 * mahnt niemand an.
 */
const NACHWEIS_HR_STATUS: readonly string[] = ["REVIEWED", "COMPLETED"];

/**
 * Sind die Nachweise der Person „abgegeben" — ab wann gilt eine fehlende
 * Unterlage als Luecke statt als Arbeit, die die Person gerade selbst erledigt?
 *
 * Das Tor des Kastens „Offene Nachweise" (bis Paket 4 als `ABGEGEBENE_STATUS`
 * in `detail-content.tsx`) und der Nachforderung (Paket 4, `verfuegbar`).
 * Anker ist die eigene Spur (`mitarbeiterAbgesendet`), dazu REVIEWED und
 * COMPLETED fuer Bestandsakten ohne Zeitstempel.
 *
 * **Bei EXPIRED bleibt die Antwort wahr**, wenn die Person abgesendet hatte:
 * `mitarbeiterAbgesendet` haengt nie am Status, und HR kann EXPIRED jederzeit
 * setzen, auch nach einem Abschluss. Wer eine Nachforderung bei EXPIRED
 * sperren will, prueft den Status zusaetzlich selbst — diese Funktion bleibt
 * das unveraenderte Tor des Kastens.
 */
export function nachweiseAbgegeben(v: MitarbeiterSpur): boolean {
  return mitarbeiterAbgesendet(v) || NACHWEIS_HR_STATUS.includes(v.status);
}

/**
 * Hat die Fuehrungskraft die Einstellungsmodalitaeten selbst abgesendet?
 *
 * Anker ist `supervisorSubmittedAt`, Rueckfall `supervisorData.isComplete` —
 * derselbe Altfall wie oben: Der Modalitaeten-POST schrieb beides bis 09/2026
 * in getrennten Aufrufen.
 */
export function vorgesetzteAbgesendet(v: VorgesetztenSpur): boolean {
  return Boolean(v.supervisorSubmittedAt) || v.supervisorData?.isComplete === true;
}

/**
 * Der Vorgangsstatus, der sich aus beiden Spuren ergibt.
 *
 *   - HR-Status bleibt, wie er ist.
 *   - Fragebogen abgesendet:
 *       Modalitaeten abgesendet     -> SUPERVISOR_SUBMITTED („Bereit zur Prüfung")
 *       sonst, Vorgesetzten-Link da -> SUPERVISOR_PENDING („Vorgesetzter offen")
 *       sonst                       -> SUBMITTED (prüfbar ohne Modalitaeten, z. B. Ehrenamt)
 *   - Fragebogen offen: IN_PROGRESS, wenn die Person schon gespeichert hat
 *     (Status IN_PROGRESS oder `currentStep > 0`), sonst INVITED. Der Stand der
 *     Modalitaeten ist in diesem Fall NICHT am Status ablesbar, sondern an
 *     `supervisorSubmittedAt` — sonst saehe der Status wieder „fertig" aus,
 *     waehrend die Person noch ausfuellt, und genau das war der Fehler.
 *
 * `currentStep > 0` ist der Rueckweg fuer festhaengende Vorgaenge: Deren Status
 * wurde von der Gegenspur ueberschrieben, das Speichern der Person steht aber
 * noch in `personalData.currentStep` (Schema-Default 0 = „nie gespeichert").
 */
export function gesamtStatus(v: SpurenStand): OnboardingStatusWert {
  if (istHrStatus(v.status)) return v.status as OnboardingStatusWert;

  if (mitarbeiterAbgesendet(v)) {
    if (vorgesetzteAbgesendet(v)) return "SUPERVISOR_SUBMITTED";
    if (v.supervisorToken) return "SUPERVISOR_PENDING";
    return "SUBMITTED";
  }

  const begonnen =
    v.status === "IN_PROGRESS" || (v.personalData?.currentStep ?? 0) > 0;
  return begonnen ? "IN_PROGRESS" : "INVITED";
}

/**
 * Darf der Fragebogen-Link noch schreiben (Speichern, Hochladen, Absenden)?
 *
 * Bis die Person selbst abgesendet hat oder HR den Vorgang abgeschlossen hat.
 * Der Stand der Modalitaeten spielt keine Rolle. COMPLETED und EXPIRED sperren
 * darueber hinaus schon das Lesen (auth.ts).
 */
export function darfMitarbeiterSchreiben(v: MitarbeiterSpur): boolean {
  return !istHrStatus(v.status) && !mitarbeiterAbgesendet(v);
}

/**
 * Darf der Modalitaeten-Link noch schreiben?
 *
 * Bis die Fuehrungskraft selbst abgesendet hat oder HR den Vorgang
 * abgeschlossen hat — unabhaengig davon, ob der Fragebogen schon da ist.
 */
export function darfVorgesetzteSchreiben(v: VorgesetztenSpur): boolean {
  return !istHrStatus(v.status) && !vorgesetzteAbgesendet(v);
}

/**
 * Darf HR den Vorgang „als geprüft markieren"?
 *
 * Entscheidung 21.09.2026: wenn der Fragebogen eingereicht ist UND — falls ein
 * Vorgesetzten-Link besteht — auch die Modalitaeten. Ohne Link (z. B. Ehrenamt)
 * genuegt der Fragebogen. Dieselbe Funktion steuert den Knopf in der
 * Detailansicht und die Pruefung im PATCH; eine zweite Fassung liefe
 * auseinander.
 *
 * Das gilt auch fuer einen ABGELAUFENEN Link: Die Regel bleibt, der Ausweg ist
 * ein neuer Link (Karte „Vorgesetzten-Link" in der Uebersicht, siehe
 * `vorgesetztenLinkAbgelaufen`).
 */
export function bereitZurPruefung(v: SpurenStand): boolean {
  if (istHrStatus(v.status)) return false;
  if (!mitarbeiterAbgesendet(v)) return false;
  return !v.supervisorToken || vorgesetzteAbgesendet(v);
}

/**
 * Warum ein Vorgang (noch) nicht geprueft werden kann — als deutscher Satz fuer
 * HR. `null`, wenn er es kann.
 *
 * Ist der Vorgesetzten-Link abgelaufen, sagt der Satz auch, was zu tun ist:
 * Die Fuehrungskraft kann mit dem alten Link nichts mehr absenden, und ohne
 * diesen Hinweis sieht HR nur eine Sperre ohne Ausweg.
 */
export function pruefungNichtMoeglichGrund(
  v: SpurenStand,
  jetzt: Date = new Date(),
): string | null {
  if (istHrStatus(v.status)) {
    return "Der Vorgang ist bereits geprüft oder abgeschlossen.";
  }
  if (!mitarbeiterAbgesendet(v)) {
    return "Der Personalfragebogen ist noch nicht eingereicht. Der Vorgang kann erst danach als geprüft markiert werden.";
  }
  if (v.supervisorToken && !vorgesetzteAbgesendet(v)) {
    if (vorgesetztenLinkAbgelaufen(v, jetzt)) {
      return (
        "Die Einstellungsmodalitäten sind noch nicht eingereicht, und der Vorgesetzten-Link ist abgelaufen. " +
        "Erzeugen Sie in der Übersicht unter „Vorgesetzten-Link“ einen neuen Link."
      );
    }
    return "Die Einstellungsmodalitäten sind noch nicht eingereicht. Der Vorgang kann erst danach als geprüft markiert werden.";
  }
  return null;
}

/**
 * Ist der Vorgesetzten-Link abgelaufen?
 *
 * Wichtig fuer die Pruefsperre: `bereitZurPruefung` wartet bei jedem
 * vorhandenen Link auf die Modalitaeten — auch bei einem abgelaufenen, mit dem
 * die Fuehrungskraft nichts mehr absenden kann (auth.ts: „Token abgelaufen").
 * Die HR-Oberflaeche bietet deshalb genau in diesem Fall „Neuen Link erzeugen"
 * an; die Route ersetzt einen abgelaufenen Link ohnehin
 * (`vorgesetztenLinkWiederverwendbar` ist dann false). Ohne diesen Ausweg
 * blieben Pruefen und Abschliessen dauerhaft gesperrt.
 *
 * Ein Link ohne Ablaufdatum gilt NICHT als abgelaufen — so etwas legt das
 * Portal nicht an, und ein erfundener Ablauf oeffnete keinen Weg, sondern
 * nur einen falschen Hinweis.
 */
export function vorgesetztenLinkAbgelaufen(
  v: { supervisorToken?: string | null; supervisorTokenExpiresAt?: Zeitpunkt },
  jetzt: Date = new Date(),
): boolean {
  if (!v.supervisorToken || !v.supervisorTokenExpiresAt) return false;
  const ablauf = new Date(v.supervisorTokenExpiresAt);
  if (Number.isNaN(ablauf.getTime())) return false;
  return ablauf <= jetzt;
}

/**
 * Seit wann der Vorgesetzten-Link besteht — Anker der ersten Erinnerung und
 * von `{{tage_offen}}` im Erinnerungs-Cron.
 *
 *   1. `supervisorLinkSentAt`, wenn vorhanden (alle Links ab 09/2026).
 *   2. Sonst zurueckgerechnet: Ablauf minus Gueltigkeit eines Magic Links
 *      (`gueltigkeitMs`, siehe `magicLinkGueltigkeitMs` in auth.ts). Das ist
 *      der Erzeugungszeitpunkt, solange `MAGIC_LINK_EXPIRY_HOURS` seitdem
 *      nicht geaendert wurde.
 *   3. Nie frueher als die Einladung der Person (`invitedAt`) — vorher kann
 *      es den Link nicht gegeben haben. Das faengt auch eine seitdem
 *      verlaengerte Gueltigkeit ab, die den Rueckrechnungswert zu frueh
 *      ausfallen liesse.
 *
 * Frueher galt fuer Links ohne `supervisorLinkSentAt` einfach `invitedAt`. Seit
 * die Erinnerung nicht mehr auf SUPERVISOR_PENDING wartet, trafen damit auch
 * Links, die HR kurz vor dem Deploy bei offenem Fragebogen erzeugt hatte: Die
 * Fuehrungskraft bekam zwei Tage nach dem Link „seit 18 Tagen offen".
 */
export function vorgesetztenLinkErzeugtAm(
  v: {
    invitedAt: Date | string;
    supervisorLinkSentAt?: Zeitpunkt;
    supervisorTokenExpiresAt?: Zeitpunkt;
  },
  gueltigkeitMs: number,
): Date {
  if (v.supervisorLinkSentAt) {
    const gesendet = new Date(v.supervisorLinkSentAt);
    if (!Number.isNaN(gesendet.getTime())) return gesendet;
  }
  const eingeladen = new Date(v.invitedAt);
  if (!v.supervisorTokenExpiresAt) return eingeladen;
  const zurueckgerechnet = new Date(
    new Date(v.supervisorTokenExpiresAt).getTime() - gueltigkeitMs,
  );
  if (Number.isNaN(zurueckgerechnet.getTime())) return eingeladen;
  return zurueckgerechnet > eingeladen ? zurueckgerechnet : eingeladen;
}

/**
 * Laesst sich der bestehende Vorgesetzten-Link fuer diese Adresse weiterverwenden?
 *
 * Ja, wenn er noch gilt und an dieselbe Adresse ging (Gross-/Kleinschreibung
 * egal). Dann erzeugt die Route KEINEN neuen Token: Frueher toetete jeder
 * Aufruf — schon ein Doppelklick — den Link, mit dem die Fuehrungskraft
 * vielleicht gerade arbeitet. Eine andere Adresse heisst dagegen „falscher
 * Empfaenger": Dann muss der alte Link sterben, sonst behielte die falsche
 * Person den Zugang zu den Verguetungsangaben.
 */
export function vorgesetztenLinkWiederverwendbar(
  v: {
    supervisorToken?: string | null;
    supervisorEmail?: string | null;
    supervisorTokenExpiresAt?: Zeitpunkt;
  },
  email: string,
  jetzt: Date = new Date(),
): boolean {
  if (!v.supervisorToken || !v.supervisorEmail || !v.supervisorTokenExpiresAt) {
    return false;
  }
  const ablauf = new Date(v.supervisorTokenExpiresAt);
  if (Number.isNaN(ablauf.getTime()) || ablauf <= jetzt) return false;
  return v.supervisorEmail.trim().toLowerCase() === email.trim().toLowerCase();
}

/**
 * Vor- und Nachname der/des Mitarbeitenden fuer die Fuehrungskraft — oder
 * `null`, wenn noch keiner bekannt ist.
 *
 * Seit beide Links parallel laufen, oeffnet die Fuehrungskraft ihren Link oft
 * VOR der Person. Die Angaben aus dem Fragebogen (`personalData`) sind dann
 * noch leer; Rueckfall ist der Name am Vorgang (`firstName`/`lastName`, den
 * HR beim Anlegen oder Bearbeiten erfassen kann). Die private E-Mail-Adresse
 * der Person ist bewusst KEIN Rueckfall (Datensparsamkeit, Art. 5 Abs. 1
 * lit. c DSGVO): Die Fuehrungskraft braucht sie fuer die Modalitaeten nicht.
 */
export function mitarbeiterName(v: {
  firstName?: string | null;
  lastName?: string | null;
  personalData?: { firstName?: string | null; lastName?: string | null } | null;
}): string | null {
  const ausFragebogen = [v.personalData?.firstName, v.personalData?.lastName]
    .map((teil) => teil?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  if (ausFragebogen) return ausFragebogen;

  const ausVorgang = [v.firstName, v.lastName]
    .map((teil) => teil?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return ausVorgang || null;
}

/** Neutrale Bezeichnung, solange kein Name bekannt ist (Akkusativ: „für …"). */
export const MITARBEITER_NEUTRAL = "die neue Mitarbeiterin / den neuen Mitarbeiter";
