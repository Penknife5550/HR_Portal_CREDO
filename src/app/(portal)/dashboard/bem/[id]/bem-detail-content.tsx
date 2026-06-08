"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";
import {
  BEM_STEPS,
  getNaechsterSchritt,
  erlaubteFolgestatus,
  getStepIndex,
  isOffPath,
  statusLabel,
  type BemStatus,
} from "@/lib/bem-workflow";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface Zugriff {
  id: string;
  rolle: string;
  grantedAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

interface Kommunikation {
  id: string;
  kanal: string;
  status: string;
  empfaenger: string;
  betreff: string | null;
  dokumentHash: string | null;
  messageId: string | null;
  fehlertext: string | null;
  gesendetAm: string;
  gesendetBy: { firstName: string; lastName: string } | null;
}

interface AuditEntry {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string } | null;
}

interface BemFall {
  id: string;
  displayId: string;
  status: BemStatus;
  eingangsweg: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string | null;
  employeePersonalNr: string | null;
  anlassFehlzeitenAb: string | null;
  einladungAm: string | null;
  datenschutzAm: string | null;
  erstgespraechAm: string | null;
  beendetAm: string | null;
  beendigungsgrund: string | null;
  aufbewahrungBis: string | null;
  createdAt: string;
  organization: { id: string; name: string; mandantNumber: string } | null;
  zugriffe: Zugriff[];
  kommunikation: Kommunikation[];
  auditLogs: AuditEntry[];
  _count: {
    gespraeche: number;
    massnahmen: number;
    dokumente: number;
    einwilligungen: number;
    fristen: number;
  };
}

const STATUS_LABELS: Record<string, string> = {
  ANGELEGT: "Angelegt",
  EINLADUNG_VERSENDET: "Einladung versendet",
  EINWILLIGUNG_ERTEILT: "Einwilligung erteilt",
  EINWILLIGUNG_ABGELEHNT: "Einwilligung abgelehnt",
  ERSTGESPRAECH: "Erstgespraech",
  MASSNAHMEN_LAUFEN: "Massnahmen laufen",
  ABGESCHLOSSEN: "Abgeschlossen",
  ABGEBROCHEN: "Abgebrochen",
  AUFBEWAHRUNG: "Aufbewahrung",
  GELOESCHT: "Geloescht",
};

const ACTION_LABELS: Record<string, string> = {
  BEM_FALL_ANGELEGT: "Fall angelegt",
  BEM_AKTE_GEOEFFNET: "Akte geoeffnet",
  BEM_STATUS_GEAENDERT: "Status geaendert",
  BEM_ZUGRIFF_GEWAEHRT: "Zugriff gewaehrt",
  BEM_ZUGRIFF_ENTZOGEN: "Zugriff entzogen",
  BEM_EINLADUNG_VERSENDET: "Einladung versendet",
  BEM_MAIL_VERSENDET: "Mail versendet",
  BEM_DOKUMENT_GENERIERT: "Dokument generiert",
};

const ROLLE_LABELS: Record<string, string> = {
  BEAUFTRAGTE: "BEM-Beauftragte:r",
  VERTRETUNG: "Vertretung",
  BR: "Betriebsrat",
  SBV: "Schwerbehindertenvertretung",
};

const TERMINAL_TARGETS: BemStatus[] = [
  "ABGEBROCHEN",
  "EINWILLIGUNG_ABGELEHNT",
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BemDetailContent({
  bemFallId,
  user,
}: {
  bemFallId: string;
  user: User;
}) {
  const [fall, setFall] = useState<BemFall | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"uebersicht" | "protokoll">("uebersicht");
  const [busy, setBusy] = useState(false);

  // Stiller Refetch (kein Spinner) — verhindert Scroll-Sprung nach Aktionen.
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/bem/${bemFallId}`);
        if (res.status === 404) {
          setError("Dieser Fall existiert nicht oder Sie sind nicht freigegeben.");
          setFall(null);
          return;
        }
        if (!res.ok) throw new Error("Fehler beim Laden");
        const json = await res.json();
        setFall(json.data);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler beim Laden");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [bemFallId],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function transition(zielStatus: BemStatus) {
    let beendigungsgrund: string | null = null;
    if (zielStatus === "ABGEBROCHEN" || zielStatus === "ABGESCHLOSSEN") {
      const grund = window.prompt(
        zielStatus === "ABGEBROCHEN"
          ? "Grund fuer den Abbruch (wird dokumentiert):"
          : "Abschlussvermerk (optional):",
        "",
      );
      if (zielStatus === "ABGEBROCHEN" && grund === null) return; // Abbruch abgebrochen
      beendigungsgrund = grund;
    } else {
      if (!window.confirm(`Status auf "${statusLabel(zielStatus)}" setzen?`)) return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/bem/${bemFallId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zielStatus, beendigungsgrund }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Statuswechsel fehlgeschlagen.");
        return;
      }
      await load(true);
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PortalHeader user={user} />
        <main className="mx-auto max-w-5xl px-4 py-8 text-muted-foreground">
          Lade Akte…
        </main>
      </div>
    );
  }

  if (error || !fall) {
    return (
      <div className="min-h-screen bg-background">
        <PortalHeader user={user} />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-3 text-sm text-credo-rot">
            {error || "Fall nicht gefunden."}
          </div>
          <Link
            href="/dashboard/bem"
            className="mt-4 inline-block text-sm text-credo-blau hover:underline"
          >
            ← Zurueck zur Uebersicht
          </Link>
        </main>
      </div>
    );
  }

  const naechster = getNaechsterSchritt(fall.status);
  const folgeStatus = erlaubteFolgestatus(fall.status);
  const primaerStatus = folgeStatus.find((s) => !TERMINAL_TARGETS.includes(s));
  const aktivIndex = getStepIndex(fall.status);

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/dashboard/bem"
          className="mb-4 inline-block text-sm text-credo-blau hover:underline"
        >
          ← Zurueck zur Uebersicht
        </Link>

        {/* Kopf */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {fall.displayId}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fall.employeeFirstName} {fall.employeeLastName}
              {fall.organization
                ? ` · ${fall.organization.mandantNumber} — ${fall.organization.name}`
                : ""}
            </p>
          </div>
          <span className="inline-block rounded-full border border-credo-blau/30 bg-credo-blau/10 px-3 py-1 text-sm font-medium text-credo-blau">
            {STATUS_LABELS[fall.status] || fall.status}
          </span>
        </div>

        {/* Stepper (nur Haupt-Pfad) */}
        {!isOffPath(fall.status) && (
          <div className="mb-6 overflow-x-auto">
            <ol className="flex min-w-max items-center gap-2">
              {BEM_STEPS.map((step, i) => {
                const done = aktivIndex >= 0 && i < aktivIndex;
                const current = i === aktivIndex;
                return (
                  <li key={step.id} className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                        current
                          ? "bg-credo-blau text-white"
                          : done
                            ? "bg-credo-gruen text-white"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    <span
                      className={`text-xs ${current ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                    >
                      {step.label}
                    </span>
                    {i < BEM_STEPS.length - 1 && (
                      <span className="mx-1 text-muted-foreground">→</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Naechster-Schritt-Banner */}
        <div className="mb-6 rounded-xl border border-credo-blau/30 bg-credo-blau/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Naechster Schritt: {naechster.titel}
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {naechster.beschreibung}
              </p>
            </div>
            {naechster.hrAktion && folgeStatus.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {primaerStatus && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => transition(primaerStatus)}
                    className="rounded-lg bg-credo-blau px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90 disabled:opacity-50"
                  >
                    {naechster.actionLabel || statusLabel(primaerStatus)}
                  </button>
                )}
                {folgeStatus
                  .filter((s) => TERMINAL_TARGETS.includes(s))
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => transition(s)}
                      className="rounded-lg border border-credo-rot/40 px-4 py-2 text-sm font-medium text-credo-rot transition-colors hover:bg-credo-rot/10 disabled:opacity-50"
                    >
                      {statusLabel(s)}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2 border-b border-border">
          {(
            [
              ["uebersicht", "Uebersicht"],
              ["protokoll", "Protokoll"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setTab(val)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === val
                  ? "border-credo-blau text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {val === "protokoll" && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({fall.kommunikation.length + fall.auditLogs.length})
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "uebersicht" ? (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Stammdaten */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Stammdaten
              </h2>
              <dl className="space-y-2 text-sm">
                <Row label="Beschaeftigte:r" value={`${fall.employeeFirstName} ${fall.employeeLastName}`} />
                <Row label="E-Mail" value={fall.employeeEmail || "—"} />
                <Row label="Personalnummer" value={fall.employeePersonalNr || "—"} />
                <Row label="Eingangsweg" value={fall.eingangsweg === "DIGITAL" ? "Digital" : "Papier"} />
                <Row label="Fehlzeiten ab" value={formatDate(fall.anlassFehlzeitenAb)} />
                <Row label="Einladung am" value={formatDate(fall.einladungAm)} />
                <Row label="Einwilligung am" value={formatDate(fall.datenschutzAm)} />
                <Row label="Erstgespraech am" value={formatDate(fall.erstgespraechAm)} />
                {fall.beendetAm && (
                  <Row label="Beendet am" value={formatDate(fall.beendetAm)} />
                )}
                {fall.beendigungsgrund && (
                  <Row label="Grund" value={fall.beendigungsgrund} />
                )}
                {fall.aufbewahrungBis && (
                  <Row label="Aufbewahrung bis" value={formatDate(fall.aufbewahrungBis)} />
                )}
              </dl>
              <div className="mt-4 flex gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                <span>{fall._count.gespraeche} Gespraeche</span>
                <span>{fall._count.massnahmen} Massnahmen</span>
                <span>{fall._count.dokumente} Dokumente</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Gespraeche, Massnahmen, Einwilligung &amp; Dokumente folgen in den
                naechsten Ausbaustufen (E3–E5).
              </p>
            </div>

            {/* Zugriffe */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Freigegebene Personen ({fall.zugriffe.length})
              </h2>
              <ul className="space-y-2 text-sm">
                {fall.zugriffe.map((z) => (
                  <li
                    key={z.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-foreground">
                        {z.user.firstName} {z.user.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {z.user.email}
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {ROLLE_LABELS[z.rolle] || z.rolle}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Freigaben verwalten folgt in einer naechsten Ausbaustufe.
              </p>
            </div>
          </div>
        ) : (
          <ProtokollTab fall={fall} />
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ProtokollTab({ fall }: { fall: BemFall }) {
  return (
    <div className="space-y-6">
      {/* Versandprotokoll */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">
          Versandnachweis (Mails &amp; Briefe)
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Datum</th>
              <th className="px-4 py-2 font-medium">Kanal</th>
              <th className="px-4 py-2 font-medium">Empfaenger</th>
              <th className="px-4 py-2 font-medium">Betreff</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Nachweis</th>
            </tr>
          </thead>
          <tbody>
            {fall.kommunikation.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Noch keine Mails/Briefe versendet.
                </td>
              </tr>
            ) : (
              fall.kommunikation.map((k) => (
                <tr key={k.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatDateTime(k.gesendetAm)}
                  </td>
                  <td className="px-4 py-2">{k.kanal === "EMAIL" ? "E-Mail" : "Brief"}</td>
                  <td className="px-4 py-2">{k.empfaenger}</td>
                  <td className="px-4 py-2 text-muted-foreground">{k.betreff || "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        k.status === "GESENDET"
                          ? "text-credo-gruen"
                          : k.status === "FEHLGESCHLAGEN"
                            ? "text-credo-rot"
                            : "text-muted-foreground"
                      }
                    >
                      {k.status === "GESENDET"
                        ? "Gesendet"
                        : k.status === "FEHLGESCHLAGEN"
                          ? "Fehlgeschlagen"
                          : "Generiert"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {k.messageId ? (
                      <span title={k.messageId}>Msg-ID ✓</span>
                    ) : k.dokumentHash ? (
                      <span title={k.dokumentHash}>Hash ✓</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Zugriffs-/Aenderungsprotokoll */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">
          Zugriffs- &amp; Aenderungsprotokoll
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Zeitpunkt</th>
              <th className="px-4 py-2 font-medium">Vorgang</th>
              <th className="px-4 py-2 font-medium">Person</th>
              <th className="px-4 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {fall.auditLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  Keine Eintraege.
                </td>
              </tr>
            ) : (
              fall.auditLogs.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatDateTime(a.createdAt)}
                  </td>
                  <td className="px-4 py-2">{ACTION_LABELS[a.action] || a.action}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {a.user ? `${a.user.firstName} ${a.user.lastName}` : "System"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {a.ipAddress || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
