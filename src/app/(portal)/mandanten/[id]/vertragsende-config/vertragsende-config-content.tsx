"use client";

/**
 * Mandanten-Konfiguration der Vertragsende-Formularfelder: pro Feld
 * Sichtbarkeit, Pflicht und Label. Pflichtfelder lassen sich nur bei sichtbaren
 * Feldern setzen; `alwaysVisible`-Felder koennen nicht ausgeblendet werden.
 */

import { useState } from "react";
import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";
import {
  CONTRACT_END_FIELD_REGISTRY,
  type ContractEndFieldConfig,
} from "@/lib/contract-end-fields";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

const ALWAYS_VISIBLE = new Set(
  CONTRACT_END_FIELD_REGISTRY.filter((d) => d.alwaysVisible).map((d) => d.name),
);
const HINTS = new Map(
  CONTRACT_END_FIELD_REGISTRY.filter((d) => d.hint).map((d) => [d.name, d.hint as string]),
);

export function VertragsendeConfigContent({
  user,
  organization,
  initialFields,
}: {
  user: User;
  organization: { id: string; name: string; mandantNumber: string };
  initialFields: ContractEndFieldConfig[];
}) {
  const [fields, setFields] = useState<ContractEndFieldConfig[]>(initialFields);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function update(name: string, patch: Partial<ContractEndFieldConfig>) {
    setFields((fs) => fs.map((f) => (f.name === name ? { ...f, ...patch } : f)));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/organizations/${organization.id}/contract-end-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg({ ok: false, text: j.error || "Speichern fehlgeschlagen." });
        return;
      }
      const j = await res.json();
      if (Array.isArray(j.data?.fields)) setFields(j.data.fields);
      setMsg({ ok: true, text: "Konfiguration gespeichert." });
    } catch {
      setMsg({ ok: false, text: "Verbindungsfehler." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PortalHeader user={user} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Link
          href="/mandanten"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Mandanten
        </Link>

        <h1 className="mt-3 text-xl font-bold text-foreground">Vertragsende — Formularfelder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {organization.name} ({organization.mandantNumber})
        </p>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Legen Sie fest, welche Felder die Führungskraft im Vertragsdaten-Formular sieht und ausfüllen
          muss. Diese Einstellung gilt nur für diesen Mandanten.
        </p>

        {msg && (
          <div
            className={`mt-4 rounded-lg border px-4 py-2.5 text-sm ${
              msg.ok
                ? "border-credo-gruen/30 bg-credo-gruen/10 text-credo-gruen"
                : "border-credo-rot/30 bg-credo-rot/10 text-credo-rot"
            }`}
          >
            {msg.text}
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Feld / Label</th>
                <th className="w-24 px-3 py-2 text-center font-medium">Sichtbar</th>
                <th className="w-24 px-3 py-2 text-center font-medium">Pflicht</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const locked = ALWAYS_VISIBLE.has(f.name);
                const hint = HINTS.get(f.name);
                return (
                  <tr key={f.name} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        value={f.label}
                        onChange={(e) => update(f.name, { label: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                      />
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{f.name}</p>
                      {hint && <p className="mt-1 text-xs text-amber-700">{hint}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={f.visible}
                        disabled={locked}
                        onChange={(e) => update(f.name, { visible: e.target.checked })}
                        className="h-4 w-4 disabled:opacity-40"
                        title={locked ? "Dieses Feld ist immer sichtbar." : undefined}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={f.required}
                        disabled={!f.visible}
                        onChange={(e) => update(f.name, { required: e.target.checked })}
                        className="h-4 w-4 disabled:opacity-40"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-credo-gruen px-6 py-2.5 text-sm font-semibold text-white hover:bg-credo-gruen/90 disabled:opacity-50"
          >
            {saving ? "Speichern…" : "Konfiguration speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
