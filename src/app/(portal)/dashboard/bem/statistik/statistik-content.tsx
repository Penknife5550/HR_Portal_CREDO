"use client";

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

interface Agg {
  gesamt: number;
  inBearbeitung: number;
  abgelehnt: number;
  abgebrochen: number;
  abgeschlossen: number;
  angeboten: number;
  angenommen: number;
  ergErfolgreich: number;
  ergTeilweise: number;
  ergKeinErfolg: number;
  ergKeineMassnahmen: number;
}

interface Zeile extends Agg {
  organizationId: string;
  mandant: string;
  mandantNumber: string;
}

interface StatistikData {
  jahr: number | null;
  verfuegbareJahre: number[];
  zeilen: Zeile[];
  gesamt: Agg;
  generiertAm: string;
}

function quote(zaehler: number, nenner: number): string {
  if (nenner <= 0) return "—";
  return `${Math.round((zaehler / nenner) * 100)} %`;
}

// Schutz vor CSV-Formel-Injection: Excel/LibreOffice werten Zellinhalte, die mit
// = + - @ (oder Tab/CR) beginnen, beim Oeffnen als Formel aus. Reine Zahlen sind
// unbetroffen; nur Freitext-Spalten (Mandantenname) sind der Vektor.
function sanitizeCsvCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

// Spalten-Definition (auch fuer CSV-Export wiederverwendet).
const COLS: { key: keyof Agg; label: string; group: string }[] = [
  { key: "gesamt", label: "Gesamt", group: "" },
  { key: "inBearbeitung", label: "In Bearbeitung", group: "Status" },
  { key: "abgelehnt", label: "Abgelehnt", group: "Status" },
  { key: "abgebrochen", label: "Abgebrochen", group: "Status" },
  { key: "abgeschlossen", label: "Abgeschlossen", group: "Status" },
  { key: "angeboten", label: "Einladung versendet", group: "Verfahren" },
  { key: "angenommen", label: "Einwilligung erteilt", group: "Verfahren" },
  { key: "ergErfolgreich", label: "Erfolgreich", group: "Ergebnis" },
  { key: "ergTeilweise", label: "Teilweise", group: "Ergebnis" },
  { key: "ergKeinErfolg", label: "Kein Erfolg", group: "Ergebnis" },
  { key: "ergKeineMassnahmen", label: "Keine Maßnahmen nötig", group: "Ergebnis" },
];

export function BemStatistikContent({ user }: { user: User }) {
  const [data, setData] = useState<StatistikData | null>(null);
  const [jahr, setJahr] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = jahr ? `?jahr=${jahr}` : "";
      const res = await fetch(`/api/bem/statistik${qs}`);
      if (!res.ok) throw new Error("Fehler beim Laden der Statistik");
      const json = await res.json();
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [jahr]);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    if (!data) return;
    const sep = ";";
    const header = ["Mandant-Nr.", "Mandant", ...COLS.map((c) => c.label), "Annahmequote"];
    const rowToCells = (mandantNr: string, mandant: string, a: Agg) => [
      mandantNr,
      mandant,
      ...COLS.map((c) => String(a[c.key])),
      data && a.angeboten > 0 ? `${Math.round((a.angenommen / a.angeboten) * 100)}%` : "",
    ];
    const lines = [
      header,
      ...data.zeilen.map((z) => rowToCells(z.mandantNumber, z.mandant, z)),
      rowToCells("", "GESAMT", data.gesamt),
    ];
    const csv = lines
      .map((cells) =>
        cells
          .map((c) => `"${sanitizeCsvCell(String(c)).replace(/"/g, '""')}"`)
          .join(sep),
      )
      .join("\r\n");
    // BOM (﻿), damit Excel UTF-8 (Umlaute) korrekt erkennt.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BEM-Statistik${jahr ? `-${jahr}` : "-gesamt"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const g = data?.gesamt;

  return (
    <div className="min-h-screen bg-background">
      <div className="print:hidden">
        <PortalHeader user={user} />
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 print:hidden">
              <Link
                href="/dashboard/bem"
                className="text-sm text-credo-blau hover:underline"
              >
                ← Zurück zur BEM-Übersicht
              </Link>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-foreground">
              📊 BEM-Statistik / IKS-Report
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Anonyme Kennzahlen je Mandant (§ 167 SGB IX). Diese Auswertung
              enthält ausschließlich aggregierte Anzahlen — keine Namen, keine
              Fall-Nummern, keine personenbezogenen Inhalte.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <select
              value={jahr}
              onChange={(e) => setJahr(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Alle Jahre</option>
              {data?.verfuegbareJahre.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!data || loading}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              CSV exportieren
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!data || loading}
              className="rounded-lg bg-credo-blau px-4 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90 disabled:opacity-50"
            >
              Drucken / PDF
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
            {error}
          </div>
        )}

        {/* KPI-Karten (Gesamt-Scope) */}
        {g && (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Verfahren gesamt" value={g.gesamt} />
            <KpiCard
              label="Annahmequote"
              value={quote(g.angenommen, g.angeboten)}
              hint="Einwilligung / Einladung"
              accent="blau"
            />
            <KpiCard label="Abgeschlossen" value={g.abgeschlossen} accent="gruen" />
            <KpiCard
              label="Erfolgsquote"
              value={quote(g.ergErfolgreich, g.abgeschlossen)}
              hint="Erfolgreich / abgeschlossen"
              accent="gruen"
            />
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Lade Statistik…
          </div>
        ) : !data || data.zeilen.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Keine BEM-Verfahren im gewählten Zeitraum.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium" rowSpan={2}>
                    Mandant
                  </th>
                  <th className="px-3 py-2 text-right font-medium" rowSpan={2}>
                    Gesamt
                  </th>
                  <th className="border-l border-border px-3 py-1 text-center font-medium" colSpan={4}>
                    Status
                  </th>
                  <th className="border-l border-border px-3 py-1 text-center font-medium" colSpan={3}>
                    Verfahren
                  </th>
                  <th className="border-l border-border px-3 py-1 text-center font-medium" colSpan={4}>
                    Ergebnis (abgeschlossen)
                  </th>
                </tr>
                <tr className="border-b border-border text-[11px] uppercase text-muted-foreground">
                  <th className="border-l border-border px-3 py-2 text-right font-medium">In Bearb.</th>
                  <th className="px-3 py-2 text-right font-medium">Abgelehnt</th>
                  <th className="px-3 py-2 text-right font-medium">Abgebr.</th>
                  <th className="px-3 py-2 text-right font-medium">Abgeschl.</th>
                  <th className="border-l border-border px-3 py-2 text-right font-medium">Eingeladen</th>
                  <th className="px-3 py-2 text-right font-medium">Eingewilligt</th>
                  <th className="px-3 py-2 text-right font-medium">Annahme</th>
                  <th className="border-l border-border px-3 py-2 text-right font-medium">Erfolgr.</th>
                  <th className="px-3 py-2 text-right font-medium">Teilw.</th>
                  <th className="px-3 py-2 text-right font-medium">Kein Erf.</th>
                  <th className="px-3 py-2 text-right font-medium">o. Maßn.</th>
                </tr>
              </thead>
              <tbody>
                {data.zeilen.map((z) => (
                  <tr key={z.organizationId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{z.mandantNumber}</span>
                      <span className="text-muted-foreground"> — {z.mandant}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">{z.gesamt}</td>
                    <td className="border-l border-border px-3 py-2 text-right">{z.inBearbeitung}</td>
                    <td className="px-3 py-2 text-right">{z.abgelehnt}</td>
                    <td className="px-3 py-2 text-right">{z.abgebrochen}</td>
                    <td className="px-3 py-2 text-right">{z.abgeschlossen}</td>
                    <td className="border-l border-border px-3 py-2 text-right">{z.angeboten}</td>
                    <td className="px-3 py-2 text-right">{z.angenommen}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{quote(z.angenommen, z.angeboten)}</td>
                    <td className="border-l border-border px-3 py-2 text-right">{z.ergErfolgreich}</td>
                    <td className="px-3 py-2 text-right">{z.ergTeilweise}</td>
                    <td className="px-3 py-2 text-right">{z.ergKeinErfolg}</td>
                    <td className="px-3 py-2 text-right">{z.ergKeineMassnahmen}</td>
                  </tr>
                ))}
              </tbody>
              {g && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                    <td className="px-3 py-2 text-foreground">Gesamt</td>
                    <td className="px-3 py-2 text-right text-foreground">{g.gesamt}</td>
                    <td className="border-l border-border px-3 py-2 text-right">{g.inBearbeitung}</td>
                    <td className="px-3 py-2 text-right">{g.abgelehnt}</td>
                    <td className="px-3 py-2 text-right">{g.abgebrochen}</td>
                    <td className="px-3 py-2 text-right">{g.abgeschlossen}</td>
                    <td className="border-l border-border px-3 py-2 text-right">{g.angeboten}</td>
                    <td className="px-3 py-2 text-right">{g.angenommen}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{quote(g.angenommen, g.angeboten)}</td>
                    <td className="border-l border-border px-3 py-2 text-right">{g.ergErfolgreich}</td>
                    <td className="px-3 py-2 text-right">{g.ergTeilweise}</td>
                    <td className="px-3 py-2 text-right">{g.ergKeinErfolg}</td>
                    <td className="px-3 py-2 text-right">{g.ergKeineMassnahmen}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Methodische Hinweise (Audit-Nachvollziehbarkeit) */}
        <div className="mt-6 space-y-1 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Lesehilfe / Methodik</p>
          <p>
            <strong>Status</strong> (Momentaufnahme, Summe = Gesamt): aktueller
            Stand jedes Verfahrens. „Abgeschlossen“ umfasst auch Verfahren in
            Aufbewahrung/Löschung mit erfasstem Ergebnis; „Abgebrochen“ jene ohne
            Ergebnis.
          </p>
          <p>
            <strong>Verfahren</strong> (kumuliert, kann sich überschneiden):
            „Eingeladen“ = Einladung versendet, „Eingewilligt“ = Einwilligung
            erteilt. „Annahme“ = eingewilligt / eingeladen.
          </p>
          <p>
            <strong>Ergebnis</strong>: Aufschlüsselung der regulär abgeschlossenen
            Verfahren nach erfasstem Abschluss-Ergebnis.
          </p>
          {data && (
            <p className="pt-1">
              Erstellt am{" "}
              {new Date(data.generiertAm).toLocaleString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              Uhr · Zeitraum: {jahr || "alle Jahre"} · von {user.firstName}{" "}
              {user.lastName}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: "blau" | "gruen" | "rot";
}) {
  const color =
    accent === "gruen"
      ? "text-credo-gruen"
      : accent === "rot"
        ? "text-credo-rot"
        : accent === "blau"
          ? "text-credo-blau"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground/70">{hint}</div>}
    </div>
  );
}
