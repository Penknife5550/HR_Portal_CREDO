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
import { getSignatureWarning, getKettenbefristungWarning } from "@/lib/contract-end-warnings";
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
  supervisorRespondedAt: string | null;
  supervisorDeclineReason: string | null;
  lastSupervisorReminderAt: string | null;
  supervisorReminderCount: number;
  contractSignedReturnedAt: string | null;
  vorstandAbgestimmt: boolean | null;
  vorstandAbstimmungVermerk: string | null;
  weitereMandanten: string[];
  contractEndDateGeaendertAm: string | null;
  befristungsart: string | null;
  bisherigeBefristungMonate: number | null;
  bisherigeVerlaengerungen: number | null;
  mavStatus: string | null;
  mavConsultedAt: string | null;
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
  const [actionInfo, setActionInfo] = useState<string | null>(null);

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

  useEffect(() => {
    if (!actionInfo) return;
    const t = setTimeout(() => setActionInfo(null), 6000);
    return () => clearTimeout(t);
  }, [actionInfo]);

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

  async function sendReminder() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/contract-end/${contractEndId}/reminder`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error || "Erinnerung konnte nicht versendet werden.");
        return;
      }
      setActionInfo("Erinnerung an die Führungskraft versendet.");
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

  // B1: unterschriebenen Ruecklauf erfassen (Entfristungsschutz)
  async function signatureReceived() {
    if (!window.confirm("Bestätigen: Der unterschriebene Verlängerungsvertrag liegt vor?")) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/contract-end/${contractEndId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "VERTRAG_UNTERSCHRIEBEN" }),
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

  // B3: MAV-Beteiligungsstatus setzen
  async function setMav(mavStatus: string) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/contract-end/${contractEndId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mavStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error || "MAV-Status konnte nicht gesetzt werden.");
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
  const signatureWarning = getSignatureWarning({
    decision: data.decision,
    status: data.status,
    contractEndDate: new Date(data.contractEndDate),
    contractSignedReturnedAt: data.contractSignedReturnedAt ? new Date(data.contractSignedReturnedAt) : null,
  });
  const kettenWarning = getKettenbefristungWarning({
    befristungsart: data.befristungsart,
    bisherigeBefristungMonate: data.bisherigeBefristungMonate,
    bisherigeVerlaengerungen: data.bisherigeVerlaengerungen,
  });

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
            const st = data.status;
            const anfrageGestellt = st !== "ANGELEGT";
            const rueckmeldung =
              data.decision !== "OFFEN" ||
              ["RUECKMELDUNG_UEBERNAHME", "RUECKMELDUNG_KEINE_UEBERNAHME"].includes(st);
            const vollzug = [
              "VERTRAG_ERSTELLT",
              "VERTRAG_UNTERSCHRIEBEN",
              "ENTSCHEIDUNG_KEINE_UEBERNAHME",
              "ABGESCHLOSSEN",
            ].includes(st);
            const istAblehnung = data.decision === "KEINE_UEBERNAHME";
            const steps = [
              { label: "Angelegt", done: true },
              { label: "Anfrage", done: anfrageGestellt, here: st === "ANGELEGT" },
              {
                label: "Rückmeldung",
                done: rueckmeldung,
                here: ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"].includes(st),
              },
              {
                label: istAblehnung ? "Offboarding" : "Vertrag",
                done: vollzug,
                here: rueckmeldung && !vollzug,
              },
              { label: "Abschluss", done: st === "ABGESCHLOSSEN" },
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
        {actionInfo && (
          <div className="mb-4 rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 px-4 py-2.5 text-sm text-credo-gruen">
            {actionInfo}
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
              {/* B1: Entfristungs-Warnung (§15 Abs.5 TzBfG) */}
              {signatureWarning?.warn && (
                <EntfristungsWarnung
                  daysLeft={signatureWarning.daysLeft}
                  overdue={signatureWarning.overdue}
                  endDate={data.contractEndDate}
                />
              )}
              {/* B2: Kettenbefristungs-Hinweis (§14 TzBfG) */}
              {kettenWarning && <KettenHinweis reason={kettenWarning.reason} />}

              {/* B9: DokuBit hat das Vertragsende auf einem weit fortgeschrittenen
                  Vorgang geaendert — vermutlich wurde die Verlaengerung bereits
                  vollzogen. Banner verschwindet mit Abschluss des Vorgangs. */}
              {data.contractEndDateGeaendertAm &&
                !["ABGESCHLOSSEN", "STORNIERT"].includes(data.status) && (
                  <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm font-bold text-amber-800">
                      Vertragsende von DokuBit geändert ({formatDate(data.contractEndDateGeaendertAm)})
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      Das gemeldete Vertragsende hat sich geändert, obwohl der Vorgang bereits weit
                      fortgeschritten war — vermutlich wurde die Verlängerung schon vollzogen.
                      Bitte prüfen und den Vorgang ggf. abschließen.
                    </p>
                  </div>
                )}

              {/* Mehrfachbeschaeftigung: relevant fuer die Vertragsgestaltung
                  (Gesamtarbeitszeit ueber alle Einstellungen) */}
              {data.weitereMandanten.length > 0 && (
                <div className="rounded-2xl border border-credo-blau/40 bg-credo-blau/5 p-4">
                  <p className="text-sm font-bold text-foreground">
                    👥 Person hat weitere Einstellungen
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Laut DokuBit ist die Person zusätzlich bei folgenden Mandanten beschäftigt:{" "}
                    <strong className="text-foreground">{data.weitereMandanten.join(", ")}</strong>.
                    Bei der Vertragsgestaltung die Gesamtarbeitszeit beachten.
                  </p>
                </div>
              )}

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
                onSendReminder={sendReminder}
                onNichtUebernehmen={nichtUebernehmen}
                onAbschliessen={abschliessen}
                onSignatureReceived={signatureReceived}
                onGotoDocuments={() => setActiveTab("documents")}
              />}

              {/* B3: MAV-Beteiligung */}
              {canEdit && <MavKarte data={data} busy={busy} onSetMav={setMav} />}
            </div>
          )}

          {activeTab === "renewal" && <RenewalView data={data} />}

          {activeTab === "documents" && (
            <div className="space-y-4">
              {data.vorstandAbgestimmt === false && <VorstandWarnung />}
              <TemplateGenerationSection
                modul="VERTRAGSVERLAENGERUNG"
                refId={data.id}
                canEdit={canEdit}
                emptyHint="Keine Vertragsvorlagen hinterlegt. Vorlagen legst du unter „Brief-Vorlagen“ (Modul Vertragsverlängerung) an."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Warnbox: Die Fuehrungskraft hat die Uebernahme OHNE Vorstand-/GF-Abstimmung
 * gemeldet. Bewusst keine Blockade — HR entscheidet, klaert aber vorher.
 */
function VorstandWarnung() {
  return (
    <div className="rounded-2xl border-2 border-credo-rot/40 bg-credo-rot/5 p-4">
      <p className="text-sm font-bold text-credo-rot">
        ⚠ NICHT mit Vorstand/Geschäftsführung abgestimmt
      </p>
      <p className="mt-1 text-sm text-foreground">
        Die Führungskraft hat angegeben, dass die Übernahme-Entscheidung nicht mit
        Vorstand/Geschäftsführung abgestimmt wurde. Bitte vor der Vertragserstellung klären.
      </p>
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
  onSendReminder,
  onNichtUebernehmen,
  onAbschliessen,
  onSignatureReceived,
  onGotoDocuments,
}: {
  data: ContractEndData;
  supervisorEmail: string;
  setSupervisorEmail: (v: string) => void;
  busy: boolean;
  onSendLink: () => void;
  onSendReminder: () => void;
  onNichtUebernehmen: () => void;
  onAbschliessen: () => void;
  onSignatureReceived: () => void;
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
        {/* B6: Auslaufmitteilung + Zeugnis */}
        <div className="mt-3 rounded-lg border border-border bg-card/60 p-3 text-sm">
          <p className="font-medium text-foreground">Nächste Schritte</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Auslaufmitteilung</strong> an die/den Mitarbeiter:in erstellen
              (Tab „Dokumente“ → Modul Vertragsverlängerung).
            </li>
            <li>
              <strong className="text-foreground">Arbeitszeugnis</strong> über das verknüpfte Offboarding ausstellen.
            </li>
          </ul>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={onGotoDocuments}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Auslaufmitteilung erstellen →
          </button>
          {data.offboarding && (
            <Link
              href={`/dashboard/offboarding/${data.offboarding.id}`}
              className="inline-flex rounded-lg bg-credo-rot px-4 py-2 text-sm font-semibold text-white hover:bg-credo-rot/90"
            >
              Zum Offboarding {data.offboarding.displayId} (inkl. Zeugnis) →
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Fuehrungskraft will uebernehmen -> HR vollzieht (Vertrag erzeugen)
  if (
    data.status === "RUECKMELDUNG_UEBERNAHME" ||
    data.status === "VERTRAG_ERSTELLT" ||
    data.status === "VERTRAG_UNTERSCHRIEBEN"
  ) {
    const unterschrieben = Boolean(data.contractSignedReturnedAt);
    return (
      <div className="rounded-2xl border-2 border-credo-gruen/40 bg-credo-gruen/5 p-5">
        <p className="text-sm font-bold text-foreground">Die Führungskraft möchte weiterbeschäftigen</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Die Vertragsdaten wurden erfasst. Erzeugen Sie den Verlängerungsvertrag im Tab „Dokumente“, lassen Sie ihn unterschreiben und schließen Sie den Vorgang ab.
        </p>
        {data.vorstandAbgestimmt === true && (
          <p className="mt-2 text-sm font-medium text-credo-gruen">
            ✓ Mit Vorstand/GF abgestimmt
            {data.vorstandAbstimmungVermerk ? ` — ${data.vorstandAbstimmungVermerk}` : ""}
          </p>
        )}
        {data.vorstandAbgestimmt === false && <VorstandWarnung />}
        {unterschrieben && (
          <p className="mt-2 text-sm font-medium text-credo-gruen">
            ✓ Unterschriebener Vertrag erfasst am {formatDate(data.contractSignedReturnedAt)}.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={onGotoDocuments} className="rounded-lg bg-credo-gruen px-4 py-2 text-sm font-semibold text-white hover:bg-credo-gruen/90">
            Zu den Dokumenten →
          </button>
          {!unterschrieben && (
            <button onClick={onSignatureReceived} disabled={busy} className="rounded-lg border border-credo-gruen/50 px-4 py-2 text-sm font-medium text-credo-gruen hover:bg-credo-gruen/10 disabled:opacity-50">
              {busy ? "…" : "Unterschriebenen Vertrag erfassen"}
            </button>
          )}
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

  // Fuehrungskraft lehnt ab -> HR bestaetigt das Offboarding
  if (data.status === "RUECKMELDUNG_KEINE_UEBERNAHME") {
    return (
      <div className="rounded-2xl border-2 border-credo-rot/30 bg-credo-rot/5 p-5">
        <p className="text-sm font-bold text-foreground">Die Führungskraft lehnt die Weiterbeschäftigung ab</p>
        {data.supervisorDeclineReason && (
          <p className="mt-2 rounded-lg bg-background/60 p-3 text-sm text-foreground">
            <span className="font-medium text-muted-foreground">Begründung: </span>
            {data.supervisorDeclineReason}
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Bestätigen Sie die Nicht-Übernahme — es wird ein Offboarding-Vorgang (Befristungsende) angelegt.
        </p>
        <button onClick={onNichtUebernehmen} disabled={busy} className="mt-3 rounded-lg bg-credo-rot px-4 py-2 text-sm font-semibold text-white hover:bg-credo-rot/90 disabled:opacity-50">
          {busy ? "…" : "Offboarding anlegen →"}
        </button>
      </div>
    );
  }

  // ANGELEGT / ANFRAGE_VORGESETZTER (+ Alt ENTSCHEIDUNG_UEBERNAHME): Anfrage an die Fuehrungskraft
  const anfrageGesendet =
    ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"].includes(data.status) && Boolean(data.supervisorEmail);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-credo-gruen/40 bg-credo-gruen/5 p-5">
        <p className="text-sm font-bold text-foreground">Anfrage an die Führungskraft</p>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          Die Führungskraft entscheidet selbst über die Weiterbeschäftigung und erfasst bei Übernahme die neuen Vertragsdaten.
        </p>
        {anfrageGesendet ? (
          <div className="text-sm">
            <p className="text-credo-gruen">
              Anfrage gesendet an <strong>{data.supervisorEmail}</strong>
              {data.supervisorLinkSentAt ? ` am ${formatDate(data.supervisorLinkSentAt)}` : ""} — wartet auf Rückmeldung.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={onSendReminder} disabled={busy} className="rounded-lg border border-credo-gruen/50 px-3 py-1.5 text-xs font-semibold text-credo-gruen hover:bg-credo-gruen/10 disabled:opacity-50">
                {busy ? "…" : "Erinnerung senden"}
              </button>
              <button onClick={onSendLink} disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
                Anfrage erneut senden
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.supervisorReminderCount > 0
                ? `Zuletzt erinnert: ${formatDate(data.lastSupervisorReminderAt)} · ${data.supervisorReminderCount}× erinnert`
                : "Noch keine Erinnerung versendet."}
              {" "}„Erinnerung senden" nutzt den bestehenden Link; „Anfrage erneut senden" erzeugt einen NEUEN Link und setzt begonnene Eingaben zurück.
            </p>
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
              {busy ? "…" : "Anfrage an Vorgesetzten senden →"}
            </button>
          </div>
        )}
      </div>

      {/* HR kann die Entscheidung direkt treffen, wenn sie bereits feststeht */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Entscheidung steht bereits fest?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Wenn klar ist, dass nicht weiterbeschäftigt wird (z.B. Stelle entfällt), können Sie direkt das Offboarding anlegen.
        </p>
        <button onClick={onNichtUebernehmen} disabled={busy} className="mt-2 rounded-lg border border-credo-rot/40 px-3 py-1.5 text-xs font-semibold text-credo-rot hover:bg-credo-rot/5 disabled:opacity-50">
          {busy ? "…" : "Direkt Nicht-Übernahme (Offboarding) →"}
        </button>
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

// B1: Entfristungs-Warnung (§ 15 Abs. 5 TzBfG)
function EntfristungsWarnung({
  daysLeft,
  overdue,
  endDate,
}: {
  daysLeft: number;
  overdue: boolean;
  endDate: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-credo-rot/40 bg-credo-rot/5 p-4">
      <p className="text-sm font-bold text-credo-rot">⚠ Entfristungsrisiko (§ 15 Abs. 5 TzBfG)</p>
      <p className="mt-1 text-sm text-foreground">
        {overdue
          ? `Das Vertragsende (${formatDate(endDate)}) ist überschritten und es liegt kein unterschriebener Vertrag vor. Arbeitet die Person weiter, gilt das Arbeitsverhältnis als UNBEFRISTET — bitte sofort klären.`
          : `Bis zum Vertragsende (${formatDate(endDate)}, in ${daysLeft} Tagen) muss ein unterschriebener Verlängerungsvertrag vorliegen — sonst droht durch Weiterarbeit ein unbefristetes Arbeitsverhältnis.`}
      </p>
    </div>
  );
}

// B2: Kettenbefristungs-Hinweis (§ 14 TzBfG)
function KettenHinweis({ reason }: { reason: string }) {
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-bold text-amber-800">Hinweis zur Befristung (§ 14 TzBfG)</p>
      <p className="mt-1 text-sm text-amber-900">{reason}</p>
    </div>
  );
}

// B3: MAV-Beteiligung
const MAV_OPTIONS: { value: string; label: string }[] = [
  { value: "NICHT_ERFORDERLICH", label: "Nicht erforderlich" },
  { value: "ANGEHOERT", label: "Angehört" },
  { value: "ZUGESTIMMT", label: "Zugestimmt" },
  { value: "WIDERSPRUCH", label: "Widerspruch" },
];

function MavKarte({
  data,
  busy,
  onSetMav,
}: {
  data: ContractEndData;
  busy: boolean;
  onSetMav: (status: string) => void;
}) {
  // Erst relevant, sobald eine Entscheidung vorliegt.
  if (data.decision === "OFFEN") return null;
  const current = data.mavStatus;
  const erledigt = Boolean(current && current !== "AUSSTEHEND");
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-bold text-foreground">Mitarbeitervertretung (MAV)</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Beteiligung der MAV vor Vollzug (MVG-EKD/MAVO). Falls für diesen Mandanten nicht zutreffend, als „nicht erforderlich“ markieren.
      </p>
      {erledigt && (
        <p className="mt-2 text-sm font-medium text-credo-gruen">
          ✓ {MAV_OPTIONS.find((o) => o.value === current)?.label ?? current}
          {data.mavConsultedAt ? ` — ${formatDate(data.mavConsultedAt)}` : ""}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {MAV_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => onSetMav(o.value)}
            disabled={busy}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
              current === o.value
                ? "border-credo-gruen bg-credo-gruen/10 text-credo-gruen"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
