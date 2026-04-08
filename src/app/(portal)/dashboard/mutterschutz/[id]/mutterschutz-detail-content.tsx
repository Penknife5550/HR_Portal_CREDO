"use client";

/**
 * Mutterschutz-Detailseite — Phase 1 MVP
 *
 * Tabs: Uebersicht, Checkliste, Notizen
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";

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
  const [tab, setTab] = useState<"uebersicht" | "checkliste" | "notizen">(
    "uebersicht",
  );
  const [neueNotiz, setNeueNotiz] = useState("");

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
    await fetch(
      `/api/mutterschutz/${prozessId}/checkliste/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ erledigt: !item.erledigtAm }),
      },
    );
    load();
  }

  async function notizSpeichern() {
    if (neueNotiz.trim().length === 0) return;
    await fetch(`/api/mutterschutz/${prozessId}/notizen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: neueNotiz }),
    });
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

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b">
          {(["uebersicht", "checkliste", "notizen"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-4 py-2 text-sm font-medium ${
                tab === t
                  ? "border-credo-gruen text-credo-gruen"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              {t === "uebersicht"
                ? "Uebersicht"
                : t === "checkliste"
                  ? `Checkliste (${data.checklistItems.filter((i) => i.erledigtAm).length}/${data.checklistItems.length})`
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
