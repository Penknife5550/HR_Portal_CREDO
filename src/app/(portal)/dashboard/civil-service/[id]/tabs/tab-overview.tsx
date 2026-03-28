"use client";

import {
  CIVIL_SERVICE_STATUS_LABELS,
  CIVIL_SERVICE_ASSIGNEE_LABELS,
} from "@/lib/constants";
import type { CivilServiceData, ChecklistItem } from "../types";
import { ASSIGNEE_COLORS } from "../types";
import { formatDate } from "../helpers";

export function TabOverview({
  data,
  openGatekeepers,
  overdueItems,
}: {
  data: CivilServiceData;
  openGatekeepers: ChecklistItem[];
  overdueItems: ChecklistItem[];
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* Naechste Aktionen */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-credo-gelb/10 text-credo-gelb text-xs">
            !
          </span>
          Nächste Aktionen
        </h3>
        {openGatekeepers.length === 0 ? (
          <p className="text-sm text-gray-400">Keine offenen Gatekeeper-Aufgaben.</p>
        ) : (
          <ul className="space-y-2">
            {openGatekeepers.slice(0, 6).map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-credo-gelb">&#9679;</span>
                <div>
                  <span className="font-medium text-gray-800">{item.title}</span>
                  <span
                    className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      ASSIGNEE_COLORS[item.assignee] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {CIVIL_SERVICE_ASSIGNEE_LABELS[item.assignee] || item.assignee}
                  </span>
                </div>
              </li>
            ))}
            {openGatekeepers.length > 6 && (
              <li className="text-xs text-gray-400">
                +{openGatekeepers.length - 6} weitere
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Fristen */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-credo-rot/10 text-credo-rot text-xs">
            &#8986;
          </span>
          Fristen
        </h3>
        {overdueItems.length > 0 ? (
          <div className="mb-3 rounded-lg bg-credo-rot/5 border border-credo-rot/20 p-3">
            <p className="text-xs font-semibold text-credo-rot mb-1">
              {overdueItems.length} überfällige Aufgabe{overdueItems.length > 1 ? "n" : ""}
            </p>
            {overdueItems.slice(0, 3).map((item) => (
              <p key={item.id} className="text-xs text-credo-rot/80">
                {item.title} (Fällig: {formatDate(item.dueDate)})
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-3">Keine überfälligen Aufgaben.</p>
        )}
        <div className="space-y-2 text-sm">
          {data.probationStartDate && (
            <div className="flex justify-between">
              <span className="text-gray-500">Probezeitbeginn</span>
              <span className="font-medium text-gray-800">{formatDate(data.probationStartDate)}</span>
            </div>
          )}
          {data.probationEndDate && (
            <div className="flex justify-between">
              <span className="text-gray-500">Probezeitende</span>
              <span className="font-medium text-gray-800">{formatDate(data.probationEndDate)}</span>
            </div>
          )}
          {data.lifetimeDate && (
            <div className="flex justify-between">
              <span className="text-gray-500">Übernahme Lebenszeit</span>
              <span className="font-medium text-gray-800">{formatDate(data.lifetimeDate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Voraussetzungen */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-credo-blau/10 text-credo-blau text-xs">
            &#10003;
          </span>
          Voraussetzungen
        </h3>
        {data.prerequisites.length === 0 ? (
          <p className="text-sm text-gray-400">Keine Voraussetzungen definiert.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.prerequisites.map((p) => (
              <li key={p.key} className="flex items-center gap-2 text-sm">
                <span className={p.met ? "text-credo-gruen" : "text-credo-rot"}>
                  {p.met ? "\u2713" : "\u2717"}
                </span>
                <span className={p.met ? "text-gray-600" : "text-gray-800 font-medium"}>
                  {p.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Beiratsentscheidungen */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs">
            &#9733;
          </span>
          Beiratsentscheidungen
        </h3>
        {data.boardDecisions.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine Entscheidungen dokumentiert.</p>
        ) : (
          <ul className="space-y-2">
            {data.boardDecisions.map((d) => (
              <li key={d.id} className="flex items-start justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-800">{d.decisionType}</span>
                  {d.notes && <p className="text-xs text-gray-400 mt-0.5">{d.notes}</p>}
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      d.result === "APPROVED"
                        ? "bg-credo-gruen/10 text-credo-gruen"
                        : d.result === "REJECTED"
                        ? "bg-credo-rot/10 text-credo-rot"
                        : "bg-credo-gelb/10 text-credo-gelb"
                    }`}
                  >
                    {d.result === "APPROVED"
                      ? "Genehmigt"
                      : d.result === "REJECTED"
                      ? "Abgelehnt"
                      : "Aufgeschoben"}
                  </span>
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(d.date)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mitarbeiter-Info */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:col-span-2">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Mitarbeiterinformationen</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <span className="text-gray-400">Name</span>
            <p className="font-medium text-gray-800">
              {data.employeeFirstName} {data.employeeLastName}
            </p>
          </div>
          <div>
            <span className="text-gray-400">E-Mail</span>
            <p className="font-medium text-gray-800">{data.employeeEmail}</p>
          </div>
          <div>
            <span className="text-gray-400">Schule</span>
            <p className="font-medium text-gray-800">{data.organizationName}</p>
          </div>
          <div>
            <span className="text-gray-400">Antrag-ID</span>
            <p className="font-medium text-credo-blau">{data.displayId}</p>
          </div>
          <div>
            <span className="text-gray-400">Startdatum</span>
            <p className="font-medium text-gray-800">{formatDate(data.startDate)}</p>
          </div>
          <div>
            <span className="text-gray-400">Status</span>
            <p className="font-medium text-gray-800">
              {CIVIL_SERVICE_STATUS_LABELS[data.status]?.label || data.status}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
