/**
 * Neue Detailseite Vertragsende: Reiter „Übersicht" (UX-Umbau, Pilot)
 *
 * Nur Lesen und Navigieren — die Handlungen stehen in „Jetzt dran" und im
 * Menue des Seitenkopfs. Einzige Ausnahme: „Stand setzen …" an der Gruppe
 * Mitarbeitervertretung (ein Dialog statt der vier sofort speichernden Knoepfe
 * der alten Ansicht), nur mit Bearbeitungsrecht — und gesperrt (sichtbar,
 * fokussierbar), solange die Seite nach einer Handlung neu laedt.
 *
 * Feinplan: docs/module/ux-ui/pilot-feinplan.md, Abschnitt 3.4.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Gruppe, Zeile } from "@/components/ui/gruppe";
import { Statuspille } from "@/components/ui/statuspille";
import { vorgangPfad } from "@/lib/adressen";
import { OFFBOARDING_STATUS_LABELS } from "@/lib/constants";
import { CONTRACT_END_ANFRAGE_OFFEN } from "@/lib/contract-end-status";
import { formatDatumDE } from "@/lib/format";
import {
  ANFRAGE_NICHT_ZUGESTELLT_ZEILE,
  MAV_PILLE,
  MAV_PILLE_OFFEN,
  anfrageNichtZugestellt,
} from "@/lib/prozess/vertragsende";
import type { VertragsendeDetail } from "./typen";

/** Befristungsart aus DokuBit → Text. Unbekannte Werte erscheinen roh. */
const BEFRISTUNGSART: Record<string, string> = {
  SACHGRUNDLOS: "Ohne Sachgrund",
  MIT_SACHGRUND: "Mit Sachgrund",
};

/**
 * Eine Zeile fuer Freitext (Begruendung, Vereinbarungen): Beschriftung ueber
 * dem Text, volle Breite, Zeilenumbrueche bleiben. Rechtsbuendig wie eine
 * gewoehnliche `Zeile` liesse sich ein Absatz nicht lesen. Leer → die
 * gewoehnliche Zeile mit „—".
 */
export function FreitextZeile({ label, children }: { label: string; children: string | null | undefined }) {
  if (!children || children.trim() === "") return <Zeile label={label}>{""}</Zeile>;
  return (
    <Zeile>
      <p className="text-ink-2">{label}</p>
      <p className="mt-1 font-medium whitespace-pre-line">{children}</p>
    </Zeile>
  );
}

export interface ReiterUebersichtProps {
  vorgang: VertragsendeDetail;
  darfBearbeiten: boolean;
  /** Die Seite laedt gerade nach einer Handlung neu: „Stand setzen …" bleibt stehen, tut aber nichts. */
  gesperrt?: boolean;
  jetzt: Date;
  /** Oeffnet den Dialog „Stand der Mitarbeitervertretung". */
  onMavSetzen: () => void;
}

export function ReiterUebersicht({ vorgang, darfBearbeiten, gesperrt = false, jetzt, onMavSetzen }: ReiterUebersichtProps) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <PersonUndVertrag vorgang={vorgang} />
      <Fuehrungskraft vorgang={vorgang} jetzt={jetzt} />
      {/* Erst nach der Entscheidung, wie in der alten Ansicht. */}
      {vorgang.decision !== "OFFEN" && (
        <Mitarbeitervertretung
          vorgang={vorgang}
          darfBearbeiten={darfBearbeiten}
          gesperrt={gesperrt}
          onMavSetzen={onMavSetzen}
        />
      )}
      {vorgang.offboarding && <Offboarding offboarding={vorgang.offboarding} />}
    </div>
  );
}

function PersonUndVertrag({ vorgang }: { vorgang: VertragsendeDetail }) {
  const befristungsart = vorgang.befristungsart
    ? (BEFRISTUNGSART[vorgang.befristungsart] ?? vorgang.befristungsart)
    : "";
  return (
    <Gruppe titel="Person und Vertrag">
      <Zeile label="Name">{`${vorgang.employeeFirstName} ${vorgang.employeeLastName}`.trim()}</Zeile>
      <Zeile label="E-Mail">{vorgang.employeeEmail}</Zeile>
      <Zeile label="Einrichtung">{`${vorgang.organization.name} (${vorgang.organization.mandantNumber})`}</Zeile>
      <Zeile label="Personalnummer">{vorgang.employeePersonalNr ?? ""}</Zeile>
      <Zeile label="Vertragsbeginn">{formatDatumDE(vorgang.contractStartDate)}</Zeile>
      <Zeile label="Vertragsende">{formatDatumDE(vorgang.contractEndDate)}</Zeile>
      <Zeile label="Befristungsart">{befristungsart}</Zeile>
    </Gruppe>
  );
}

/** „2× erinnert, zuletzt 31.05.2026" bzw. „keine". */
function erinnerungen(vorgang: VertragsendeDetail): string {
  if (vorgang.supervisorReminderCount <= 0) return "keine";
  const zuletzt = formatDatumDE(vorgang.lastSupervisorReminderAt);
  return `${vorgang.supervisorReminderCount}× erinnert${zuletzt ? `, zuletzt ${zuletzt}` : ""}`;
}

/**
 * Bis wann der Link gilt — nur, solange die Fuehrungskraft antworten kann:
 * Entscheidung offen UND ein Status, in dem die Anfrage offen ist
 * (`CONTRACT_END_ANFRAGE_OFFEN`, dieselbe Liste wie `/reminder`; nach einer
 * Stornierung bliebe das Datum stehen, der Link gilt aber nicht mehr). Ein
 * vergangenes Datum heisst so.
 */
function linkGueltigBis(vorgang: VertragsendeDetail, jetzt: Date): string | null {
  const anfrageLaeuft = (CONTRACT_END_ANFRAGE_OFFEN as readonly string[]).includes(vorgang.status);
  if (vorgang.decision !== "OFFEN" || !anfrageLaeuft || !vorgang.supervisorTokenExpiresAt) return null;
  const datum = formatDatumDE(vorgang.supervisorTokenExpiresAt);
  if (!datum) return null;
  const ablauf = new Date(vorgang.supervisorTokenExpiresAt).getTime();
  return ablauf < jetzt.getTime() ? `${datum} (abgelaufen)` : datum;
}

function vorstandText(vorgang: VertragsendeDetail): string {
  if (vorgang.vorstandAbgestimmt === false) return "Nein";
  const vermerk = vorgang.vorstandAbstimmungVermerk?.trim();
  return vermerk ? `Ja – ${vermerk}` : "Ja";
}

/**
 * Ging die Mail der Anfrage nicht hinaus (Lage des Adapters, dieselbe wie
 * Pille und „Jetzt dran"), steht bei „Anfrage vom" der Zustand statt eines
 * leeren Datums — als Pille mit Wort, nicht nur als Farbe. „Link gültig bis"
 * entfaellt dann: Der neue Link steht zwar in der Datenbank, die
 * Fuehrungskraft hat ihn aber nie bekommen („Jetzt dran" sagt genau das).
 */
function Fuehrungskraft({ vorgang, jetzt }: { vorgang: VertragsendeDetail; jetzt: Date }) {
  const nichtZugestellt = anfrageNichtZugestellt(vorgang, jetzt);
  const gueltigBis = nichtZugestellt ? null : linkGueltigBis(vorgang, jetzt);
  return (
    <Gruppe titel="Führungskraft">
      <Zeile label="E-Mail">{vorgang.supervisorEmail ?? ""}</Zeile>
      <Zeile label="Anfrage vom">
        {nichtZugestellt ? (
          <Statuspille ton={ANFRAGE_NICHT_ZUGESTELLT_ZEILE.ton}>{ANFRAGE_NICHT_ZUGESTELLT_ZEILE.text}</Statuspille>
        ) : (
          formatDatumDE(vorgang.supervisorLinkSentAt)
        )}
      </Zeile>
      {gueltigBis && <Zeile label="Link gültig bis">{gueltigBis}</Zeile>}
      <Zeile label="Rückmeldung vom">{formatDatumDE(vorgang.supervisorRespondedAt)}</Zeile>
      <Zeile label="Erinnerungen">{erinnerungen(vorgang)}</Zeile>
      {vorgang.decision === "KEINE_UEBERNAHME" && vorgang.supervisorDeclineReason && (
        <FreitextZeile label="Begründung der Ablehnung">{vorgang.supervisorDeclineReason}</FreitextZeile>
      )}
      {vorgang.decision === "UEBERNAHME" && vorgang.vorstandAbgestimmt !== null && (
        <Zeile label="Mit Vorstand/GF abgestimmt">{vorstandText(vorgang)}</Zeile>
      )}
    </Gruppe>
  );
}

function Mitarbeitervertretung({
  vorgang,
  darfBearbeiten,
  gesperrt,
  onMavSetzen,
}: {
  vorgang: VertragsendeDetail;
  darfBearbeiten: boolean;
  gesperrt: boolean;
  onMavSetzen: () => void;
}) {
  const pille = (vorgang.mavStatus && MAV_PILLE[vorgang.mavStatus]) || MAV_PILLE_OFFEN;
  const aktion: ReactNode = darfBearbeiten ? (
    <Button groesse="sm" aria-disabled={gesperrt || undefined} onClick={onMavSetzen}>
      Stand setzen …
    </Button>
  ) : undefined;
  return (
    <Gruppe titel="Mitarbeitervertretung" aktion={aktion}>
      <Zeile label="Stand">
        <Statuspille ton={pille.ton}>{pille.text}</Statuspille>
      </Zeile>
      <Zeile label="Vermerkt am">{formatDatumDE(vorgang.mavConsultedAt)}</Zeile>
    </Gruppe>
  );
}

function Offboarding({ offboarding }: { offboarding: NonNullable<VertragsendeDetail["offboarding"]> }) {
  // Nur das Wort: Die Farbklassen der Tabelle sind Palettenfarben der alten Oberflaeche.
  const status = OFFBOARDING_STATUS_LABELS[offboarding.status]?.label ?? offboarding.status;
  return (
    <Gruppe
      titel="Offboarding"
      aktion={
        // Reine Navigation — auch ohne Bearbeitungsrecht.
        <Button asChild groesse="sm" variante="secondary">
          <Link href={vorgangPfad("offboarding", offboarding.id)}>Offboarding öffnen</Link>
        </Button>
      }
    >
      <Zeile label="Nummer">{offboarding.displayId}</Zeile>
      <Zeile label="Status">{status}</Zeile>
    </Gruppe>
  );
}
