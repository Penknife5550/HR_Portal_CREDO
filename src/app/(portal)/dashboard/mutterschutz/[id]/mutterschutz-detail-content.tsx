"use client";

/**
 * Mutterschutz-Detailseite — Phase 1 MVP
 *
 * Tabs: Uebersicht, Checkliste, Notizen
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";
import {
  ProzessStepper,
  NaechsterSchrittBanner,
} from "@/components/prozess-stepper";
import { ConfirmDeleteModal } from "@/components/elternzeit/elternzeit-modals";
import {
  getRelevantSteps,
  getStepIndex as getMsStepIndex,
  getNaechsterSchritt as getMsNaechsterSchritt,
  type MutterschutzStatus,
} from "@/lib/mutterschutz-workflow";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface ChecklistItem {
  id: string;
  titel: string;
  beschreibung: string | null;
  logaHinweis: string | null;
  erledigtAm: string | null;
  erledigtVon: string | null;
  personalgruppe: string | null;
  orderIndex: number;
}

interface Notiz {
  id: string;
  text: string;
  erstelltVon: string;
  createdAt: string;
}

interface DokumentEintrag {
  id: string;
  dokumentTyp: string;
  dateiname: string;
  mimeType: string | null;
  fileSize: number | null;
  generiert: boolean;
  hochgeladenAm: string;
  hochgeladenVon: string | null;
}

interface MutterschutzData {
  id: string;
  displayId: string;
  status: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string;
  employeePersonalNr: string | null;
  voraussGeburt: string;
  tatsGeburt: string | null;
  mutterschutzBeginn: string;
  mutterschutzEnde: string | null;
  fruehgeburt: boolean;
  mehrlinge: boolean;
  einrichtungstyp: string;
  badErforderlich: boolean;
  badBeauftragtAm: string | null;
  badAbgeschlossenAm: string | null;
  beschaeftigungsverbot: boolean;
  organization: { id: string; name: string; mandantNumber: string };
  checklistItems: ChecklistItem[];
  notizen: Notiz[];
  dokumente: DokumentEintrag[];
  elternzeitProzesse: {
    id: string;
    displayId: string;
    status: string;
    geschlecht: string;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  GEMELDET: "Gemeldet",
  BAD_BEAUFTRAGT: "BAD beauftragt",
  BAD_ABGESCHLOSSEN: "BAD abgeschlossen",
  AKTIV: "Aktiv",
  BEENDET: "Beendet",
};

export function MutterschutzDetailContent({
  prozessId,
  user,
}: {
  prozessId: string;
  user: User;
}) {
  const [data, setData] = useState<MutterschutzData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    "uebersicht" | "checkliste" | "dokumente" | "notizen"
  >("uebersicht");
  const [neueNotiz, setNeueNotiz] = useState("");
  const [uploadTyp, setUploadTyp] = useState<string>("SONSTIGES");
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DokumentEintrag | null>(
    null,
  );

  async function dokumentUpload(file: File) {
    setActionError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dokumentTyp", uploadTyp);
      const res = await fetch(`/api/mutterschutz/${prozessId}/dokumente`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error || "Upload fehlgeschlagen.");
        return;
      }
      load();
    } finally {
      setUploading(false);
    }
  }

  async function dokumentLoeschen(docId: string) {
    setActionError(null);
    const res = await fetch(
      `/api/mutterschutz/${prozessId}/dokumente/${docId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error || "Dokument konnte nicht geloescht werden.");
      return;
    }
    load();
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/mutterschutz/${prozessId}`);
    if (res.ok) {
      const j = await res.json();
      setData(j.data);
    }
    setLoading(false);
  }, [prozessId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleItem(item: ChecklistItem) {
    setActionError(null);
    const res = await fetch(
      `/api/mutterschutz/${prozessId}/checkliste/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ erledigt: !item.erledigtAm }),
      },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error || "Item konnte nicht aktualisiert werden.");
      return;
    }
    load();
  }

  async function statusTransition(
    aktion: "bad-beauftragen" | "bad-abschliessen" | "aktivieren" | "beenden",
  ) {
    setActionError(null);
    const res = await fetch(`/api/mutterschutz/${prozessId}/${aktion}`, {
      method: "POST",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error || `Fehler bei Aktion '${aktion}'.`);
      return;
    }
    load();
  }

  async function notizSpeichern() {
    if (neueNotiz.trim().length === 0) return;
    setActionError(null);
    const res = await fetch(`/api/mutterschutz/${prozessId}/notizen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: neueNotiz }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error || "Notiz konnte nicht gespeichert werden.");
      return;
    }
    setNeueNotiz("");
    load();
  }

  if (loading || !data) {
    return (
      <div>
        <PortalHeader user={user} />
        <div className="p-8 text-center text-sm text-muted-foreground">
          Lade…
        </div>
      </div>
    );
  }

  return (
    <div>
      <PortalHeader user={user} />
      <div className="mx-auto max-w-5xl p-4">
        <div className="mb-4">
          <Link
            href="/dashboard?tab=mutterschutz"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Zurueck zum Dashboard
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-xl font-bold">
              {data.employeeFirstName} {data.employeeLastName}
            </h1>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
              {data.displayId}
            </span>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              {STATUS_LABELS[data.status] || data.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.organization.name} ({data.organization.mandantNumber})
          </p>
        </div>

        {actionError && (
          <div className="mb-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {actionError}
          </div>
        )}

        {/* Prozess-Stepper + Naechster-Schritt-Banner */}
        {(() => {
          const msStatus = data.status as MutterschutzStatus;
          const steps = getRelevantSteps(data.badErforderlich);
          const stepIndex = getMsStepIndex(msStatus, data.badErforderlich);
          const naechster = getMsNaechsterSchritt(
            msStatus,
            data.badErforderlich,
          );

          return (
            <div className="mb-4 space-y-3">
              <ProzessStepper
                steps={steps.map((s) => ({
                  id: s.id,
                  label: s.label,
                  beschreibung: s.beschreibung,
                }))}
                currentStepIndex={stepIndex}
              />
              <NaechsterSchrittBanner
                titel={naechster.titel}
                beschreibung={naechster.beschreibung}
                hrAktion={naechster.hrAktion}
                actionLabel={naechster.actionLabel}
                onAction={
                  naechster.action === "BAD_BEAUFTRAGEN"
                    ? () => statusTransition("bad-beauftragen")
                    : naechster.action === "BAD_ABSCHLIESSEN"
                      ? () => statusTransition("bad-abschliessen")
                      : naechster.action === "AKTIVIEREN"
                        ? () => statusTransition("aktivieren")
                        : naechster.action === "BEENDEN"
                          ? () => statusTransition("beenden")
                          : undefined
                }
              />
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b overflow-x-auto">
          {(
            ["uebersicht", "checkliste", "dokumente", "notizen"] as const
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
                tab === t
                  ? "border-credo-gruen text-credo-gruen"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              {t === "uebersicht"
                ? "Uebersicht"
                : t === "checkliste"
                  ? `Checkliste (${data.checklistItems.filter((i) => i.erledigtAm).length}/${data.checklistItems.length})`
                  : t === "dokumente"
                    ? `Dokumente (${data.dokumente?.length ?? 0})`
                    : `Notizen (${data.notizen.length})`}
            </button>
          ))}
        </div>

        {tab === "uebersicht" && (
          <div className="space-y-4">
            <Section title="Mutterschutz-Daten">
              <Row label="Vorauss. Geburtstermin">
                {new Date(data.voraussGeburt).toLocaleDateString("de-DE")}
              </Row>
              <Row label="Mutterschutz-Beginn">
                {new Date(data.mutterschutzBeginn).toLocaleDateString("de-DE")}
              </Row>
              {data.tatsGeburt && (
                <Row label="Tatsaechliche Geburt">
                  {new Date(data.tatsGeburt).toLocaleDateString("de-DE")}
                  {data.fruehgeburt && " · Fruehgeburt"}
                  {data.mehrlinge && " · Mehrlinge"}
                </Row>
              )}
              {data.mutterschutzEnde && (
                <Row label="Mutterschutz-Ende">
                  {new Date(data.mutterschutzEnde).toLocaleDateString("de-DE")}
                </Row>
              )}
            </Section>

            <Section title="BAD (Betriebsaerztlicher Dienst)">
              <Row label="Einrichtungstyp">{data.einrichtungstyp}</Row>
              <Row label="BAD erforderlich">
                {data.badErforderlich ? "Ja" : "Nein"}
              </Row>
              {data.badBeauftragtAm && (
                <Row label="Beauftragt am">
                  {new Date(data.badBeauftragtAm).toLocaleDateString("de-DE")}
                </Row>
              )}
              {data.badAbgeschlossenAm && (
                <Row label="Abgeschlossen am">
                  {new Date(data.badAbgeschlossenAm).toLocaleDateString("de-DE")}
                </Row>
              )}
              {data.beschaeftigungsverbot && (
                <Row label="Beschaeftigungsverbot">Ja</Row>
              )}
            </Section>

            {data.elternzeitProzesse.length > 0 && (
              <Section title="Verknuepfte Elternzeit-Vorgaenge">
                <ul className="space-y-1">
                  {data.elternzeitProzesse.map((ez) => (
                    <li key={ez.id} className="text-sm">
                      <Link
                        href={`/dashboard/elternzeit/${ez.id}`}
                        className="text-credo-gruen hover:underline"
                      >
                        {ez.displayId}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {ez.geschlecht} · {ez.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}

        {tab === "checkliste" && (
          <div className="space-y-2">
            {data.checklistItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border bg-card p-4 flex items-start gap-3"
              >
                <input
                  type="checkbox"
                  checked={!!item.erledigtAm}
                  onChange={() => toggleItem(item)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{item.titel}</div>
                  {item.beschreibung && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {item.beschreibung}
                    </div>
                  )}
                  {item.logaHinweis && (
                    <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                      <span className="font-medium">LOGA:</span>{" "}
                      {item.logaHinweis}
                    </div>
                  )}
                  {item.erledigtAm && item.erledigtVon && (
                    <div className="mt-1 text-xs text-credo-gruen">
                      ✓ Erledigt am{" "}
                      {new Date(item.erledigtAm).toLocaleDateString("de-DE")}{" "}
                      von {item.erledigtVon}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "dokumente" && (
          <div className="space-y-4">
            {/* BAD-Brief generieren */}
            {data.badErforderlich && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold text-primary">
                  BAD-Aufforderungsbrief
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Generiert den Brief an den Betriebsaerztlichen Dienst
                  und legt ihn als Dokument ab.
                </p>
                <a
                  href={`/api/mutterschutz/${prozessId}/bad-aufforderung`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                >
                  BAD-Brief erzeugen (PDF)
                </a>
              </div>
            )}

            {/* Upload-Bereich */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold text-primary">
                Dokument hochladen
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Manueller Upload (max. 10 MB, PDF / JPG / PNG / WebP).
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={uploadTyp}
                  onChange={(e) => setUploadTyp(e.target.value)}
                  className="rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="BAD_BESCHEINIGUNG">BAD-Bescheinigung</option>
                  <option value="GEFAEHRDUNGSBEURTEILUNG">
                    Gefaehrdungsbeurteilung
                  </option>
                  <option value="LOHNBESCHEINIGUNG_KK">
                    Lohnbescheinigung KK
                  </option>
                  <option value="AERZTLICHES_ZEUGNIS">
                    Aerztliches Zeugnis
                  </option>
                  <option value="SONSTIGES">Sonstiges</option>
                </select>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) dokumentUpload(f);
                    e.target.value = "";
                  }}
                  className="text-sm"
                />
                {uploading && (
                  <span className="text-xs text-muted-foreground">
                    Lade hoch…
                  </span>
                )}
              </div>
            </div>

            {/* Liste */}
            {(!data.dokumente || data.dokumente.length === 0) && (
              <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                Keine Dokumente vorhanden.
              </p>
            )}
            {data.dokumente && data.dokumente.length > 0 && (
              <div className="overflow-hidden rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Typ</th>
                      <th className="px-3 py-2 text-left">Dateiname</th>
                      <th className="px-3 py-2 text-left">Hochgeladen</th>
                      <th className="px-3 py-2 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dokumente.map((d) => (
                      <tr
                        key={d.id}
                        className="border-t border-border/50 hover:bg-muted/20"
                      >
                        <td className="px-3 py-2">
                          <span className="rounded bg-muted px-2 py-0.5 text-xs">
                            {d.dokumentTyp}
                          </span>
                          {d.generiert && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (generiert)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <a
                            href={`/api/mutterschutz/${prozessId}/dokumente/${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-credo-gruen hover:underline"
                          >
                            {d.dateiname}
                          </a>
                          {d.fileSize && (
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              {(d.fileSize / 1024).toFixed(0)} KB
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {new Date(d.hochgeladenAm).toLocaleDateString(
                            "de-DE",
                          )}
                          {d.hochgeladenVon && ` · ${d.hochgeladenVon}`}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(d)}
                            className="text-xs text-destructive hover:underline"
                          >
                            Loeschen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "notizen" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <textarea
                value={neueNotiz}
                onChange={(e) => setNeueNotiz(e.target.value)}
                rows={3}
                placeholder="Neue Notiz…"
                className="w-full rounded border bg-background px-3 py-2 text-sm resize-none"
              />
              <button
                onClick={notizSpeichern}
                disabled={!neueNotiz.trim()}
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Speichern
              </button>
            </div>
            {data.notizen.map((n) => (
              <div key={n.id} className="rounded-lg border bg-card p-4">
                <div className="text-sm whitespace-pre-wrap">{n.text}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {n.erstelltVon} ·{" "}
                  {new Date(n.createdAt).toLocaleString("de-DE")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          titel="Dokument loeschen?"
          beschreibung={`'${confirmDelete.dateiname}' wird endgueltig entfernt.`}
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const docId = confirmDelete.id;
            setConfirmDelete(null);
            await dokumentLoeschen(docId);
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-primary">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
