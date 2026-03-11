"use client";

/**
 * Benutzerverwaltung – Client Component
 *
 * Ermoeglicht das Anlegen, Bearbeiten und Deaktivieren von
 * HR-Portal-Benutzern (SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER).
 */

import { useState, useEffect, useCallback } from "react";
import { PortalHeader } from "@/components/portal-header";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface PortalUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  isActive: boolean;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    color: "bg-red-100 text-red-800",
  },
  HR_LEITUNG: {
    label: "HR-Leitung",
    color: "bg-blue-100 text-blue-800",
  },
  HR_SACHBEARBEITER: {
    label: "Sachbearbeiter",
    color: "bg-gray-100 text-gray-800",
  },
};

const EMPTY_FORM: UserFormData = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  role: "HR_SACHBEARBEITER",
  isActive: true,
};

export function BenutzerverwaltungContent({ user }: { user: User }) {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [editUser, setEditUser] = useState<PortalUser | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Benutzer laden
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setUsers(data.data || []);
    } catch (error) {
      console.error("Fehler beim Laden der Benutzer:", error);
      setErrorMessage("Benutzer konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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

  // Benutzer deaktivieren/reaktivieren
  async function handleToggleActive(targetUser: PortalUser) {
    if (targetUser.id === user.userId) return;

    try {
      if (targetUser.isActive) {
        // Deaktivieren via DELETE
        const res = await fetch(`/api/users/${targetUser.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Fehler beim Deaktivieren");
        }
        setSuccessMessage(
          `${targetUser.firstName} ${targetUser.lastName} wurde deaktiviert`
        );
      } else {
        // Reaktivieren via PATCH
        const res = await fetch(`/api/users/${targetUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Fehler beim Reaktivieren");
        }
        setSuccessMessage(
          `${targetUser.firstName} ${targetUser.lastName} wurde reaktiviert`
        );
      }
      loadUsers();
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
              Benutzerverwaltung
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              HR-Portal Benutzer verwalten
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            + Neuer Benutzer
          </button>
        </div>

        {/* Tabelle */}
        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              Lade Benutzer...
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg">Keine Benutzer vorhanden</p>
              <p className="mt-1 text-sm">
                Erstellen Sie einen neuen Benutzer ueber den Button oben.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">E-Mail</th>
                    <th className="px-4 py-3">Rolle</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Letzter Login</th>
                    <th className="px-4 py-3">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u) => {
                    const roleInfo =
                      ROLE_LABELS[u.role] || ROLE_LABELS.HR_SACHBEARBEITER;
                    const isSelf = u.id === user.userId;

                    return (
                      <tr
                        key={u.id}
                        className="transition-colors hover:bg-muted/50"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {u.firstName} {u.lastName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {u.email}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${roleInfo.color}`}
                          >
                            {roleInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.isActive ? (
                            <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                              Aktiv
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                              Inaktiv
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleDateString(
                                "de-DE",
                                {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )
                            : "Noch nie"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditUser(u)}
                              className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                            >
                              Bearbeiten
                            </button>
                            {!isSelf && (
                              <button
                                onClick={() => handleToggleActive(u)}
                                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                  u.isActive
                                    ? "border border-red-200 text-red-700 hover:bg-red-50"
                                    : "border border-green-200 text-green-700 hover:bg-green-50"
                                }`}
                              >
                                {u.isActive ? "Deaktivieren" : "Reaktivieren"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Neuer Benutzer Modal */}
      {showNewModal && (
        <UserModal
          title="Neuer Benutzer"
          initialData={EMPTY_FORM}
          showPasswordRequired
          onClose={() => setShowNewModal(false)}
          onSave={async (data) => {
            const res = await fetch("/api/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            if (!res.ok) {
              const result = await res.json();
              throw new Error(result.error || "Fehler beim Erstellen");
            }
            setSuccessMessage("Benutzer wurde erfolgreich erstellt");
            loadUsers();
          }}
        />
      )}

      {/* Benutzer bearbeiten Modal */}
      {editUser && (
        <UserModal
          title="Benutzer bearbeiten"
          initialData={{
            firstName: editUser.firstName,
            lastName: editUser.lastName,
            email: editUser.email,
            password: "",
            role: editUser.role,
            isActive: editUser.isActive,
          }}
          showIsActive
          showPasswordRequired={false}
          onClose={() => setEditUser(null)}
          onSave={async (data) => {
            const payload: Record<string, unknown> = {
              firstName: data.firstName,
              lastName: data.lastName,
              email: data.email,
              role: data.role,
              isActive: data.isActive,
            };
            // Passwort nur mitsenden wenn ausgefuellt
            if (data.password && data.password.length > 0) {
              payload.password = data.password;
            }
            const res = await fetch(`/api/users/${editUser.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const result = await res.json();
              throw new Error(result.error || "Fehler beim Aktualisieren");
            }
            setSuccessMessage("Benutzer wurde erfolgreich aktualisiert");
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

// =============================================
// Wiederverwendbares Modal fuer Neuer/Bearbeiten
// =============================================
function UserModal({
  title,
  initialData,
  showPasswordRequired = true,
  showIsActive = false,
  onClose,
  onSave,
}: {
  title: string;
  initialData: UserFormData;
  showPasswordRequired?: boolean;
  showIsActive?: boolean;
  onClose: () => void;
  onSave: (data: UserFormData) => Promise<void>;
}) {
  const [formData, setFormData] = useState<UserFormData>(initialData);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function handleChange(
    field: keyof UserFormData,
    value: string | boolean
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Client-seitige Validierung
    if (!formData.firstName.trim()) {
      setFormError("Vorname ist ein Pflichtfeld");
      return;
    }
    if (!formData.lastName.trim()) {
      setFormError("Nachname ist ein Pflichtfeld");
      return;
    }
    if (!formData.email.trim()) {
      setFormError("E-Mail ist ein Pflichtfeld");
      return;
    }
    if (showPasswordRequired && formData.password.length < 6) {
      setFormError("Passwort muss mindestens 6 Zeichen lang sein");
      return;
    }
    if (
      !showPasswordRequired &&
      formData.password.length > 0 &&
      formData.password.length < 6
    ) {
      setFormError("Passwort muss mindestens 6 Zeichen lang sein");
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

          {/* Vorname */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Vorname <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              placeholder="Max"
            />
          </div>

          {/* Nachname */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Nachname <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              placeholder="Mustermann"
            />
          </div>

          {/* E-Mail */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              E-Mail <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              placeholder="max.mustermann@credo.schule"
            />
          </div>

          {/* Passwort */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Passwort{" "}
              {showPasswordRequired ? (
                <span className="text-red-500">*</span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  (leer lassen um beizubehalten)
                </span>
              )}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => handleChange("password", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              placeholder={showPasswordRequired ? "Mindestens 6 Zeichen" : "Neues Passwort eingeben..."}
            />
          </div>

          {/* Rolle */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Rolle
            </label>
            <select
              value={formData.role}
              onChange={(e) => handleChange("role", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="HR_SACHBEARBEITER">Sachbearbeiter</option>
              <option value="HR_LEITUNG">HR-Leitung</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>

          {/* Status Toggle (nur bei Bearbeiten) */}
          {showIsActive && (
            <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
              <span className="text-sm font-medium text-foreground">
                Benutzer aktiv
              </span>
              <button
                type="button"
                onClick={() => handleChange("isActive", !formData.isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.isActive ? "bg-[#6BAA24]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    formData.isActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}

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
