"use client";

/**
 * Detailseite eines Vertragsende-Vorgangs.
 * Tabs: Übersicht (Stammdaten + Entscheidung A/B) | Vertragsdaten | Dokumente.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";
import { TemplateGenerationSection } from "@/components/template-generation-section";
import { CONTRACT_END_STATUS_LABELS } from "@/lib/constants";
import { getContractEndCategory, CONTRACT_END_CATEGORY_META } from "@/lib/contract-end-fristen";
import { HR_EDIT_ROLES } from "@/lib/permissions";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface RenewalData {
  vertragsbeginn: string | null;
  befristet: boolean | null;
  vertragsende: string | null;
  befristungSachgrund: string | null;
  wochenstunden: number | null;
  entgeltgruppe: string | null;
  stufe: string | null;
  stellenbeschreibung: string | null;
  betriebsstaette: string | null;
  urlaubstageProJahr: number | null;
  zusatzvereinbarungen: string | null;
  isComplete: boolean;
}

interface ContractEndData {
  id: string;
  displayId: string;
  status: string;
  decision: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string;
  employeePersonalNr: string | null;
  contractStartDate: string | null;
  contractEndDate: string;
  supervisorEmail: string | null;
  supervisorLinkSentAt: string | null;
  organization: { id: string; name: string; mandantNumber: string };
  renewalData: RenewalData | null;
  offboarding: { id: string; displayId: string; status: string } | null;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const TABS = [
  { id: "overview", label: "Übersicht" },
  { id: "renewal", label: "Vertragsdaten" },
  { id: "documents", label: "Dokumente" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function ContractEndDetailContent({
  contractEndId,
  user,
}: {
  contractEndId: string;
  user: User;
}) {
  const router = useRouter();
  const [data, setData] = useState<ContractEndData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const [supervisorEmail, setSupervisorEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canEdit = HR_EDIT_ROLES.includes(user.role);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/contract-end/${contractEndId}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setLoadError(j.error || "Vorgang konnte nicht geladen werden.");
        return;
      }
      const j = await res.json();
      setData(j);
      if (j.supervisorEmail) setSupervisorEmail(j.supervisorEmail);
    } catch {
      setLoadError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  }, [contractEndId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 6000);
    return () => clearTimeout(t);
  }, [actionError]);

  async function sendSupervisorLink() {
    if (!supervisorEmail) {
      setActionError("Bitte E-Mail der/des Vorgesetzten eingeben.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/contract-end/${contractEndId}/supervisor-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisorEmail }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error || "Link konnte nicht versendet werden.");
        return;
      }
      await loadData();
    } catch {
      setActionError("Verbindungsfehler beim Versand.");
    } finally {
      setBusy(false);
    }
  }

  async function nichtUebernehmen() {
    if (
      !window.confirm(
        "Mitarbeiter NICHT übernehmen? Es wird automatisch ein Offboarding-Vorgang (Befristungsende) angelegt.",
      )
    )
      return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/contract-end/${contractEndId}/nicht-uebernehmen`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error || "Offboarding konnte nicht angelegt werden.");
        return;
      }
      await loadData();
    } catch {
      setActionError("Verbindungsfehler.");
    } finally {
      setBusy(false);
    }
  }

  async function abschliessen() {
    if (!window.confirm("Diesen Vertragsende-Vorgang als abgeschlossen markieren?")) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/contract-end/${contractEndId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ABGESCHLOSSEN" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error || "Status konnte nicht geändert werden.");
        return;
      }
      await loadData();
    } catch {
      setActionError("Verbindungsfehler.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PortalHeader user={user} />
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Wird geladen…
        </div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div>
        <PortalHeader user={user} />
        <div className="mx-auto max-w-3xl px-4 py-12 text-center">
          <p className="text-sm text-destructive">{loadError || "Vorgang nicht gefunden."}</p>
          <button
            onClick={() => router.push("/dashboard?tab=contract-end")}
            className="mt-4 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Zurück zur Übersicht
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = CONTRACT_END_STATUS_LABELS[data.status] || CONTRACT_END_STATUS_LABELS.ANGELEGT;
  const cat = getContractEndCategory(new Date(data.contractEndDate));
  const catMeta = CONTRACT_END_CATEGORY_META[cat];

  return (
    <div>
      <PortalHeader user={user} />

      {/* Header-Leiste */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/dashboard?tab=contract-end")}
              className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              ← Zurück
            </button>
            <div className="h-5 w-px bg-border" />
            <span className="inline-flex rounded-md bg-muted px-3 py-1 font-mono text-sm font-bold text-foreground">
              {data.displayId}
            </span>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {cat !== "AUSSERHALB" && (
              <span
                className="inline-flex rounded-full px-3 py-1 text-xs font-semibold"
                style={{ color: catMeta.color, backgroundColor: catMeta.bg }}
              >
                {catMeta.label}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {data.employeeFirstName} {data.employeeLastName}
            </span>
            <span className="text-border">·</span>
            <span>{data.organization.name}</span>
            <span className="text-border">·</span>
            <span>Vertragsende {formatDate(data.contractEndDate)}</span>
          </div>
        </div>
      </div>

      {/* Schrittleiste */}
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-2 px-4 py-2 text-xs sm:px-6">
          {(() => {
            const entschieden = data.decision !== "OFFEN";
            const fertig = ["VERTRAG_ERSTELLT", "ENTSCHEIDUNG_KEINE_UEBERNAHME", "ABGESCHLOSSEN"].includes(
              data.status,
            );
            const steps = [
              { label: "Angelegt", done: true },
              { label: "Entscheidung", done: entschieden, here: !entschieden },
              {
                label: data.decision === "KEINE_UEBERNAHME" ? "Offboarding" : "Vertrag",
                done: fertig,
                here: entschieden && !fertig,
              },
              { label: "Abschluss", done: data.status === "ABGESCHLOSSEN" },
            ];
            return steps.map((s) => (
              <span
                key={s.label}
                className={`rounded-full px-3 py-1 ${
                  s.here
                    ? "bg-credo-blau text-white"
                    : s.done
                      ? "bg-credo-gruen/15 text-credo-gruen"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {s.done ? "✓ " : ""}
                {s.label}
              </span>
            ));
          })()}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        {actionError && (
          <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2.5 text-sm text-credo-rot">
            {actionError}
          </div>
        )}

        {/* Tabs */}
        <nav className="-mb-px flex gap-1 border-b" aria-label="Tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? "border-credo-gruen text-credo-gruen"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="py-5">
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* Stammdaten */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-bold text-foreground">Stammdaten</h3>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  <Row label="Name" value={`${data.employeeFirstName} ${data.employeeLastName}`} />
                  <Row label="E-Mail" value={data.employeeEmail} />
                  <Row label="Einrichtung" value={`${data.organization.name} (${data.organization.mandantNumber})`} />
                  <Row label="Personalnummer" value={data.employeePersonalNr || "—"} />
                  <Row label="Vertragsbeginn" value={formatDate(data.contractStartDate)} />
                  <Row label="Vertragsende" value={formatDate(data.contractEndDate)} />
                </dl>
              </div>

              {/* Entscheidungs-Bereich */}
              {canEdit && <Entscheidung
                data={data}
                supervisorEmail={supervisorEmail}
                setSupervisorEmail={setSupervisorEmail}
                busy={busy}
                onSendLink={sendSupervisorLink}
                onNichtUebernehmen={nichtUebernehmen}
                onAbschliessen={abschliessen}
                onGotoDocuments={() => setActiveTab("documents")}
              />}
            </div>
          )}

          {activeTab === "renewal" && <RenewalView data={data} />}

          {activeTab === "documents" && (
            <TemplateGenerationSection
              modul="VERTRAGSVERLAENGERUNG"
              refId={data.id}
              canEdit={canEdit}
              emptyHint="Keine Vertragsvorlagen hinterlegt. Vorlagen legst du unter „Brief-Vorlagen“ (Modul Vertragsverlängerung) an."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Entscheidung({
  data,
  supervisorEmail,
  setSupervisorEmail,
  busy,
  onSendLink,
  onNichtUebernehmen,
  onAbschliessen,
  onGotoDocuments,
}: {
  data: ContractEndData;
  supervisorEmail: string;
  setSupervisorEmail: (v: string) => void;
  busy: boolean;
  onSendLink: () => void;
  onNichtUebernehmen: () => void;
  onAbschliessen: () => void;
  onGotoDocuments: () => void;
}) {
  const INPUT =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

  if (data.status === "ENTSCHEIDUNG_KEINE_UEBERNAHME") {
    return (
      <div className="rounded-2xl border-2 border-credo-rot/30 bg-credo-rot/5 p-5">
        <p className="text-sm font-bold text-foreground">Entscheidung: keine Übernahme</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Für diesen Vorgang wurde ein Offboarding (Befristungsende) angelegt.
        </p>
        {data.offboarding && (
          <Link
            href={`/dashboard/offboarding/${data.offboarding.id}`}
            className="mt-3 inline-flex rounded-lg bg-credo-rot px-4 py-2 text-sm font-semibold text-white hover:bg-credo-rot/90"
          >
            Zum Offboarding {data.offboarding.displayId} →
          </Link>
        )}
      </div>
    );
  }

  if (data.status === "VERTRAG_ERSTELLT") {
    return (
      <div className="rounded-2xl border-2 border-credo-gruen/40 bg-credo-gruen/5 p-5">
        <p className="text-sm font-bold text-foreground">Vertragsdaten erfasst</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Die/der Vorgesetzte hat die Vertragsdaten ausgefüllt. Erzeugen Sie den Verlängerungsvertrag im Tab „Dokumente“.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={onGotoDocuments} className="rounded-lg bg-credo-gruen px-4 py-2 text-sm font-semibold text-white hover:bg-credo-gruen/90">
            Zu den Dokumenten →
          </button>
          <button onClick={onAbschliessen} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-50">
            Vorgang abschließen
          </button>
        </div>
      </div>
    );
  }

  if (data.status === "ABGESCHLOSSEN" || data.status === "STORNIERT") {
    return null;
  }

  // ANGELEGT oder ENTSCHEIDUNG_UEBERNAHME: Weiche A/B
  const linkVersendet = data.status === "ENTSCHEIDUNG_UEBERNAHME" && Boolean(data.supervisorEmail);
  return (
    <div>
      <p className="mb-1 text-sm font-bold text-foreground">Entscheidung treffen</p>
      <p className="mb-3 text-sm text-muted-foreground">
        Wird der Mitarbeiter über das Vertragsende hinaus weiterbeschäftigt?
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Strang A */}
        <div className="rounded-2xl border-2 border-credo-gruen/40 bg-credo-gruen/5 p-5">
          <p className="text-sm font-bold text-foreground">✓ Mitarbeiter übernehmen</p>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            Die/der Vorgesetzte erhält einen Link, um die neuen Vertragsdaten auszufüllen.
          </p>
          {linkVersendet ? (
            <div className="text-sm">
              <p className="text-credo-gruen">
                Link gesendet an <strong>{data.supervisorEmail}</strong>
                {data.supervisorLinkSentAt ? ` am ${formatDate(data.supervisorLinkSentAt)}` : ""}.
              </p>
              <button onClick={onSendLink} disabled={busy} className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
                Link erneut senden
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="email"
                value={supervisorEmail}
                onChange={(e) => setSupervisorEmail(e.target.value)}
                placeholder="vorgesetzte@einrichtung.de"
                className={INPUT}
              />
              <button onClick={onSendLink} disabled={busy} className="w-full rounded-lg bg-credo-gruen px-4 py-2 text-sm font-semibold text-white hover:bg-credo-gruen/90 disabled:opacity-50">
                {busy ? "…" : "Vorgesetzten-Link senden →"}
              </button>
            </div>
          )}
        </div>

        {/* Strang B */}
        <div className="rounded-2xl border-2 border-credo-rot/30 bg-credo-rot/5 p-5">
          <p className="text-sm font-bold text-foreground">✕ Nicht übernehmen</p>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            Das Vertragsende führt zum Austritt. Es wird automatisch ein Offboarding-Vorgang angelegt.
          </p>
          <button onClick={onNichtUebernehmen} disabled={busy} className="w-full rounded-lg bg-credo-rot px-4 py-2 text-sm font-semibold text-white hover:bg-credo-rot/90 disabled:opacity-50">
            {busy ? "…" : "Offboarding anlegen →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RenewalView({ data }: { data: ContractEndData }) {
  const rd = data.renewalData;
  if (!rd || (!rd.isComplete && !rd.vertragsbeginn && !rd.entgeltgruppe)) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Noch keine Vertragsdaten erfasst. Sie entstehen, sobald die/der Vorgesetzte das Formular (Strang A) ausgefüllt hat.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
        Vertragsdaten (Verlängerung)
        {rd.isComplete && (
          <span className="rounded-full bg-credo-gruen/15 px-2 py-0.5 text-xs font-semibold text-credo-gruen">
            abgesendet
          </span>
        )}
      </h3>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Row label="Vertragsbeginn (neu)" value={formatDate(rd.vertragsbeginn)} />
        <Row label="Befristet" value={rd.befristet == null ? "—" : rd.befristet ? "Ja" : "Nein"} />
        <Row label="Vertragsende (neu)" value={formatDate(rd.vertragsende)} />
        <Row label="Wochenstunden" value={rd.wochenstunden != null ? String(rd.wochenstunden) : "—"} />
        <Row label="Entgeltgruppe" value={rd.entgeltgruppe || "—"} />
        <Row label="Stufe" value={rd.stufe || "—"} />
        <Row label="Urlaubstage / Jahr" value={rd.urlaubstageProJahr != null ? String(rd.urlaubstageProJahr) : "—"} />
        <Row label="Betriebsstätte" value={rd.betriebsstaette || "—"} />
      </dl>
      {rd.stellenbeschreibung && (
        <div className="mt-3 border-t border-border/50 pt-3 text-sm">
          <p className="text-muted-foreground">Stellenbeschreibung</p>
          <p className="mt-1 text-foreground">{rd.stellenbeschreibung}</p>
        </div>
      )}
      {rd.zusatzvereinbarungen && (
        <div className="mt-3 border-t border-border/50 pt-3 text-sm">
          <p className="text-muted-foreground">Zusätzliche Vereinbarungen</p>
          <p className="mt-1 text-foreground">{rd.zusatzvereinbarungen}</p>
        </div>
      )}
    </div>
  );
}
