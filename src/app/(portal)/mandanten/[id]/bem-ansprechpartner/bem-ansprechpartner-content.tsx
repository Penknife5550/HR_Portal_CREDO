"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
  mandantNumber: string;
  name: string;
}

interface Ansprechpartner {
  id: string;
  name: string;
  email: string;
  funktion: string | null;
  isActive: boolean;
}

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

export function BemAnsprechpartnerContent({
  user,
  organization,
}: {
  user: User;
  organization: Organization;
}) {
  const [list, setList] = useState<Ansprechpartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [funktion, setFunktion] = useState("");
  const [saving, setSaving] = useState(false);

  const base = `/api/organizations/${organization.id}/bem-ansprechpartner`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(base);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setList(json.data?.ansprechpartner || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  function notify(msg: string) {
    setSuccess(msg);
    setError("");
    setTimeout(() => setSuccess(""), 4000);
  }

  async function handleAdd() {
    setError("");
    if (!name.trim() || !email.trim()) {
      setError("Name und E-Mail sind erforderlich.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          funktion: funktion.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Fehler beim Anlegen.");
        return;
      }
      setName("");
      setEmail("");
      setFunktion("");
      notify("Ansprechpartner:in hinzugefügt.");
      load();
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(ap: Ansprechpartner) {
    const res = await fetch(`${base}/${ap.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !ap.isActive }),
    });
    if (res.ok) {
      notify(ap.isActive ? "Deaktiviert." : "Aktiviert.");
      load();
    } else {
      setError("Fehler beim Ändern.");
    }
  }

  async function handleDelete(ap: Ansprechpartner) {
    if (!confirm(`„${ap.name}" wirklich entfernen?`)) return;
    const res = await fetch(`${base}/${ap.id}`, { method: "DELETE" });
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      notify(j.hinweis || "Entfernt.");
      load();
    } else {
      setError("Fehler beim Entfernen.");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/mandanten"
          className="mb-4 inline-block text-sm text-credo-blau hover:underline"
        >
          ← Zurück zu Mandanten
        </Link>

        <h1 className="text-2xl font-bold text-foreground">
          BEM-Ansprechpartner:innen
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {organization.mandantNumber} — {organization.name}. Diese Personen kann
          der/die Beschäftigte im BEM-Einwilligungs-Formular auswählen; die gewählte
          Person wird automatisch per E-Mail informiert.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 px-4 py-2 text-sm text-credo-gruen">
            {success}
          </div>
        )}

        {/* Hinzufügen */}
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Ansprechpartner:in hinzufügen
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Funktion (optional)</label>
              <input
                value={funktion}
                onChange={(e) => setFunktion(e.target.value)}
                placeholder="z.B. BEM-Beauftragte"
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90 disabled:opacity-50"
            >
              {saving ? "Speichern…" : "Hinzufügen"}
            </button>
          </div>
        </div>

        {/* Liste */}
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">E-Mail</th>
                <th className="px-4 py-3 font-medium">Funktion</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Lade…
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Noch keine Ansprechpartner:innen hinterlegt.
                  </td>
                </tr>
              ) : (
                list.map((ap) => (
                  <tr
                    key={ap.id}
                    className={`border-b border-border last:border-0 ${ap.isActive ? "" : "opacity-50"}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{ap.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ap.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ap.funktion || "—"}</td>
                    <td className="px-4 py-3">
                      {ap.isActive ? (
                        <span className="text-credo-gruen">Aktiv</span>
                      ) : (
                        <span className="text-muted-foreground">Inaktiv</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggle(ap)}
                          className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                        >
                          {ap.isActive ? "Deaktivieren" : "Aktivieren"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ap)}
                          className="rounded-md border border-credo-rot/40 px-3 py-1 text-xs font-medium text-credo-rot hover:bg-credo-rot/10"
                        >
                          Entfernen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
