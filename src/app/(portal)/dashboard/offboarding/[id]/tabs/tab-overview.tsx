"use client";

import { EXIT_TYPE_LABELS, abteilungLabel } from "@/lib/constants";
import type { AnzeigeStatus } from "@/lib/abteilungsaufgaben";
import {
  PILL_FARBEN,
  aufgabenText,
} from "@/components/abteilungsaufgaben/abteilungen-karte";
import type { OffboardingData } from "../types";
import {
  formatDate,
  formatNumber,
  formatCurrency,
  formatBoolean,
  CERTIFICATE_STATUS_LABELS,
} from "../helpers";
import {
  Card,
  FieldRow,
  EditableFieldRow,
} from "../shared-components";
import { PencilIcon } from "../icons";
import { ProcessWorkflowStepper, type WorkflowStep } from "@/components/process-workflow-stepper";

/** Kurz-Status je Abteilung im Stepper (Schritt 2). */
export const ABTEILUNG_KURZSTATUS: Record<AnzeigeStatus, string> = {
  ERLEDIGT: "Erledigt",
  GEOEFFNET: "In Bearbeitung",
  INFORMIERT: "Informiert",
  ABGELAUFEN: "Link abgelaufen",
  FEHLGESCHLAGEN: "Fehlgeschlagen",
  NICHT_VERSENDET: "Nicht versendet",
  NICHT_INFORMIERT: "Ausstehend",
  UEBERSPRUNGEN: "Übersprungen",
  KEINE_OFFENEN: "Keine offenen",
};

const FUEHRUNGSKRAFT_QUELLE: Record<string, string> = {
  ZEUGNIS: "aus der Zeugnis-Bewertung",
  VERTRAGSENDE: "aus dem Vertragsende",
};

export function TabOverview({
  data,
  editingField,
  editingValue,
  savingField,
  setEditingField,
  setEditingValue,
  handleFieldSave,
  onNavigateTab,
}: {
  data: OffboardingData;
  editingField: string | null;
  editingValue: string;
  savingField: boolean;
  setEditingField: (f: string | null) => void;
  setEditingValue: (v: string) => void;
  handleFieldSave: (field: string, value: string) => void;
  onNavigateTab?: (tab: string) => void;
}) {
  const ed = data.exitData;

  // ---- Workflow-Steps berechnen ----
  const checklistTotal = data.checklistItems.length;
  const checklistDone = data.checklistItems.filter((i) => i.isCompleted).length;
  const checklistAllDone = checklistTotal > 0 && checklistDone === checklistTotal;

  const returnTotal = data.returnItems.length;
  const returnDone = data.returnItems.filter((i) => i.isReturned).length;
  const returnsAllDone = returnTotal > 0 && returnDone === returnTotal;

  // Schritt 2 aus den Zeilen der Karte „Aufgaben für Abteilungen": eine Zeile
  // je Link-Zustaendigkeit, auch nicht informierte und uebersprungene. Fertig
  // ist eine Zeile, wenn nichts mehr offen ist — auch wenn HR die Aufgaben im
  // Portal abgehakt hat und die Abteilung nie einen Link bekam.
  const zeilen = data.abteilungen?.zeilen ?? [];
  const deptTotal = zeilen.length;
  const deptDone = zeilen.filter((z) => z.aufgaben.offen === 0).length;
  const niemandInformiert = data.abteilungen?.niemandInformiert ?? true;
  const offeneAbteilungen = zeilen.some((z) => z.aufgaben.offen > 0);

  // Exit-Interview Status: pruefen ob Exit-Interview existiert und eingereicht wurde
  // ExitInterview-Daten sind nicht direkt auf OffboardingData, aber wir koennen
  // anhand der Documents + exitData ableiten
  const hasExitInterview = data.documents.some((d) => d.type === "EXIT_INTERVIEW") || (ed?.certificateStatus != null);
  const exitInterviewDone = data.documents.some((d) => d.type === "EXIT_INTERVIEW");

  const zeugnisStatus = ed?.certificateStatus || "PENDING";
  const zeugnisDone = zeugnisStatus === "COMPLETED" || zeugnisStatus === "SENT";

  const svDone = ed?.svDeregistrationDone ?? false;
  const certDone = ed?.employmentCertDone ?? false;

  const isCompleted = data.status === "COMPLETED";

  // Schritt 1: Erfassung — immer erledigt (Vorgang existiert)
  // Schritt 2: Abteilungen — aktiv sobald Vorgang existiert
  // Schritt 3: Rueckgaben — aktiv sobald Abteilungen informiert oder parallel
  // Schritt 4: Exit-Interview
  // Schritt 5: Zeugnis
  // Schritt 6: Dokumente & Abrechnung
  // Schritt 7: Abschluss

  const step1Done = true; // Vorgang ist erfasst
  const step2Done = deptTotal > 0 ? deptDone === deptTotal : checklistAllDone;
  const step3Done = returnsAllDone || returnTotal === 0;
  const step4Done = exitInterviewDone || !hasExitInterview;
  const step5Done = zeugnisDone;
  const step6Done = svDone && certDone;

  function calcStatus(done: boolean, prevDone: boolean): "completed" | "active" | "upcoming" {
    if (done || isCompleted) return "completed";
    if (prevDone) return "active";
    return "upcoming";
  }

  const workflowSteps: WorkflowStep[] = [
    {
      key: "erfassen",
      title: "Austritt erfassen",
      description: "Stammdaten, Austrittsgrund und letzten Arbeitstag festlegen",
      status: "completed",
      completedAt: formatDate(data.initiatedAt),
      items: [
        { id: "ma", title: `${data.employeeFirstName} ${data.employeeLastName}`, isCompleted: true, assignee: EXIT_TYPE_LABELS[data.exitType] || data.exitType, assigneeColor: "bg-credo-rot/10 text-credo-rot" },
        { id: "lat", title: `Letzter Arbeitstag: ${formatDate(data.lastWorkingDay)}`, isCompleted: true },
      ],
    },
    {
      key: "abteilungen",
      title: "Abteilungen informieren",
      description: "Aufgaben per Link an Abteilungen und Führungskraft verteilen",
      status: calcStatus(step2Done, step1Done),
      progress: deptTotal > 0 ? { done: deptDone, total: deptTotal } : checklistTotal > 0 ? { done: checklistDone, total: checklistTotal } : undefined,
      items: deptTotal > 0 ? zeilen.map((z) => ({
        id: z.departmentKey,
        title: z.departmentName,
        isCompleted: z.aufgaben.offen === 0,
        // Der Stepper zeigt contactName nur neben einem assignee-Chip —
        // deshalb traegt der Chip die Aufgabenzahl wie auf der Karte.
        assignee: aufgabenText(z.aufgaben),
        assigneeColor: "bg-gray-100 text-gray-600",
        contactName: z.email ?? z.empfaenger.grundText ?? undefined,
        statusLabel: ABTEILUNG_KURZSTATUS[z.anzeige.status],
        statusColor: PILL_FARBEN[z.anzeige.farbe],
      })) : checklistTotal > 0 ? data.checklistItems.filter((i) => !i.isCompleted).slice(0, 5).map((i) => ({
        id: i.id,
        title: i.title,
        isCompleted: false,
        assignee: abteilungLabel(i.assigneeDepartment) || undefined,
        assigneeColor: "bg-credo-blau/10 text-credo-blau",
        note: i.notes,
      })) : undefined,
      info: deptTotal > 0
        ? (niemandInformiert && offeneAbteilungen
            ? "Noch keine Abteilung informiert – im Tab Checkliste „Abteilungen informieren“ wählen."
            : undefined)
        : checklistTotal === 0
          ? "Diesem Vorgang wurde noch keine Checkliste zugeordnet."
          : undefined,
      actions: !step2Done && onNavigateTab ? [
        { label: "Zum Checkliste-Tab", onClick: () => onNavigateTab("checklist"), variant: "secondary" as const },
      ] : undefined,
    },
    {
      key: "rueckgaben",
      title: "Rückgaben einsammeln",
      description: "Hardware, Schlüssel, Fahrzeuge und Dokumente zurückfordern",
      status: calcStatus(step3Done, step1Done),
      progress: returnTotal > 0 ? { done: returnDone, total: returnTotal } : undefined,
      items: returnTotal > 0 ? data.returnItems.filter((i) => !i.isReturned).slice(0, 5).map((i) => ({
        id: i.id,
        title: i.itemName,
        isCompleted: false,
        assignee: i.category,
        assigneeColor: "bg-orange-100 text-orange-700",
      })) : undefined,
      info: returnTotal === 0 ? "Keine Rückgaben erfasst — erfasse sie im Rückgaben-Tab" : undefined,
      actions: !step3Done && onNavigateTab ? [
        { label: "Zum Rückgaben-Tab", onClick: () => onNavigateTab("returns"), variant: "secondary" as const },
      ] : undefined,
    },
    {
      key: "exit-interview",
      title: "Exit-Interview",
      description: "Austrittsgespräch führen und dokumentieren",
      status: calcStatus(step4Done, step2Done && step3Done),
      info: hasExitInterview
        ? (exitInterviewDone ? undefined : "Exit-Interview wurde erstellt — wartet auf Einreichung")
        : "Kein Exit-Interview erstellt — kann im Exit-Interview-Tab angelegt werden",
      actions: !step4Done && onNavigateTab ? [
        { label: "Zum Exit-Interview-Tab", onClick: () => onNavigateTab("exit-interview"), variant: "secondary" as const },
      ] : undefined,
    },
    {
      key: "zeugnis",
      title: "Zeugnis erstellen",
      description: "Arbeitszeugnis durch Vorgesetzten bewerten lassen",
      status: calcStatus(step5Done, step2Done && step3Done),
      info: zeugnisDone ? undefined
        : zeugnisStatus === "IN_PROGRESS" ? "Zeugnis in Bearbeitung"
        : "Zeugnis-Bewertung noch ausstehend — kann im Zeugnis-Tab gestartet werden",
      actions: !step5Done && onNavigateTab ? [
        { label: "Zum Zeugnis-Tab", onClick: () => onNavigateTab("zeugnis"), variant: "secondary" as const },
      ] : undefined,
    },
    {
      key: "dokumente",
      title: "Dokumente & Abrechnung",
      description: "SV-Abmeldung, Arbeitsbescheinigung, finale Abrechnung",
      status: calcStatus(step6Done, step4Done && step5Done),
      items: [
        { id: "sv", title: "SV-Abmeldung", isCompleted: svDone, assignee: "HR", assigneeColor: "bg-credo-blau/10 text-credo-blau" },
        { id: "cert", title: "Arbeitsbescheinigung", isCompleted: certDone, assignee: "HR", assigneeColor: "bg-credo-blau/10 text-credo-blau" },
      ],
      actions: !step6Done && onNavigateTab ? [
        { label: "Zum Dokumente-Tab", onClick: () => onNavigateTab("documents"), variant: "secondary" as const },
      ] : undefined,
    },
    {
      key: "abschluss",
      title: "Abschluss",
      description: "Vorgang abschließen und archivieren",
      status: isCompleted ? "completed" : "upcoming",
      completedAt: isCompleted && data.completedAt ? formatDate(data.completedAt) : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ===== WORKFLOW STEPPER ===== */}
      <ProcessWorkflowStepper steps={workflowSteps} />

      {/* 2-Column Grid (bestehende Cards) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          <Card title="Mitarbeiterdaten">
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              <EditableFieldRow label="Vorname" value={data.employeeFirstName} fieldKey="employeeFirstName"
                editingField={editingField} editingValue={editingValue} savingField={savingField}
                setEditingField={setEditingField} setEditingValue={setEditingValue} handleFieldSave={handleFieldSave} />
              <EditableFieldRow label="Nachname" value={data.employeeLastName} fieldKey="employeeLastName"
                editingField={editingField} editingValue={editingValue} savingField={savingField}
                setEditingField={setEditingField} setEditingValue={setEditingValue} handleFieldSave={handleFieldSave} />
              <FieldRow label="E-Mail" value={data.employeeEmail} />
              <EditableFieldRow label="Private E-Mail" value={data.employeePrivateEmail} fieldKey="employeePrivateEmail"
                editingField={editingField} editingValue={editingValue} savingField={savingField}
                setEditingField={setEditingField} setEditingValue={setEditingValue} handleFieldSave={handleFieldSave} />
              <EditableFieldRow label="Personalnummer" value={data.employeePersonalNr} fieldKey="employeePersonalNr"
                editingField={editingField} editingValue={editingValue} savingField={savingField}
                setEditingField={setEditingField} setEditingValue={setEditingValue} handleFieldSave={handleFieldSave} />
            </div>
          </Card>

          {/* Fuehrungskraft: Empfaenger der Aufgaben mit der Zustaendigkeit
              „Führungskraft". Leeres Feld = loeschen (PATCH mit ""). */}
          <Card title="Führungskraft">
            <EditableFieldRow label="E-Mail der Führungskraft" value={data.supervisorEmail} fieldKey="supervisorEmail"
              editingField={editingField} editingValue={editingValue} savingField={savingField}
              setEditingField={setEditingField} setEditingValue={setEditingValue} handleFieldSave={handleFieldSave} />
            <EditableFieldRow label="Name der Führungskraft" value={data.supervisorName} fieldKey="supervisorName"
              editingField={editingField} editingValue={editingValue} savingField={savingField}
              setEditingField={setEditingField} setEditingValue={setEditingValue} handleFieldSave={handleFieldSave} />
            {!data.supervisorEmail?.trim() &&
              data.fuehrungskraft?.email &&
              data.fuehrungskraft.quelle &&
              FUEHRUNGSKRAFT_QUELLE[data.fuehrungskraft.quelle] && (
                <p className="mt-2 text-xs text-muted-foreground" data-hinweis="fuehrungskraft-quelle">
                  Verwendet wird {data.fuehrungskraft.email} {FUEHRUNGSKRAFT_QUELLE[data.fuehrungskraft.quelle]},
                  solange hier nichts eingetragen ist.
                </p>
              )}
            <p className="mt-2 text-xs text-muted-foreground">
              Bekommt die Aufgaben mit der Zuständigkeit „Führungskraft“ per Link.
            </p>
          </Card>

          <Card title="Austrittsdaten">
            <FieldRow label="Austrittsart" value={EXIT_TYPE_LABELS[data.exitType] || data.exitType} />
            <FieldRow label="Kuendigungsdatum" value={formatDate(data.noticeDate)} />
            <EditableDateRow
              label="Letzter Arbeitstag"
              value={data.lastWorkingDay}
              fieldKey="lastWorkingDay"
              hinweis="Offene Fälligkeiten verschieben sich um dieselbe Anzahl Tage."
              editingField={editingField}
              editingValue={editingValue}
              savingField={savingField}
              setEditingField={setEditingField}
              setEditingValue={setEditingValue}
              handleFieldSave={handleFieldSave}
            />
            <FieldRow label="Vertragsende" value={formatDate(data.contractEndDate)} />
            <FieldRow label="Kuendigungsfrist-Ende" value={formatDate(data.noticePeriodEnd)} />
            {data.exitReason && <FieldRow label="Austrittsgrund" value={data.exitReason} />}
            <FieldRow label="Erfasst am" value={formatDate(data.initiatedAt)} />
            {data.completedAt && <FieldRow label="Abgeschlossen am" value={formatDate(data.completedAt)} />}
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <Card title="Finanzielle Abwicklung">
            {ed ? (
              <>
                <FieldRow label="Resturlaub" value={formatNumber(ed.remainingVacationDays, "Tage")} />
                {ed.vacationPayout !== null && <FieldRow label="Urlaubsauszahlung" value={formatCurrency(ed.vacationPayout)} />}
                <FieldRow label="Ueberstunden" value={formatNumber(ed.overtimeHours, "Std.")} />
                {ed.overtimePayout !== null && <FieldRow label="Ueberstundenauszahlung" value={formatCurrency(ed.overtimePayout)} />}
                {ed.severancePay && <FieldRow label="Abfindung" value={formatCurrency(ed.severancePay)} />}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Noch keine Daten erfasst.</p>
            )}
          </Card>

          <Card title="Zeugnis & Sozialversicherung">
            {ed ? (
              <>
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">Zeugnis-Status</span>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${(CERTIFICATE_STATUS_LABELS[ed.certificateStatus] || CERTIFICATE_STATUS_LABELS.PENDING).color}`}>
                    {(CERTIFICATE_STATUS_LABELS[ed.certificateStatus] || CERTIFICATE_STATUS_LABELS.PENDING).label}
                  </span>
                </div>
                {ed.certificateType && <FieldRow label="Zeugnisart" value={ed.certificateType === "QUALIFIZIERT" ? "Qualifiziert" : "Einfach"} />}
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">SV-Abmeldung</span>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ed.svDeregistrationDone ? "bg-credo-gruen/10 text-credo-gruen" : "bg-credo-gelb/10 text-credo-gelb"}`}>
                    {ed.svDeregistrationDone ? "Erledigt" : "Ausstehend"}
                  </span>
                </div>
                {ed.svDeregistrationDate && <FieldRow label="SV-Abmeldedatum" value={formatDate(ed.svDeregistrationDate)} />}
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">Arbeitsbescheinigung</span>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ed.employmentCertDone ? "bg-credo-gruen/10 text-credo-gruen" : "bg-credo-gelb/10 text-credo-gelb"}`}>
                    {ed.employmentCertDone ? "Erstellt" : "Ausstehend"}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Noch keine Daten erfasst.</p>
            )}
          </Card>

          <Card title="Wissenstransfer">
            {ed ? (
              <>
                <FieldRow label="Uebergabeplan" value={formatBoolean(ed.knowledgeTransferPlan)} />
                <FieldRow label="Nachfolger" value={ed.successorName} />
                <FieldRow label="Dokumentation vollstaendig" value={formatBoolean(ed.handoverDocComplete)} />
                <FieldRow label="Wettbewerbsverbot" value={formatBoolean(ed.nonCompeteClause)} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Noch keine Daten erfasst.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Datumszeile mit Bearbeiten — wie EditableFieldRow, aber mit
 * `<input type="date">`. Der Browser liefert `YYYY-MM-DD`; genau das erwartet
 * PATCH /api/offboarding/[id] (UTC-Mitternacht wie bei der Anlage, die
 * Verschiebung der Faelligkeiten ist damit eine ganze Zahl von Tagen).
 *
 * Fuer den letzten Arbeitstag: Aendert er sich, verschiebt der Server die
 * offenen Faelligkeiten der Checkliste mit (Paket 1b, Punkt 10). Ohne dieses
 * Feld liess sich das Datum im Portal gar nicht aendern.
 */
function EditableDateRow({
  label,
  value,
  fieldKey,
  hinweis,
  editingField,
  editingValue,
  savingField,
  setEditingField,
  setEditingValue,
  handleFieldSave,
}: {
  label: string;
  value: string | null | undefined;
  fieldKey: string;
  hinweis?: string;
  editingField: string | null;
  editingValue: string;
  savingField: boolean;
  setEditingField: (f: string | null) => void;
  setEditingValue: (v: string) => void;
  handleFieldSave: (field: string, value: string) => void;
}) {
  const isEditing = editingField === fieldKey;
  const inputId = `feld-${fieldKey}`;
  // ISO-Zeitstempel (UTC-Mitternacht) → YYYY-MM-DD fuer das Datumsfeld.
  const alsEingabe = value ? value.slice(0, 10) : "";

  if (isEditing) {
    return (
      <div className="py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={inputId} className="shrink-0 text-xs text-muted-foreground">
            {label}
          </label>
          <div className="flex flex-1 items-center justify-end gap-1">
            <input
              id={inputId}
              type="date"
              autoComplete="off"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              className="w-full max-w-[180px] rounded-md border border-input bg-background px-2 py-1 text-right text-sm outline-none focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
              autoFocus
              onKeyDown={(e) => {
                // Wie der Knopf „OK": nicht waehrend des Speicherns, nicht ohne Aenderung.
                if (e.key === "Enter" && editingValue && !savingField && editingValue !== alsEingabe) {
                  handleFieldSave(fieldKey, editingValue);
                }
                if (e.key === "Escape") { setEditingField(null); setEditingValue(""); }
              }}
            />
            <button
              type="button"
              onClick={() => handleFieldSave(fieldKey, editingValue)}
              disabled={savingField || !editingValue || editingValue === alsEingabe}
              className="rounded-md bg-credo-gruen px-2 py-1 text-xs text-white hover:bg-[#5a9420] disabled:opacity-50"
            >
              {savingField ? "..." : "OK"}
            </button>
            <button
              type="button"
              onClick={() => { setEditingField(null); setEditingValue(""); }}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              X
            </button>
          </div>
        </div>
        {hinweis && <p className="mt-1 text-right text-[11px] text-muted-foreground">{hinweis}</p>}
      </div>
    );
  }

  return (
    <div className="group flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-right text-sm font-medium text-foreground">{formatDate(value ?? null)}</span>
        <button
          type="button"
          onClick={() => { setEditingField(fieldKey); setEditingValue(alsEingabe); }}
          className="invisible rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground group-hover:visible"
          title="Bearbeiten"
          aria-label={`${label} bearbeiten`}
        >
          <PencilIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
