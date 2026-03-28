"use client";

import type { NoteData } from "../types";
import { formatDateTime } from "../helpers";
import { Card } from "../shared-components";
import { ChatBubbleIcon, PencilIcon, TrashIcon } from "../icons";

export function TabNotes({
  notes,
  newNote,
  setNewNote,
  savingNote,
  addNote,
  editingNoteId,
  setEditingNoteId,
  editingNoteText,
  setEditingNoteText,
  updateNote,
  deleteNote,
  currentUserId,
}: {
  notes: NoteData[];
  newNote: string;
  setNewNote: (v: string) => void;
  savingNote: boolean;
  addNote: () => void;
  editingNoteId: string | null;
  setEditingNoteId: (id: string | null) => void;
  editingNoteText: string;
  setEditingNoteText: (v: string) => void;
  updateNote: (id: string) => void;
  deleteNote: (id: string) => void;
  currentUserId: string;
}) {
  return (
    <div className="space-y-6">
      {/* Add Note */}
      <Card title="Neue Notiz">
        <div className="flex gap-2">
          <textarea autoComplete="off"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Neue Notiz hinzufügen..."
            rows={3}
            className="min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote();
            }}
          />
          <button
            onClick={addNote}
            disabled={savingNote || !newNote.trim()}
            className="shrink-0 self-end rounded-md bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
          >
            {savingNote ? "..." : "Speichern"}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Strg+Enter zum Speichern</p>
      </Card>

      {/* Note List */}
      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
          <ChatBubbleIcon className="mb-4 h-16 w-16 text-border" />
          <p className="mb-1 text-base font-medium text-foreground">Keine Notizen</p>
          <p className="text-sm text-muted-foreground">
            Noch keine Notizen zu diesem Vorgang vorhanden.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const isOwn = note.createdById === currentUserId;
            const isEditing = editingNoteId === note.id;

            return (
              <div key={note.id} className="rounded-lg border border-border bg-card p-4">
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea autoComplete="off"
                      value={editingNoteText}
                      onChange={(e) => setEditingNoteText(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setEditingNoteId(null); setEditingNoteText(""); }}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        Abbrechen
                      </button>
                      <button
                        onClick={() => updateNote(note.id)}
                        className="rounded-md bg-credo-gruen px-4 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95"
                      >
                        Speichern
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{note.content}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-medium">
                          {note.createdBy.firstName} {note.createdBy.lastName}
                        </span>
                        <span>&middot;</span>
                        <span>{formatDateTime(note.createdAt)}</span>
                      </div>
                      {isOwn && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.content); }}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title="Bearbeiten"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Löschen"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
