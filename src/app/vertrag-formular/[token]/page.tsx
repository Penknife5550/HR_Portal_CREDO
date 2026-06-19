"use client";

/**
 * Oeffentliche Seite (Magic-Link): Vorgesetzte:r ENTSCHEIDET ueber die Uebernahme
 * und erfasst bei Ja die neuen Vertragsdaten (Strang A). Kein Login.
 * GET laedt (inkl. mandantenspezifischer Feld-Konfiguration), PUT speichert
 * zwischen, POST sendet die Rueckmeldung verbindlich ab.
 *
 * Welche Felder sichtbar/Pflicht sind und ihre Labels kommen pro Mandant aus
 * `fieldConfig` (Admin: /mandanten/[id]/vertragsende-config).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ContractEndFieldHelper, type ContractEndFieldConfig } from "@/lib/contract-end-fields";

function CredoLinie() {
  return (
    <div className="flex h-1.5 w-full">
      <div className="flex-1" style={{ background: "#DADADA" }} />
      <div style={{ flex: "0 0 8%", background: "#FBC900" }} />
      <div style={{ flex: "0 0 8%", background: "#6BAA24" }} />
      <div style={{ flex: "0 0 8%", background: "#E2001A" }} />
      <div style={{ flex: "0 0 8%", background: "#009AC6" }} />
    </div>
  );
}

interface Betriebsstaette {
  id: string;
  name: string;
  mandantNumber: string;
}

interface PageData {
  displayId: string;
  employeeName: string;
  contractStartDate: string | null;
  contractEndDate: string;
  organization: string;
  organizationId: string;
  fieldConfig: ContractEndFieldConfig[];
  betriebsstaetten: Betriebsstaette[];
  status: string;
  decision: string | null;
  declineReason: string | null;
  alreadySubmitted: boolean;
  renewalData: Record<string, unknown> | null;
}

type FormState = {
  vertragsbeginn: string;
  befristet: boolean;
  vertragsende: string;
  befristungSachgrund: string;
  vollzeit: boolean;
  wochenstunden: string;
  tageProWoche: string;
  verguetungsmodell: string;
  entgeltgruppe: string;
  stufe: string;
  urlaubstageProJahr: string;
  probezeit: boolean;
  probezeitMonate: string;
  stellenbeschreibung: string;
  betriebsstaetteOrgId: string;
  zusatzvereinbarungen: string;
};

function dateInput(v: unknown): string {
  if (!v || typeof v !== "string") return "";
  return v.slice(0, 10);
}

const INPUT =
  "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

const PROBEZEIT_HINT =
  "Hinweis: Bei Verlängerung desselben Arbeitsverhältnisses ist eine erneute Probezeit i.d.R. unzulässig.";

export default function VertragFormularPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [decision, setDecision] = useState<"" | "UEBERNAHME" | "KEINE_UEBERNAHME">("");
  const [declineReason, setDeclineReason] = useState("");

  const [form, setForm] = useState<FormState>({
    vertragsbeginn: "",
    befristet: false,
    vertragsende: "",
    befristungSachgrund: "",
    vollzeit: true,
    wochenstunden: "",
    tageProWoche: "",
    verguetungsmodell: "",
    entgeltgruppe: "",
    stufe: "",
    urlaubstageProJahr: "",
    probezeit: false,
    probezeitMonate: "",
    stellenbeschreibung: "",
    betriebsstaetteOrgId: "",
    zusatzvereinbarungen: "",
  });

  // Sichtbarkeit / Pflicht / Label pro Mandant (Fallback: Defaults)
  const helper = useMemo(
    () => new ContractEndFieldHelper(pageData?.fieldConfig ?? null),
    [pageData],
  );
  const vis = (n: string) => helper.isVisible(n);
  const lbl = (n: string) => helper.getLabel(n) + (helper.isRequired(n) ? " *" : "");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/vertrag-formular/${token}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Der Link ist ungültig oder abgelaufen.");
        return;
      }
      const j: PageData = await res.json();
      setPageData(j);
      if (j.alreadySubmitted) setSubmitted(true);
      if (j.decision === "UEBERNAHME" || j.decision === "KEINE_UEBERNAHME") setDecision(j.decision);
      if (j.declineReason) setDeclineReason(j.declineReason);
      const rd = j.renewalData;
      if (rd) {
        setForm((f) => ({
          ...f,
          vertragsbeginn: dateInput(rd.vertragsbeginn),
          befristet: Boolean(rd.befristet),
          vertragsende: dateInput(rd.vertragsende),
          befristungSachgrund: (rd.befristungSachgrund as string) || "",
          vollzeit: rd.vollzeit == null ? true : Boolean(rd.vollzeit),
          wochenstunden: rd.wochenstunden != null ? String(rd.wochenstunden) : "",
          tageProWoche: rd.tageProWoche != null ? String(rd.tageProWoche) : "",
          verguetungsmodell: (rd.verguetungsmodell as string) || "",
          entgeltgruppe: (rd.entgeltgruppe as string) || "",
          stufe: (rd.stufe as string) || "",
          urlaubstageProJahr: rd.urlaubstageProJahr != null ? String(rd.urlaubstageProJahr) : "",
          probezeit: Boolean(rd.probezeit),
          probezeitMonate: rd.probezeitMonate != null ? String(rd.probezeitMonate) : "",
          stellenbeschreibung: (rd.stellenbeschreibung as string) || "",
          betriebsstaetteOrgId: (rd.betriebsstaetteOrgId as string) || "",
          zusatzvereinbarungen: (rd.zusatzvereinbarungen as string) || "",
        }));
      }
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function buildPayload(): Record<string, unknown> {
    const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));
    return {
      decision: decision || undefined,
      declineReason: decision === "KEINE_UEBERNAHME" ? declineReason || undefined : undefined,
      vertragsbeginn: form.vertragsbeginn || undefined,
      befristet: form.befristet,
      vertragsende: form.befristet ? form.vertragsende || undefined : undefined,
      befristungSachgrund: form.befristet ? form.befristungSachgrund || undefined : undefined,
      vollzeit: form.vollzeit,
      wochenstunden: num(form.wochenstunden),
      tageProWoche: num(form.tageProWoche),
      verguetungsmodell: form.verguetungsmodell || undefined,
      entgeltgruppe: form.entgeltgruppe || undefined,
      stufe: form.stufe || undefined,
      urlaubstageProJahr: num(form.urlaubstageProJahr),
      probezeit: form.probezeit,
      probezeitMonate: form.probezeit ? num(form.probezeitMonate) : undefined,
      stellenbeschreibung: form.stellenbeschreibung || undefined,
      betriebsstaetteOrgId: form.betriebsstaetteOrgId || undefined,
      zusatzvereinbarungen: form.zusatzvereinbarungen || undefined,
    };
  }

  async function zwischenspeichern() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/vertrag-formular/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error || "Speichern fehlgeschlagen.");
        return;
      }
      setMsg("Zwischengespeichert.");
    } catch {
      setMsg("Verbindungsfehler.");
    } finally {
      setSaving(false);
    }
  }

  /** Sichtbare Pflichtfelder pruefen (mandantenspezifisch). */
  function missingRequired(): string | null {
    const checks: [string, string, boolean][] = [
      ["vertragsbeginn", form.vertragsbeginn, true],
      ["vertragsende", form.vertragsende, form.befristet],
      ["befristungSachgrund", form.befristungSachgrund, form.befristet],
      ["wochenstunden", form.wochenstunden, true],
      ["tageProWoche", form.tageProWoche, true],
      ["verguetungsmodell", form.verguetungsmodell, true],
      ["entgeltgruppe", form.entgeltgruppe, true],
      ["stufe", form.stufe, true],
      ["urlaubstageProJahr", form.urlaubstageProJahr, true],
      ["betriebsstaette", form.betriebsstaetteOrgId, true],
      ["stellenbeschreibung", form.stellenbeschreibung, true],
      ["probezeitMonate", form.probezeitMonate, form.probezeit],
      ["zusatzvereinbarungen", form.zusatzvereinbarungen, true],
    ];
    for (const [name, val, relevant] of checks) {
      if (relevant && vis(name) && helper.isRequired(name) && !String(val).trim()) {
        return helper.getLabel(name);
      }
    }
    return null;
  }

  async function absenden() {
    if (!decision) {
      setMsg("Bitte treffen Sie zuerst eine Entscheidung (übernehmen ja/nein).");
      return;
    }
    if (decision === "KEINE_UEBERNAHME" && !declineReason.trim()) {
      setMsg("Bitte geben Sie eine kurze Begründung für die Nicht-Übernahme an.");
      return;
    }
    if (decision === "UEBERNAHME") {
      const missing = missingRequired();
      if (missing) {
        setMsg(`Bitte füllen Sie das Pflichtfeld „${missing}" aus.`);
        return;
      }
    }
    const confirmText =
      decision === "UEBERNAHME"
        ? "Vertragsdaten verbindlich absenden? Danach ist keine Änderung mehr möglich."
        : "Nicht-Übernahme verbindlich melden? Danach ist keine Änderung mehr möglich.";
    if (!window.confirm(confirmText)) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/vertrag-formular/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error || "Absenden fehlgeschlagen.");
        return;
      }
      setSubmitted(true);
    } catch {
      setMsg("Verbindungsfehler.");
    } finally {
      setSubmitting(false);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // ----- Zustaende -----
  if (loading) {
    return (
      <Shell>
        <p className="py-16 text-center text-sm text-muted-foreground">Wird geladen…</p>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="px-6 py-12 text-center">
          <h1 className="text-lg font-bold text-foreground">Link nicht gültig</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </Shell>
    );
  }

  if (submitted) {
    return (
      <Shell subtitle={pageData ? `für ${pageData.employeeName} · ${pageData.organization}` : undefined}>
        <div className="px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-credo-gruen/10">
            <svg className="h-7 w-7 text-credo-gruen" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-foreground">Vielen Dank!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {decision === "KEINE_UEBERNAHME"
              ? "Ihre Rückmeldung (keine Weiterbeschäftigung) wurde übermittelt. Die Personalabteilung übernimmt alles Weitere."
              : "Die Vertragsdaten wurden erfolgreich übermittelt. Die Personalabteilung übernimmt alles Weitere."}
          </p>
        </div>
      </Shell>
    );
  }

  const betriebsstaetten = pageData?.betriebsstaetten ?? [];

  return (
    <Shell subtitle={pageData ? `für ${pageData.employeeName} · ${pageData.organization}` : undefined}>
      <div className="px-5 py-6 sm:px-8">
        <p className="mb-5 text-sm text-muted-foreground">
          Bisheriges Vertragsende: <strong className="text-foreground">{pageData ? new Date(pageData.contractEndDate).toLocaleDateString("de-DE") : ""}</strong>.
          Bitte entscheiden Sie, ob der Mitarbeiter über das Vertragsende hinaus weiterbeschäftigt wird.
        </p>

        {msg && (
          <div className="mb-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">{msg}</div>
        )}

        {/* Entscheidung der Fuehrungskraft */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setDecision("UEBERNAHME")}
            className={`rounded-xl border-2 p-4 text-left transition-colors ${
              decision === "UEBERNAHME" ? "border-credo-gruen bg-credo-gruen/5" : "border-border hover:border-credo-gruen/50"
            }`}
          >
            <p className="text-sm font-bold text-foreground">✓ Ja, weiterbeschäftigen</p>
            <p className="mt-1 text-xs text-muted-foreground">Neue Vertragsdaten erfassen.</p>
          </button>
          <button
            type="button"
            onClick={() => setDecision("KEINE_UEBERNAHME")}
            className={`rounded-xl border-2 p-4 text-left transition-colors ${
              decision === "KEINE_UEBERNAHME" ? "border-credo-rot bg-credo-rot/5" : "border-border hover:border-credo-rot/50"
            }`}
          >
            <p className="text-sm font-bold text-foreground">✕ Nein, nicht weiterbeschäftigen</p>
            <p className="mt-1 text-xs text-muted-foreground">Das Arbeitsverhältnis endet mit dem Vertragsende.</p>
          </button>
        </div>

        {decision === "UEBERNAHME" && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {vis("vertragsbeginn") && (
                <div>
                  <label className="text-sm font-medium">{lbl("vertragsbeginn")}</label>
                  <input type="date" value={form.vertragsbeginn} onChange={(e) => set("vertragsbeginn", e.target.value)} className={INPUT} />
                </div>
              )}
              {vis("befristet") && (
                <div className="flex items-end gap-2 pb-2">
                  <input id="befristet" type="checkbox" checked={form.befristet} onChange={(e) => set("befristet", e.target.checked)} className="h-4 w-4" />
                  <label htmlFor="befristet" className="text-sm font-medium">{helper.getLabel("befristet")}</label>
                </div>
              )}
              {form.befristet && vis("vertragsende") && (
                <div>
                  <label className="text-sm font-medium">{lbl("vertragsende")}</label>
                  <input type="date" value={form.vertragsende} onChange={(e) => set("vertragsende", e.target.value)} className={INPUT} />
                </div>
              )}
              {form.befristet && vis("befristungSachgrund") && (
                <div>
                  <label className="text-sm font-medium">{lbl("befristungSachgrund")}</label>
                  <input type="text" value={form.befristungSachgrund} onChange={(e) => set("befristungSachgrund", e.target.value)} className={INPUT} />
                </div>
              )}
              {vis("wochenstunden") && (
                <div>
                  <label className="text-sm font-medium">{lbl("wochenstunden")}</label>
                  <input type="text" inputMode="decimal" value={form.wochenstunden} onChange={(e) => set("wochenstunden", e.target.value)} placeholder="z.B. 25,5" className={INPUT} />
                </div>
              )}
              {vis("tageProWoche") && (
                <div>
                  <label className="text-sm font-medium">{lbl("tageProWoche")}</label>
                  <input type="text" inputMode="numeric" value={form.tageProWoche} onChange={(e) => set("tageProWoche", e.target.value)} className={INPUT} />
                </div>
              )}
              {vis("vollzeit") && (
                <div className="flex items-end gap-2 pb-2">
                  <input id="vollzeit" type="checkbox" checked={form.vollzeit} onChange={(e) => set("vollzeit", e.target.checked)} className="h-4 w-4" />
                  <label htmlFor="vollzeit" className="text-sm font-medium">{helper.getLabel("vollzeit")}</label>
                </div>
              )}
              {vis("verguetungsmodell") && (
                <div>
                  <label className="text-sm font-medium">{lbl("verguetungsmodell")}</label>
                  <input type="text" value={form.verguetungsmodell} onChange={(e) => set("verguetungsmodell", e.target.value)} placeholder="z.B. TV-L" className={INPUT} />
                </div>
              )}
              {vis("entgeltgruppe") && (
                <div>
                  <label className="text-sm font-medium">{lbl("entgeltgruppe")}</label>
                  <input type="text" value={form.entgeltgruppe} onChange={(e) => set("entgeltgruppe", e.target.value)} placeholder="z.B. E11" className={INPUT} />
                </div>
              )}
              {vis("stufe") && (
                <div>
                  <label className="text-sm font-medium">{lbl("stufe")}</label>
                  <input type="text" value={form.stufe} onChange={(e) => set("stufe", e.target.value)} className={INPUT} />
                </div>
              )}
              {vis("urlaubstageProJahr") && (
                <div>
                  <label className="text-sm font-medium">{lbl("urlaubstageProJahr")}</label>
                  <input type="text" inputMode="numeric" value={form.urlaubstageProJahr} onChange={(e) => set("urlaubstageProJahr", e.target.value)} className={INPUT} />
                </div>
              )}
              {vis("betriebsstaette") && (
                <div>
                  <label className="text-sm font-medium">{lbl("betriebsstaette")}</label>
                  <select value={form.betriebsstaetteOrgId} onChange={(e) => set("betriebsstaetteOrgId", e.target.value)} className={INPUT}>
                    <option value="">— bitte wählen —</option>
                    {betriebsstaetten.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.mandantNumber})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {vis("probezeit") && (
                <div className="flex items-end gap-2 pb-2">
                  <input id="probezeit" type="checkbox" checked={form.probezeit} onChange={(e) => set("probezeit", e.target.checked)} className="h-4 w-4" />
                  <label htmlFor="probezeit" className="text-sm font-medium">{helper.getLabel("probezeit")}</label>
                </div>
              )}
              {form.probezeit && vis("probezeitMonate") && (
                <div>
                  <label className="text-sm font-medium">{lbl("probezeitMonate")}</label>
                  <input type="text" inputMode="numeric" value={form.probezeitMonate} onChange={(e) => set("probezeitMonate", e.target.value)} className={INPUT} />
                </div>
              )}
            </div>

            {vis("probezeit") && (
              <p className="mt-2 text-xs text-amber-700">{PROBEZEIT_HINT}</p>
            )}

            {vis("stellenbeschreibung") && (
              <div className="mt-4">
                <label className="text-sm font-medium">{lbl("stellenbeschreibung")}</label>
                <textarea value={form.stellenbeschreibung} onChange={(e) => set("stellenbeschreibung", e.target.value)} rows={2} className={INPUT} />
              </div>
            )}
            {vis("zusatzvereinbarungen") && (
              <div className="mt-4">
                <label className="text-sm font-medium">{lbl("zusatzvereinbarungen")}</label>
                <textarea value={form.zusatzvereinbarungen} onChange={(e) => set("zusatzvereinbarungen", e.target.value)} rows={2} className={INPUT} />
              </div>
            )}
          </>
        )}

        {decision === "KEINE_UEBERNAHME" && (
          <div>
            <label className="text-sm font-medium">Begründung der Nicht-Weiterbeschäftigung</label>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={3}
              placeholder="z.B. Stelle entfällt, Vertretung ausgelaufen, Bedarf gedeckt …"
              className={INPUT}
            />
            <p className="mt-1 text-xs text-muted-foreground">Diese Begründung sieht nur die Personalabteilung.</p>
          </div>
        )}

        {decision && (
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            {decision === "UEBERNAHME" && (
              <button onClick={zwischenspeichern} disabled={saving || submitting} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-50">
                {saving ? "Speichern…" : "Zwischenspeichern"}
              </button>
            )}
            <button
              onClick={absenden}
              disabled={submitting || saving}
              className={`rounded-lg px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
                decision === "KEINE_UEBERNAHME" ? "bg-credo-rot hover:bg-credo-rot/90" : "bg-credo-gruen hover:bg-credo-gruen/90"
              }`}
            >
              {submitting ? "Wird gesendet…" : decision === "KEINE_UEBERNAHME" ? "Nicht-Übernahme melden" : "Verbindlich absenden"}
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-muted px-4 py-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-lg">
        <div className="px-6 pt-6 pb-4 text-center sm:px-8">
          <p className="text-2xl font-extrabold tracking-[0.18em] text-[#575756]">CREDO</p>
          <p className="text-sm font-semibold text-[#575756]">Vertragsdaten erfassen</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <CredoLinie />
        {children}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        CREDO Gruppe – Freie Evangelische Schulen · lebensnah · wegweisend · christlich
      </p>
    </div>
  );
}
