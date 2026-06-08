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
import { getBemCheckliste } from "@/lib/bem-checkliste-template";

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

interface Teilnehmer {
  name: string;
  rolle?: string | null;
}

interface ChecklistItem {
  titel: string;
  erledigt: boolean;
}

interface Gespraech {
  id: string;
  typ: string;
  datum: string | null;
  ort: string | null;
  teilnehmer: Teilnehmer[] | null;
  notizen: string | null;
  checkliste: ChecklistItem[] | null;
  naechsterTermin: string | null;
}

interface Massnahme {
  id: string;
  kategorie: string;
  beschreibung: string;
  zustaendig: string | null;
  frist: string | null;
  status: string;
  evaluationAm: string | null;
}

interface Einwilligung {
  id: string;
  art: string;
  status: string;
  signedAt: string | null;
  signedName: string | null;
  widerrufAm: string | null;
  tokenExpiry: string | null;
  createdAt: string;
}

interface Dokument {
  id: string;
  typ: string;
  ablage: string;
  quelle: string;
  dateiname: string;
  fileSize: number | null;
  createdAt: string;
}

interface Vorlage {
  id: string;
  name: string;
  platzhalter: string[];
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
  gespraeche: Gespraech[];
  massnahmen: Massnahme[];
  einwilligungen: Einwilligung[];
  dokumente: Dokument[];
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
  BEM_GESPRAECH_ERFASST: "Gespraech erfasst",
  BEM_GESPRAECH_AKTUALISIERT: "Gespraech aktualisiert",
  BEM_GESPRAECH_GELOESCHT: "Gespraech geloescht",
  BEM_MASSNAHME_ERFASST: "Massnahme erfasst",
  BEM_MASSNAHME_AKTUALISIERT: "Massnahme aktualisiert",
  BEM_MASSNAHME_GELOESCHT: "Massnahme geloescht",
};

const ROLLE_LABELS: Record<string, string> = {
  BEAUFTRAGTE: "BEM-Beauftragte:r",
  VERTRETUNG: "Vertretung",
  BR: "Betriebsrat",
  SBV: "Schwerbehindertenvertretung",
};

const GESPRAECH_TYP_LABELS: Record<string, string> = {
  ERSTGESPRAECH: "Erstgespraech",
  FOLGEGESPRAECH: "Folgegespraech",
  GEDAECHTNISPROTOKOLL: "Gedaechtnisprotokoll",
};

const KATEGORIE_LABELS: Record<string, string> = {
  TECHNISCH: "Technisch",
  ORGANISATORISCH: "Organisatorisch",
  PERSONENBEZOGEN: "Personenbezogen",
};

const MASSNAHME_STATUS_LABELS: Record<string, string> = {
  OFFEN: "Offen",
  LAEUFT: "Laeuft",
  UMGESETZT: "Umgesetzt",
  VERWORFEN: "Verworfen",
};

const EINWILLIGUNG_ART_LABELS: Record<string, string> = {
  DATENSCHUTZ: "Datenschutz",
  DURCHFUEHRUNG: "Durchfuehrung",
  BR: "Betriebsrat",
  SBV: "Schwerbehindertenvertretung",
};

const EINWILLIGUNG_STATUS_LABELS: Record<string, string> = {
  OFFEN: "Offen (ausstehend)",
  ERTEILT: "Erteilt",
  ABGELEHNT: "Abgelehnt",
  WIDERRUFEN: "Widerrufen",
};

const DOKUMENT_TYP_LABELS: Record<string, string> = {
  EINLADUNG: "Einladung",
  DATENSCHUTZVEREINBARUNG: "Datenschutzvereinbarung",
  ERSTGESPRAECH_PROTOKOLL: "Erstgespraech-Protokoll",
  FOLGEGESPRAECH_PROTOKOLL: "Folgegespraech-Protokoll",
  GEDAECHTNISPROTOKOLL: "Gedaechtnisprotokoll",
  MASSNAHMENPLAN: "Massnahmenplan",
  ABSCHLUSSERKLAERUNG: "Abschlusserklaerung",
  ABBRUCHERKLAERUNG: "Abbrucherklaerung",
  BEENDIGUNGSERKLAERUNG: "Beendigungserklaerung",
  GESAMT_EXPORT: "Gesamtexport",
  SONSTIGES: "Sonstiges",
};

const ABLAGE_LABELS: Record<string, string> = {
  NUR_BEM: "Nur BEM-Akte",
  KOPIE_PERSONALAKTE: "BEM + bereinigte Kopie Personalakte",
  ORIGINAL_PERSONALAKTE: "Personalakte (Original) + Kopie BEM",
};

// Dokumenttypen, die im Generieren-Dialog auswaehlbar sind (ohne GESAMT_EXPORT).
const DOKUMENT_TYP_OPTIONS = [
  "EINLADUNG",
  "DATENSCHUTZVEREINBARUNG",
  "ERSTGESPRAECH_PROTOKOLL",
  "FOLGEGESPRAECH_PROTOKOLL",
  "GEDAECHTNISPROTOKOLL",
  "MASSNAHMENPLAN",
  "ABSCHLUSSERKLAERUNG",
  "ABBRUCHERKLAERUNG",
  "BEENDIGUNGSERKLAERUNG",
  "SONSTIGES",
] as const;

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

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
  const [tab, setTab] = useState<
    | "uebersicht"
    | "gespraeche"
    | "massnahmen"
    | "einwilligung"
    | "dokumente"
    | "protokoll"
  >("uebersicht");
  const [busy, setBusy] = useState(false);
  const [gespraechModal, setGespraechModal] = useState<Gespraech | "new" | null>(
    null,
  );
  const [massnahmeModal, setMassnahmeModal] = useState<Massnahme | "new" | null>(
    null,
  );
  const [einladungOpen, setEinladungOpen] = useState(false);
  const [papierOpen, setPapierOpen] = useState(false);
  const [dokumentOpen, setDokumentOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  async function remove(kind: "gespraeche" | "massnahmen", entityId: string) {
    const label = kind === "gespraeche" ? "Gespraech" : "Massnahme";
    if (!window.confirm(`${label} wirklich loeschen?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/bem/${bemFallId}/${kind}/${entityId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Loeschen fehlgeschlagen.");
        return;
      }
      await load(true);
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setBusy(false);
    }
  }

  async function widerrufen(einwId: string) {
    if (!window.confirm("Diese Einwilligung wirklich widerrufen?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/bem/${bemFallId}/einwilligung/${einwId}/widerruf`,
        { method: "POST" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Widerruf fehlgeschlagen.");
        return;
      }
      await load(true);
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadFile(url: string, fallbackName: string) {
    const res = await fetch(url);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Download fehlgeschlagen.");
      return false;
    }
    const cd = res.headers.get("Content-Disposition") || "";
    const m = cd.match(/filename="?([^"]+)"?/);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = m?.[1] || fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
    return true;
  }

  async function gesamtExport() {
    setExporting(true);
    setError("");
    try {
      const ok = await downloadFile(
        `/api/bem/${bemFallId}/export`,
        `BEM-Gesamtexport.pdf`,
      );
      if (ok) await load(true); // neuer Audit-Eintrag sichtbar machen
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setExporting(false);
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
          <div className="flex flex-col items-end gap-2">
            <span className="inline-block rounded-full border border-credo-blau/30 bg-credo-blau/10 px-3 py-1 text-sm font-medium text-credo-blau">
              {STATUS_LABELS[fall.status] || fall.status}
            </span>
            <button
              type="button"
              disabled={exporting}
              onClick={gesamtExport}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
              title="Komplette Akte als PDF (DSGVO Art. 15)"
            >
              {exporting ? "Erstelle…" : "Gesamt-Export (PDF)"}
            </button>
          </div>
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
        <div className="mb-4 flex flex-wrap gap-2 border-b border-border">
          {(
            [
              ["uebersicht", "Uebersicht", null],
              ["gespraeche", "Gespraeche", fall.gespraeche.length],
              ["massnahmen", "Massnahmen", fall.massnahmen.length],
              ["einwilligung", "Einwilligung", fall.einwilligungen.length],
              ["dokumente", "Dokumente", fall.dokumente.length],
              ["protokoll", "Protokoll", fall.kommunikation.length + fall.auditLogs.length],
            ] as const
          ).map(([val, label, count]) => (
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
              {count !== null && (
                <span className="ml-1 text-xs text-muted-foreground">({count})</span>
              )}
            </button>
          ))}
        </div>

        {tab === "uebersicht" && (
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
                Einwilligung &amp; Dokumente folgen in den naechsten Ausbaustufen
                (E4–E5).
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
        )}

        {tab === "gespraeche" && (
          <GespraecheTab
            fall={fall}
            busy={busy}
            onNew={() => setGespraechModal("new")}
            onEdit={(g) => setGespraechModal(g)}
            onDelete={(gid) => remove("gespraeche", gid)}
          />
        )}

        {tab === "massnahmen" && (
          <MassnahmenTab
            fall={fall}
            busy={busy}
            onNew={() => setMassnahmeModal("new")}
            onEdit={(m) => setMassnahmeModal(m)}
            onDelete={(mid) => remove("massnahmen", mid)}
          />
        )}

        {tab === "einwilligung" && (
          <EinwilligungTab
            fall={fall}
            busy={busy}
            onEinladung={() => setEinladungOpen(true)}
            onPapier={() => setPapierOpen(true)}
            onWiderruf={widerrufen}
          />
        )}

        {tab === "dokumente" && (
          <DokumenteTab
            fall={fall}
            onGenerieren={() => setDokumentOpen(true)}
            onDownload={(dokId, name) =>
              downloadFile(`/api/bem/${bemFallId}/dokumente/${dokId}/download`, name)
            }
          />
        )}

        {tab === "protokoll" && <ProtokollTab fall={fall} />}
      </main>

      {dokumentOpen && (
        <DokumentGenerierenModal
          bemFallId={bemFallId}
          onClose={() => setDokumentOpen(false)}
          onSaved={async () => {
            setDokumentOpen(false);
            await load(true);
          }}
        />
      )}

      {einladungOpen && (
        <EinladungModal
          bemFallId={bemFallId}
          defaultEmail={fall.employeeEmail || ""}
          onClose={() => setEinladungOpen(false)}
          onSent={async () => {
            setEinladungOpen(false);
            await load(true);
          }}
        />
      )}

      {papierOpen && (
        <PapierModal
          bemFallId={bemFallId}
          onClose={() => setPapierOpen(false)}
          onSaved={async () => {
            setPapierOpen(false);
            await load(true);
          }}
        />
      )}

      {gespraechModal && (
        <GespraechModal
          bemFallId={bemFallId}
          gespraech={gespraechModal === "new" ? null : gespraechModal}
          onClose={() => setGespraechModal(null)}
          onSaved={async () => {
            setGespraechModal(null);
            await load(true);
          }}
        />
      )}

      {massnahmeModal && (
        <MassnahmeModal
          bemFallId={bemFallId}
          massnahme={massnahmeModal === "new" ? null : massnahmeModal}
          onClose={() => setMassnahmeModal(null)}
          onSaved={async () => {
            setMassnahmeModal(null);
            await load(true);
          }}
        />
      )}
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

// =============================================
// Tab: Gespraeche
// =============================================
function GespraecheTab({
  fall,
  busy,
  onNew,
  onEdit,
  onDelete,
}: {
  fall: BemFall;
  busy: boolean;
  onNew: () => void;
  onEdit: (g: Gespraech) => void;
  onDelete: (gid: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={onNew}
          className="rounded-lg bg-credo-blau px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90"
        >
          + Gespraech
        </button>
      </div>
      {fall.gespraeche.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Noch keine Gespraeche dokumentiert.
        </div>
      ) : (
        <div className="space-y-4">
          {fall.gespraeche.map((g) => {
            const ckTotal = g.checkliste?.length || 0;
            const ckDone = g.checkliste?.filter((c) => c.erledigt).length || 0;
            return (
              <div key={g.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">
                      {GESPRAECH_TYP_LABELS[g.typ] || g.typ}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(g.datum)}
                      {g.ort ? ` · ${g.ort}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(g)}
                      className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(g.id)}
                      className="rounded-md border border-credo-rot/40 px-3 py-1 text-xs font-medium text-credo-rot hover:bg-credo-rot/10 disabled:opacity-50"
                    >
                      Loeschen
                    </button>
                  </div>
                </div>

                {g.teilnehmer && g.teilnehmer.length > 0 && (
                  <div className="mt-3 text-sm">
                    <span className="text-muted-foreground">Teilnehmende: </span>
                    {g.teilnehmer
                      .map((t) => (t.rolle ? `${t.name} (${t.rolle})` : t.name))
                      .join(", ")}
                  </div>
                )}

                {g.notizen && (
                  <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-foreground">
                    {g.notizen}
                  </div>
                )}

                {ckTotal > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-xs text-muted-foreground">
                      Checkliste: {ckDone}/{ckTotal} erledigt
                    </div>
                    <ul className="space-y-1 text-sm">
                      {g.checkliste!.map((c, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span
                            className={
                              c.erledigt ? "text-credo-gruen" : "text-muted-foreground"
                            }
                          >
                            {c.erledigt ? "✓" : "○"}
                          </span>
                          <span
                            className={
                              c.erledigt ? "text-foreground" : "text-muted-foreground"
                            }
                          >
                            {c.titel}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {g.naechsterTermin && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Naechster Termin: {formatDate(g.naechsterTermin)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================
// Tab: Massnahmen
// =============================================
function MassnahmenTab({
  fall,
  busy,
  onNew,
  onEdit,
  onDelete,
}: {
  fall: BemFall;
  busy: boolean;
  onNew: () => void;
  onEdit: (m: Massnahme) => void;
  onDelete: (mid: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={onNew}
          className="rounded-lg bg-credo-blau px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90"
        >
          + Massnahme
        </button>
      </div>
      {fall.massnahmen.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Noch keine Massnahmen erfasst.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Kategorie</th>
                <th className="px-4 py-3 font-medium">Beschreibung</th>
                <th className="px-4 py-3 font-medium">Zustaendig</th>
                <th className="px-4 py-3 font-medium">Frist</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {fall.massnahmen.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {KATEGORIE_LABELS[m.kategorie] || m.kategorie}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{m.beschreibung}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.zustaendig || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(m.frist)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        m.status === "UMGESETZT"
                          ? "text-credo-gruen"
                          : m.status === "VERWORFEN"
                            ? "text-muted-foreground"
                            : "text-credo-blau"
                      }
                    >
                      {MASSNAHME_STATUS_LABELS[m.status] || m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(m)}
                        className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDelete(m.id)}
                        className="rounded-md border border-credo-rot/40 px-3 py-1 text-xs font-medium text-credo-rot hover:bg-credo-rot/10 disabled:opacity-50"
                      >
                        Loeschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================
// Modal-Bausteine
// =============================================
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Schliessen"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  onClose,
  onConfirm,
  confirmLabel,
  disabled,
}: {
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
      >
        Abbrechen
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90 disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

// =============================================
// Gespraech-Modal (anlegen / bearbeiten)
// =============================================
function GespraechModal({
  bemFallId,
  gespraech,
  onClose,
  onSaved,
}: {
  bemFallId: string;
  gespraech: Gespraech | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!gespraech;
  const [typ, setTyp] = useState<string>(gespraech?.typ || "ERSTGESPRAECH");
  const [datum, setDatum] = useState(dateInputValue(gespraech?.datum ?? null));
  const [ort, setOrt] = useState(gespraech?.ort || "");
  const [naechsterTermin, setNaechsterTermin] = useState(
    dateInputValue(gespraech?.naechsterTermin ?? null),
  );
  const [notizen, setNotizen] = useState(gespraech?.notizen || "");
  const [teilnehmer, setTeilnehmer] = useState<Teilnehmer[]>(
    gespraech?.teilnehmer && gespraech.teilnehmer.length > 0
      ? gespraech.teilnehmer
      : [{ name: "", rolle: "" }],
  );
  const [checkliste, setCheckliste] = useState<ChecklistItem[]>(
    gespraech?.checkliste && gespraech.checkliste.length > 0
      ? gespraech.checkliste
      : getBemCheckliste((gespraech?.typ as never) || "ERSTGESPRAECH"),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function changeTyp(newTyp: string) {
    setTyp(newTyp);
    // Beim Anlegen: Checkliste an neuen Typ anpassen (nur wenn unveraendert/leer).
    if (!isEdit) {
      setCheckliste(getBemCheckliste(newTyp as never));
    }
  }

  async function handleSubmit() {
    setErr("");
    setSaving(true);
    const cleanTeilnehmer = teilnehmer
      .filter((t) => t.name.trim() !== "")
      .map((t) => ({ name: t.name.trim(), rolle: t.rolle?.trim() || null }));
    const payload = {
      ...(isEdit ? {} : { typ }),
      datum: datum || null,
      ort: ort.trim() || null,
      teilnehmer: cleanTeilnehmer,
      notizen: notizen.trim() || null,
      checkliste,
      naechsterTermin: naechsterTermin || null,
    };
    try {
      const url = isEdit
        ? `/api/bem/${bemFallId}/gespraeche/${gespraech!.id}`
        : `/api/bem/${bemFallId}/gespraeche`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || "Speichern fehlgeschlagen.");
        return;
      }
      onSaved();
    } catch {
      setErr("Verbindungsfehler.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={isEdit ? "Gespraech bearbeiten" : "Neues Gespraech"}
      onClose={onClose}
    >
      {err && (
        <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
          {err}
        </div>
      )}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Typ</label>
            <select
              value={typ}
              onChange={(e) => changeTyp(e.target.value)}
              disabled={isEdit}
              className={INPUT_CLASS}
            >
              {Object.entries(GESPRAECH_TYP_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Datum</label>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Ort</label>
          <input
            value={ort}
            onChange={(e) => setOrt(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Teilnehmende</label>
          <div className="mt-1 space-y-2">
            {teilnehmer.map((t, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={t.name}
                  onChange={(e) =>
                    setTeilnehmer((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  placeholder="Name"
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                <input
                  value={t.rolle || ""}
                  onChange={(e) =>
                    setTeilnehmer((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, rolle: e.target.value } : x)),
                    )
                  }
                  placeholder="Rolle (optional)"
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setTeilnehmer((prev) =>
                      prev.length > 1 ? prev.filter((_, j) => j !== i) : prev,
                    )
                  }
                  className="rounded-md border border-border px-2 text-muted-foreground hover:bg-accent"
                  aria-label="Entfernen"
                >
                  −
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setTeilnehmer((prev) => [...prev, { name: "", rolle: "" }])}
              className="text-xs text-credo-blau hover:underline"
            >
              + Teilnehmende:n hinzufuegen
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">
            Notizen (vertraulich, verschluesselt)
          </label>
          <textarea
            value={notizen}
            onChange={(e) => setNotizen(e.target.value)}
            rows={4}
            className={INPUT_CLASS}
          />
        </div>

        {checkliste.length > 0 && (
          <div>
            <label className="text-sm font-medium">Checkliste</label>
            <ul className="mt-1 space-y-1">
              {checkliste.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={c.erledigt}
                    onChange={(e) =>
                      setCheckliste((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, erledigt: e.target.checked } : x,
                        ),
                      )
                    }
                    className="mt-0.5"
                  />
                  <span>{c.titel}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">Naechster Termin (optional)</label>
          <input
            type="date"
            value={naechsterTermin}
            onChange={(e) => setNaechsterTermin(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <ModalActions
        onClose={onClose}
        onConfirm={handleSubmit}
        confirmLabel={saving ? "Speichern…" : "Speichern"}
        disabled={saving}
      />
    </ModalShell>
  );
}

// =============================================
// Massnahme-Modal (anlegen / bearbeiten)
// =============================================
function MassnahmeModal({
  bemFallId,
  massnahme,
  onClose,
  onSaved,
}: {
  bemFallId: string;
  massnahme: Massnahme | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!massnahme;
  const [kategorie, setKategorie] = useState(massnahme?.kategorie || "TECHNISCH");
  const [beschreibung, setBeschreibung] = useState(massnahme?.beschreibung || "");
  const [zustaendig, setZustaendig] = useState(massnahme?.zustaendig || "");
  const [frist, setFrist] = useState(dateInputValue(massnahme?.frist ?? null));
  const [evaluationAm, setEvaluationAm] = useState(
    dateInputValue(massnahme?.evaluationAm ?? null),
  );
  const [status, setStatus] = useState(massnahme?.status || "OFFEN");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit() {
    setErr("");
    if (!beschreibung.trim()) {
      setErr("Beschreibung ist erforderlich.");
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      kategorie,
      beschreibung: beschreibung.trim(),
      zustaendig: zustaendig.trim() || null,
      frist: frist || null,
      evaluationAm: evaluationAm || null,
    };
    if (isEdit) payload.status = status;
    try {
      const url = isEdit
        ? `/api/bem/${bemFallId}/massnahmen/${massnahme!.id}`
        : `/api/bem/${bemFallId}/massnahmen`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || "Speichern fehlgeschlagen.");
        return;
      }
      onSaved();
    } catch {
      setErr("Verbindungsfehler.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={isEdit ? "Massnahme bearbeiten" : "Neue Massnahme"}
      onClose={onClose}
    >
      {err && (
        <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
          {err}
        </div>
      )}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Kategorie</label>
            <select
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value)}
              className={INPUT_CLASS}
            >
              {Object.entries(KATEGORIE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {isEdit && (
            <div>
              <label className="text-sm font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={INPUT_CLASS}
              >
                {Object.entries(MASSNAHME_STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="text-sm font-medium">Beschreibung (verschluesselt)</label>
          <textarea
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            rows={3}
            className={INPUT_CLASS}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-sm font-medium">Zustaendig</label>
            <input
              value={zustaendig}
              onChange={(e) => setZustaendig(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Frist</label>
            <input
              type="date"
              value={frist}
              onChange={(e) => setFrist(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Evaluation am</label>
            <input
              type="date"
              value={evaluationAm}
              onChange={(e) => setEvaluationAm(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </div>

      <ModalActions
        onClose={onClose}
        onConfirm={handleSubmit}
        confirmLabel={saving ? "Speichern…" : "Speichern"}
        disabled={saving}
      />
    </ModalShell>
  );
}

// =============================================
// Tab: Einwilligung
// =============================================
function EinwilligungTab({
  fall,
  busy,
  onEinladung,
  onPapier,
  onWiderruf,
}: {
  fall: BemFall;
  busy: boolean;
  onEinladung: () => void;
  onPapier: () => void;
  onWiderruf: (einwId: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onEinladung}
          className="rounded-lg bg-credo-blau px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90"
        >
          Einladung digital versenden
        </button>
        <button
          type="button"
          onClick={onPapier}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
        >
          Papier-Einwilligung erfassen
        </button>
      </div>

      {fall.einwilligungen.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Noch keine Einwilligung erfasst. Versenden Sie eine digitale Einladung
          oder erfassen Sie eine auf Papier erteilte Einwilligung.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Art</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Beantwortet</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {fall.einwilligungen.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    {EINWILLIGUNG_ART_LABELS[e.art] || e.art}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        e.status === "ERTEILT"
                          ? "text-credo-gruen"
                          : e.status === "ABGELEHNT" || e.status === "WIDERRUFEN"
                            ? "text-credo-rot"
                            : "text-credo-blau"
                      }
                    >
                      {EINWILLIGUNG_STATUS_LABELS[e.status] || e.status}
                    </span>
                    {e.widerrufAm && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (am {formatDate(e.widerrufAm)})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(e.signedAt)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {e.signedName || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.status === "ERTEILT" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onWiderruf(e.id)}
                        className="rounded-md border border-credo-rot/40 px-3 py-1 text-xs font-medium text-credo-rot hover:bg-credo-rot/10 disabled:opacity-50"
                      >
                        Widerrufen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Das BEM ist freiwillig. Eine erteilte Einwilligung kann jederzeit
        widerrufen werden (§ 167 SGB IX / DSGVO).
      </p>
    </div>
  );
}

// =============================================
// Einladungs-Modal (digital)
// =============================================
function EinladungModal({
  bemFallId,
  defaultEmail,
  onClose,
  onSent,
}: {
  bemFallId: string;
  defaultEmail: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [art, setArt] = useState<"DATENSCHUTZ" | "DURCHFUEHRUNG">("DATENSCHUTZ");
  const [nachricht, setNachricht] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fallbackLink, setFallbackLink] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setErr("");
    setFallbackLink("");
    if (!email.trim()) {
      setErr("Bitte eine Empfaenger-E-Mail angeben.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/bem/${bemFallId}/einladung`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          art,
          nachricht: nachricht.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error || "Versand fehlgeschlagen.");
        // Bei SMTP-Fehler liefert die API den Link zur manuellen Zustellung.
        if (j.magicUrl) setFallbackLink(j.magicUrl);
        return;
      }
      setDone(true);
    } catch {
      setErr("Verbindungsfehler.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Einladung digital versenden" onClose={onClose}>
      {done ? (
        <div>
          <div className="rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 px-4 py-3 text-sm text-credo-gruen">
            Einladung versendet. Der Versand ist im Protokoll-Tab als Nachweis
            dokumentiert.
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onSent}
              className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90"
            >
              Schliessen
            </button>
          </div>
        </div>
      ) : (
        <>
          {err && (
            <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
              {err}
            </div>
          )}
          {fallbackLink && (
            <div className="mb-4 break-all rounded-lg border border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
              Link zur manuellen Zustellung:
              <br />
              <code>{fallbackLink}</code>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Empfaenger-E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
                placeholder="beschaeftigte:r@example.de"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Art</label>
              <select
                value={art}
                onChange={(e) => setArt(e.target.value as "DATENSCHUTZ" | "DURCHFUEHRUNG")}
                className={INPUT_CLASS}
              >
                <option value="DATENSCHUTZ">Datenschutz-Einwilligung</option>
                <option value="DURCHFUEHRUNG">Durchfuehrung des BEM</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">
                Zusaetzliche Nachricht (optional)
              </label>
              <textarea
                value={nachricht}
                onChange={(e) => setNachricht(e.target.value)}
                rows={3}
                className={INPUT_CLASS}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Die Mail wird im CREDO-Design direkt per SMTP versendet (kein
              externer Dienst) und im Protokoll als Versandnachweis erfasst.
            </p>
          </div>
          <ModalActions
            onClose={onClose}
            onConfirm={handleSubmit}
            confirmLabel={busy ? "Sende…" : "Senden"}
            disabled={busy}
          />
        </>
      )}
    </ModalShell>
  );
}

// =============================================
// Papier-Einwilligung-Modal (Scan-Upload)
// =============================================
function PapierModal({
  bemFallId,
  onClose,
  onSaved,
}: {
  bemFallId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [art, setArt] = useState<"DATENSCHUTZ" | "DURCHFUEHRUNG">("DATENSCHUTZ");
  const [signedName, setSignedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit() {
    setErr("");
    if (!file) {
      setErr("Bitte einen Scan (PDF/Bild) auswaehlen.");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("art", art);
    if (signedName.trim()) fd.append("signedName", signedName.trim());
    try {
      const res = await fetch(`/api/bem/${bemFallId}/einwilligung/papier`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || "Upload fehlgeschlagen.");
        return;
      }
      onSaved();
    } catch {
      setErr("Verbindungsfehler.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Papier-Einwilligung erfassen" onClose={onClose}>
      {err && (
        <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
          {err}
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Scan (PDF, JPG, PNG)</label>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Art</label>
          <select
            value={art}
            onChange={(e) => setArt(e.target.value as "DATENSCHUTZ" | "DURCHFUEHRUNG")}
            className={INPUT_CLASS}
          >
            <option value="DATENSCHUTZ">Datenschutz-Einwilligung</option>
            <option value="DURCHFUEHRUNG">Durchfuehrung des BEM</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">
            Name der/des Unterzeichnenden (optional)
          </label>
          <input
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Der Scan wird ausschliesslich in der BEM-Akte abgelegt (nicht in der
          Personalakte) und mit Pruefsumme dokumentiert.
        </p>
      </div>
      <ModalActions
        onClose={onClose}
        onConfirm={handleSubmit}
        confirmLabel={busy ? "Lade hoch…" : "Erfassen"}
        disabled={busy}
      />
    </ModalShell>
  );
}

// =============================================
// Tab: Dokumente
// =============================================
function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DokumenteTab({
  fall,
  onGenerieren,
  onDownload,
}: {
  fall: BemFall;
  onGenerieren: () => void;
  onDownload: (dokId: string, name: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={onGenerieren}
          className="rounded-lg bg-credo-blau px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90"
        >
          Dokument aus Vorlage erzeugen
        </button>
      </div>
      {fall.dokumente.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Noch keine Dokumente in der Akte.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Typ</th>
                <th className="px-4 py-3 font-medium">Datei</th>
                <th className="px-4 py-3 font-medium">Ablage</th>
                <th className="px-4 py-3 font-medium">Quelle</th>
                <th className="px-4 py-3 font-medium">Erstellt</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {fall.dokumente.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{DOKUMENT_TYP_LABELS[d.typ] || d.typ}</td>
                  <td className="px-4 py-3">
                    <div className="text-foreground">{d.dateiname}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(d.fileSize)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs ${d.ablage === "NUR_BEM" ? "text-muted-foreground" : "text-credo-rot"}`}
                    >
                      {ABLAGE_LABELS[d.ablage] || d.ablage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {d.quelle === "GENERIERT" ? "Generiert" : "Upload"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(d.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDownload(d.id, d.dateiname)}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Ablage gemaess Aktentrennung (§ 167 SGB IX): Massnahmenplan und
        Beendigung/Abbruch erfordern eine (bereinigte) Kopie bzw. das Original in
        der Personalakte — die Uebernahme erfolgt als bewusster manueller Schritt.
      </p>
    </div>
  );
}

// =============================================
// Dokument-aus-Vorlage-Modal
// =============================================
function DokumentGenerierenModal({
  bemFallId,
  onClose,
  onSaved,
}: {
  bemFallId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [typ, setTyp] = useState<string>("EINLADUNG");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`/api/bem/${bemFallId}/dokumente/vorlagen`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setVorlagen(j.data || []))
      .catch(() => setVorlagen([]))
      .finally(() => setLoading(false));
  }, [bemFallId]);

  const selected = vorlagen.find((v) => v.id === templateId);

  async function handleSubmit() {
    setErr("");
    if (!templateId) {
      setErr("Bitte eine Vorlage waehlen.");
      return;
    }
    setBusy(true);
    const filled: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim() !== "") filled[k] = v;
    }
    try {
      const res = await fetch(`/api/bem/${bemFallId}/dokumente/generieren`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, typ, format, values: filled }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error || "Erzeugung fehlgeschlagen.");
        return;
      }
      onSaved();
    } catch {
      setErr("Verbindungsfehler.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Dokument aus BEM-Vorlage erzeugen" onClose={onClose}>
      {err && (
        <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
          {err}
        </div>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Lade Vorlagen…</p>
      ) : vorlagen.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine BEM-Vorlagen hinterlegt. Bitte zuerst unter „Brief-Vorlagen“ eine
          Vorlage mit Modul „BEM“ hochladen.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Vorlage</label>
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setValues({});
              }}
              className={INPUT_CLASS}
            >
              <option value="">Bitte waehlen…</option>
              {vorlagen.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Dokumenttyp (Ablage)</label>
              <select
                value={typ}
                onChange={(e) => setTyp(e.target.value)}
                className={INPUT_CLASS}
              >
                {DOKUMENT_TYP_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {DOKUMENT_TYP_LABELS[t]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {ABLAGE_LABELS_BY_TYP(typ)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as "docx" | "pdf")}
                className={INPUT_CLASS}
              >
                <option value="docx">Word (.docx)</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
          </div>

          {selected && selected.platzhalter.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium">
                Platzhalter befuellen
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Leere Felder werden automatisch (Name, Mandant, Datum, …) ergaenzt
                oder mit „___“ markiert.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {selected.platzhalter.map((p) => (
                  <div key={p}>
                    <label className="text-xs text-muted-foreground">{p}</label>
                    <input
                      value={values[p] || ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [p]: e.target.value }))
                      }
                      className={INPUT_CLASS}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {vorlagen.length > 0 && (
        <ModalActions
          onClose={onClose}
          onConfirm={handleSubmit}
          confirmLabel={busy ? "Erzeuge…" : "Erzeugen & ablegen"}
          disabled={busy}
        />
      )}
    </ModalShell>
  );
}

// Ablage-Hinweis je Dokumenttyp (gespiegelt zu bem-aktentrennung.ts).
function ABLAGE_LABELS_BY_TYP(typ: string): string {
  const ablage =
    typ === "MASSNAHMENPLAN"
      ? "KOPIE_PERSONALAKTE"
      : typ === "ABBRUCHERKLAERUNG" || typ === "BEENDIGUNGSERKLAERUNG"
        ? "ORIGINAL_PERSONALAKTE"
        : "NUR_BEM";
  return ABLAGE_LABELS[ablage];
}
