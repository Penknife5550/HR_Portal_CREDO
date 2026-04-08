"use client";

/**
 * Modal: Neuer Mutterschutz-Vorgang anlegen
 *
 * Felder:
 *  - Mitarbeiterin (Vor-/Nachname, E-Mail, PersonalNr)
 *  - Einrichtung (Mandant)
 *  - Voraussichtlicher Geburtstermin
 *  - Einrichtungstyp (Schule / Kita / Verwaltung) → bestimmt BAD-Pflicht
 *  - Personalgruppe (TV-L / Beamter / PSI)
 */

import { useState, useEffect } from "react";

interface Organization {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NeuerMutterschutzModal({ open, onClose, onCreated }: Props) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [personalNr, setPersonalNr] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [voraussGeburt, setVoraussGeburt] = useState("");
  const [einrichtungstyp, setEinrichtungstyp] = useState<
    "SCHULE" | "KITA" | "VERWALTUNG"
  >("SCHULE");
  const [personalgruppe, setPersonalgruppe] = useState<
    "TARIF_TV_L" | "BEAMTER" | "PLANSTELLENINHABER"
  >("TARIF_TV_L");
  const [badErforderlich, setBadErforderlich] = useState(false);

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
  }, [open]);

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPersonalNr("");
    setOrganizationId("");
    setVoraussGeburt("");
    setEinrichtungstyp("SCHULE");
    setPersonalgruppe("TARIF_TV_L");
    setBadErforderlich(false);
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
      const res = await fetch("/api/mutterschutz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeFirstName: firstName,
          employeeLastName: lastName,
          employeeEmail: email,
          employeePersonalNr: personalNr || undefined,
          organizationId,
          voraussGeburt,
          einrichtungstyp,
          badErforderlich:
            einrichtungstyp === "KITA" ? true : badErforderlich,
          personalgruppe,
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
      <div className="w-full max-w-xl rounded-lg bg-card shadow-xl">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">Neuer Mutterschutz-Vorgang</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Schwangerschaftsmeldung erfassen
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
            <Field label="Voraussichtl. Geburtstermin *">
              <input
                type="date"
                value={voraussGeburt}
                onChange={(e) => setVoraussGeburt(e.target.value)}
                required
                className={inp}
              />
            </Field>
            <Field label="Einrichtungstyp *">
              <select
                value={einrichtungstyp}
                onChange={(e) =>
                  setEinrichtungstyp(
                    e.target.value as "SCHULE" | "KITA" | "VERWALTUNG",
                  )
                }
                className={inp}
              >
                <option value="SCHULE">Schule</option>
                <option value="KITA">Kita (BAD-Pflicht)</option>
                <option value="VERWALTUNG">Verwaltung</option>
              </select>
            </Field>
            <Field label="Personalgruppe *">
              <select
                value={personalgruppe}
                onChange={(e) =>
                  setPersonalgruppe(
                    e.target.value as
                      | "TARIF_TV_L"
                      | "BEAMTER"
                      | "PLANSTELLENINHABER",
                  )
                }
                className={inp}
              >
                <option value="TARIF_TV_L">Tarifangestellte (TV-L)</option>
                <option value="BEAMTER">Beamtin</option>
                <option value="PLANSTELLENINHABER">Planstelleninhaberin</option>
              </select>
            </Field>
          </div>

          {einrichtungstyp === "SCHULE" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={badErforderlich}
                onChange={(e) => setBadErforderlich(e.target.checked)}
              />
              Direkter Kinderkontakt — BAD-Untersuchung erforderlich
            </label>
          )}

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
              {loading ? "Anlegen…" : "Mutterschutz anlegen"}
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
