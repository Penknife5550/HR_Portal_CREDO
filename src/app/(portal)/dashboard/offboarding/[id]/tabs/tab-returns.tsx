"use client";

import { RETURN_CATEGORY_LABELS } from "@/lib/constants";
import type { ReturnItemData } from "../types";
import { formatDate } from "../helpers";
import { CheckIcon, PlusIcon } from "../icons";

export function TabReturns({
  returnItems,
  confirmReturn,
  showAddReturn,
  setShowAddReturn,
  newReturn,
  setNewReturn,
  addReturnItem,
  savingReturn,
}: {
  returnItems: ReturnItemData[];
  confirmReturn: (id: string) => void;
  showAddReturn: boolean;
  setShowAddReturn: (v: boolean) => void;
  newReturn: { category: string; itemName: string; serialNumber: string; notes: string };
  setNewReturn: (v: { category: string; itemName: string; serialNumber: string; notes: string }) => void;
  addReturnItem: () => void;
  savingReturn: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {returnItems.length > 0
            ? `${returnItems.filter((i) => i.isReturned).length} von ${returnItems.length} Gegenständen zurückgegeben`
            : "Noch keine Rückgaben erfasst"
          }
        </p>
        <button
          onClick={() => setShowAddReturn(!showAddReturn)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95"
        >
          <PlusIcon className="h-4 w-4" />
          Gegenstand hinzufügen
        </button>
      </div>

      {/* Add Return Inline Form */}
      {showAddReturn && (
        <div className="rounded-xl border border-credo-gruen/30 bg-credo-gruen/5 p-5">
          <h4 className="mb-3 text-sm font-bold text-foreground">Neuen Gegenstand erfassen</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Kategorie</label>
              <select autoComplete="off"
                value={newReturn.category}
                onChange={(e) => setNewReturn({ ...newReturn, category: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
              >
                {Object.entries(RETURN_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Gegenstand</label>
              <input autoComplete="off"
                type="text"
                value={newReturn.itemName}
                onChange={(e) => setNewReturn({ ...newReturn, itemName: e.target.value })}
                placeholder="z.B. Laptop ThinkPad X1"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Seriennummer (optional)</label>
              <input autoComplete="off"
                type="text"
                value={newReturn.serialNumber}
                onChange={(e) => setNewReturn({ ...newReturn, serialNumber: e.target.value })}
                placeholder="z.B. SN-12345"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notiz (optional)</label>
              <input autoComplete="off"
                type="text"
                value={newReturn.notes}
                onChange={(e) => setNewReturn({ ...newReturn, notes: e.target.value })}
                placeholder="z.B. Kratzer am Deckel"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setShowAddReturn(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Abbrechen
            </button>
            <button
              onClick={addReturnItem}
              disabled={savingReturn || !newReturn.itemName.trim()}
              className="rounded-md bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
            >
              {savingReturn ? "Wird gespeichert..." : "Hinzufügen"}
            </button>
          </div>
        </div>
      )}

      {/* Return Items Table */}
      {returnItems.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Kategorie</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Gegenstand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Seriennummer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Zustand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Notiz</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {returnItems.map((item) => (
                <tr key={item.id} className="border-b border-border/50 transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-foreground">
                      {RETURN_CATEGORY_LABELS[item.category] || item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{item.itemName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.serialNumber || "\u2014"}</td>
                  <td className="px-4 py-3">
                    {item.isReturned ? (
                      <span className="inline-flex rounded-full bg-credo-gruen/10 px-2.5 py-0.5 text-xs font-medium text-credo-gruen">
                        Zurückgegeben
                        {item.returnedAt && (
                          <span className="ml-1 text-[10px] text-credo-gruen">({formatDate(item.returnedAt)})</span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-credo-rot/10 px-2.5 py-0.5 text-xs font-medium text-credo-rot">
                        Ausstehend
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.condition || "\u2014"}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-xs text-muted-foreground" title={item.notes || ""}>
                    {item.notes || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!item.isReturned && (
                      <button
                        onClick={() => confirmReturn(item.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-credo-gruen px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95"
                      >
                        <CheckIcon className="h-3 w-3" />
                        Rückgabe
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !showAddReturn ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
          <svg className="mb-4 h-16 w-16 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="mb-1 text-base font-medium text-foreground">Keine Rückgaben</p>
          <p className="text-sm text-muted-foreground">
            Es wurden noch keine Gegenstände zur Rückgabe erfasst.
          </p>
        </div>
      ) : null}
    </div>
  );
}
