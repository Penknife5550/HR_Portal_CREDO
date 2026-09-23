"use client";

/**
 * Dialog „Abteilungen informieren" (Paket 5, beide Module)
 *
 * Zwischen dem Knopf und dem Versand: Wer bekommt eine E-Mail, mit welchen
 * Aufgaben, und was steht darin ueber die Person? Der Versand geht an externe
 * Postfaecher — er soll nicht der erste Moment sein, in dem HR das sieht.
 *
 * Die Vorschau rechnet der Dialog NICHT selbst: `zeile.vorschau` (offene
 * Aufgaben in Mail-Reihenfolge, Gueltigkeit des Links) kommt fertig vom Server
 * (`abteilungsZeilenBauen`), der Abschnitt „Was die Empfänger sehen" aus
 * `sichtbarkeitsHinweis(modul, …)` — derselben Tabelle, nach der Payload und
 * Link-Seite zugeschnitten werden. Zwei Texte ueber dieselbe Sache gehen
 * auseinander; einer nicht.
 *
 * Der Dialog ruft KEINE Schnittstelle. Er meldet „senden" an die Karte, die
 * die Aktion ausfuehrt und die Meldung anzeigt (`onAktion("informieren")`).
 */

import { useEffect, useRef } from "react";
import {
  sichtbarkeitsHinweis,
  type AbteilungsUebersichtDaten,
  type AbteilungsZeile,
} from "@/lib/abteilungsaufgaben";
import { formatDatumDE } from "@/lib/format";

/** Ab der wievielten Aufgabe je Empfaenger „…und n weitere" steht. */
const AUFGABEN_VORSCHAU_MAX = 3;

export interface AbteilungenDialogProps {
  abteilungen: AbteilungsUebersichtDaten;
  /** Laeuft der Versand gerade? Dann „Wird gesendet…" und beide Knoepfe gesperrt. */
  sendet?: boolean;
  onAbbrechen: () => void;
  /** Meldet „senden" an die Karte — der Dialog ruft selbst nichts auf. */
  onSenden: () => void;
}

/** Zeilen, die „Abteilungen informieren" jetzt anschreiben wuerde. */
export function informierbareZeilen(daten: AbteilungsUebersichtDaten): AbteilungsZeile[] {
  return daten.zeilen.filter((z) => z.informierbar);
}

/**
 * Zeilen mit offenen Aufgaben, die KEINEN Link bekommen und auch keinen haben —
 * sie gingen sonst still unter (keine Adresse, Abteilung deaktiviert, keine
 * Fuehrungskraft). Bereits informierte Zeilen stehen hier nicht: Sie sind kein
 * Versaeumnis, sondern erledigt.
 */
export function nichtInformierteZeilen(daten: AbteilungsUebersichtDaten): AbteilungsZeile[] {
  return daten.zeilen.filter((z) => !z.informierbar && !z.link && z.aufgaben.offen > 0);
}

/**
 * Ein Datum fuer die Einleitung: Alle neuen Links laufen gleich lange, ein
 * verlaengerter Bestandslink kann laenger gelten. Sind die Werte verschieden,
 * nennt der Text das FRUEHESTE als Untergrenze — nie ein Datum, das fuer einen
 * Teil der Empfaenger zu spaet waere.
 */
export function gueltigkeitsText(zeilen: ReadonlyArray<AbteilungsZeile>): string {
  const roh = zeilen.map((z) => z.vorschau?.gueltigBis).filter((w): w is string => !!w);
  const formatiert = roh.map((w) => formatDatumDE(w)).filter(Boolean);
  if (formatiert.length === 0) return "";
  if (new Set(formatiert).size === 1) return `gültig bis ${formatiert[0]}`;
  const frueheste = roh
    .map((w) => new Date(w))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return `mindestens gültig bis ${formatDatumDE(frueheste)}`;
}

export function AbteilungenDialog({
  abteilungen,
  sendet = false,
  onAbbrechen,
  onSenden,
}: AbteilungenDialogProps) {
  const abbrechenRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    abbrechenRef.current?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAbbrechen();
    };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [onAbbrechen]);

  const empfaenger = informierbareZeilen(abteilungen);
  const uebersprungen = nichtInformierteZeilen(abteilungen);
  const sicht = sichtbarkeitsHinweis(abteilungen.modul, empfaenger);
  const gueltigkeit = gueltigkeitsText(empfaenger);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="abteilungen-dialog-titel"
      data-dialog="abteilungen-informieren"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-card shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 id="abteilungen-dialog-titel" className="text-base font-bold text-foreground">
            Abteilungen informieren
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Folgende Stellen erhalten eine E-Mail mit einem Link zu ihren Aufgaben. Der Link
            funktioniert ohne Anmeldung und ist {gueltigkeit || "zeitlich begrenzt gültig"}.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* ---- Empfaenger mit ihren Aufgaben ---- */}
          {empfaenger.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Es gibt keine Abteilung, die jetzt informiert werden kann.
            </p>
          ) : (
            <ul className="space-y-3">
              {empfaenger.map((zeile) => (
                <EmpfaengerBlock key={zeile.departmentKey} zeile={zeile} />
              ))}
            </ul>
          )}

          {/* ---- Was die Empfaenger sehen ---- */}
          <section
            className="rounded-lg border border-border bg-muted/40 px-3 py-2.5"
            aria-labelledby="abteilungen-dialog-sichtbarkeit"
            data-block="sichtbarkeit"
          >
            <h3
              id="abteilungen-dialog-sichtbarkeit"
              className="text-xs font-semibold text-foreground"
            >
              Was die Empfänger sehen
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{sicht.alle}</p>
            {sicht.zusaetzlich.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {sicht.zusaetzlich.map((e) => (
                  <li key={e.departmentKey} className="text-xs text-muted-foreground">
                    {e.departmentName} zusätzlich: {e.felder.join(", ")}
                  </li>
                ))}
              </ul>
            )}
            {sicht.hinweis && <p className="mt-1.5 text-xs text-muted-foreground">{sicht.hinweis}</p>}
          </section>

          {/* ---- Nicht informiert werden ---- */}
          {uebersprungen.length > 0 && (
            <section
              className="rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2.5"
              aria-labelledby="abteilungen-dialog-uebersprungen"
              data-block="nicht-informiert"
            >
              <h3
                id="abteilungen-dialog-uebersprungen"
                className="text-xs font-semibold text-amber-900"
              >
                Nicht informiert werden
              </h3>
              <ul className="mt-1 space-y-0.5">
                {uebersprungen.map((z) => (
                  <li key={z.departmentKey} className="text-xs text-amber-900">
                    {z.departmentName} – {z.anzeige.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <button
            ref={abbrechenRef}
            type="button"
            onClick={onAbbrechen}
            disabled={sendet}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onSenden}
            disabled={sendet || empfaenger.length === 0}
            className="rounded-lg bg-credo-gruen px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
          >
            {sendet
              ? "Wird gesendet…"
              : `${empfaenger.length} ${empfaenger.length === 1 ? "E-Mail" : "E-Mails"} senden`}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================
// Ein Empfaengerblock
// =============================================

function EmpfaengerBlock({ zeile }: { zeile: AbteilungsZeile }) {
  const aufgaben = zeile.vorschau?.aufgaben ?? [];
  const sichtbar = aufgaben.slice(0, AUFGABEN_VORSCHAU_MAX);
  const weitere = aufgaben.length - sichtbar.length;
  const adresse = zeile.empfaenger.email ?? zeile.email ?? "";

  return (
    <li
      className="rounded-lg border border-border bg-muted/30 px-3 py-2.5"
      data-empfaenger={zeile.departmentKey}
    >
      <p className="break-words text-sm font-semibold text-foreground">
        {zeile.departmentName}
        {adresse ? ` – ${adresse}` : ""}
      </p>
      {sichtbar.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {zeile.aufgaben.offen} {zeile.aufgaben.offen === 1 ? "offene Aufgabe" : "offene Aufgaben"}
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {sichtbar.map((a) => (
            <li key={a.id} className="break-words text-xs text-muted-foreground">
              • {a.title}
              {a.dueDate ? ` – fällig ${formatDatumDE(a.dueDate)}` : ""}
            </li>
          ))}
          {weitere > 0 && (
            <li className="text-xs text-muted-foreground">…und {weitere} weitere</li>
          )}
        </ul>
      )}
    </li>
  );
}
