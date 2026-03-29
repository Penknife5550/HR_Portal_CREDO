"use client";

import {
  EXIT_TYPE_LABELS,
  DEPARTMENT_LABELS,
} from "@/lib/constants";
import type { OffboardingData, DepartmentLinkData } from "../types";
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
  StatusMiniCard,
} from "../shared-components";
import { ProcessWorkflowStepper, type WorkflowStep } from "@/components/process-workflow-stepper";

export function TabOverview({
  data,
  editingField,
  editingValue,
  savingField,
  setEditingField,
  setEditingValue,
  handleFieldSave,
  departmentLinks,
}: {
  data: OffboardingData;
  editingField: string | null;
  editingValue: string;
  savingField: boolean;
  setEditingField: (f: string | null) => void;
  setEditingValue: (v: string) => void;
  handleFieldSave: (field: string, value: string) => void;
  departmentLinks: DepartmentLinkData[];
}) {
  const ed = data.exitData;

  // ---- Workflow-Steps berechnen ----
  const checklistTotal = data.checklistItems.length;
  const checklistDone = data.checklistItems.filter((i) => i.isCompleted).length;
  const checklistAllDone = checklistTotal > 0 && checklistDone === checklistTotal;

  const returnTotal = data.returnItems.length;
  const returnDone = data.returnItems.filter((i) => i.isReturned).length;
  const returnsAllDone = returnTotal > 0 && returnDone === returnTotal;

  const deptTotal = departmentLinks.length;
  const deptDone = departmentLinks.filter((d) => d.allTasksComplete).length;
  const deptsAllDone = deptTotal > 0 && deptDone === deptTotal;

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
  const step2Done = deptsAllDone || (deptTotal === 0 && checklistAllDone);
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
      description: "Abteilungs-Links versenden und Aufgaben verteilen",
      status: calcStatus(step2Done, step1Done),
      progress: deptTotal > 0 ? { done: deptDone, total: deptTotal } : checklistTotal > 0 ? { done: checklistDone, total: checklistTotal } : undefined,
      items: deptTotal > 0 ? departmentLinks.map((link) => ({
        id: link.id,
        title: DEPARTMENT_LABELS[link.departmentKey] || link.departmentName,
        isCompleted: link.allTasksComplete,
        contactName: link.email,
        statusLabel: link.allTasksComplete ? "Erledigt"
          : link.firstOpenedAt ? "In Bearbeitung"
          : link.sentAt ? "Gesendet"
          : "Ausstehend",
        statusColor: link.allTasksComplete ? "bg-credo-gruen/10 text-credo-gruen"
          : link.firstOpenedAt ? "bg-credo-blau/10 text-credo-blau"
          : link.sentAt ? "bg-credo-gelb/10 text-credo-gelb"
          : "bg-gray-100 text-gray-600",
      })) : checklistTotal > 0 ? data.checklistItems.filter((i) => !i.isCompleted).slice(0, 5).map((i) => ({
        id: i.id,
        title: i.title,
        isCompleted: false,
        assignee: i.assigneeDepartment || undefined,
        assigneeColor: "bg-credo-blau/10 text-credo-blau",
        note: i.notes,
      })) : undefined,
      info: deptTotal === 0 && checklistTotal === 0 ? "Keine Abteilungs-Links oder Checkliste vorhanden — erstelle sie im Checkliste-Tab" : undefined,
    },
    {
      key: "rueckgaben",
      title: "Rueckgaben einsammeln",
      description: "Hardware, Schluessel, Fahrzeuge und Dokumente zurueckfordern",
      status: calcStatus(step3Done, step1Done),
      progress: returnTotal > 0 ? { done: returnDone, total: returnTotal } : undefined,
      items: returnTotal > 0 ? data.returnItems.filter((i) => !i.isReturned).slice(0, 5).map((i) => ({
        id: i.id,
        title: i.itemName,
        isCompleted: false,
        assignee: i.category,
        assigneeColor: "bg-orange-100 text-orange-700",
      })) : undefined,
      info: returnTotal === 0 ? "Keine Rueckgaben erfasst — erfasse sie im Rueckgaben-Tab" : undefined,
    },
    {
      key: "exit-interview",
      title: "Exit-Interview",
      description: "Austrittsgespraech fuehren und dokumentieren",
      status: calcStatus(step4Done, step2Done && step3Done),
      info: hasExitInterview
        ? (exitInterviewDone ? undefined : "Exit-Interview wurde erstellt — wartet auf Einreichung")
        : "Kein Exit-Interview erstellt — kann im Exit-Interview-Tab angelegt werden",
    },
    {
      key: "zeugnis",
      title: "Zeugnis erstellen",
      description: "Arbeitszeugnis durch Vorgesetzten bewerten lassen",
      status: calcStatus(step5Done, step2Done && step3Done),
      info: zeugnisDone ? undefined
        : zeugnisStatus === "IN_PROGRESS" ? "Zeugnis in Bearbeitung"
        : "Zeugnis-Bewertung noch ausstehend — kann im Zeugnis-Tab gestartet werden",
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
    },
    {
      key: "abschluss",
      title: "Abschluss",
      description: "Vorgang abschliessen und archivieren",
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

          <Card title="Austrittsdaten">
            <FieldRow label="Austrittsart" value={EXIT_TYPE_LABELS[data.exitType] || data.exitType} />
            <FieldRow label="Kuendigungsdatum" value={formatDate(data.noticeDate)} />
            <FieldRow label="Letzter Arbeitstag" value={formatDate(data.lastWorkingDay)} />
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
