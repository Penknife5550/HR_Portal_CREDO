"use client";

/**
 * Oeffentliche Seite (Magic-Link): Vorgesetzte:r erfasst die Vertragsdaten fuer
 * eine Verlaengerung (Strang A). Kein Login. GET laedt, PUT speichert zwischen,
 * POST sendet verbindlich ab.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

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

interface PageData {
  displayId: string;
  employeeName: string;
  contractStartDate: string | null;
  contractEndDate: string;
  organization: string;
  status: string;
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
  entgeltgruppe: string;
  stufe: string;
  urlaubstageProJahr: string;
  probezeit: boolean;
  probezeitMonate: string;
  stellenbeschreibung: string;
  betriebsstaette: string;
  zusatzvereinbarungen: string;
};

function dateInput(v: unknown): string {
  if (!v || typeof v !== "string") return "";
  return v.slice(0, 10);
}

const INPUT =
  "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

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

  const [form, setForm] = useState<FormState>({
    vertragsbeginn: "",
    befristet: false,
    vertragsende: "",
    befristungSachgrund: "",
    vollzeit: true,
    wochenstunden: "",
    entgeltgruppe: "",
    stufe: "",
    urlaubstageProJahr: "",
    probezeit: false,
    probezeitMonate: "",
    stellenbeschreibung: "",
    betriebsstaette: "",
    zusatzvereinbarungen: "",
  });

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
          entgeltgruppe: (rd.entgeltgruppe as string) || "",
          stufe: (rd.stufe as string) || "",
          urlaubstageProJahr: rd.urlaubstageProJahr != null ? String(rd.urlaubstageProJahr) : "",
          probezeit: Boolean(rd.probezeit),
          probezeitMonate: rd.probezeitMonate != null ? String(rd.probezeitMonate) : "",
          stellenbeschreibung: (rd.stellenbeschreibung as string) || "",
          betriebsstaette: (rd.betriebsstaette as string) || "",
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
      vertragsbeginn: form.vertragsbeginn || undefined,
      befristet: form.befristet,
      vertragsende: form.befristet ? form.vertragsende || undefined : undefined,
      befristungSachgrund: form.befristet ? form.befristungSachgrund || undefined : undefined,
      vollzeit: form.vollzeit,
      wochenstunden: num(form.wochenstunden),
      entgeltgruppe: form.entgeltgruppe || undefined,
      stufe: form.stufe || undefined,
      urlaubstageProJahr: num(form.urlaubstageProJahr),
      probezeit: form.probezeit,
      probezeitMonate: form.probezeit ? num(form.probezeitMonate) : undefined,
      stellenbeschreibung: form.stellenbeschreibung || undefined,
      betriebsstaette: form.betriebsstaette || undefined,
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

  async function absenden() {
    if (!window.confirm("Vertragsdaten verbindlich absenden? Danach ist keine Änderung mehr möglich.")) return;
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
            Die Vertragsdaten wurden erfolgreich übermittelt. Die Personalabteilung übernimmt alles Weitere.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell subtitle={pageData ? `für ${pageData.employeeName} · ${pageData.organization}` : undefined}>
      <div className="px-5 py-6 sm:px-8">
        <p className="mb-5 text-sm text-muted-foreground">
          Bisheriges Vertragsende: <strong className="text-foreground">{pageData ? new Date(pageData.contractEndDate).toLocaleDateString("de-DE") : ""}</strong>.
          Bitte erfassen Sie die Daten für die Verlängerung.
        </p>

        {msg && (
          <div className="mb-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">{msg}</div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Neuer Vertragsbeginn</label>
            <input type="date" value={form.vertragsbeginn} onChange={(e) => set("vertragsbeginn", e.target.value)} className={INPUT} />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input id="befristet" type="checkbox" checked={form.befristet} onChange={(e) => set("befristet", e.target.checked)} className="h-4 w-4" />
            <label htmlFor="befristet" className="text-sm font-medium">Befristeter Vertrag</label>
          </div>
          {form.befristet && (
            <>
              <div>
                <label className="text-sm font-medium">Neues Vertragsende</label>
                <input type="date" value={form.vertragsende} onChange={(e) => set("vertragsende", e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="text-sm font-medium">Sachgrund der Befristung</label>
                <input type="text" value={form.befristungSachgrund} onChange={(e) => set("befristungSachgrund", e.target.value)} className={INPUT} />
              </div>
            </>
          )}
          <div>
            <label className="text-sm font-medium">Wochenstunden</label>
            <input type="text" inputMode="decimal" value={form.wochenstunden} onChange={(e) => set("wochenstunden", e.target.value)} placeholder="z.B. 25,5" className={INPUT} />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input id="vollzeit" type="checkbox" checked={form.vollzeit} onChange={(e) => set("vollzeit", e.target.checked)} className="h-4 w-4" />
            <label htmlFor="vollzeit" className="text-sm font-medium">Vollzeit</label>
          </div>
          <div>
            <label className="text-sm font-medium">Entgeltgruppe</label>
            <input type="text" value={form.entgeltgruppe} onChange={(e) => set("entgeltgruppe", e.target.value)} placeholder="z.B. E11" className={INPUT} />
          </div>
          <div>
            <label className="text-sm font-medium">Stufe</label>
            <input type="text" value={form.stufe} onChange={(e) => set("stufe", e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="text-sm font-medium">Urlaubstage / Jahr</label>
            <input type="text" inputMode="numeric" value={form.urlaubstageProJahr} onChange={(e) => set("urlaubstageProJahr", e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="text-sm font-medium">Betriebsstätte</label>
            <input type="text" value={form.betriebsstaette} onChange={(e) => set("betriebsstaette", e.target.value)} className={INPUT} />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium">Stellenbeschreibung</label>
          <textarea value={form.stellenbeschreibung} onChange={(e) => set("stellenbeschreibung", e.target.value)} rows={2} className={INPUT} />
        </div>
        <div className="mt-4">
          <label className="text-sm font-medium">Zusätzliche Vereinbarungen</label>
          <textarea value={form.zusatzvereinbarungen} onChange={(e) => set("zusatzvereinbarungen", e.target.value)} rows={2} className={INPUT} />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button onClick={zwischenspeichern} disabled={saving || submitting} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-50">
            {saving ? "Speichern…" : "Zwischenspeichern"}
          </button>
          <button onClick={absenden} disabled={submitting || saving} className="rounded-lg bg-credo-gruen px-6 py-2.5 text-sm font-semibold text-white hover:bg-credo-gruen/90 disabled:opacity-50">
            {submitting ? "Wird gesendet…" : "Verbindlich absenden"}
          </button>
        </div>
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
