"use client";

/**
 * Schulferien NRW — CRUD-Verwaltung
 *
 * Anlegen, Bearbeiten, Aktiv-Toggle, Löschen.
 * Wird für Feriensperrfrist-Check (§ 11 FrUrlV NRW) im Elternzeit-Antrag genutzt.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Save, X } from "lucide-react";
import { PortalHeader } from "@/components/portal-header";
import { ConfirmDeleteModal } from "@/components/elternzeit/elternzeit-modals";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface SchulferienEintrag {
  id: string;
  bezeichnung: string;
  von: string;
  bis: string;
  ferienTyp: "SOMMER" | "SONSTIGE";
  schuljahr: string;
  aktiv: boolean;
}

type FormState = Omit<SchulferienEintrag, "id">;

const EMPTY: FormState = {
  bezeichnung: "",
  von: "",
  bis: "",
  ferienTyp: "SONSTIGE",
  schuljahr: "",
  aktiv: true,
};

export function SchulferienContent({ user }: { user: User }) {
  const [items, setItems] = useState<SchulferienEintrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/schulferien");
    if (res.ok) {
      const j = await res.json();
      setItems(
        j.data.map((d: SchulferienEintrag) => ({
          ...d,
          von: d.von.slice(0, 10),
          bis: d.bis.slice(0, 10),
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (it: SchulferienEintrag) => {
    setEditId(it.id);
    setForm({
      bezeichnung: it.bezeichnung,
      von: it.von,
      bis: it.bis,
      ferienTyp: it.ferienTyp,
      schuljahr: it.schuljahr,
      aktiv: it.aktiv,
    });
    setShowNew(false);
  };

  const startNew = () => {
    setEditId(null);
    setForm(EMPTY);
    setShowNew(true);
  };

  const cancel = () => {
    setEditId(null);
    setShowNew(false);
    setForm(EMPTY);
    setError(null);
  };

  const save = async () => {
    setError(null);
    const url = editId ? `/api/schulferien/${editId}` : "/api/schulferien";
    const method = editId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Speichern fehlgeschlagen");
      return;
    }
    cancel();
    load();
  };

  const remove = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/schulferien/${deleteId}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteId(null);
      load();
    }
  };

  const toggleAktiv = async (it: SchulferienEintrag) => {
    await fetch(`/api/schulferien/${it.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aktiv: !it.aktiv }),
    });
    load();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/einstellungen"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zu Einstellungen
          </Link>
        </div>

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Schulferien NRW</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pflege des Ferienkalenders für Feriensperrfrist-Check
              (§ 11 FrUrlV NRW) im Elternzeit-Antrag.
            </p>
          </div>
          <button
            onClick={startNew}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Neuer Eintrag
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-3 text-sm text-credo-rot">
            {error}
          </div>
        )}

        {(showNew || editId) && (
          <div className="mb-6 rounded-lg border bg-card p-6">
            <h3 className="mb-4 text-sm font-semibold">
              {editId ? "Eintrag bearbeiten" : "Neuer Ferien-Eintrag"}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium">Bezeichnung</label>
                <input
                  type="text"
                  value={form.bezeichnung}
                  onChange={(e) =>
                    setForm({ ...form, bezeichnung: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder="z.B. Sommerferien 2026"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Von</label>
                <input
                  type="date"
                  value={form.von}
                  onChange={(e) => setForm({ ...form, von: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Bis</label>
                <input
                  type="date"
                  value={form.bis}
                  onChange={(e) => setForm({ ...form, bis: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Typ</label>
                <select
                  value={form.ferienTyp}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      ferienTyp: e.target.value as FormState["ferienTyp"],
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                >
                  <option value="SOMMER">Sommer (6 Wochen Sperrzone)</option>
                  <option value="SONSTIGE">Sonstige (2 Wochen Sperrzone)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">Schuljahr</label>
                <input
                  type="text"
                  value={form.schuljahr}
                  onChange={(e) =>
                    setForm({ ...form, schuljahr: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
                  placeholder="z.B. 2025/2026"
                />
              </div>
              <label className="flex items-center gap-2 sm:col-span-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.aktiv}
                  onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                Aktiv (wird im Sperrfrist-Check beruecksichtigt)
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={cancel}
                className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium"
              >
                <X className="h-4 w-4" />
                Abbrechen
              </button>
              <button
                onClick={save}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                <Save className="h-4 w-4" />
                Speichern
              </button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Lade Schulferien...
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Keine Eintraege vorhanden.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-4 py-3">Bezeichnung</th>
                  <th className="px-4 py-3">Schuljahr</th>
                  <th className="px-4 py-3">Von</th>
                  <th className="px-4 py-3">Bis</th>
                  <th className="px-4 py-3">Typ</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it) => (
                  <tr
                    key={it.id}
                    className={`text-sm ${it.aktiv ? "" : "opacity-50"}`}
                  >
                    <td className="px-4 py-3 font-medium">{it.bezeichnung}</td>
                    <td className="px-4 py-3">{it.schuljahr}</td>
                    <td className="px-4 py-3">
                      {new Date(it.von).toLocaleDateString("de-DE")}
                    </td>
                    <td className="px-4 py-3">
                      {new Date(it.bis).toLocaleDateString("de-DE")}
                    </td>
                    <td className="px-4 py-3">
                      {it.ferienTyp === "SOMMER" ? "Sommer" : "Sonstige"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleAktiv(it)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          it.aktiv
                            ? "bg-credo-gruen/10 text-credo-gruen"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {it.aktiv ? "Aktiv" : "Inaktiv"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(it)}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => setDeleteId(it.id)}
                          className="rounded border border-destructive px-2 py-1 text-xs text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {deleteId && (
        <ConfirmDeleteModal
          titel="Ferien-Eintrag löschen?"
          beschreibung="Der Eintrag wird unwiderruflich entfernt. Verwende stattdessen 'Aktiv' deaktivieren, um den Eintrag für Berechnungen auszublenden."
          bestaetigungsText="Endgültig löschen"
          onClose={() => setDeleteId(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
