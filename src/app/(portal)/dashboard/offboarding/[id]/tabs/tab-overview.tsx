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

  return (
    <div className="space-y-6">
      {/* 2-Column Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Mitarbeiterdaten */}
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

          {/* Austrittsdaten */}
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
          {/* Finanzielle Abwicklung */}
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

          {/* Zeugnis & SV */}
          <Card title="Zeugnis & Sozialversicherung">
            {ed ? (
              <>
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">Zeugnis-Status</span>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    (CERTIFICATE_STATUS_LABELS[ed.certificateStatus] || CERTIFICATE_STATUS_LABELS.PENDING).color
                  }`}>
                    {(CERTIFICATE_STATUS_LABELS[ed.certificateStatus] || CERTIFICATE_STATUS_LABELS.PENDING).label}
                  </span>
                </div>
                {ed.certificateType && <FieldRow label="Zeugnisart" value={ed.certificateType === "QUALIFIZIERT" ? "Qualifiziert" : "Einfach"} />}
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">SV-Abmeldung</span>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    ed.svDeregistrationDone ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {ed.svDeregistrationDone ? "Erledigt" : "Ausstehend"}
                  </span>
                </div>
                {ed.svDeregistrationDate && <FieldRow label="SV-Abmeldedatum" value={formatDate(ed.svDeregistrationDate)} />}
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">Arbeitsbescheinigung</span>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    ed.employmentCertDone ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {ed.employmentCertDone ? "Erstellt" : "Ausstehend"}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Noch keine Daten erfasst.</p>
            )}
          </Card>

          {/* Wissenstransfer */}
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

      {/* Status-Uebersicht */}
      <Card title="Status-Uebersicht">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatusMiniCard
            label="Checkliste"
            value={
              data.checklistItems.length > 0
                ? `${data.checklistItems.filter((i) => i.isCompleted).length}/${data.checklistItems.length}`
                : "Keine"
            }
            done={data.checklistItems.length > 0 && data.checklistItems.every((i) => i.isCompleted)}
          />
          <StatusMiniCard
            label="Rueckgaben"
            value={
              data.returnItems.length > 0
                ? `${data.returnItems.filter((i) => i.isReturned).length}/${data.returnItems.length}`
                : "Keine"
            }
            done={data.returnItems.length > 0 && data.returnItems.every((i) => i.isReturned)}
          />
          <StatusMiniCard
            label="Dokumente"
            value={`${data.documents.length} Datei${data.documents.length !== 1 ? "en" : ""}`}
            done={data.documents.length > 0}
          />
          <StatusMiniCard
            label="Zeugnis"
            value={ed ? (CERTIFICATE_STATUS_LABELS[ed.certificateStatus] || CERTIFICATE_STATUS_LABELS.PENDING).label : "Offen"}
            done={ed?.certificateStatus === "COMPLETED" || ed?.certificateStatus === "SENT"}
          />
        </div>
      </Card>

      {/* Abteilungs-Fortschritt */}
      <Card title="Abteilungen">
        {departmentLinks.length > 0 ? (
          <div className="space-y-2">
            {departmentLinks.map((link) => {
              const deptLabel = DEPARTMENT_LABELS[link.departmentKey] || link.departmentName;
              return (
                <div key={link.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex rounded-full bg-[#009AC6]/10 px-2.5 py-1 text-xs font-semibold text-[#009AC6]">
                      {deptLabel}
                    </span>
                    <span className="text-sm text-muted-foreground">{link.email}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {link.openCount > 0 && (
                      <span className="text-xs text-muted-foreground">{link.openCount}x geöffnet</span>
                    )}
                    {link.allTasksComplete ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Abgeschlossen
                      </span>
                    ) : link.firstOpenedAt ? (
                      <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                        In Bearbeitung
                      </span>
                    ) : link.sentAt ? (
                      <span className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                        Gesendet
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                        Ausstehend
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Noch keine Abteilungs-Links erstellt. Erstelle sie im Tab &quot;Checkliste&quot;.
          </p>
        )}
      </Card>
    </div>
  );
}
