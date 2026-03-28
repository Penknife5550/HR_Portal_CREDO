"use client";

import React from "react";
import { PencilIcon } from "./icons";

// =============================================
// Shared UI Sub-Components
// =============================================

export function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="h-1 w-1 rounded-full bg-credo-gruen" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value || "\u2014"}</span>
    </div>
  );
}

export function EditableFieldRow({
  label,
  value,
  fieldKey,
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
  editingField: string | null;
  editingValue: string;
  savingField: boolean;
  setEditingField: (f: string | null) => void;
  setEditingValue: (v: string) => void;
  handleFieldSave: (field: string, value: string) => void;
}) {
  const isEditing = editingField === fieldKey;

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
        <div className="flex flex-1 items-center justify-end gap-1">
          <input autoComplete="off"
            type="text"
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            className="w-full max-w-[200px] rounded-md border border-input bg-background px-2 py-1 text-right text-sm outline-none focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFieldSave(fieldKey, editingValue);
              if (e.key === "Escape") { setEditingField(null); setEditingValue(""); }
            }}
          />
          <button
            onClick={() => handleFieldSave(fieldKey, editingValue)}
            disabled={savingField}
            className="rounded-md bg-credo-gruen px-2 py-1 text-xs text-white hover:bg-[#5a9420] disabled:opacity-50"
          >
            {savingField ? "..." : "OK"}
          </button>
          <button
            onClick={() => { setEditingField(null); setEditingValue(""); }}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            X
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-right text-sm font-medium text-foreground">{value || "\u2014"}</span>
        <button
          onClick={() => { setEditingField(fieldKey); setEditingValue(value || ""); }}
          className="invisible rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground group-hover:visible"
          title="Bearbeiten"
        >
          <PencilIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function StatusMiniCard({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${done ? "border-credo-gruen/30 bg-credo-gruen/5" : "border-border bg-muted/30"}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${done ? "text-credo-gruen" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
