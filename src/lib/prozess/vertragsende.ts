/**
 * Vertragsende: vom Vorgang zum Prozess-Stand (UX-Umbau, Pilot)
 *
 * Rein und client-sicher: kein Prisma, kein `next/*`, keine Uhr im Innern
 * (jede Funktion nimmt `jetzt` entgegen). Hier steht, was die neue Detailseite
 * ueber einen Vorgang SAGT — Schritte der Prozessleiste, „Jetzt dran",
 * Statuspille, Menue. Was der Vorgang DARF, entscheiden unveraendert die
 * Routen (`src/lib/contract-end-status.ts`, `/supervisor-link`, `/reminder`,
 * `/nicht-uebernehmen`); der Test haelt beides gegeneinander.
 *
 * Fuenf Schritte: Angelegt · Anfrage · Rueckmeldung · Vertrag ODER Offboarding
 * · Abschluss.
 *
 * Vier Regeln:
 *   1. Ein vergangener Schritt ist nur „erledigt", wenn es einen BELEG gibt
 *      (Zeitstempel bzw. das verknuepfte Offboarding) — sonst „uebersprungen".
 *      Legt HR das Offboarding ohne Anfrage an, wurden Anfrage und Rueckmeldung
 *      uebersprungen, nicht erledigt.
 *   2. Der Schritt „Vertrag" haengt an `contractSignedReturnedAt`, NICHT am
 *      Status VERTRAG_ERSTELLT: Den setzt kein Code (nur ein Hand-PATCH). Er
 *      wird deshalb wie RUECKMELDUNG_UEBERNAHME behandelt; die Leiste behauptet
 *      nicht „Vertrag erstellt", solange das Portal es nicht weiss.
 *   3. MAV ist ein Hinweis, keine Sperre — die Route laesst den Abschluss ohne
 *      MAV-Stand zu.
 *   4. Tage werden in BERLINER KALENDERTAGEN gezaehlt: Am Tag des Vertragsendes
 *      heisst es „heute", ueberschritten ist es erst am Tag danach. OB die
 *      Entfristungswarnung greift, entscheidet weiter `getSignatureWarning`.
 *
 * Feinplan: docs/module/ux-ui/pilot-feinplan.md, Abschnitte 3.2, 3.3, 3.5.
 */

import { getContractEndCategory } from "@/lib/contract-end-fristen";
import { getSignatureWarning } from "@/lib/contract-end-warnings";
import { formatDatumDE } from "@/lib/format";
import { berlinerKalendertag, tageZwischen } from "@/lib/kalendertag";
import type { JetztDran, ProzessSchritt, ProzessStand, SchrittStatus } from "@/lib/prozess/prozess-stand";

// =============================================
// Eingabe
// =============================================

/**
 * Was der Adapter vom Vorgang braucht — eine eigene, enge Schnittstelle. Die
 * Antwort von `GET /api/contract-end/[id]` erfuellt sie strukturell.
 */
export interface VertragsendeStand {
  status: string;
  decision: string;
  contractEndDate: string;
  createdAt?: string | null;
  supervisorEmail: string | null;
  supervisorLinkSentAt: string | null;
  supervisorTokenExpiresAt?: string | null;
  supervisorRespondedAt: string | null;
  lastSupervisorReminderAt: string | null;
  supervisorReminderCount: number;
  contractSignedReturnedAt: string | null;
  mavStatus: string | null;
  completedAt?: string | null;
  offboarding: { id: string; displayId: string } | null;
}

/** Die Handlungen der Seite. Die Seite macht daraus Knoepfe und Menuepunkte. */
export type VertragsendeAktion =
  | "anfrage-senden"
  | "erinnern"
  | "anfrage-neu-senden"
  | "offboarding-anlegen"
  | "vertrag-erfassen"
  | "dokumente"
  | "zum-offboarding"
  | "abschliessen"
  | "stornieren";

// =============================================
// Kataloge
// =============================================

export type PillenTon = "ok" | "wait" | "critical" | "info" | "neutral";

/**
 * Fachstatus → Text und Ton der Statuspille.
 *
 * wait = wartet auf jemand anderen · info = HR ist dran · ok = erledigt ·
 * neutral = beendet ohne Ergebnis. `critical` vergibt nur die
 * Entfristungswarnung (`vertragsendePille`).
 */
export const VERTRAGSENDE_PILLE: Record<string, { text: string; ton: PillenTon }> = {
  ANGELEGT: { text: "Anfrage offen", ton: "info" },
  ANFRAGE_VORGESETZTER: { text: "Wartet auf Führungskraft", ton: "wait" },
  ENTSCHEIDUNG_UEBERNAHME: { text: "Wartet auf Führungskraft", ton: "wait" },
  RUECKMELDUNG_UEBERNAHME: { text: "Übernahme · Vertrag offen", ton: "info" },
  VERTRAG_ERSTELLT: { text: "Übernahme · Vertrag offen", ton: "info" },
  VERTRAG_UNTERSCHRIEBEN: { text: "Vertrag unterschrieben", ton: "ok" },
  RUECKMELDUNG_KEINE_UEBERNAHME: { text: "Abgelehnt · Offboarding offen", ton: "info" },
  ENTSCHEIDUNG_KEINE_UEBERNAHME: { text: "Keine Übernahme", ton: "neutral" },
  ABGESCHLOSSEN: { text: "Abgeschlossen", ton: "ok" },
  STORNIERT: { text: "Storniert", ton: "neutral" },
};

/** Stand der Mitarbeitervertretung → Text und Ton. `null`/unbekannt = „offen". */
export const MAV_PILLE: Record<string, { text: string; ton: PillenTon }> = {
  NICHT_ERFORDERLICH: { text: "Nicht erforderlich", ton: "neutral" },
  AUSSTEHEND: { text: "Ausstehend", ton: "wait" },
  ANGEHOERT: { text: "Angehört", ton: "ok" },
  ZUGESTIMMT: { text: "Zugestimmt", ton: "ok" },
  WIDERSPRUCH: { text: "Widerspruch", ton: "critical" },
};

const ENDSTATUS = ["ABGESCHLOSSEN", "STORNIERT"];

// =============================================
// Tage und Fristen
// =============================================

/**
 * Kalendertage (Europe/Berlin) von heute bis zum Vertragsende: 0 = heute,
 * negativ = ueberschritten. Unlesbares Datum ergibt `null`.
 */
export function tageBisVertragsende(contractEndDate: string, jetzt: Date): number | null {
  const ende = new Date(contractEndDate);
  if (Number.isNaN(ende.getTime())) return null;
  return tageZwischen(berlinerKalendertag(jetzt), berlinerKalendertag(ende));
}

function tageText(tage: number): string {
  if (tage === 0) return "heute";
  if (tage === 1) return "morgen";
  if (tage > 1) return `in ${tage} Tagen`;
  return tage === -1 ? "seit 1 Tag überschritten" : `seit ${-tage} Tagen überschritten`;
}

/** Greift die Entfristungswarnung (§ 15 Abs. 5 TzBfG)? Dieselbe Regel wie auf der alten Seite. */
function entfristungsWarnung(stand: VertragsendeStand, jetzt: Date): boolean {
  const warnung = getSignatureWarning({
    decision: stand.decision,
    status: stand.status,
    contractEndDate: new Date(stand.contractEndDate),
    contractSignedReturnedAt: stand.contractSignedReturnedAt ? new Date(stand.contractSignedReturnedAt) : null,
    now: jetzt,
  });
  return Boolean(warnung?.warn);
}

// =============================================
// Zweig und Phase
// =============================================

type Zweig = "offen" | "uebernahme" | "keine";
type Phase = "anfrage" | "rueckmeldung" | "vollzug" | "abschluss" | "ende" | "unbekannt";

function zweigVon(stand: VertragsendeStand): Zweig {
  switch (stand.status) {
    case "RUECKMELDUNG_UEBERNAHME":
    case "VERTRAG_ERSTELLT":
    case "VERTRAG_UNTERSCHRIEBEN":
      return "uebernahme";
    case "RUECKMELDUNG_KEINE_UEBERNAHME":
    case "ENTSCHEIDUNG_KEINE_UEBERNAHME":
      return "keine";
    case "ABGESCHLOSSEN":
    case "STORNIERT":
      if (stand.decision === "UEBERNAHME") return "uebernahme";
      if (stand.decision === "KEINE_UEBERNAHME") return "keine";
      return "offen";
    default:
      // ANGELEGT, ANFRAGE_VORGESETZTER und der Altstatus ENTSCHEIDUNG_UEBERNAHME:
      // Die Rueckmeldung der Fuehrungskraft steht aus.
      return "offen";
  }
}

function phaseVon(stand: VertragsendeStand): Phase {
  switch (stand.status) {
    case "ANGELEGT":
      return "anfrage";
    case "ANFRAGE_VORGESETZTER":
    case "ENTSCHEIDUNG_UEBERNAHME":
      // Auf eine Rueckmeldung warten kann nur, wem eine Anfrage zugegangen ist.
      // Ohne Adresse oder Versandzeitpunkt (Altbestand ENTSCHEIDUNG_UEBERNAHME,
      // Status per Hand-PATCH gesetzt) ist die Anfrage erst noch zu stellen —
      // `/reminder` lehnte dort ab (409).
      return stand.supervisorEmail && stand.supervisorLinkSentAt ? "rueckmeldung" : "anfrage";
    case "RUECKMELDUNG_UEBERNAHME":
    case "VERTRAG_ERSTELLT":
    case "RUECKMELDUNG_KEINE_UEBERNAHME":
      return "vollzug";
    case "VERTRAG_UNTERSCHRIEBEN":
    case "ENTSCHEIDUNG_KEINE_UEBERNAHME":
      return "abschluss";
    case "ABGESCHLOSSEN":
    case "STORNIERT":
      return "ende";
    default:
      return "unbekannt";
  }
}

const mavOffen = (stand: VertragsendeStand) => !stand.mavStatus || stand.mavStatus === "AUSSTEHEND";

/**
 * Der Link der Fuehrungskraft ist abgelaufen — die Route `/reminder` lehnt dann
 * ab (409). Wie dort gilt ein fehlendes Ablaufdatum als abgelaufen.
 */
function linkAbgelaufen(stand: VertragsendeStand, jetzt: Date): boolean {
  if (!stand.supervisorTokenExpiresAt) return true;
  const ablauf = new Date(stand.supervisorTokenExpiresAt);
  return Number.isNaN(ablauf.getTime()) || ablauf.getTime() < jetzt.getTime();
}

// =============================================
// Schritte
// =============================================

const REIHENFOLGE = ["angelegt", "anfrage", "rueckmeldung", "vollzug", "abschluss"] as const;
type SchrittKey = (typeof REIHENFOLGE)[number];

function schritteBauen(stand: VertragsendeStand, phase: Phase, zweig: Zweig): ProzessSchritt[] {
  const beleg: Record<SchrittKey, boolean> = {
    angelegt: true,
    anfrage: Boolean(stand.supervisorLinkSentAt),
    rueckmeldung: Boolean(stand.supervisorRespondedAt),
    vollzug: zweig === "uebernahme" ? Boolean(stand.contractSignedReturnedAt) : zweig === "keine" && Boolean(stand.offboarding),
    abschluss: stand.status === "ABGESCHLOSSEN",
  };

  const aktivIndex = phase === "ende" || phase === "unbekannt" ? -1 : REIHENFOLGE.indexOf(phase);

  const statusVon = (key: SchrittKey, index: number): SchrittStatus => {
    if (key === "angelegt") return "erledigt";
    if (phase === "unbekannt") return "kommend";
    if (stand.status === "STORNIERT") return beleg[key] ? "erledigt" : "kommend";
    if (stand.status === "ABGESCHLOSSEN") return beleg[key] ? "erledigt" : "uebersprungen";
    if (index === aktivIndex) return "aktiv";
    if (index > aktivIndex) return "kommend";
    return beleg[key] ? "erledigt" : "uebersprungen";
  };

  const status = Object.fromEntries(REIHENFOLGE.map((key, i) => [key, statusVon(key, i)])) as Record<
    SchrittKey,
    SchrittStatus
  >;
  const datumWenn = (key: SchrittKey, wert: string | null | undefined) =>
    status[key] === "erledigt" && wert ? wert : undefined;
  const laeuft = !ENDSTATUS.includes(stand.status);

  return [
    { key: "angelegt", titel: "Angelegt", status: status.angelegt, datum: stand.createdAt ?? undefined },
    {
      key: "anfrage",
      titel: "Anfrage",
      status: status.anfrage,
      zustaendig: "HR",
      datum: datumWenn("anfrage", stand.supervisorLinkSentAt),
    },
    {
      key: "rueckmeldung",
      titel: "Rückmeldung",
      status: status.rueckmeldung,
      zustaendig: "Führungskraft",
      datum: datumWenn("rueckmeldung", stand.supervisorRespondedAt),
      ...(status.rueckmeldung === "erledigt" && zweig === "uebernahme"
        ? { notiz: "Übernahme", sonst: "sonst: Offboarding" }
        : {}),
      ...(status.rueckmeldung === "erledigt" && zweig === "keine"
        ? { notiz: "abgelehnt", sonst: "sonst: Vertrag" }
        : {}),
    },
    {
      key: "vollzug",
      titel: zweig === "uebernahme" ? "Vertrag" : zweig === "keine" ? "Offboarding" : "Vertrag oder Offboarding",
      status: status.vollzug,
      zustaendig: "HR",
      datum: zweig === "uebernahme" ? datumWenn("vollzug", stand.contractSignedReturnedAt) : undefined,
      notiz: zweig === "keine" && stand.offboarding ? stand.offboarding.displayId : undefined,
      reiter: zweig === "offen" ? undefined : "dokumente",
    },
    {
      key: "abschluss",
      titel: "Abschluss",
      status: status.abschluss,
      zustaendig: "HR",
      datum: datumWenn("abschluss", stand.completedAt),
      notiz: laeuft && zweig !== "offen" && mavOffen(stand) ? "MAV offen" : undefined,
    },
  ];
}

// =============================================
// Jetzt dran
// =============================================

function fristVon(
  stand: VertragsendeStand,
  phase: Phase,
  jetzt: Date,
): Pick<JetztDran, "frist" | "dringlichkeit"> {
  const tage = tageBisVertragsende(stand.contractEndDate, jetzt);
  if (tage === null) return {};
  const text = `Vertragsende ${formatDatumDE(stand.contractEndDate)} · ${tageText(tage)}`;

  // Uebernahme ohne unterschriebenen Vertrag: Entfristungsrisiko.
  if (entfristungsWarnung(stand, jetzt)) {
    return { frist: `${text} · Entfristungsrisiko (§ 15 Abs. 5 TzBfG)`, dringlichkeit: "critical" };
  }
  // Nach dem Vollzug (Vertrag unterschrieben, Offboarding angelegt) ist das
  // Vertragsende keine Frist mehr, die jemand halten muesste.
  if (phase === "abschluss") return {};
  // Ueberschritten, waehrend noch nichts entschieden oder vollzogen ist (P-F4).
  if (tage < 0) return { frist: text, dringlichkeit: "critical" };

  const stufe = getContractEndCategory(new Date(stand.contractEndDate), jetzt);
  if (stufe === "KRITISCH") return { frist: text, dringlichkeit: "critical" };
  if (stufe === "WARNUNG") return { frist: text, dringlichkeit: "wait" };
  return { frist: text };
}

function erinnerungsText(stand: VertragsendeStand): string {
  const anfrage = stand.supervisorLinkSentAt ? `Anfrage vom ${formatDatumDE(stand.supervisorLinkSentAt)}` : "Anfrage";
  const an = stand.supervisorEmail ? ` an ${stand.supervisorEmail}` : "";
  const erinnert =
    stand.supervisorReminderCount > 0
      ? `${stand.supervisorReminderCount}× erinnert, zuletzt ${formatDatumDE(stand.lastSupervisorReminderAt)}`
      : "noch nicht erinnert";
  return `${anfrage}${an} · ${erinnert}`;
}

function jetztDranBauen(
  stand: VertragsendeStand,
  phase: Phase,
  zweig: Zweig,
  jetzt: Date,
): JetztDran<VertragsendeAktion> | null {
  const frist = fristVon(stand, phase, jetzt);

  switch (phase) {
    case "anfrage":
      return {
        satz: "Anfrage an die Führungskraft senden",
        bei: "HR",
        unterzeile: "Die Führungskraft entscheidet über die Weiterbeschäftigung und erfasst bei Übernahme die Vertragsdaten.",
        aktion: "anfrage-senden",
        ...frist,
      };
    case "rueckmeldung":
      if (linkAbgelaufen(stand, jetzt)) {
        return {
          satz: "Link der Führungskraft ist abgelaufen – Anfrage neu senden",
          bei: "HR",
          unterzeile: erinnerungsText(stand),
          aktion: "anfrage-neu-senden",
          ...frist,
        };
      }
      return {
        satz: "Wartet auf die Rückmeldung der Führungskraft",
        bei: "FUEHRUNGSKRAFT",
        unterzeile: erinnerungsText(stand),
        aktion: "erinnern",
        ...frist,
      };
    case "vollzug":
      if (zweig === "keine") {
        return {
          satz: "Ablehnung bestätigen und Offboarding anlegen",
          bei: "HR",
          unterzeile: "Die Führungskraft lehnt die Weiterbeschäftigung ab. Mit der Bestätigung startet ein neuer Offboarding-Vorgang.",
          aktion: "offboarding-anlegen",
          ...frist,
        };
      }
      return {
        satz: "Verlängerungsvertrag erstellen und unterschrieben zurückholen",
        bei: "HR",
        unterzeile: "Danach: Vorgang abschließen",
        aktion: "vertrag-erfassen",
        nebenAktion: "dokumente",
        ...frist,
      };
    case "abschluss":
      if (zweig === "keine") {
        return {
          satz: "Auslaufmitteilung erstellen, Zeugnis über das Offboarding",
          bei: "HR",
          unterzeile: stand.offboarding
            ? `Offboarding ${stand.offboarding.displayId} ist angelegt. Danach: Vorgang abschließen`
            : "Danach: Vorgang abschließen",
          aktion: stand.offboarding ? "zum-offboarding" : "dokumente",
          nebenAktion: stand.offboarding ? "dokumente" : undefined,
          ...frist,
        };
      }
      return {
        satz: "Vorgang abschließen",
        bei: "HR",
        unterzeile: mavOffen(stand) ? "Mitarbeitervertretung: Stand noch offen" : undefined,
        aktion: "abschliessen",
        nebenAktion: "dokumente",
        ...frist,
      };
    default:
      return null;
  }
}

// =============================================
// Oeffentliche Funktionen
// =============================================

/** Der Stand der Prozessleiste fuer einen Vertragsende-Vorgang. */
export function vertragsendeProzessStand(stand: VertragsendeStand, jetzt: Date): ProzessStand<VertragsendeAktion> {
  const phase = phaseVon(stand);
  const zweig = zweigVon(stand);
  return {
    modus: "schritte",
    schritte: schritteBauen(stand, phase, zweig),
    jetztDran: jetztDranBauen(stand, phase, zweig, jetzt),
    ...(stand.status === "ABGESCHLOSSEN" ? { ende: "abgeschlossen" as const } : {}),
    ...(stand.status === "STORNIERT" ? { ende: "abgebrochen" as const } : {}),
  };
}

/**
 * Die Punkte des „…"-Menues: Handlungen, die der Status zulaesst, die aber
 * nicht der naechste Schritt sind. „Stornieren" steht immer am Ende (P-F2).
 * Handlungen, die schon in „Jetzt dran" stehen, erscheinen hier nicht noch
 * einmal — jede Handlung hat genau einen Ort.
 */
export function vertragsendeMenue(stand: VertragsendeStand, jetzt: Date): VertragsendeAktion[] {
  const phase = phaseVon(stand);
  const zweig = zweigVon(stand);
  switch (phase) {
    case "anfrage":
      return ["offboarding-anlegen", "stornieren"];
    case "rueckmeldung":
      return linkAbgelaufen(stand, jetzt)
        ? ["offboarding-anlegen", "stornieren"]
        : ["anfrage-neu-senden", "offboarding-anlegen", "stornieren"];
    case "vollzug":
      return zweig === "uebernahme" ? ["abschliessen", "stornieren"] : ["stornieren"];
    case "abschluss":
      return zweig === "keine" ? ["abschliessen", "stornieren"] : ["stornieren"];
    default:
      return [];
  }
}

/**
 * Die EINE Statuspille des Seitenkopfs. Greift die Entfristungswarnung,
 * ersetzt sie die Pille des Status.
 */
export function vertragsendePille(stand: VertragsendeStand, jetzt: Date): { text: string; ton: PillenTon } {
  if (entfristungsWarnung(stand, jetzt)) {
    const tage = tageBisVertragsende(stand.contractEndDate, jetzt);
    return {
      text: tage === null ? "Entfristungsrisiko" : `Entfristungsrisiko · ${tageText(tage)}`,
      ton: "critical",
    };
  }
  // Unbekannter Status: den Rohwert zeigen statt einen falschen Namen zu erfinden.
  return VERTRAGSENDE_PILLE[stand.status] ?? { text: stand.status, ton: "neutral" };
}
