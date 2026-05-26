"use client";

/**
 * Mandanten-Konfiguration Elternzeit (Client Component)
 *
 * Drei Kartenbloecke: Geschaeftsfuehrung, Einrichtungsleiter, BR Detmold,
 * + Token-Validity. Alle Felder optional — werden in Briefvorlagen
 * als Platzhalter genutzt.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { PortalHeader } from "@/components/portal-header";

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
  ezGfFirstName: string | null;
  ezGfLastName: string | null;
  ezGfTitle: string | null;
  ezSignaturePath: string | null;
  ezDefaultLeiterFirstName: string | null;
  ezDefaultLeiterLastName: string | null;
  ezDefaultLeiterEmail: string | null;
  ezBrDetmoldName: string | null;
  ezBrDetmoldEmail: string | null;
  ezBrDetmoldPhone: string | null;
  ezBrDetmoldAktenPrefix: string | null;
  ezTokenValidityDays: number;
}

type FormState = {
  ezGfFirstName: string;
  ezGfLastName: string;
  ezGfTitle: string;
  ezSignaturePath: string;
  ezDefaultLeiterFirstName: string;
  ezDefaultLeiterLastName: string;
  ezDefaultLeiterEmail: string;
  ezBrDetmoldName: string;
  ezBrDetmoldEmail: string;
  ezBrDetmoldPhone: string;
  ezBrDetmoldAktenPrefix: string;
  ezTokenValidityDays: number;
};

function toForm(o: OrganizationConfig): FormState {
  return {
    ezGfFirstName: o.ezGfFirstName ?? "",
    ezGfLastName: o.ezGfLastName ?? "",
    ezGfTitle: o.ezGfTitle ?? "",
    ezSignaturePath: o.ezSignaturePath ?? "",
    ezDefaultLeiterFirstName: o.ezDefaultLeiterFirstName ?? "",
    ezDefaultLeiterLastName: o.ezDefaultLeiterLastName ?? "",
    ezDefaultLeiterEmail: o.ezDefaultLeiterEmail ?? "",
    ezBrDetmoldName: o.ezBrDetmoldName ?? "",
    ezBrDetmoldEmail: o.ezBrDetmoldEmail ?? "",
    ezBrDetmoldPhone: o.ezBrDetmoldPhone ?? "",
    ezBrDetmoldAktenPrefix: o.ezBrDetmoldAktenPrefix ?? "",
    ezTokenValidityDays: o.ezTokenValidityDays,
  };
}

export function ElternzeitConfigContent({
  user,
  organization,
}: {
  user: User;
  organization: OrganizationConfig;
}) {
  const [form, setForm] = useState<FormState>(toForm(organization));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: Record<string, unknown> = {
        ezGfFirstName: form.ezGfFirstName.trim() || null,
        ezGfLastName: form.ezGfLastName.trim() || null,
        ezGfTitle: form.ezGfTitle.trim() || null,
        ezSignaturePath: form.ezSignaturePath.trim() || null,
        ezDefaultLeiterFirstName: form.ezDefaultLeiterFirstName.trim() || null,
        ezDefaultLeiterLastName: form.ezDefaultLeiterLastName.trim() || null,
        ezDefaultLeiterEmail: form.ezDefaultLeiterEmail.trim() || null,
        ezBrDetmoldName: form.ezBrDetmoldName.trim() || null,
        ezBrDetmoldEmail: form.ezBrDetmoldEmail.trim() || null,
        ezBrDetmoldPhone: form.ezBrDetmoldPhone.trim() || null,
        ezBrDetmoldAktenPrefix: form.ezBrDetmoldAktenPrefix.trim() || null,
        ezTokenValidityDays: form.ezTokenValidityDays,
      };

      const res = await fetch(
        `/api/organizations/${organization.id}/elternzeit-config`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
          <h1 className="text-2xl font-bold tracking-tight">
            Elternzeit-Konfiguration
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium">{organization.name}</span> ·{" "}
            Mandant {organization.mandantNumber}
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
          {/* Geschaeftsfuehrung */}
          <section className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Geschaeftsfuehrung / Unterschrift</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Wird auf endgültigen Genehmigungen und Briefen als Unterzeichner
              aufgefuehrt.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Vorname</label>
                <input
                  type="text"
                  value={form.ezGfFirstName}
                  onChange={(e) => update("ezGfFirstName", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder="z.B. Eduard"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Nachname</label>
                <input
                  type="text"
                  value={form.ezGfLastName}
                  onChange={(e) => update("ezGfLastName", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder="z.B. Reimer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Titel / Funktion</label>
                <input
                  type="text"
                  value={form.ezGfTitle}
                  onChange={(e) => update("ezGfTitle", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder="z.B. Geschaeftsfuehrer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Unterschrift-Datei (optional)</label>
                <input
                  type="text"
                  value={form.ezSignaturePath}
                  onChange={(e) => update("ezSignaturePath", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder="uploads/signatures/..."
                />
              </div>
            </div>
          </section>

          {/* Standard-Einrichtungsleiter */}
          <section className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Standard-Einrichtungsleitung</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Wird beim Anlegen neuer Vorgaenge als Default vorgeschlagen
              (Phase-2-Workflow Genehmigung via Magic Link).
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Vorname</label>
                <input
                  type="text"
                  value={form.ezDefaultLeiterFirstName}
                  onChange={(e) =>
                    update("ezDefaultLeiterFirstName", e.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Nachname</label>
                <input
                  type="text"
                  value={form.ezDefaultLeiterLastName}
                  onChange={(e) =>
                    update("ezDefaultLeiterLastName", e.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium">E-Mail</label>
                <input
                  type="email"
                  value={form.ezDefaultLeiterEmail}
                  onChange={(e) =>
                    update("ezDefaultLeiterEmail", e.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder="leitung@..."
                />
              </div>
            </div>
          </section>

          {/* BR Detmold */}
          <section className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Bezirksregierung Detmold</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Kontaktdaten Dezernat 41 für BR-Schreiben (PSI / Beamte).
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">
                  Ansprechpartner / Dezernat
                </label>
                <input
                  type="text"
                  value={form.ezBrDetmoldName}
                  onChange={(e) => update("ezBrDetmoldName", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder="z.B. Dezernat 41"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">E-Mail</label>
                <input
                  type="email"
                  value={form.ezBrDetmoldEmail}
                  onChange={(e) => update("ezBrDetmoldEmail", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Telefon</label>
                <input
                  type="text"
                  value={form.ezBrDetmoldPhone}
                  onChange={(e) => update("ezBrDetmoldPhone", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder="+49 5231 71-0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Aktenzeichen-Prefix</label>
                <input
                  type="text"
                  value={form.ezBrDetmoldAktenPrefix}
                  onChange={(e) =>
                    update("ezBrDetmoldAktenPrefix", e.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder="optional"
                />
              </div>
            </div>
          </section>

          {/* Token & Sonstiges */}
          <section className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Magic Link Konfiguration</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">
                  Token-Gueltigkeit (Tage)
                </label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={form.ezTokenValidityDays}
                  onChange={(e) =>
                    update(
                      "ezTokenValidityDays",
                      Math.max(1, Math.min(180, Number(e.target.value) || 30)),
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Standard: 30 Tage (1–180 erlaubt)
                </p>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/mandanten"
              className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Abbrechen
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Speichert ..." : "Speichern"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
