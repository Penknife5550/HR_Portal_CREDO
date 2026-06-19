"use client";

/**
 * Mandanten-Verwaltung – Client Component
 *
 * Ermoeglicht das Anlegen, Bearbeiten und Aktivieren/Deaktivieren
 * von Mandanten (Einrichtungen). Nur für SUPER_ADMIN.
 */

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
  shortName: string | null;
  type: string;
  isActive: boolean;
  createdAt: string;
  _count: {
    onboardings: number;
  };
}

interface MandantFormData {
  mandantNumber: string;
  name: string;
  shortName: string;
  type: string;
}

const ORGANIZATION_TYPE_LABELS: Record<string, string> = {
  GYMNASIUM: "Gymnasium",
  GESAMTSCHULE: "Gesamtschule",
  GRUNDSCHULE: "Grundschule",
  BERUFSKOLLEG: "Berufskolleg",
  KITA: "Kita",
  VERWALTUNG: "Verwaltung",
  GMBH: "GmbH",
  VEREIN: "Verein",
};

const ORGANIZATION_TYPES = Object.keys(ORGANIZATION_TYPE_LABELS);

const EMPTY_FORM: MandantFormData = {
  mandantNumber: "",
  name: "",
  shortName: "",
  type: "GYMNASIUM",
};

export function MandantenContent({ user }: { user: User }) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mandanten laden
  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/organizations");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setOrganizations(data.data || []);
    } catch (error) {
      console.error("Fehler beim Laden der Mandanten:", error);
      setErrorMessage("Mandanten konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  // Erfolgs-/Fehlermeldungen automatisch ausblenden
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Mandant aktivieren/deaktivieren
  async function handleToggleActive(org: Organization) {
    if (org.isActive) {
      const confirmed = confirm(
        `Moechten Sie "${org.name}" wirklich deaktivieren?`
      );
      if (!confirmed) return;
    }

    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !org.isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Ändern des Status");
      }
      setSuccessMessage(
        `${org.name} wurde ${org.isActive ? "deaktiviert" : "reaktiviert"}`
      );
      loadOrganizations();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Ein Fehler ist aufgetreten"
      );
    }
  }

  return (
    <div className="min-h-screen bg-muted">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Erfolgsmeldung */}
        {successMessage && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {successMessage}
          </div>
        )}

        {/* Fehlermeldung */}
        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Mandanten-Verwaltung
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Einrichtungen und Mandanten verwalten
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            + Neuer Mandant
          </button>
        </div>

        {/* Tabelle */}
        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              Lade Mandanten...
            </div>
          ) : organizations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg">Keine Mandanten vorhanden</p>
              <p className="mt-1 text-sm">
                Erstellen Sie einen neuen Mandanten über den Button oben.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                    <th className="px-4 py-3">Mandantennr.</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Kürzel</th>
                    <th className="px-4 py-3">Typ</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Vorgänge</th>
                    <th className="px-4 py-3">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {organizations.map((org) => (
                    <tr
                      key={org.id}
                      className={`transition-colors hover:bg-muted/50 ${
                        !org.isActive ? "opacity-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {org.mandantNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {org.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {org.shortName || "–"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          {ORGANIZATION_TYPE_LABELS[org.type] || org.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {org.isActive ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                            Aktiv
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                            Passiv
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {org._count.onboardings}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditOrg(org)}
                            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            Bearbeiten
                          </button>
                          <Link
                            href={`/mandanten/${org.id}/elternzeit-config`}
                            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            Elternzeit-Konfig
                          </Link>
                          <Link
                            href={`/mandanten/${org.id}/dsgvo-config`}
                            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            DSGVO-Konfig
                          </Link>
                          <Link
                            href={`/mandanten/${org.id}/bem-ansprechpartner`}
                            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            BEM-Ansprechpartner
                          </Link>
                          <Link
                            href={`/mandanten/${org.id}/starterpaket`}
                            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            Starterpaket
                          </Link>
                          <Link
                            href={`/mandanten/${org.id}/vertragsende-config`}
                            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            Vertragsende-Konfig
                          </Link>
                          <button
                            onClick={() => handleToggleActive(org)}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                              org.isActive
                                ? "border border-red-200 text-red-700 hover:bg-red-50"
                                : "border border-green-200 text-green-700 hover:bg-green-50"
                            }`}
                          >
                            {org.isActive ? "Deaktivieren" : "Reaktivieren"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Neuer Mandant Modal */}
      {showNewModal && (
        <MandantModal
          title="Neuer Mandant"
          initialData={EMPTY_FORM}
          isNew
          onClose={() => setShowNewModal(false)}
          onSave={async (data) => {
            const res = await fetch("/api/organizations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            if (!res.ok) {
              const result = await res.json();
              throw new Error(result.error || "Fehler beim Erstellen");
            }
            setSuccessMessage("Mandant wurde erfolgreich erstellt");
            loadOrganizations();
          }}
        />
      )}

      {/* Mandant bearbeiten Modal */}
      {editOrg && (
        <MandantModal
          title="Mandant bearbeiten"
          initialData={{
            mandantNumber: editOrg.mandantNumber,
            name: editOrg.name,
            shortName: editOrg.shortName || "",
            type: editOrg.type,
          }}
          isNew={false}
          onClose={() => setEditOrg(null)}
          onSave={async (data) => {
            const res = await fetch(`/api/organizations/${editOrg.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: data.name,
                shortName: data.shortName,
                type: data.type,
              }),
            });
            if (!res.ok) {
              const result = await res.json();
              throw new Error(result.error || "Fehler beim Aktualisieren");
            }
            setSuccessMessage("Mandant wurde erfolgreich aktualisiert");
            loadOrganizations();
          }}
        />
      )}
    </div>
  );
}

// =============================================
// Wiederverwendbares Modal für Neuer/Bearbeiten
// =============================================
function MandantModal({
  title,
  initialData,
  isNew,
  onClose,
  onSave,
}: {
  title: string;
  initialData: MandantFormData;
  isNew: boolean;
  onClose: () => void;
  onSave: (data: MandantFormData) => Promise<void>;
}) {
  const [formData, setFormData] = useState<MandantFormData>(initialData);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function handleChange(field: keyof MandantFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Client-seitige Validierung
    if (isNew && !formData.mandantNumber.trim()) {
      setFormError("Mandantennummer ist ein Pflichtfeld");
      return;
    }
    if (!formData.name.trim()) {
      setFormError("Name ist ein Pflichtfeld");
      return;
    }
    if (!formData.type) {
      setFormError("Typ ist ein Pflichtfeld");
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Ein Fehler ist aufgetreten"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="relative mx-4 w-full max-w-md rounded-lg border bg-card shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {formError}
            </div>
          )}

          {/* Mandantennummer */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Mandantennummer <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.mandantNumber}
              onChange={(e) => handleChange("mandantNumber", e.target.value)}
              disabled={!isNew}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="z.B. 712"
            />
            {!isNew && (
              <p className="mt-1 text-xs text-muted-foreground">
                Die Mandantennummer kann nach der Erstellung nicht geändert werden.
              </p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              placeholder="z.B. Gymnasium Minden"
            />
          </div>

          {/* Kuerzel */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Kuerzel (shortName)
            </label>
            <input
              type="text"
              value={formData.shortName}
              onChange={(e) => handleChange("shortName", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              placeholder="z.B. GYM"
            />
          </div>

          {/* Typ */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Typ <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => handleChange("type", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              {ORGANIZATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORGANIZATION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Wird gespeichert..." : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
