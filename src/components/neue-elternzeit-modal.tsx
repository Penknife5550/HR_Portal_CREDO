"use client";

/**
 * Modal: Neuer Elternzeit-Vorgang anlegen
 *
 * Felder:
 *  - Mitarbeiter/in
 *  - Einrichtung
 *  - Geschlecht (Mutter / Vater) — bestimmt Workflow + Briefvorlagen
 *  - Personalgruppe + KV-Typ
 *  - Kind-Nummer (HR waehlt manuell)
 *  - Optional: Verknuepfung zu Mutterschutz, Einrichtungsleiter
 */

import { useState, useEffect } from "react";

interface Organization {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

interface MutterschutzOption {
  id: string;
  displayId: string;
  employeeFirstName: string;
  employeeLastName: string;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NeueElternzeitModal({ open, onClose, onCreated }: Props) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [mutterschutzOptions, setMutterschutzOptions] = useState<
    MutterschutzOption[]
  >([]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [personalNr, setPersonalNr] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [personalgruppe, setPersonalgruppe] = useState<
    "TARIF_TV_L" | "BEAMTER"
  >("TARIF_TV_L");
  const [geschlecht, setGeschlecht] = useState<"MUTTER" | "VATER">("MUTTER");
  const [kvTyp, setKvTyp] = useState<"GKV_PFLICHT" | "GKV_FREIWILLIG" | "PKV">(
    "GKV_PFLICHT",
  );
  const [kindNummer, setKindNummer] = useState(1);
  const [mutterschutzId, setMutterschutzId] = useState("");
  const [einrichtungsleiterName, setEinrichtungsleiterName] = useState("");
  const [einrichtungsleiterEmail, setEinrichtungsleiterEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setOrganizations(data.data);
      })
      .catch(() => {});
    fetch("/api/mutterschutz?limit=200")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setMutterschutzOptions(data.data);
      })
      .catch(() => {});
  }, [open]);

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPersonalNr("");
    setOrganizationId("");
    setPersonalgruppe("TARIF_TV_L");
    setGeschlecht("MUTTER");
    setKvTyp("GKV_PFLICHT");
    setKindNummer(1);
    setMutterschutzId("");
    setEinrichtungsleiterName("");
    setEinrichtungsleiterEmail("");
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/elternzeit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeFirstName: firstName,
          employeeLastName: lastName,
          employeeEmail: email,
          employeePersonalNr: personalNr || undefined,
          organizationId,
          personalgruppe,
          geschlecht,
          kvTyp,
          kindNummer,
          mutterschutzId:
            geschlecht === "MUTTER" && mutterschutzId
              ? mutterschutzId
              : undefined,
          einrichtungsleiterName: einrichtungsleiterName || undefined,
          einrichtungsleiterEmail: einrichtungsleiterEmail || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Fehler beim Anlegen.");
        return;
      }
      reset();
      onCreated();
      onClose();
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-2xl rounded-lg bg-card shadow-xl max-h-[95vh] overflow-y-auto">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">Neue Elternzeit anlegen</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Phase 1: vorlaeufiger Antrag via Magic Link
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vorname *">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className={inp}
              />
            </Field>
            <Field label="Nachname *">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className={inp}
              />
            </Field>
            <Field label="E-Mail *">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inp}
              />
            </Field>
            <Field label="Personalnummer">
              <input
                value={personalNr}
                onChange={(e) => setPersonalNr(e.target.value)}
                className={inp}
              />
            </Field>
            <Field label="Einrichtung *">
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                required
                className={inp}
              >
                <option value="">Bitte waehlen…</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.mandantNumber} – {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Geschlecht *">
              <select
                value={geschlecht}
                onChange={(e) =>
                  setGeschlecht(e.target.value as "MUTTER" | "VATER")
                }
                className={inp}
              >
                <option value="MUTTER">Mutter</option>
                <option value="VATER">Vater (kein Mutterschutz)</option>
              </select>
            </Field>
            <Field label="Personalgruppe *">
              <select
                value={personalgruppe}
                onChange={(e) =>
                  setPersonalgruppe(
                    e.target.value as "TARIF_TV_L" | "BEAMTER",
                  )
                }
                className={inp}
              >
                <option value="TARIF_TV_L">Tarifangestellte (TV-L)</option>
                <option value="BEAMTER">Beamter/Beamtin</option>
              </select>
            </Field>
            <Field label="KV-Typ *">
              <select
                value={kvTyp}
                onChange={(e) =>
                  setKvTyp(
                    e.target.value as
                      | "GKV_PFLICHT"
                      | "GKV_FREIWILLIG"
                      | "PKV",
                  )
                }
                className={inp}
              >
                <option value="GKV_PFLICHT">GKV Pflichtversichert</option>
                <option value="GKV_FREIWILLIG">GKV Freiwillig</option>
                <option value="PKV">PKV (Privat)</option>
              </select>
            </Field>
            <Field label="Kind-Nummer *">
              <select
                value={kindNummer}
                onChange={(e) => setKindNummer(parseInt(e.target.value))}
                className={inp}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}. Kind
                  </option>
                ))}
              </select>
            </Field>
            {geschlecht === "MUTTER" && (
              <Field label="Verknuepfung Mutterschutz (optional)">
                <select
                  value={mutterschutzId}
                  onChange={(e) => setMutterschutzId(e.target.value)}
                  className={inp}
                >
                  <option value="">— keine —</option>
                  {mutterschutzOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayId} — {m.employeeFirstName} {m.employeeLastName}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Einrichtungsleiter Name">
              <input
                value={einrichtungsleiterName}
                onChange={(e) => setEinrichtungsleiterName(e.target.value)}
                className={inp}
              />
            </Field>
            <Field label="Einrichtungsleiter E-Mail">
              <input
                type="email"
                value={einrichtungsleiterEmail}
                onChange={(e) => setEinrichtungsleiterEmail(e.target.value)}
                className={inp}
              />
            </Field>
          </div>

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border px-4 py-2 text-sm font-medium"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? "Anlegen…" : "Elternzeit anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inp =
  "w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}
