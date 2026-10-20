/**
 * Personalstamm aus DokuBit (Self-Service, Paket S0): Hinweiszeile und Block
 * „Zu prüfen" der Ansicht „Personen" (src/app/(portal)/personen/).
 *
 * Rechnet nichts: Gruppen, Zahlen und die Farbe des Hinweises liefert
 * GET /api/personalstamm/pruefen (src/lib/personalstamm/pruefen.ts). Hier
 * stehen nur die Saetze dazu.
 */

import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { formatZeitpunktDE } from "@/lib/format";
import { WAECHTER_STUNDEN } from "@/lib/zeitplaner/katalog";
import type { PersonalstammPruefung } from "@/lib/personalstamm/pruefen";

/**
 * "742|AK|MANR" lesbar. Ein Formatfehler ohne lesbaren Schluessel steht als
 * "zeile:<index>" (ab 0) und ist nur mit dem Zeitpunkt seines Laufs zu
 * verorten, der rechts daneben steht. "person": Der Aktiv-Status einer Person
 * liess sich am Ende des Stapels nicht schreiben (ohne Kennung im Protokoll).
 */
function schluesselText(schluessel: string): string {
  if (schluessel === "person") return "Aktiv-Status einer Person am Ende des Stapels";
  if (schluessel.startsWith("zeile:")) {
    return `Zeile ${Number(schluessel.slice("zeile:".length)) + 1} im Stapel, ohne lesbaren Schlüssel`;
  }
  const teile = schluessel.split("|");
  if (teile.length !== 3) return schluessel;
  return `Mandant ${teile[0]} · Abrechnungskreis ${teile[1]} · MANR ${teile[2]}`;
}

function anzahlText(anzahl: number): string {
  return anzahl > 1 ? ` · ${anzahl}×` : "";
}

export function Hinweiszeile({ pruefung }: { pruefung: PersonalstammPruefung }) {
  const rot = pruefung.nichtGeliefert.anzahl;
  const uebrige = pruefung.meldungen.length + pruefung.abgewieseneAnmeldungen.length;

  return (
    <div className="mb-4 space-y-2">
      {pruefung.hinweis === "rot" && (
        <p
          role="alert"
          data-hinweis="rot"
          className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot"
        >
          {rot === 1 ? "1 aktive Person wurde" : `${rot} aktive Personen wurden`} seit mehr als{" "}
          {WAECHTER_STUNDEN} Stunden nicht aus DokuBit geliefert. Läuft der Abgleich?
        </p>
      )}
      {pruefung.hinweis === "gelb" && (
        <p
          role="status"
          data-hinweis="gelb"
          className="rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-4 py-2 text-sm text-foreground"
        >
          {uebrige === 1 ? "1 Eintrag" : `${uebrige} Einträge`} zu prüfen.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {pruefung.letzterLauf
          ? `Letzter Abgleich: ${formatZeitpunktDE(pruefung.letzterLauf)}`
          : "Noch kein Abgleich gelaufen."}
      </p>
    </div>
  );
}

function Gruppe({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titel}</h3>
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border">{children}</ul>
    </div>
  );
}

function Zeile({ links, rechts }: { links: ReactNode; rechts: string }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-sm">
      <span className="text-foreground">{links}</span>
      <span className="text-xs text-muted-foreground">{rechts}</span>
    </li>
  );
}

export function ZuPruefen({ pruefung }: { pruefung: PersonalstammPruefung }) {
  const { nichtGeliefert, meldungen, abgewieseneAnmeldungen } = pruefung;
  const nichts = nichtGeliefert.anzahl === 0 && meldungen.length === 0 && abgewieseneAnmeldungen.length === 0;

  if (nichts) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleCheck className="h-4 w-4" aria-hidden="true" />
        Nichts zu prüfen.
      </p>
    );
  }

  const weitere = nichtGeliefert.anzahl - nichtGeliefert.personen.length;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Behoben wird in DokuBit — der nächste Abgleich räumt den Eintrag von selbst ab.
      </p>

      {nichtGeliefert.anzahl > 0 && (
        <Gruppe titel={`Seit mehr als ${WAECHTER_STUNDEN} Stunden nicht geliefert (${nichtGeliefert.anzahl})`}>
          {nichtGeliefert.personen.map((p) => (
            <Zeile
              key={p.id}
              links={p.name}
              rechts={p.lastSyncAt ? `zuletzt geliefert ${formatZeitpunktDE(p.lastSyncAt)}` : "nie geliefert"}
            />
          ))}
          {weitere > 0 && <Zeile links={`… und ${weitere} weitere`} rechts="" />}
        </Gruppe>
      )}

      {meldungen.length > 0 && (
        <Gruppe titel={`Meldungen aus dem Abgleich (${meldungen.length})`}>
          {meldungen.map((m) => (
            <Zeile
              key={`${m.schluessel}|${m.code}|${m.zuletzt}`}
              links={
                <>
                  <span className="font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{schluesselText(m.schluessel)}</span>
                </>
              }
              rechts={`zuletzt ${formatZeitpunktDE(m.zuletzt)}${anzahlText(m.anzahl)}`}
            />
          ))}
        </Gruppe>
      )}

      {abgewieseneAnmeldungen.length > 0 && (
        <Gruppe titel={`Abgewiesene Anmeldungen (${abgewieseneAnmeldungen.length})`}>
          {abgewieseneAnmeldungen.map((a) => (
            <Zeile
              key={a.email ?? "ohne-adresse"}
              links={a.email ?? "ohne Adresse"}
              rechts={`zuletzt ${formatZeitpunktDE(a.zuletzt)}${anzahlText(a.anzahl)}`}
            />
          ))}
        </Gruppe>
      )}
    </>
  );
}
