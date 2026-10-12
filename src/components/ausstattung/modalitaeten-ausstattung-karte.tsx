/**
 * Reiter „Vorgesetzter“ der Onboarding-Detailseite: die fünfte Karte
 * „Ausstattung & Zugänge“ (Paket A2, Feinplan S10).
 *
 * Zeigt HR, was die Führungskraft im Formular gewählt hat — je Stelle die
 * Positionen, gewählten Optionen und Angaben, die Bemerkungen mit ihrer
 * Herkunft und „Weitere Hinweise an …“. Nur lesend: Bearbeitet wird in der
 * Karte im Reiter Checkliste, auf die der Verweis „Bearbeiten im Reiter
 * Checkliste“ führt (nur im Zustand BEARBEITBAR).
 *
 * Die Karte rechnet nichts selbst: Gruppen, Beschriftungen, Zustand und
 * Sätze kommen fertig aus `ausstattungsUebersichtBauen`
 * (src/lib/ausstattung.ts) über GET /api/onboarding/[id] (Feld `ausstattung`,
 * nur für HR_EDIT_ROLES — sonst `null`, dann zeichnet die Karte nichts).
 *
 * Optik der übrigen Karten des Reiters, nur mit Farb-Tokens (neue Datei,
 * Stand 0 in der Sperrklinke).
 */

import {
  AUSSTATTUNG_KATEGORIE,
  namenAufzaehlen,
  type AusstattungsGruppe,
  type AusstattungsUebersicht,
  type AusstattungsZeile,
} from "@/lib/ausstattung";

export const KARTE_TEXTE = {
  verweis: "Bearbeiten im Reiter Checkliste",
  gestrichen: "gestrichen",
  nichtMehrImKatalog: "nicht mehr im Katalog",
  adresseFehlt: "Für diese Stelle ist am Arbeitsort keine aktive Adresse hinterlegt.",
  gesehen: "zur Kenntnis genommen",
} as const;

const TITEL_ID = "ausstattung-karte-titel";

function Zeile({ zeile }: { zeile: AusstattungsZeile }) {
  const kennzeichen: string[] = [];
  if (zeile.gestrichen) kennzeichen.push(KARTE_TEXTE.gestrichen);
  if (zeile.nichtMehrImKatalog) kennzeichen.push(KARTE_TEXTE.nichtMehrImKatalog);

  return (
    <li className="py-2" data-zeile={zeile.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className={zeile.gestrichen ? "text-sm text-muted-foreground line-through" : "text-sm font-medium text-foreground"}>
          {zeile.angabe ? zeile.angabe.label : zeile.bezeichnung}
        </span>
        {zeile.auswahl.length > 0 && (
          <span className="text-right text-sm text-foreground">{zeile.auswahl.join(", ")}</span>
        )}
        {zeile.angabe && <span className="text-right text-sm text-foreground">{zeile.angabe.wert}</span>}
      </div>
      {zeile.angabe && zeile.angabe.sichtbarFuer.length > 0 && (
        <p className="text-xs text-muted-foreground">sehen {namenAufzaehlen(zeile.angabe.sichtbarFuer)}</p>
      )}
      {zeile.bemerkung && (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">
          <span className="font-medium text-muted-foreground">{zeile.bemerkung.label}:</span> {zeile.bemerkung.text}
        </p>
      )}
      {(zeile.erfasst || kennzeichen.length > 0) && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[zeile.erfasst, ...kennzeichen].filter(Boolean).join(" · ")}
        </p>
      )}
    </li>
  );
}

function Gruppe({ gruppe }: { gruppe: AusstattungsGruppe }) {
  return (
    <section className="py-3 first:pt-0 last:pb-0" data-stelle={gruppe.departmentKey} aria-label={gruppe.stelleName}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{gruppe.stelleName}</h4>
      {gruppe.adresseFehlt && <p className="mt-1 text-xs text-destructive">{KARTE_TEXTE.adresseFehlt}</p>}
      {gruppe.zeilen.length > 0 && (
        <ul className="divide-y divide-border">
          {gruppe.zeilen.map((zeile) => (
            <Zeile key={zeile.id} zeile={zeile} />
          ))}
        </ul>
      )}
      {gruppe.hinweis && (
        <div className="mt-2 rounded-lg border border-border bg-muted/50 px-3 py-2" data-hinweis={gruppe.departmentKey}>
          <p className="text-xs font-medium text-muted-foreground">
            {gruppe.hinweis.quelleLabel}
            {gruppe.hinweis.gesehen ? ` · ${KARTE_TEXTE.gesehen}` : ""}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{gruppe.hinweis.text}</p>
        </div>
      )}
    </section>
  );
}

export function ModalitaetenAusstattungKarte({
  uebersicht,
  onZurCheckliste,
}: {
  /** Aus GET /api/onboarding/[id]; `null`/fehlend (keine HR-Rolle) = keine Karte. */
  uebersicht: AusstattungsUebersicht | null | undefined;
  /** Wechselt in den Reiter Checkliste; ohne ihn kein Verweis. */
  onZurCheckliste?: () => void;
}) {
  if (!uebersicht) return null;
  const verweis = uebersicht.zustand === "BEARBEITBAR" && onZurCheckliste;

  return (
    <section
      className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
      aria-labelledby={TITEL_ID}
      data-karte="ausstattung"
      data-zustand={uebersicht.zustand}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 id={TITEL_ID} className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="h-1 w-1 rounded-full bg-credo-gruen" aria-hidden="true" />
          {AUSSTATTUNG_KATEGORIE}
        </h3>
        {verweis && (
          <button
            type="button"
            onClick={onZurCheckliste}
            className="text-xs font-medium text-foreground underline hover:no-underline"
          >
            {KARTE_TEXTE.verweis}
          </button>
        )}
      </div>
      {uebersicht.satz && <p className="mb-3 text-sm text-muted-foreground">{uebersicht.satz}</p>}
      {uebersicht.einleitung && <p className="mb-3 text-xs text-muted-foreground">{uebersicht.einleitung}</p>}
      {uebersicht.gruppen.length > 0 ? (
        <div className="divide-y divide-border">
          {uebersicht.gruppen.map((gruppe) => (
            <Gruppe key={gruppe.departmentKey} gruppe={gruppe} />
          ))}
        </div>
      ) : (
        uebersicht.leer && <p className="text-sm text-muted-foreground">{uebersicht.leer}</p>
      )}
    </section>
  );
}
