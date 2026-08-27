"use client";

/**
 * Step 10: Zusammenfassung + Dokumenten-Upload + Erklärung + DSGVO + Signatur
 *
 * Zeigt alle eingegebenen Daten zur Pruefung,
 * ermoeglicht Dokumenten-Upload, fordert Erklärung
 * des Arbeitnehmers und DSGVO-Zustimmung.
 */

import { useState } from "react";
import { DocumentUpload } from "./document-upload";
import { FieldConfigHelper } from "@/lib/field-definitions";
import { formatVerantwortlicheStelle } from "@/lib/dsgvo";
import { AKTUELLE_ERKLAERUNG } from "@/lib/erklaerung-arbeitnehmer";
import {
  RV_BEFREIUNG_HINWEIS,
  documentTypeLabel,
} from "@/lib/required-documents";
import { rvEntscheidungLabel } from "@/lib/minijob-rentenversicherung";
import { statusLabel } from "@/lib/minijob-status";
import {
  ART_LABELS,
  BESCHAEFTIGUNGS_KATEGORIEN,
  KATEGORIE_LABELS,
} from "@/lib/validations/beschaeftigungs-angaben";

/** Eine Zeile aus den drei Tabellen des Beschaeftigungs-Schritts. */
interface BeschaeftigungEntry {
  kategorie: string;
  beginn?: string | null;
  ende?: string | null;
  art?: string | null;
  arbeitgeberName?: string | null;
  entgeltUeberGrenze?: boolean | null;
  arbeitstage?: number | null;
  beiArbeitsagentur?: boolean | null;
}

interface ChildEntry {
  firstName: string;
  lastName?: string;
  birthDate: string;
  taxAllowance: boolean;
}

interface StepProps {
  data: Record<string, unknown>;
  allData: Record<string, unknown>;
  onBack: () => void;
  saving: boolean;
  onSubmit: (erklaerung: { ort: string; version: string }) => void;
  organization: {
    name: string;
    mandantNumber: string;
    type: string;
    dsgvoVerantwortlicheName?: string | null;
    dsgvoVerantwortlicheStrasse?: string | null;
    dsgvoVerantwortlichePlz?: string | null;
    dsgvoVerantwortlicheOrt?: string | null;
  };
  token?: string;
  fieldConfig?: FieldConfigHelper;
  requiredDocuments?: string[];
  /** Ist beim Mandanten eine Betriebsnummer hinterlegt? */
  antragErzeugbar?: boolean;
}

// Hilfs-Labels
const SALUTATION_LABELS: Record<string, string> = {
  Herr: "Herr",
  Frau: "Frau",
};

const MARITAL_LABELS: Record<string, string> = {
  ledig: "Ledig",
  verheiratet: "Verheiratet",
  geschieden: "Geschieden",
  verwitwet: "Verwitwet",
  getrennt_lebend: "Getrennt lebend",
  eingetragene_partnerschaft: "Eingetragene Lebenspartnerschaft",
};

const TAX_CLASS_LABELS: Record<string, string> = {
  I: "I",
  II: "II",
  III: "III",
  IV: "IV",
  V: "V",
  VI: "VI",
};

const INSURANCE_LABELS: Record<string, string> = {
  gesetzlich: "Gesetzlich",
  privat: "Privat",
};

const RELIGION_LABELS: Record<string, string> = {
  ev: "Evangelisch",
  rk: "Roemisch-Katholisch",
  ak: "Altkatholisch",
  lt: "Evangelisch-Lutherisch",
  rf: "Evangelisch-Reformiert",
  fr: "Französisch-Reformiert",
  fg: "Freie Religionsgemeinschaft",
  keine: "Keine",
  sonstige: "Sonstige",
};

const EMPLOYER_TYPE_LABELS: Record<string, string> = {
  hauptarbeitgeber: "Ja, Hauptarbeitgeber",
  nebenarbeitgeber: "Ja, Nebenarbeitgeber",
  nein: "Nein",
};

const SCHOOL_DEGREE_LABELS: Record<string, string> = {
  ohne_schulabschluss: "Ohne Schulabschluss",
  hauptschulabschluss: "Haupt-/Volksschulabschluss",
  mittlere_reife: "Mittlere Reife / gleichwertiger Abschluss",
  abitur_fachabitur: "Abitur / Fachabitur",
  sonstiges: "Sonstiges / nicht bekannt",
};

const PROFESSIONAL_DEGREE_LABELS: Record<string, string> = {
  ohne_berufsausbildung: "Ohne berufliche Ausbildung",
  anerkannte_berufsausbildung: "Abschluss einer anerkannten Berufsausbildung",
  meister_techniker_fachschule:
    "Meister-/Techniker- oder gleichwertige Fachschulausbildung",
  bachelor: "Bachelor",
  diplom_magister_master_staatsexamen: "Diplom/Magister/Master/Staatsexamen",
  promotion: "Promotion",
};

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="border-b bg-muted/50 px-4 py-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  if (!value || value === "—") return null;
  return (
    <div className="flex justify-between border-b border-border/50 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

export function Step10Summary({
  allData,
  onBack,
  saving,
  onSubmit,
  organization,
  token,
  requiredDocuments,
  antragErzeugbar = true,
}: StepProps) {
  const [dsgvoAccepted, setDsgvoAccepted] = useState(false);
  const [erklaerungAccepted, setErklaerungAccepted] = useState(false);
  const [erklaerungOrt, setErklaerungOrt] = useState("");
  const [dsgvoError, setDsgvoError] = useState("");
  /**
   * Eigener Zustand fuer fehlende Dokumente — bewusst nicht `dsgvoError`.
   *
   * Der wird ueber Teilzeichenketten zurueckgesetzt („Ort", „Erklärung",
   * „Datenschutz"). Eine Dokumentenmeldung, die eines dieser Woerter enthaelt,
   * verschwaende beim naechsten Haken lautlos.
   */
  const [fehlendeDokumente, setFehlendeDokumente] = useState<string[]>([]);
  const [dokumenteFehler, setDokumenteFehler] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const d = allData;
  const children = (d.children as ChildEntry[]) || [];
  const beschaeftigungen =
    (d.beschaeftigungsAngaben as BeschaeftigungEntry[]) || [];

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (erklaerungOrt.trim().length < 2) {
      // Wortlaut bewusst ohne "Erklärung": Die Fehleranzeige wird ueber
      // Teilzeichenketten zurueckgesetzt, sonst raeumte das Haken-Setzen diese
      // Meldung mit weg.
      setDsgvoError("Bitte geben Sie den Ort an. Er gehört zur Unterschrift.");
      return;
    }
    if (!erklaerungAccepted) {
      setDsgvoError("Bitte bestätigen Sie die Erklärung des Arbeitnehmers.");
      return;
    }
    if (!dsgvoAccepted) {
      setDsgvoError(
        "Bitte stimmen Sie der Datenschutzerklärung zu, um den Fragebogen abzuschicken."
      );
      return;
    }

    // Nur Hoeflichkeit: Verbindlich prueft der Server gegen den Datenbankstand.
    // In einem zweiten Tab kann ein Dokument geloescht worden sein, waehrend
    // hier abgeschickt wird.
    if (fehlendeDokumente.length > 0) {
      const nurRv =
        fehlendeDokumente.length === 1 && fehlendeDokumente[0] === "RV_BEFREIUNG";
      setDokumenteFehler(
        nurRv
          ? RV_BEFREIUNG_HINWEIS
          : "Bitte laden Sie zuerst die fehlenden Pflichtunterlagen hoch: " +
              fehlendeDokumente.map((t) => documentTypeLabel(t)).join(", ") +
              "."
      );
      setDsgvoError("");
      return;
    }

    setDokumenteFehler("");
    setDsgvoError("");
    setShowConfirmDialog(true);
  };

  const formatDate = (dateStr: unknown): string => {
    if (!dateStr || typeof dateStr !== "string") return "—";
    try {
      return new Date(dateStr).toLocaleDateString("de-DE");
    } catch {
      return String(dateStr);
    }
  };

  const str = (val: unknown): string => {
    if (!val) return "—";
    return String(val);
  };

  /**
   * Ja/Nein — aber "—", solange die Frage unbeantwortet ist.
   *
   * Nicht `wert ? "Ja" : "Nein"`: Die Fragen des Beschaeftigungs-Schritts sind
   * dreiwertig. Ein noch nicht angeklicktes Feld als "Nein" auszuweisen, waere
   * eine Angabe, die der Mitarbeiter nie gemacht hat — und genau die soll er
   * hier ja pruefen.
   */
  const jaNein = (val: unknown): string => {
    if (val === true) return "Ja";
    if (val === false) return "Nein";
    return "—";
  };

  /** Eine Beschaeftigungszeile als ein lesbarer Satzteil. */
  const beschreibeZeile = (z: BeschaeftigungEntry): string => {
    const teile: string[] = [];
    if (z.ende) {
      teile.push(`${formatDate(z.beginn)} – ${formatDate(z.ende)}`);
    } else {
      teile.push(`seit ${formatDate(z.beginn)}`);
    }
    if (z.art) teile.push(ART_LABELS[z.art] || z.art);
    if (typeof z.arbeitstage === "number") {
      teile.push(`${z.arbeitstage} Arbeitstage`);
    }
    if (z.entgeltUeberGrenze === true) teile.push("Entgelt über der Grenze");
    if (z.entgeltUeberGrenze === false) teile.push("Entgelt unter der Grenze");
    if (z.beiArbeitsagentur) teile.push("Meldung bei der Agentur für Arbeit");
    if (z.arbeitgeberName) teile.push(z.arbeitgeberName);
    return teile.join(" · ");
  };

  return (
    <form onSubmit={handleFinalSubmit} className="space-y-5">
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="text-sm text-green-800">
          Bitte prüfen Sie alle Angaben sorgfältig. Nach dem Absenden können
          Änderungen nur noch über die Personalabteilung vorgenommen werden.
        </p>
      </div>

      {/* Einrichtung */}
      <SummarySection title="Einrichtung">
        <SummaryRow label="Einrichtung" value={organization.name} />
        <SummaryRow label="Mandantennummer" value={organization.mandantNumber} />
      </SummarySection>

      {/* Step 1: Persönliche Angaben */}
      <SummarySection title="1. Persönliche Angaben">
        <SummaryRow
          label="Anrede"
          value={SALUTATION_LABELS[str(d.salutation)] || str(d.salutation)}
        />
        {!!d.title && <SummaryRow label="Titel" value={str(d.title)} />}
        <SummaryRow label="Vorname" value={str(d.firstName)} />
        <SummaryRow label="Nachname" value={str(d.lastName)} />
        {!!d.birthName && (
          <SummaryRow label="Geburtsname" value={str(d.birthName)} />
        )}
        <SummaryRow label="Geburtsdatum" value={formatDate(d.birthDate)} />
        <SummaryRow label="Geburtsort" value={str(d.birthPlace)} />
        <SummaryRow label="Geburtsland" value={str(d.birthCountry)} />
        <SummaryRow
          label="Staatsangehörigkeit"
          value={str(d.nationality)}
        />
        <SummaryRow
          label="Familienstand"
          value={
            MARITAL_LABELS[str(d.maritalStatus)] || str(d.maritalStatus)
          }
        />
        {!!d.severelyDisabled && (
          <SummaryRow
            label="Schwerbehinderung"
            value={`Ja, GdB ${str(d.disabilityDegree)}`}
          />
        )}
      </SummarySection>

      {/* Step 2: Adresse */}
      <SummarySection title="2. Adresse & Kontakt">
        <SummaryRow
          label="Strasse"
          value={`${str(d.street)} ${str(d.houseNumber)}`}
        />
        <SummaryRow
          label="PLZ / Ort"
          value={`${str(d.zipCode)} ${str(d.city)}`}
        />
        <SummaryRow label="Land" value={str(d.country)} />
        {!!d.phone && <SummaryRow label="Telefon" value={str(d.phone)} />}
        {!!d.mobile && <SummaryRow label="Mobil" value={str(d.mobile)} />}
        {!!d.emailPrivate && (
          <SummaryRow label="Private E-Mail" value={str(d.emailPrivate)} />
        )}
      </SummarySection>

      {/* Step 3: Bank */}
      <SummarySection title="3. Bankverbindung">
        <SummaryRow label="IBAN" value={str(d.iban)} />
        {!!d.bic && <SummaryRow label="BIC" value={str(d.bic)} />}
        {!!d.bankName && <SummaryRow label="Bank" value={str(d.bankName)} />}
        {!!d.accountHolder && (
          <SummaryRow label="Kontoinhaber" value={str(d.accountHolder)} />
        )}
      </SummarySection>

      {/* Step 4: Sozialversicherung */}
      <SummarySection title="4. Sozialversicherung">
        {!!d.socialSecurityNumber && (
          <SummaryRow label="SV-Nummer" value={str(d.socialSecurityNumber)} />
        )}
        <SummaryRow
          label="Versicherungsart"
          value={
            INSURANCE_LABELS[str(d.healthInsuranceType)] ||
            str(d.healthInsuranceType)
          }
        />
        <SummaryRow
          label="Krankenkasse"
          value={str(d.healthInsuranceName)}
        />
        <SummaryRow
          label="Elterneigenschaft"
          value={d.parentStatus ? "Ja" : "Nein"}
        />
        <SummaryRow
          label="RV-Befreiung (Minijob)"
          value={d.minijobRvBefreiung ? "Ja" : "Nein"}
        />
      </SummarySection>

      {/* Step 5: Steuer */}
      <SummarySection title="5. Steuer">
        <SummaryRow label="Steuer-ID" value={str(d.taxId)} />
        <SummaryRow
          label="Steuerklasse"
          value={TAX_CLASS_LABELS[str(d.taxClass)] || str(d.taxClass)}
        />
        {!!d.taxAllowance && (
          <SummaryRow
            label="Freibetrag"
            value={`${str(d.taxAllowance)} EUR`}
          />
        )}
        {!!d.childAllowance && (
          <SummaryRow
            label="Kinderfreibetrag"
            value={str(d.childAllowance)}
          />
        )}
        <SummaryRow
          label="Religion"
          value={RELIGION_LABELS[str(d.religion)] || str(d.religion)}
        />
      </SummarySection>

      {/* Step 6: Weitere Beschäftigung */}
      <SummarySection title="6. Weitere Beschäftigung">
        <SummaryRow
          label="Status"
          value={
            d.beschaeftigungsStatus
              ? statusLabel(d.beschaeftigungsStatus as string)
              : "—"
          }
        />
        <SummaryRow
          label="Und zwar"
          value={str(d.beschaeftigungsStatusSonstige)}
        />
        <SummaryRow
          label="Bei der Agentur für Arbeit gemeldet"
          value={jaNein(d.alsArbeitsuchendGemeldet)}
        />
        <SummaryRow label="Agentur" value={str(d.agenturFuerArbeit)} />
        <SummaryRow
          label="Mit Leistungsbezug"
          value={jaNein(d.mitLeistungsbezug)}
        />
        <SummaryRow
          label="Weitere Beschäftigungen"
          value={jaNein(d.hasOtherEmployment)}
        />
        <SummaryRow
          label="Haupt-/Nebenarbeitgeber"
          value={
            EMPLOYER_TYPE_LABELS[str(d.employerType)] || str(d.employerType)
          }
        />
        <SummaryRow
          label="Summe über der Geringfügigkeitsgrenze"
          value={jaNein(d.summeUeberGeringfuegigkeitsgrenze)}
        />
        <SummaryRow
          label="Vorbeschäftigungen in diesem Jahr"
          value={jaNein(d.vorbeschaeftigungenVorhanden)}
        />
        <SummaryRow
          label="Tätigkeit im Ausland"
          value={jaNein(d.auslandsbeschaeftigungVorhanden)}
        />
        {/* Altfelder: seit AP 6 nicht mehr erhoben — die Tabelle „Weitere
            Beschäftigung“ hat sie abgeloest. Sie erscheinen nur noch, wenn ein
            alter Vorgang sie mitbringt; sonst blendet SummaryRow sie aus. */}
        <SummaryRow
          label="Arbeitgeber (frühere Erfassung)"
          value={str(d.otherEmployerName)}
        />
        <SummaryRow
          label="Wochenstunden (frühere Erfassung)"
          value={d.otherWeeklyHours ? `${str(d.otherWeeklyHours)} Std.` : "—"}
        />
      </SummarySection>

      {/* Die drei Tabellen aus Abschnitt 4 der Checkliste. Nur zeigen, was
          wirklich eingetragen wurde — ein leerer Block sagt nichts. */}
      {beschaeftigungen.length > 0 && (
        <SummarySection title="Angegebene Beschäftigungen">
          {BESCHAEFTIGUNGS_KATEGORIEN.map((kategorie) => {
            const zeilen = beschaeftigungen.filter(
              (z) => z.kategorie === kategorie
            );
            if (zeilen.length === 0) return null;
            return (
              <div
                key={kategorie}
                className="border-b border-border/50 py-2 last:border-0"
              >
                <p className="mb-1 text-xs font-semibold text-foreground">
                  {KATEGORIE_LABELS[kategorie]}
                </p>
                {zeilen.map((z, i) => (
                  <SummaryRow
                    key={i}
                    label={`Eintrag ${i + 1}`}
                    value={beschreibeZeile(z)}
                  />
                ))}
              </div>
            );
          })}
        </SummarySection>
      )}

      {/* Step 7: Kinder */}
      <SummarySection title="7. Kinder">
        {children.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Keine Kinder eingetragen.
          </p>
        ) : (
          children.map((child, i) => (
            <SummaryRow
              key={i}
              label={`Kind ${i + 1}`}
              value={`${child.firstName} ${child.lastName || ""} (${formatDate(child.birthDate)})${child.taxAllowance ? " [KFB]" : ""}`}
            />
          ))
        )}
      </SummarySection>

      {/* Step 8: Bildung & Beruf */}
      <SummarySection title="8. Bildung & Beruf">
        <SummaryRow
          label="Höchster Schulabschluss"
          value={
            SCHOOL_DEGREE_LABELS[str(d.highestSchoolDegree)] ||
            str(d.highestSchoolDegree)
          }
        />
        <SummaryRow
          label="Höchste Berufsausbildung"
          value={
            PROFESSIONAL_DEGREE_LABELS[str(d.highestProfessionalDegree)] ||
            str(d.highestProfessionalDegree)
          }
        />
      </SummarySection>

      {/* Step 9: Masernschutz */}
      <SummarySection title="9. Masernschutz">
        <SummaryRow
          label="Nach 1970 geboren"
          value={d.bornAfter1971 ? "Ja" : "Nein"}
        />
        {!!d.bornAfter1971 && (
          <SummaryRow
            label="Masernschutz vorhanden"
            value={d.masernschutzProvided ? "Ja" : "Nein"}
          />
        )}
      </SummarySection>

      {/* Rentenversicherung — bewusst ohne Ziffer im Titel: Die Nummern oben
          stammen aus der alten festen Schrittfolge, in der es diesen Schritt
          noch nicht gab. Eine erfundene Nummer waere irrefuehrender als keine. */}
      {!!d.rvEntscheidung && (
        <SummarySection title="Rentenversicherung">
          <SummaryRow
            label="Entscheidung"
            value={rvEntscheidungLabel(d.rvEntscheidung as string)}
          />
          {d.rvMerkblattGelesen === true && (
            <SummaryRow label="Hinweise zur Rente gelesen" value="Ja" />
          )}
          {d.rvBindungBestaetigt === true && (
            <SummaryRow label="Bindungswirkung bestätigt" value="Ja" />
          )}
        </SummarySection>
      )}

      {/* ============================================= */}
      {/* Dokumenten-Upload */}
      {/* ============================================= */}
      {token && (
        <DocumentUpload
          token={token}
          hasChildren={children.length > 0}
          requiredDocuments={requiredDocuments}
          rvEntscheidung={(d.rvEntscheidung as string) ?? null}
          antragErzeugbar={antragErzeugbar}
          onMissingChange={(missing) => {
            setFehlendeDokumente(missing);
            if (missing.length === 0) setDokumenteFehler("");
          }}
        />
      )}

      {/* ============================================= */}
      {/* Erklärung des Arbeitnehmers */}
      {/* ============================================= */}
      <div className="rounded-lg border-2 border-primary/30 bg-muted p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <svg
            className="h-5 w-5 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          Erklärung des Arbeitnehmers
        </h3>
        <div className="mb-4 rounded-lg bg-card p-4 text-xs leading-relaxed text-foreground">
          {AKTUELLE_ERKLAERUNG.abschnitte.map((abschnitt, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <p>{abschnitt.text}</p>
              {abschnitt.punkte && (
                <ul className="ml-4 mt-1 list-disc space-y-1 text-muted-foreground">
                  {abschnitt.punkte.map((punkt) => (
                    <li key={punkt}>{punkt}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* Ort — wie auf dem Papierformular "Ort, Datum". Das Datum setzt der
            Server beim Absenden, damit es nicht manipulierbar ist. */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="erklaerungOrt"
              className="mb-1 block text-xs font-semibold text-foreground"
            >
              Ort <span className="text-destructive">*</span>
            </label>
            <input
              id="erklaerungOrt"
              type="text"
              value={erklaerungOrt}
              onChange={(e) => {
                setErklaerungOrt(e.target.value);
                if (dsgvoError.includes("Ort")) setDsgvoError("");
              }}
              maxLength={100}
              placeholder="z.B. Minden"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-foreground">
              Datum
            </span>
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              wird beim Absenden gesetzt
            </p>
          </div>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={erklaerungAccepted}
            onChange={(e) => {
              setErklaerungAccepted(e.target.checked);
              if (e.target.checked && dsgvoError.includes("Erklärung"))
                setDsgvoError("");
            }}
            className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-primary"
          />
          <div>
            <span className="text-sm font-medium text-foreground">
              {AKTUELLE_ERKLAERUNG.bestaetigung}{" "}
              <span className="text-destructive">*</span>
            </span>
            <p className="text-xs text-muted-foreground">
              {AKTUELLE_ERKLAERUNG.unterschriftsersatz}
            </p>
          </div>
        </label>
      </div>

      {/* ============================================= */}
      {/* DSGVO */}
      {/* ============================================= */}
      <div className="rounded-lg border-2 border-primary/30 bg-muted p-5">
        <h3 className="mb-3 text-sm font-bold text-foreground">
          Datenschutzerklaerung und Einwilligung
        </h3>
        <div className="mb-4 max-h-40 overflow-y-auto rounded-lg bg-card p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-2">
            Ich erklaere mich damit einverstanden, dass meine im Rahmen dieses
            Personalfragebogens erhobenen personenbezogenen Daten zum Zwecke der
            Begruendung, Durchfuehrung und Beendigung des Arbeitsverhaeltnisses
            verarbeitet werden.
          </p>
          <p className="mb-2">
            Die Daten werden ausschliesslich für personalverwaltungsrelevante
            Zwecke verwendet und an die zustaendigen Stellen (Lohnbuchhaltung,
            Sozialversicherungstraeger, Finanzamt) weitergeleitet, soweit dies
            gesetzlich vorgeschrieben oder für die Durchfuehrung des
            Arbeitsverhaeltnisses erforderlich ist.
          </p>
          <p className="mb-2">
            Die Rechtsgrundlage für die Verarbeitung ist Art. 6 Abs. 1 lit. b
            DSGVO (Vertragserfuellung) sowie Art. 88 DSGVO i.V.m. §26 BDSG
            (Beschäftigtendatenschutz).
          </p>
          <p className="mb-2">
            Verantwortliche Stelle: {formatVerantwortlicheStelle(organization)}.
            Bei Fragen zum Datenschutz wenden Sie sich bitte an die
            Personalabteilung.
          </p>
          <p>
            Sie haben das Recht auf Auskunft, Berichtigung, Loeschung und
            Einschränkung der Verarbeitung Ihrer Daten gemäß Art. 15-18
            DSGVO.
          </p>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={dsgvoAccepted}
            onChange={(e) => {
              setDsgvoAccepted(e.target.checked);
              if (e.target.checked && dsgvoError.includes("Datenschutz"))
                setDsgvoError("");
            }}
            className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-primary"
          />
          <div>
            <span className="text-sm font-medium text-foreground">
              Ich habe die Datenschutzerklaerung gelesen und stimme der
              Verarbeitung meiner Daten zu.{" "}
              <span className="text-destructive">*</span>
            </span>
            <p className="text-xs text-muted-foreground">
              Mit dem Absenden bestätigen Sie die Richtigkeit Ihrer Angaben.
            </p>
          </div>
        </label>
        {dokumenteFehler && (
          <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {dokumenteFehler}
          </p>
        )}
        {dsgvoError && (
          <p className="mt-2 text-xs text-destructive">{dsgvoError}</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          Zurück
        </button>
        <button
          type="submit"
          disabled={saving || !dsgvoAccepted || !erklaerungAccepted}
          className="rounded-lg bg-[#6BAA24] px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
        >
          {saving
            ? "Wird gesendet..."
            : "Fragebogen verbindlich absenden"}
        </button>
      </div>

      {/* Bestätigungs-Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-foreground">Fragebogen absenden?</h3>
            </div>
            <p className="mb-2 text-sm text-muted-foreground">
              Sie sind dabei, Ihren Personalfragebogen verbindlich einzureichen.
            </p>
            <p className="mb-5 text-sm text-muted-foreground">
              Nach dem Absenden können Änderungen <strong>nur noch über die Personalabteilung</strong> vorgenommen werden. Bitte stellen Sie sicher, dass alle Angaben korrekt sind.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Noch einmal prüfen
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmDialog(false);
                  onSubmit({
                    ort: erklaerungOrt.trim(),
                    version: AKTUELLE_ERKLAERUNG.version,
                  });
                }}
                disabled={saving}
                className="flex-1 rounded-lg bg-[#6BAA24] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
              >
                {saving ? "Wird gesendet..." : "Ja, jetzt absenden"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
