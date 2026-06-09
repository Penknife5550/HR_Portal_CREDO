"use client";

import { useState, useEffect, useCallback } from "react";
import { PortalHeader } from "@/components/portal-header";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface Organization {
  id: string;
  name: string;
  mandantNumber: string;
}

interface VorlageItem {
  typ: string;
  istCheckliste: boolean;
  inhalt: unknown;
  version: number;
  hatGlobal: boolean;
  hatOverride: boolean;
  default: unknown;
}

const TYP_LABELS: Record<string, string> = {
  CHECKLISTE_ERSTGESPRAECH: "Checkliste — Erstgespräch",
  CHECKLISTE_FOLGEGESPRAECH: "Checkliste — Folgegespräch",
  CHECKLISTE_GEDAECHTNISPROTOKOLL: "Checkliste — Gedächtnisprotokoll",
  EINWILLIGUNGSTEXT_DURCHFUEHRUNG: "Einwilligungstext — Durchführung (Angebot)",
  EINWILLIGUNGSTEXT_DATENSCHUTZ: "Einwilligungstext — Datenschutz",
  EINWILLIGUNGSTEXT_BR: "Einwilligungstext — Betriebsrat",
  EINWILLIGUNGSTEXT_SBV: "Einwilligungstext — Schwerbehindertenvertretung",
};

const INPUT =
  "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

export function BemVorlagenContent({ user }: { user: User }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState(""); // "" = global
  const [items, setItems] = useState<VorlageItem[]>([]);
  const [config, setConfig] = useState<{ hatBetriebsrat: boolean; hatSchwerbehindertenvertretung: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setOrgs(j.data || []))
      .catch(() => setOrgs([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const qs = orgId ? `?organizationId=${orgId}` : "";
      const res = await fetch(`/api/bem-vorlagen${qs}`);
      if (!res.ok) throw new Error("Fehler beim Laden der Vorlagen");
      const json = await res.json();
      setItems(json.data?.vorlagen || []);
      if (orgId) {
        const cRes = await fetch(`/api/organizations/${orgId}/bem-config`);
        setConfig(cRes.ok ? (await cRes.json()).data : null);
      } else {
        setConfig(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  function notify(m: string) {
    setMsg(m);
    setErr("");
    setTimeout(() => setMsg(""), 4000);
  }

  async function saveVorlage(typ: string, inhalt: unknown) {
    const res = await fetch("/api/bem-vorlagen", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typ, organizationId: orgId || null, inhalt }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Speichern fehlgeschlagen.");
      return;
    }
    notify(orgId ? "Mandanten-Vorlage gespeichert." : "Globale Vorlage gespeichert.");
    await load();
  }

  async function removeOverride(typ: string) {
    if (!orgId) return;
    const res = await fetch(`/api/bem-vorlagen?typ=${typ}&organizationId=${orgId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Entfernen fehlgeschlagen.");
      return;
    }
    notify("Mandanten-Override entfernt — es gilt wieder die globale Vorlage.");
    await load();
  }

  async function toggleConfig(field: "hatBetriebsrat" | "hatSchwerbehindertenvertretung", value: boolean) {
    if (!orgId) return;
    const res = await fetch(`/api/organizations/${orgId}/bem-config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) {
      setErr("Konfiguration konnte nicht gespeichert werden.");
      return;
    }
    setConfig((await res.json()).data);
    notify("Mandanten-Konfiguration gespeichert.");
  }

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">BEM-Vorlagen & Einstellungen</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Checklisten und Datenschutz-/Einwilligungstexte für das BEM. Bei gesetzlichen
          Änderungen hier anpassbar. Eine globale Fassung gilt für alle Mandanten; je
          Mandant kann eine eigene Fassung (Override) hinterlegt werden.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-foreground">Geltung:</label>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="">Global (alle Mandanten)</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.mandantNumber} — {o.name}
              </option>
            ))}
          </select>
        </div>

        {msg && <div className="mt-4 rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 px-4 py-2 text-sm text-credo-gruen">{msg}</div>}
        {err && <div className="mt-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">{err}</div>}

        {/* Gremien-Flags (nur in Mandanten-Ansicht) */}
        {orgId && config && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Im Betrieb vorhandene Gremien</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Steuert, ob nach Annahme des BEM automatisch BR-/SBV-Einwilligungs-Links versendet werden.
            </p>
            <div className="mt-3 space-y-2">
              <ToggleRow
                label="Betriebsrat vorhanden"
                value={config.hatBetriebsrat}
                onChange={(v) => toggleConfig("hatBetriebsrat", v)}
              />
              <ToggleRow
                label="Schwerbehindertenvertretung (SBV) vorhanden"
                hint="SBV-Link wird nur bei schwerbehinderten Fällen versendet."
                value={config.hatSchwerbehindertenvertretung}
                onChange={(v) => toggleConfig("hatSchwerbehindertenvertretung", v)}
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Lade Vorlagen…</div>
        ) : (
          <div className="mt-6 space-y-4">
            {items.map((it) => (
              <VorlageEditor
                key={it.typ}
                item={it}
                mandantView={!!orgId}
                onSave={(inhalt) => saveVorlage(it.typ, inhalt)}
                onRemoveOverride={() => removeOverride(it.typ)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-input px-3 py-2">
      <span className="text-sm text-foreground">
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? "bg-credo-gruen" : "bg-gray-300"}`}
        aria-pressed={value}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

function VorlageEditor({
  item,
  mandantView,
  onSave,
  onRemoveOverride,
}: {
  item: VorlageItem;
  mandantView: boolean;
  onSave: (inhalt: unknown) => void;
  onRemoveOverride: () => void;
}) {
  // Checkliste: ein Item pro Zeile. Text: titel + koerper.
  const initialText =
    item.inhalt && typeof item.inhalt === "object" && !Array.isArray(item.inhalt)
      ? (item.inhalt as { titel?: string; koerper?: string })
      : { titel: "", koerper: "" };
  const [lines, setLines] = useState(
    Array.isArray(item.inhalt) ? (item.inhalt as string[]).join("\n") : "",
  );
  const [titel, setTitel] = useState(initialText.titel || "");
  const [koerper, setKoerper] = useState(initialText.koerper || "");

  function handleSave() {
    if (item.istCheckliste) {
      const arr = lines.split("\n").map((l) => l.trim()).filter(Boolean);
      onSave(arr);
    } else {
      onSave({ titel: titel.trim(), koerper: koerper.trim() });
    }
  }

  const quelle = item.hatOverride
    ? "Mandanten-Override"
    : item.hatGlobal
      ? "global"
      : "Standard (Code-Default)";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{TYP_LABELS[item.typ] || item.typ}</h3>
        <span className="text-xs text-muted-foreground">
          Quelle: {quelle} · v{item.version}
        </span>
      </div>

      {item.istCheckliste ? (
        <div className="mt-2">
          <label className="text-xs text-muted-foreground">Ein Checklisten-Punkt pro Zeile</label>
          <textarea value={lines} onChange={(e) => setLines(e.target.value)} rows={8} className={INPUT} />
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Titel</label>
            <input value={titel} onChange={(e) => setTitel(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Text (wird im CREDO-Layout angezeigt)</label>
            <textarea value={koerper} onChange={(e) => setKoerper(e.target.value)} rows={6} className={INPUT} />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-credo-blau px-4 py-1.5 text-sm font-semibold text-white hover:bg-credo-blau/90"
        >
          {mandantView ? "Für Mandant speichern" : "Global speichern"}
        </button>
        {mandantView && item.hatOverride && (
          <button
            type="button"
            onClick={onRemoveOverride}
            className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Override entfernen
          </button>
        )}
      </div>
    </div>
  );
}
