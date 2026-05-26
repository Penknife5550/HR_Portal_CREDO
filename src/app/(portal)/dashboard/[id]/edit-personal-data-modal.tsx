"use client";

/**
 * Modal: Personaldaten eines Onboarding-Vorgangs durch HR bearbeiten (Task P4).
 *
 * Sensible Felder (IBAN, SV-Nr, Steuer-ID) werden NICHT vorbefuellt — sie werden
 * nur uebertragen, wenn HR einen neuen Wert eingibt (sonst bleibt der bestehende,
 * verschluesselte Wert unveraendert). Speichern ruft PATCH /api/onboarding/:id/personal-data.
 */

import { useState } from "react";

type PD = Record<string, unknown> | null;

const SALUTATIONS = ["Herr", "Frau"];
const MARITAL = [
  "ledig",
  "verheiratet",
  "geschieden",
  "verwitwet",
  "getrennt_lebend",
  "eingetragene_partnerschaft",
];
const HEALTH = ["gesetzlich", "privat"];
const TAX_CLASS = ["I", "II", "III", "IV", "V", "VI"];
const RELIGION = ["ev", "rk", "ak", "lt", "rf", "fr", "fg", "keine", "sonstige"];
const SCHOOL = [
  "ohne_schulabschluss",
  "hauptschulabschluss",
  "mittlere_reife",
  "abitur_fachabitur",
  "sonstiges",
];
const PROF = [
  "ohne_berufsausbildung",
  "anerkannte_berufsausbildung",
  "meister_techniker_fachschule",
  "bachelor",
  "diplom_magister_master_staatsexamen",
  "promotion",
];

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export function EditPersonalDataModal({
  onboardingId,
  personalData,
  onClose,
  onSaved,
}: {
  onboardingId: string;
  personalData: PD;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pd = personalData ?? {};
  const [form, setForm] = useState<Record<string, string>>({
    salutation: str(pd.salutation),
    title: str(pd.title),
    firstName: str(pd.firstName),
    lastName: str(pd.lastName),
    birthName: str(pd.birthName),
    birthDate: str(pd.birthDate),
    birthPlace: str(pd.birthPlace),
    birthCountry: str(pd.birthCountry),
    nationality: str(pd.nationality),
    maritalStatus: str(pd.maritalStatus),
    disabilityDegree: str(pd.disabilityDegree),
    street: str(pd.street),
    houseNumber: str(pd.houseNumber),
    zipCode: str(pd.zipCode),
    city: str(pd.city),
    country: str(pd.country),
    phone: str(pd.phone),
    mobile: str(pd.mobile),
    emailPrivate: str(pd.emailPrivate),
    // sensible Felder: bewusst leer (nur bei Neueingabe senden)
    iban: "",
    bic: str(pd.bic),
    bankName: str(pd.bankName),
    accountHolder: str(pd.accountHolder),
    socialSecurityNumber: "",
    healthInsuranceName: str(pd.healthInsuranceName),
    healthInsuranceType: str(pd.healthInsuranceType),
    taxId: "",
    taxClass: str(pd.taxClass),
    taxAllowance: str(pd.taxAllowance),
    childAllowance: str(pd.childAllowance),
    religion: str(pd.religion),
    highestSchoolDegree: str(pd.highestSchoolDegree),
    highestProfessionalDegree: str(pd.highestProfessionalDegree),
  });
  const [severelyDisabled, setSeverelyDisabled] = useState<boolean>(
    Boolean(pd.severelyDisabled),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Payload bauen. Sensible Felder nur, wenn ausgefuellt.
      const payload: Record<string, unknown> = {
        salutation: form.salutation || null,
        title: form.title || null,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        birthName: form.birthName || null,
        birthDate: form.birthDate || null,
        birthPlace: form.birthPlace || null,
        birthCountry: form.birthCountry || null,
        nationality: form.nationality || null,
        maritalStatus: form.maritalStatus || null,
        severelyDisabled,
        disabilityDegree: form.disabilityDegree
          ? Number(form.disabilityDegree)
          : null,
        street: form.street || null,
        houseNumber: form.houseNumber || null,
        zipCode: form.zipCode || null,
        city: form.city || null,
        country: form.country || null,
        phone: form.phone || null,
        mobile: form.mobile || null,
        emailPrivate: form.emailPrivate || null,
        bic: form.bic || null,
        bankName: form.bankName || null,
        accountHolder: form.accountHolder || null,
        healthInsuranceName: form.healthInsuranceName || null,
        healthInsuranceType: form.healthInsuranceType || null,
        taxClass: form.taxClass || null,
        taxAllowance: form.taxAllowance ? Number(form.taxAllowance) : null,
        childAllowance: form.childAllowance ? Number(form.childAllowance) : null,
        religion: form.religion || null,
        highestSchoolDegree: form.highestSchoolDegree || null,
        highestProfessionalDegree: form.highestProfessionalDegree || null,
      };
      if (form.iban.trim()) payload.iban = form.iban.trim();
      if (form.socialSecurityNumber.trim())
        payload.socialSecurityNumber = form.socialSecurityNumber.trim();
      if (form.taxId.trim()) payload.taxId = form.taxId.trim();

      const res = await fetch(`/api/onboarding/${onboardingId}/personal-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Speichern fehlgeschlagen.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

  // Als FUNKTIONEN (inline aufgerufen, nicht als <Comp/>), damit React die
  // Inputs nicht bei jedem Tastendruck neu mountet (sonst Fokusverlust).
  const Text = (k: string, label: string, type = "text") => (
    <div key={k}>
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        className={inputCls}
      />
    </div>
  );

  const Select = (k: string, label: string, options: string[]) => (
    <div key={k}>
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      <select value={form[k]} onChange={(e) => set(k, e.target.value)} className={inputCls}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Personaldaten bearbeiten</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold">Persönliche Daten</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {Select("salutation", "Anrede", SALUTATIONS)}
              {Text("title", "Titel")}
              {Text("firstName", "Vorname")}
              {Text("lastName", "Nachname")}
              {Text("birthName", "Geburtsname")}
              {Text("birthDate", "Geburtsdatum", "date")}
              {Text("birthPlace", "Geburtsort")}
              {Text("birthCountry", "Geburtsland")}
              {Text("nationality", "Staatsangehörigkeit")}
              {Select("maritalStatus", "Familienstand", MARITAL)}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={severelyDisabled}
                  onChange={(e) => setSeverelyDisabled(e.target.checked)}
                  className="h-4 w-4"
                />
                Schwerbehinderung
              </label>
              {Text("disabilityDegree", "Behinderungsgrad (GdB)", "number")}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Adresse &amp; Kontakt</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {Text("street", "Straße")}
              {Text("houseNumber", "Hausnummer")}
              {Text("zipCode", "PLZ")}
              {Text("city", "Ort")}
              {Text("country", "Land")}
              {Text("phone", "Telefon")}
              {Text("mobile", "Mobil")}
              {Text("emailPrivate", "Private E-Mail")}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Bankverbindung</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {Text("iban", "IBAN (nur zum Ändern eingeben)")}
              {Text("bic", "BIC")}
              {Text("bankName", "Bank")}
              {Text("accountHolder", "Kontoinhaber")}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Sozialversicherung &amp; Steuer</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {Text("socialSecurityNumber", "SV-Nummer (nur zum Ändern eingeben)")}
              {Text("healthInsuranceName", "Krankenkasse")}
              {Select("healthInsuranceType", "Versicherungsart", HEALTH)}
              {Text("taxId", "Steuer-ID (nur zum Ändern eingeben)")}
              {Select("taxClass", "Steuerklasse", TAX_CLASS)}
              {Text("taxAllowance", "Jährlicher Freibetrag", "number")}
              {Text("childAllowance", "Kinderfreibetrag", "number")}
              {Select("religion", "Religionszugehörigkeit", RELIGION)}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Bildung</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {Select("highestSchoolDegree", "Höchster Schulabschluss", SCHOOL)}
              {Select("highestProfessionalDegree", "Höchste Berufsausbildung", PROF)}
            </div>
          </section>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90 disabled:opacity-50"
          >
            {saving ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
