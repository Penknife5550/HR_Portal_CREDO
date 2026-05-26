"use client";

/**
 * Offboarding-Aufgaben – Abteilungs-Ansicht (Magic Link)
 *
 * Zeigt die Checkliste für eine Abteilung an.
 * Aufgaben koennen abgehakt und mit Kommentar versehen werden.
 * Optimistic Updates mit Fehler-Rollback.
 */

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import type { OffboardingTaskData, ChecklistItem } from "./page";

interface OffboardingTasksFormProps {
  token: string;
  initialData: OffboardingTaskData;
}

export function OffboardingTasksForm({ token, initialData }: OffboardingTasksFormProps) {
  const [items, setItems] = useState<ChecklistItem[]>(
    [...initialData.checklistItems].sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Gruppierung nach Status
  const openItems = useMemo(() => items.filter((i) => !i.isCompleted), [items]);
  const doneItems = useMemo(() => items.filter((i) => i.isCompleted), [items]);

  // Fortschritt
  const total = items.length;
  const completed = doneItems.length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Countdown berechnen
  const countdown = useMemo(() => {
    const lastDay = new Date(initialData.lastWorkingDay);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    lastDay.setHours(0, 0, 0, 0);
    const diff = Math.ceil((lastDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { text: `${Math.abs(diff)} Tage überfällig`, overdue: true };
    if (diff === 0) return { text: "Heute", overdue: false };
    if (diff === 1) return { text: "Morgen", overdue: false };
    return { text: `Noch ${diff} Tage`, overdue: false };
  }, [initialData.lastWorkingDay]);

  // Aufgabe abhaken / zuruecksetzen
  const handleToggle = useCallback(async (item: ChecklistItem) => {
    const newCompleted = !item.isCompleted;
    const comment = commentDrafts[item.id] || null;

    // Optimistic Update
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              isCompleted: newCompleted,
              completedAt: newCompleted ? new Date().toISOString() : null,
              comment: newCompleted ? comment : i.comment,
            }
          : i
      )
    );

    // Erfolgs-Animation
    if (newCompleted) {
      setJustCompleted((prev) => new Set(prev).add(item.id));
      setTimeout(() => {
        setJustCompleted((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 1200);
    }

    setSavingItems((prev) => new Set(prev).add(item.id));
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/offboarding-tasks/${token}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isCompleted: newCompleted,
          comment: newCompleted ? comment : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fehler beim Speichern");
      }

      // Kommentar-Feld schliessen nach erfolgreichem Abhaken
      if (newCompleted) {
        setExpandedItems((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setCommentDrafts((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }
    } catch (err) {
      // Rollback
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, isCompleted: item.isCompleted, completedAt: item.completedAt, comment: item.comment }
            : i
        )
      );
      setErrorMessage(err instanceof Error ? err.message : "Fehler beim Speichern der Aufgabe.");
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setSavingItems((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, [token, commentDrafts]);

  // Kommentar-Feld togglen
  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // Faelligkeitsdatum formatieren
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Pruefen ob ueberfaellig
  const isOverdue = (dateStr: string | null) => {
    if (!dateStr) return false;
    const due = new Date(dateStr);
    due.setHours(23, 59, 59, 999);
    return due < new Date();
  };

  // Mitarbeitername
  const employeeName = `${initialData.employee.firstName} ${initialData.employee.lastName}`;

  // Aufgaben-Karte rendern
  const renderItem = (item: ChecklistItem) => {
    const saving = savingItems.has(item.id);
    const animating = justCompleted.has(item.id);
    const expanded = expandedItems.has(item.id);
    const overdue = !item.isCompleted && isOverdue(item.dueDate);

    return (
      <div
        key={item.id}
        className={`rounded-xl border bg-card shadow-sm transition-all duration-300 ${
          animating ? "ring-2 ring-green-400 ring-offset-2" : ""
        } ${item.isCompleted ? "opacity-75" : ""}`}
      >
        <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
          {/* Custom Checkbox */}
          <button
            onClick={() => handleToggle(item)}
            disabled={saving}
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-300 sm:h-6 sm:w-6 sm:rounded-md ${
              item.isCompleted
                ? "border-green-500 bg-green-500 text-white"
                : "border-gray-300 bg-white hover:border-primary hover:bg-primary/5"
            } ${saving ? "opacity-50" : ""} ${animating ? "scale-110" : ""}`}
            aria-label={item.isCompleted ? "Als offen markieren" : "Als erledigt markieren"}
          >
            {item.isCompleted && (
              <svg
                className={`h-4 w-4 sm:h-3.5 sm:w-3.5 ${animating ? "animate-bounce" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          {/* Inhalt */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4
                className={`text-sm font-medium sm:text-base ${
                  item.isCompleted ? "text-muted-foreground line-through" : "text-foreground"
                }`}
              >
                {item.title}
              </h4>

              {/* Faelligkeitsdatum */}
              {item.dueDate && (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    item.isCompleted
                      ? "bg-green-100 text-green-700"
                      : overdue
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {item.isCompleted ? "Erledigt" : overdue ? "Überfällig" : ""}{" "}
                  {formatDate(item.dueDate)}
                </span>
              )}
            </div>

            {/* Beschreibung */}
            {item.description && (
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                {item.description}
              </p>
            )}

            {/* Abgeschlossen-Info */}
            {item.isCompleted && item.completedAt && (
              <p className="mt-1.5 text-xs text-green-600">
                Erledigt am{" "}
                {new Date(item.completedAt).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {item.comment && (
                  <span className="ml-2 text-muted-foreground">
                    — {item.comment}
                  </span>
                )}
              </p>
            )}

            {/* Kommentar-Button (nur für offene Aufgaben) */}
            {!item.isCompleted && (
              <button
                onClick={() => toggleExpand(item.id)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                {expanded ? "Kommentar ausblenden" : "Kommentar hinzufügen"}
              </button>
            )}

            {/* Kommentar-Feld */}
            {expanded && !item.isCompleted && (
              <div className="mt-2">
                <textarea
                  value={commentDrafts[item.id] || ""}
                  onChange={(e) =>
                    setCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  placeholder="Optionaler Kommentar..."
                  rows={2}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
            )}
          </div>

          {/* Lade-Indikator */}
          {saving && (
            <div className="mt-1 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/credo_logo.svg"
              alt="CREDO"
              width={100}
              height={33}
              priority
            />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-foreground">HR-Portal</h1>
              <p className="text-xs text-muted-foreground">Offboarding</p>
            </div>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {completed} / {total} erledigt
          </span>
        </div>
        <CredoLinie height={2} />
      </header>

      {/* Inhalt */}
      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Titel */}
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">
          Offboarding-Aufgaben: {initialData.departmentLabel}
        </h2>

        {/* Info-Box */}
        <div className="mt-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Mitarbeiter</p>
              <p className="font-medium text-foreground">{employeeName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Einrichtung</p>
              <p className="font-medium text-foreground">{initialData.organization.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Letzter Arbeitstag</p>
              <p className="font-medium text-foreground">
                {new Date(initialData.lastWorkingDay).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Countdown</p>
              <p
                className={`font-medium ${
                  countdown.overdue ? "text-red-600" : "text-foreground"
                }`}
              >
                {countdown.text}
              </p>
            </div>
          </div>

          {/* Fortschrittsbalken */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Gesamtfortschritt</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-credo-gruen transition-all duration-700 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Fehlermeldung */}
        {errorMessage && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        {/* Offene Aufgaben */}
        {openItems.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-xs text-orange-700">
                {openItems.length}
              </span>
              Offene Aufgaben
            </h3>
            <div className="space-y-3">{openItems.map(renderItem)}</div>
          </div>
        )}

        {/* Erledigte Aufgaben */}
        {doneItems.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs text-green-700">
                {doneItems.length}
              </span>
              Erledigte Aufgaben
            </h3>
            <div className="space-y-3">{doneItems.map(renderItem)}</div>
          </div>
        )}

        {/* Alle erledigt */}
        {openItems.length === 0 && doneItems.length > 0 && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-green-800">Alle Aufgaben erledigt!</h3>
            <p className="mt-1 text-sm text-green-700">
              Vielen Dank. Alle Offboarding-Aufgaben für Ihre Abteilung sind abgeschlossen.
            </p>
          </div>
        )}

        {/* Keine Aufgaben */}
        {items.length === 0 && (
          <div className="mt-6 rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              Keine Aufgaben für diese Abteilung vorhanden.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-card py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Bei Fragen wenden Sie sich an die Personalabteilung.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Ihre Eingaben werden verschlüsselt übertragen und gemäß DSGVO verarbeitet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
        </p>
      </footer>
    </div>
  );
}
