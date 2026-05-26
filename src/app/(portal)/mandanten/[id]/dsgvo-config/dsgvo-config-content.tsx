"use client";

/**
 * Mandanten-Konfiguration "Verantwortliche Stelle" (DSGVO) — Client Component
 *
 * Vier Felder (Name, Strasse, PLZ, Ort). Leere Felder fallen auf den globalen
 * Default zurueck — eine Live-Vorschau zeigt den effektiv genutzten Text.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import { PortalHeader } from "@/components/portal-header";
import {
  DEFAULT_VERANTWORTLICHE_STELLE,
  formatVerantwortlicheStelle,
} from "@/lib/dsgvo";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface OrganizationConfig {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
  dsgvoVerantwortlicheName: string | null;
  dsgvoVerantwortlicheStrasse: string | null;
  dsgvoVerantwortlichePlz: string | null;
  dsgvoVerantwortlicheOrt: string | null;
}

type FormState = {
  dsgvoVerantwortlicheName: string;
  dsgvoVerantwortlicheStrasse: string;
  dsgvoVerantwortlichePlz: string;
  dsgvoVerantwortlicheOrt: string;
};

export function DsgvoConfigContent({
  user,
  organization,
}: {
  user: User;
  organization: OrganizationConfig;
}) {
  const [form, setForm] = useState<FormState>({
    dsgvoVerantwortlicheName: organization.dsgvoVerantwortlicheName ?? "",
    dsgvoVerantwortlicheStrasse: organization.dsgvoVerantwortlicheStrasse ?? "",
    dsgvoVerantwortlichePlz: organization.dsgvoVerantwortlichePlz ?? "",
    dsgvoVerantwortlicheOrt: organization.dsgvoVerantwortlicheOrt ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  // Live-Vorschau des effektiv genutzten Textes (mit Default-Fallback)
  const preview = formatVerantwortlicheStelle({
    dsgvoVerantwortlicheName: form.dsgvoVerantwortlicheName,
    dsgvoVerantwortlicheStrasse: form.dsgvoVerantwortlicheStrasse,
    dsgvoVerantwortlichePlz: form.dsgvoVerantwortlichePlz,
    dsgvoVerantwortlicheOrt: form.dsgvoVerantwortlicheOrt,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/organizations/${organization.id}/dsgvo-config`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dsgvoVerantwortlicheName: form.dsgvoVerantwortlicheName.trim() || null,
            dsgvoVerantwortlicheStrasse: form.dsgvoVerantwortlicheStrasse.trim() || null,
            dsgvoVerantwortlichePlz: form.dsgvoVerantwortlichePlz.trim() || null,
            dsgvoVerantwortlicheOrt: form.dsgvoVerantwortlicheOrt.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Speichern fehlgeschlagen");
        return;
      }
      setSuccess("Konfiguration gespeichert.");
      setTimeout(() => setSuccess(null), 4000);
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/mandanten"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zu Mandanten
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-credo-blau" />
            Verantwortliche Stelle (DSGVO)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium">{organization.name}</span> · Mandant{" "}
            {organization.mandantNumber}
            {organization.shortName ? ` · ${organization.shortName}` : ""}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-3 text-sm text-credo-rot">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 px-4 py-3 text-sm text-credo-gruen">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Verantwortliche Stelle</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Diese Angaben erscheinen im Personalfragebogen (Datenschutz&shy;erklärung)
              und stehen als Platzhalter für Briefe zur Verfügung. Leere Felder
              werden durch den Standardwert ersetzt.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium">Name der Stelle</label>
                <input
                  type="text"
                  value={form.dsgvoVerantwortlicheName}
                  onChange={(e) => update("dsgvoVerantwortlicheName", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder={DEFAULT_VERANTWORTLICHE_STELLE.name}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium">Straße &amp; Hausnummer</label>
                <input
                  type="text"
                  value={form.dsgvoVerantwortlicheStrasse}
                  onChange={(e) => update("dsgvoVerantwortlicheStrasse", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder={DEFAULT_VERANTWORTLICHE_STELLE.strasse}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">PLZ</label>
                <input
                  type="text"
                  value={form.dsgvoVerantwortlichePlz}
                  onChange={(e) => update("dsgvoVerantwortlichePlz", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder={DEFAULT_VERANTWORTLICHE_STELLE.plz}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Ort</label>
                <input
                  type="text"
                  value={form.dsgvoVerantwortlicheOrt}
                  onChange={(e) => update("dsgvoVerantwortlicheOrt", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder={DEFAULT_VERANTWORTLICHE_STELLE.ort}
                />
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-muted/60 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Vorschau (so erscheint es im Fragebogen):
              </p>
              <p className="mt-1 text-sm text-foreground">
                Verantwortliche Stelle: {preview}.
              </p>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-credo-blau px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
