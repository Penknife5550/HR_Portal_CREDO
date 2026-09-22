"use client";

import { abteilungLabel } from "@/lib/constants";
import type { AbteilungsAktion, Fuehrungskraft } from "@/lib/abteilungsaufgaben";
import {
  AbteilungenKarte,
  datumUhrzeitDE,
  type AktionsMeldung,
} from "@/components/abteilungsaufgaben/abteilungen-karte";
import type { AbteilungenData, ChecklistItemData } from "../types";
import {
  formatDate,
  CHECKLIST_PHASE_LABELS,
} from "../helpers";
import {
  CheckIcon,
  ChatBubbleIcon,
  NoteIndicatorIcon,
} from "../icons";

/**
 * Wer hat abgehakt — aus `erledigtVon` (GET /api/offboarding/[id]):
 *   LINK   „erledigt von IT-Abteilung (Link) am 29.07.2027, 10:14"
 *   PORTAL „erledigt im Portal von Erika Muster am 29.07.2027, 10:14"
 *   null   „am 29.07.2027" (Altbestand, Urheber unbekannt)
 */
export function erledigtText(item: Pick<ChecklistItemData, "completedAt" | "erledigtVon">): string {
  const am = item.completedAt ? ` am ${datumUhrzeitDE(item.completedAt)}` : "";
  const von = item.erledigtVon;
  if (von?.art === "LINK") return `erledigt von ${von.name} (Link)${am}`;
  if (von?.art === "PORTAL") return `erledigt im Portal von ${von.name}${am}`;
  return item.completedAt ? `am ${formatDate(item.completedAt)}` : "";
}

export function TabChecklist({
  checklistItems,
  togglingItems,
  toggleChecklistItem,
  editingChecklistNoteId,
  setEditingChecklistNoteId,
  checklistNoteText,
  setChecklistNoteText,
  savingChecklistNote,
  saveChecklistNote,
  abteilungen,
  fuehrungskraft,
  darfAbteilungsAktionen = true,
  abgebrochen = false,
  onAbteilungsAktion,
  abteilungsMeldung,
  onAbteilungsMeldungSchliessen,
  onFuehrungskraftEintragen,
}: {
  checklistItems: ChecklistItemData[];
  togglingItems: Set<string>;
  toggleChecklistItem: (id: string, current: boolean) => void;
  editingChecklistNoteId: string | null;
  setEditingChecklistNoteId: (id: string | null) => void;
  checklistNoteText: string;
  setChecklistNoteText: (v: string) => void;
  savingChecklistNote: boolean;
  saveChecklistNote: (id: string) => void;
  /** Karte „Aufgaben für Abteilungen" (fehlt, solange die API sie nicht liefert). */
  abteilungen?: AbteilungenData;
  fuehrungskraft?: Fuehrungskraft;
  darfAbteilungsAktionen?: boolean;
  abgebrochen?: boolean;
  onAbteilungsAktion: (aktion: AbteilungsAktion, departmentKey?: string) => Promise<unknown> | void;
  abteilungsMeldung?: AktionsMeldung | null;
  onAbteilungsMeldungSchliessen?: () => void;
  onFuehrungskraftEintragen?: () => void;
}) {
  if (checklistItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
        <CheckIcon className="mb-4 h-16 w-16 text-border" />
        <p className="mb-1 text-base font-medium text-foreground">Keine Checkliste</p>
        <p className="text-sm text-muted-foreground">
          Diesem Vorgang wurde noch keine Checkliste zugeordnet.
        </p>
      </div>
    );
  }

  const completed = checklistItems.filter((i) => i.isCompleted).length;
  const total = checklistItems.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Anzeigename je Zustaendigkeit: der Name aus der Karte (bei eigenen
  // Schluesseln z. B. „Empfang FES Minden" statt „EMPFANG"), sonst das Label.
  const abteilungsName = (key: string) =>
    abteilungen?.zeilen.find((z) => z.departmentKey === key)?.departmentName ?? abteilungLabel(key);

  // Group by category
  const grouped: Record<string, ChecklistItemData[]> = {};
  checklistItems.forEach((item) => {
    const cat = item.category || "Sonstige";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Fortschritt</p>
            <p className="text-xs text-muted-foreground">
              {completed} von {total} Aufgaben erledigt
            </p>
          </div>
          <span
            className={`text-2xl font-bold ${
              pct === 100 ? "text-credo-gruen" : pct > 50 ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {pct}%
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-credo-gruen transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Aufgaben für Abteilungen (Paket 1b) */}
      {abteilungen && (
        <AbteilungenKarte
          abteilungen={abteilungen}
          fuehrungskraft={fuehrungskraft ?? null}
          bezugsdatumLabel="letzten Arbeitstag"
          darfAktionen={darfAbteilungsAktionen}
          abgebrochen={abgebrochen}
          onAktion={onAbteilungsAktion}
          onFuehrungskraftEintragen={onFuehrungskraftEintragen}
          meldung={abteilungsMeldung}
          onMeldungSchliessen={onAbteilungsMeldungSchliessen}
        />
      )}

      {/* Grouped Items */}
      {Object.entries(grouped).map(([category, items]) => {
        const catCompleted = items.filter((i) => i.isCompleted).length;
        const catTotal = items.length;
        const catPct = catTotal > 0 ? Math.round((catCompleted / catTotal) * 100) : 0;

        return (
          <div key={category}>
            <div className="mb-3 flex items-center gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {CHECKLIST_PHASE_LABELS[category] || category}
              </h3>
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-medium text-muted-foreground">{catCompleted}/{catTotal}</span>
            </div>
            {/* Category progress bar */}
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-credo-gruen transition-all duration-500"
                style={{ width: `${catPct}%` }}
              />
            </div>
            <div className="space-y-2">
              {items
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((item) => {
                  const name = item.assigneeDepartment ? abteilungsName(item.assigneeDepartment) : null;
                  const erledigt = item.isCompleted ? erledigtText(item) : "";
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-card transition-all hover:shadow-sm"
                      data-aufgabe={item.id}
                    >
                      <div className="flex items-start gap-3 p-4">
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleChecklistItem(item.id, item.isCompleted)}
                          disabled={togglingItems.has(item.id)}
                          aria-label={item.isCompleted ? "Als offen markieren" : "Als erledigt markieren"}
                          aria-pressed={item.isCompleted}
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                            item.isCompleted
                              ? "border-credo-gruen bg-credo-gruen"
                              : "border-border hover:border-credo-gruen/50"
                          } ${togglingItems.has(item.id) ? "opacity-50" : ""}`}
                        >
                          {item.isCompleted && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                        </button>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`text-sm font-medium ${
                                item.isCompleted ? "text-muted-foreground line-through" : "text-foreground"
                              }`}
                            >
                              {item.title}
                            </p>

                            {/* Note button */}
                            <button
                              type="button"
                              onClick={() => {
                                if (editingChecklistNoteId === item.id) {
                                  setEditingChecklistNoteId(null);
                                  setChecklistNoteText("");
                                } else {
                                  setEditingChecklistNoteId(item.id);
                                  setChecklistNoteText(item.notes || "");
                                }
                              }}
                              className={`relative shrink-0 rounded-md p-1.5 transition-colors ${
                                editingChecklistNoteId === item.id
                                  ? "bg-[#009AC6]/10 text-[#009AC6]"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                              title="Interne Notiz"
                              aria-label="Interne Notiz"
                            >
                              <ChatBubbleIcon className="h-4 w-4" />
                              {item.notes && (
                                <span className="absolute -right-0.5 -top-0.5">
                                  <NoteIndicatorIcon className="h-2.5 w-2.5 text-[#FBC900]" />
                                </span>
                              )}
                            </button>
                          </div>

                          {/* Meta info */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {name && (
                              <span className="inline-flex rounded-full bg-[#009AC6]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#009AC6]">
                                {name}
                              </span>
                            )}
                            {item.dueDate && (
                              <span className="text-[11px] text-muted-foreground">
                                Fällig: {formatDate(item.dueDate)}
                              </span>
                            )}
                            {erledigt && (
                              <span className="text-[11px] text-muted-foreground" data-urheber>
                                {erledigt}
                              </span>
                            )}
                          </div>

                          {/* Kommentar der Abteilung (ueber ihren Link) — React maskiert */}
                          {item.abteilungKommentar && (
                            <div
                              className="mt-2 rounded-md border border-credo-blau/30 bg-credo-blau/5 px-3 py-2"
                              data-box="abteilungskommentar"
                            >
                              <p className="whitespace-pre-wrap break-words text-xs text-foreground">
                                <span className="font-semibold text-credo-blau">
                                  Kommentar {name ?? "der Abteilung"}
                                  {item.abteilungKommentarAm ? `, ${formatDate(item.abteilungKommentarAm)}` : ""}:
                                </span>{" "}
                                {item.abteilungKommentar}
                              </p>
                            </div>
                          )}

                          {/* Interne HR-Notiz — nur im Portal */}
                          {item.notes && editingChecklistNoteId !== item.id && (
                            <div
                              className="mt-2 rounded-md border border-[#FBC900]/30 bg-[#FBC900]/5 px-3 py-2"
                              data-box="interne-notiz"
                            >
                              <p className="text-[11px] font-semibold text-amber-800">
                                Interne Notiz (nur im Portal)
                              </p>
                              <p className="whitespace-pre-wrap break-words text-xs text-foreground">{item.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Inline note editor */}
                      {editingChecklistNoteId === item.id && (
                        <div className="border-t border-border bg-muted/30 p-4">
                          <label
                            htmlFor={`interne-notiz-${item.id}`}
                            className="mb-1 block text-[11px] font-semibold text-amber-800"
                          >
                            Interne Notiz (nur im Portal)
                          </label>
                          <textarea autoComplete="off"
                            id={`interne-notiz-${item.id}`}
                            value={checklistNoteText}
                            onChange={(e) => setChecklistNoteText(e.target.value)}
                            placeholder="Notiz eingeben..."
                            rows={2}
                            className="mb-2 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
                            autoFocus
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingChecklistNoteId(null);
                                setChecklistNoteText("");
                              }}
                              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                            >
                              Abbrechen
                            </button>
                            <button
                              type="button"
                              onClick={() => saveChecklistNote(item.id)}
                              disabled={savingChecklistNote}
                              className="rounded-md bg-credo-gruen px-4 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
                            >
                              {savingChecklistNote ? "..." : "Speichern"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
