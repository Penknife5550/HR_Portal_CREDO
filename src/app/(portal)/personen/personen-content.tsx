"use client";

/**
 * Personen – Client Component (Self-Service, Paket S0)
 *
 * Leseansicht des Personalstamms aus DokuBit. Von oben nach unten:
 *   - Hinweiszeile: rot, solange aktive DokuBit-Personen seit mehr als
 *     WAECHTER_STUNDEN nicht geliefert wurden; sonst gelb mit der Zahl der
 *     uebrigen Eintraege; darunter neutral der letzte Abgleich.
 *   - Block „Zu prüfen" aus GET /api/personalstamm/pruefen (drei Gruppen).
 *   Beide in src/components/personen/zu-pruefen.tsx.
 *   - Liste aus GET /api/personalstamm/personen (schlanke Leseform): Suche
 *     ueber Name, Adresse und MANR, Filter aktiv/inaktiv/alle, Blaettern. Je
 *     Anstellung der Vertragsschluessel, damit sich eine Meldung aus „Zu
 *     prüfen" zuordnen laesst; laufende Vertraege zuerst, beendete und
 *     Bestandsanstellungen ohne Schluessel gedaempft.
 *
 * Bewusst KEINE Bearbeitung und KEINE Zuordnung von Hand: Geaendert wird in
 * DokuBit, der naechste Abgleich uebernimmt es.
 */

import { useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
import { Hinweiszeile, ZuPruefen } from "@/components/personen/zu-pruefen";
import { IMPORT_QUELLE_MANUELL, PERSONALSTAMM_QUELLE } from "@/lib/constants";
import { formatDatumDE, formatZeitpunktDE } from "@/lib/format";
import { ablaufKalendertag, heuteInBerlin } from "@/lib/kalendertag";
import type { PersonalstammPruefung } from "@/lib/personalstamm/pruefen";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

/** Eine Anstellung, wie GET /api/personalstamm/personen sie liefert. */
interface Anstellung {
  id: string;
  isActive: boolean;
  endDate: string | null;
  mandantNumber: string | null;
  abrechnungskreis: string | null;
  personalNumber: string | null;
  organization: { name: string };
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  isActive: boolean;
  importSource: string | null;
  lastSyncAt: string | null;
  employments: Anstellung[];
}

type Filter = "aktiv" | "inaktiv" | "alle";

/** Wert des Parameters `isActive` der Route je Filter. */
const FILTER_PARAM: Record<Filter, string> = { aktiv: "true", inaktiv: "false", alle: "all" };
const FILTER_LABEL: Record<Filter, string> = { aktiv: "Aktiv", inaktiv: "Inaktiv", alle: "Alle" };

const SEITENGROESSE = 25;

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const PILLE = "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium";

// =============================================
// Anzeige-Helfer
// =============================================

function quelleLabel(quelle: string | null): string {
  if (!quelle) return "Bestand";
  if (quelle === PERSONALSTAMM_QUELLE) return "DokuBit";
  if (quelle === IMPORT_QUELLE_MANUELL) return "Von Hand";
  return quelle;
}

/**
 * „Mandantenname · läuft / läuft bis TT.MM.JJJJ / beendet am TT.MM.JJJJ".
 * Das Vertragsende ist der letzte Arbeitstag: An ihm laeuft der Vertrag noch.
 * Ohne Datum entscheidet der Aktiv-Stand der Anstellung.
 */
function anstellungText(a: Anstellung, heute: string): string {
  const mandant = a.organization.name;
  const ende = ablaufKalendertag(a.endDate);
  if (ende) {
    return ende >= heute
      ? `${mandant} · läuft bis ${formatDatumDE(ende)}`
      : `${mandant} · beendet am ${formatDatumDE(ende)}`;
  }
  return a.isActive ? `${mandant} · läuft` : `${mandant} · beendet`;
}

/** Laeuft die Anstellung heute? Dieselbe Regel wie `anstellungText`. */
function laeuftHeute(a: Anstellung, heute: string): boolean {
  const ende = ablaufKalendertag(a.endDate);
  return ende ? ende >= heute : a.isActive;
}

/** Vom Abgleich verwaltet = Vertragsschluessel gesetzt. */
function istVerwaltet(a: Anstellung): boolean {
  return a.abrechnungskreis !== null && a.personalNumber !== null;
}

/**
 * Reihenfolge in der Zelle: laufende vor beendeten; bei einer DokuBit-Person
 * die Bestandsanstellungen ohne Schluessel ganz unten, denn sie zaehlen nicht
 * fuer den Status. Die Route liefert je Gruppe schon nach Beginn absteigend.
 */
function anstellungenSortiert(p: Person, heute: string): Anstellung[] {
  const dokubit = p.importSource === PERSONALSTAMM_QUELLE;
  const rang = (a: Anstellung) => (dokubit && !istVerwaltet(a) ? 2 : 0) + (laeuftHeute(a, heute) ? 0 : 1);
  return [...p.employments].sort((a, b) => rang(a) - rang(b));
}

function AnstellungZeile({ a, dokubit, heute }: { a: Anstellung; dokubit: boolean; heute: string }) {
  const bestand = dokubit && !istVerwaltet(a);
  const zaehlt = laeuftHeute(a, heute) && !bestand;
  return (
    <li className={zaehlt ? "text-foreground" : "text-muted-foreground"}>
      {anstellungText(a, heute)}
      {istVerwaltet(a) ? (
        <span className="block text-xs text-muted-foreground">
          {a.mandantNumber} · AK {a.abrechnungskreis} · MANR {a.personalNumber}
        </span>
      ) : (
        bestand && <span className="block text-xs">Bestand, zählt nicht für den Status</span>
      )}
    </li>
  );
}

// =============================================
// Seite
// =============================================

export function PersonenContent({ user }: { user: User }) {
  // „Zu prüfen"
  const [pruefung, setPruefung] = useState<PersonalstammPruefung | null>(null);
  const [pruefungFehler, setPruefungFehler] = useState("");

  // Liste
  const [personen, setPersonen] = useState<Person[]>([]);
  const [gesamt, setGesamt] = useState(0);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState("");
  const [suche, setSuche] = useState("");
  const [suchbegriff, setSuchbegriff] = useState("");
  const [filter, setFilter] = useState<Filter>("aktiv");
  const [seite, setSeite] = useState(1);
  const [bestandLeer, setBestandLeer] = useState(false);
  const [neuLaden, setNeuLaden] = useState(0);

  useEffect(() => {
    let aktiv = true;
    fetch("/api/personalstamm/pruefen")
      .then((r) => {
        if (!r.ok) throw new Error("Pruefung nicht geladen");
        return r.json();
      })
      .then((j) => {
        if (aktiv) setPruefung(j.data);
      })
      .catch(() => {
        if (aktiv) setPruefungFehler("Die Hinweise zum Abgleich konnten nicht geladen werden.");
      });
    return () => {
      aktiv = false;
    };
  }, []);

  // Suche erst nach einer kurzen Tipp-Pause abschicken
  useEffect(() => {
    const t = setTimeout(() => {
      setSuchbegriff(suche.trim());
      setSeite(1);
    }, 300);
    return () => clearTimeout(t);
  }, [suche]);

  useEffect(() => {
    // Nur die Antwort der juengsten Anfrage zaehlt (schnelles Tippen, Filterwechsel)
    let aktiv = true;
    setLaden(true);
    setFehler("");
    const params = new URLSearchParams({
      page: String(seite),
      limit: String(SEITENGROESSE),
      isActive: FILTER_PARAM[filter],
    });
    if (suchbegriff) params.set("search", suchbegriff);

    fetch(`/api/personalstamm/personen?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("Liste nicht geladen");
        return r.json();
      })
      .then((j) => {
        if (!aktiv) return;
        setPersonen(j.data || []);
        setGesamt(j.total || 0);
        setBestandLeer(j.bestandLeer === true);
      })
      .catch(() => {
        if (aktiv) setFehler("Die Personen konnten nicht geladen werden.");
      })
      .finally(() => {
        if (aktiv) setLaden(false);
      });
    return () => {
      aktiv = false;
    };
  }, [suchbegriff, filter, seite, neuLaden]);

  const seiten = Math.max(1, Math.ceil(gesamt / SEITENGROESSE));
  const heute = heuteInBerlin();

  return (
    <div className="min-h-screen bg-background">

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Kopf */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Personen</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Personen und Anstellungen kommen täglich aus DokuBit. Geändert wird nur dort — das Portal
            übernimmt es mit dem nächsten Abgleich.
          </p>
        </div>

        {/* Hinweiszeile */}
        {pruefungFehler && (
          <p role="alert" className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
            {pruefungFehler}
          </p>
        )}
        {pruefung && <Hinweiszeile pruefung={pruefung} />}

        {/* Zu prüfen */}
        <section className="mb-6 rounded-lg border border-border bg-card p-4" aria-labelledby="zu-pruefen">
          <h3 id="zu-pruefen" className="mb-2 text-sm font-semibold text-foreground">
            Zu prüfen
          </h3>
          {pruefung ? (
            <ZuPruefen pruefung={pruefung} />
          ) : pruefungFehler ? (
            <p className="text-sm text-muted-foreground">Nicht verfügbar.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Lade Hinweise…</p>
          )}
        </section>

        {/* Suche und Filter */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Name, Adresse oder MANR suchen…"
              aria-label="Personen suchen"
              autoComplete="off"
              className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div role="group" aria-label="Status" className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => {
                  setFilter(f);
                  setSeite(1);
                }}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {fehler && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot"
          >
            <span>{fehler}</span>
            <button
              type="button"
              onClick={() => setNeuLaden((n) => n + 1)}
              className="rounded-lg border border-border bg-background px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Erneut laden
            </button>
          </div>
        )}

        {/* Laden und Trefferzahl — fuer Screenreader angesagt */}
        <p role="status" className="mb-2 min-h-5 text-sm text-muted-foreground">
          {laden
            ? "Lade Personen…"
            : !fehler && personen.length > 0
              ? `${gesamt} ${gesamt === 1 ? "Person" : "Personen"}`
              : ""}
        </p>

        {/* Liste — beim Nachladen bleiben die bisherigen Zeilen gedaempft stehen */}
        {fehler ? null : personen.length > 0 ? (
          <div
            aria-busy={laden}
            className={`overflow-hidden rounded-lg border border-border bg-card transition-opacity ${laden ? "opacity-60" : ""}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">Personen</caption>
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className={TH}>Name</th>
                    <th className={TH}>Dienstliche Adresse</th>
                    <th className={TH}>Anstellungen</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Quelle</th>
                    <th className={TH}>Zuletzt geliefert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {personen.map((p) => (
                    <tr key={p.id} className="align-top transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                        {p.lastName}, {p.firstName}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{p.email || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {p.employments.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {anstellungenSortiert(p, heute).map((a) => (
                              <AnstellungZeile
                                key={a.id}
                                a={a}
                                dokubit={p.importSource === PERSONALSTAMM_QUELLE}
                                heute={heute}
                              />
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`${PILLE} ${
                            p.isActive
                              ? "border-credo-gruen/50 bg-credo-gruen/10 text-foreground"
                              : "border-border bg-muted text-muted-foreground"
                          }`}
                        >
                          {p.isActive ? "aktiv" : "inaktiv"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                        {quelleLabel(p.importSource)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                        {formatZeitpunktDE(p.lastSyncAt) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : laden ? null : bestandLeer ? (
          <div className="flex flex-col items-center rounded-lg border border-border bg-card px-4 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">Noch keine Personen</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Der erste Abgleich aus DokuBit legt sie an.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            Keine Treffer für diese Suche oder diesen Filter.
          </div>
        )}

        {/* Blaettern — auch nach einem Fehler, damit man nicht zurueck auf Seite 1 muss */}
        {seiten > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Seite {seite} von {seiten}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSeite((s) => Math.max(1, s - 1))}
                disabled={laden || seite <= 1}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={() => setSeite((s) => Math.min(seiten, s + 1))}
                disabled={laden || seite >= seiten}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Weiter
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
