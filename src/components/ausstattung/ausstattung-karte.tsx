"use client";

/**
 * Reiter Checkliste der Onboarding-Detailseite: die Karte „Ausstattung &
 * Zugänge“ (Paket A3, Feinplan S16, Mockup 6.3).
 *
 * Zeigt HR je Stelle, was die Fuehrungskraft angefordert und die
 * Personalabteilung ergaenzt hat — jede Position mit ihrer Aufgabe, eine
 * Auswahl je Option eine Zeile mit eigenem Stand (offen · fällig, erledigt,
 * entfällt), „Eilt“, die Vorlauf-Warnung (Regel 14), „ergänzt von HR (…)“,
 * „nicht mehr im Katalog“, Angaben und die „Weiteren Hinweise an …“ samt Stand
 * ihrer Aufgabe. Im Zustand BEARBEITBAR — unabhaengig vom Merker
 * `mitAusstattung` (Feinplan 1.6) — dazu die Aktionen: „Position
 * hinzufügen…“, „Hinweis an eine Stelle…“, je Zeile „Bearbeiten…“ und
 * „Streichen…“, je Hinweis „Als Position übernehmen…“, „Bearbeiten…“ und
 * „Zur Kenntnis genommen“. ENTWURF und NUR_LESEN zeigen nur, mit dem Satz der
 * Zustandsregel.
 *
 * Die Karte rechnet NICHTS selbst: Zustand, Saetze, Gruppen, Aufgabenstand,
 * erlaubte Aktionen samt Sperrgrund, Optionen und Stellen kommen fertig aus
 * `ausstattungsUebersichtBauen` (src/lib/ausstattung.ts) — ueber
 * GET /api/onboarding/[id] (Feld `ausstattung`, nur HR_EDIT_ROLES, sonst
 * `null`: dann keine Karte). Die Dialoge (ausstattung-dialoge.tsx) pruefen vor
 * dem Senden mit denselben Regeln wie der Server; was dieser trotzdem
 * abweist (gleichzeitige Aenderung, 409), steht als Fehler im offenen Dialog.
 *
 * Bemerkungen, Angaben und Hinweistexte zeigt die Karte nur mit
 * Bearbeitungsrecht (Regel 16) — doppelt gesichert: Die Rolle und
 * `uebersicht.darfBearbeiten` muessen beide stimmen.
 *
 * Die Aktion selbst fuehrt die Seite aus (`onAktion`: senden, dann den
 * Vorgang neu laden — die Checkliste aendert sich mit). `ausstattungAktionSenden`
 * ist der Aufruf der Route dafuer.
 *
 * Optik der uebrigen Karten des Reiters, nur Farb-Tokens und lucide-react
 * (neue Datei, Stand 0 in der Sperrklinke); Rueckfragen ueber
 * `unterlagen/dialog-rahmen.tsx`.
 */

import { useId, useRef, useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { EiltKennzeichen } from "@/components/ausstattung/link-seite-teile";
import {
  BearbeitenDialog,
  HinweisDialog,
  HinweisEntfernenDialog,
  HinzufuegenDialog,
  StreichenDialog,
  type AusstattungAktionBody,
} from "@/components/ausstattung/ausstattung-dialoge";
import {
  AUSSTATTUNG_KATEGORIE,
  aufgabenStandText,
  namenAufzaehlen,
  optionsZeilen,
  type AufgabenStatus,
  type AusstattungsGruppe,
  type AusstattungsHinweis,
  type AusstattungsUebersicht,
  type AusstattungsZeile,
} from "@/lib/ausstattung";

export const AUSSTATTUNG_KARTE_TEXTE = {
  erklaerung:
    "Jede Position ist eine Aufgabe der zuständigen Stelle, bei Schlüsseln und Zugängen jede gewählte Option.",
  hinzufuegen: "Position hinzufügen…",
  hinweisNeu: "Hinweis an eine Stelle…",
  bearbeiten: "Bearbeiten…",
  streichen: "Streichen…",
  uebernehmen: "Als Position übernehmen…",
  gesehen: "Zur Kenntnis genommen",
  gesehenVermerk: "zur Kenntnis genommen",
  gestrichen: "gestrichen – entfällt für die Stelle",
  nichtMehrImKatalog: "nicht mehr im Katalog",
  adresseFehlt: "Für diese Stelle ist am Arbeitsort keine aktive Adresse hinterlegt.",
  nurHr: "Inhalt nur für die Personalabteilung sichtbar.",
  gespeichert: "Gespeichert.",
  fehler: "Die Änderung konnte nicht gespeichert werden.",
  verbindungsfehler: "Verbindungsfehler. Bitte erneut versuchen.",
} as const;

/** Ersatzziel des Fokus, wenn der Ausloeser eines Dialogs verschwunden ist (etwa nach dem Streichen). */
export const AUSSTATTUNG_KARTE_TITEL_ID = "ausstattung-checkliste-titel";

const KNOPF_NEBEN =
  "rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50";
const KNOPF_ZEILE =
  "rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
const KNOPF_ZEILE_KRITISCH =
  "rounded-md border border-credo-rot/40 px-2.5 py-1 text-xs text-credo-rot hover:bg-credo-rot/10 disabled:cursor-not-allowed disabled:opacity-50";

const STAND_KLASSE: Readonly<Record<AufgabenStatus, string>> = {
  offen: "border-credo-gelb/50 bg-credo-gelb/10 text-foreground",
  erledigt: "border-credo-gruen/40 bg-credo-gruen/10 text-foreground",
  entfaellt: "border-border bg-muted text-muted-foreground",
};

// =============================================
// Aufruf der Route
// =============================================

/** Ausgang einer Aktion: `meldung` ist der Text des Servers (Erfolg oder Fehler). */
export interface AusstattungAktionsAusgang {
  ok: boolean;
  /** HTTP-Status; `null` bei einem Netzfehler (dann hat der Server nichts getan). */
  status: number | null;
  meldung: string;
}

/**
 * POST /api/onboarding/[id]/ausstattung mit dem Body eines Dialogs. Der Server
 * liefert bei Erfolg `meldung`, sonst `error` — beides wird 1:1 angezeigt,
 * nie ein erfundener Ersatztext, solange er einen liefert.
 */
export async function ausstattungAktionSenden(
  onboardingId: string,
  body: AusstattungAktionBody,
): Promise<AusstattungAktionsAusgang> {
  let res: Response;
  try {
    res = await fetch(`/api/onboarding/${encodeURIComponent(onboardingId)}/ausstattung`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: null, meldung: AUSSTATTUNG_KARTE_TEXTE.verbindungsfehler };
  }
  const daten = (await res.json().catch(() => null)) as { meldung?: unknown; error?: unknown } | null;
  const text = (wert: unknown) => (typeof wert === "string" && wert.trim() ? wert : null);
  if (res.ok) return { ok: true, status: res.status, meldung: text(daten?.meldung) ?? AUSSTATTUNG_KARTE_TEXTE.gespeichert };
  return { ok: false, status: res.status, meldung: text(daten?.error) ?? AUSSTATTUNG_KARTE_TEXTE.fehler };
}

// =============================================
// Bausteine
// =============================================

/** Stand einer Aufgabe als Pille („offen · fällig 27.01.2027“), dazu „Eilt“ an einer offenen. */
function StandPille({
  aufgabe,
}: {
  aufgabe: { status: AufgabenStatus; faelligAm: string | null; erledigtAm?: string | null; eilt: boolean };
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        data-stand={aufgabe.status}
        className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STAND_KLASSE[aufgabe.status]}`}
      >
        {aufgabenStandText(aufgabe)}
      </span>
      {aufgabe.eilt && aufgabe.status === "offen" && <EiltKennzeichen />}
    </span>
  );
}

/** Sichtbarer Text eines Knopfs, dahinter der Bezug nur fuer Screenreader („Bearbeiten… Dienst-iPad“). */
function MitBezug({ text, bezug }: { text: string; bezug: string }) {
  return (
    <>
      {text}
      <span className="sr-only">{` ${bezug}`}</span>
    </>
  );
}

interface ZeilenProps {
  zeile: AusstattungsZeile;
  gruppe: AusstattungsGruppe;
  zeigeTexte: boolean;
  bearbeitbar: boolean;
  sendet: boolean;
  onBearbeiten: () => void;
  onStreichen: () => void;
}

function Zeile({ zeile, gruppe, zeigeTexte, bearbeitbar, sendet, onBearbeiten, onStreichen }: ZeilenProps) {
  const sperrId = useId();
  const titel = zeile.art === "ANGABE" ? `Angabe: ${zeile.angabe?.label ?? zeile.bezeichnung}` : zeile.bezeichnung;
  const einzel = zeile.art === "AUSWAHL" ? null : (zeile.aufgaben.find((a) => a.option === "") ?? null);
  const optionen = optionsZeilen(zeile);
  const meta = [
    zeile.erfasst,
    zeile.gestrichen ? AUSSTATTUNG_KARTE_TEXTE.gestrichen : null,
    zeile.nichtMehrImKatalog ? AUSSTATTUNG_KARTE_TEXTE.nichtMehrImKatalog : null,
  ].filter(Boolean);
  const mitAktionen = bearbeitbar && !zeile.gestrichen;
  const sperrGrund = mitAktionen && (!zeile.aktionen.aendern || !zeile.aktionen.streichen) ? zeile.aktionen.sperrGrund : null;

  return (
    <li className="py-2.5" data-zeile={zeile.id}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className={zeile.gestrichen ? "text-sm text-muted-foreground line-through" : "text-sm font-semibold text-foreground"}>
            {titel}
          </p>
          {zeile.art === "ANGABE" && (
            <p className="text-xs text-muted-foreground" data-angabe>
              {[
                zeigeTexte ? (zeile.angabe?.wert ?? "—") : AUSSTATTUNG_KARTE_TEXTE.nurHr,
                zeile.angabe && zeile.angabe.sichtbarFuer.length > 0 ? `sehen ${namenAufzaehlen(zeile.angabe.sichtbarFuer)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {zeigeTexte && zeile.bemerkung && (
            <div className="mt-1.5 rounded-md border-l-2 border-primary bg-muted px-3 py-1.5" data-bemerkung>
              <p className="text-xs font-semibold text-foreground">{zeile.bemerkung.label}</p>
              <p className="whitespace-pre-wrap break-words text-xs text-foreground">{zeile.bemerkung.text}</p>
            </div>
          )}
          {meta.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{meta.join(" · ")}</p>}
          {zeile.vorlaufWarnung && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-foreground" data-warnung="vorlauf">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-credo-rot" aria-hidden="true" />
              <span>{zeile.vorlaufWarnung}</span>
            </p>
          )}
          {sperrGrund && (
            <p id={sperrId} className="mt-1 text-xs text-muted-foreground" data-sperrgrund>
              {sperrGrund}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {einzel && <StandPille aufgabe={einzel} />}
          {mitAktionen && (
            <>
              <button
                type="button"
                className={KNOPF_ZEILE}
                disabled={sendet || !zeile.aktionen.aendern}
                aria-describedby={sperrGrund && !zeile.aktionen.aendern ? sperrId : undefined}
                onClick={onBearbeiten}
              >
                <MitBezug text={AUSSTATTUNG_KARTE_TEXTE.bearbeiten} bezug={titel} />
              </button>
              <button
                type="button"
                className={KNOPF_ZEILE_KRITISCH}
                disabled={sendet || !zeile.aktionen.streichen}
                aria-describedby={sperrGrund && !zeile.aktionen.streichen ? sperrId : undefined}
                onClick={onStreichen}
              >
                <MitBezug text={AUSSTATTUNG_KARTE_TEXTE.streichen} bezug={titel} />
              </button>
            </>
          )}
        </div>
      </div>
      {optionen.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-border pl-3" aria-label={`Optionen ${zeile.bezeichnung} (${gruppe.stelleName})`}>
          {optionen.map((o) => (
            <li key={o.option} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-option={o.option}>
              <span className={o.aufgabe?.status === "entfaellt" ? "text-muted-foreground line-through" : "text-foreground"}>
                {o.option}
              </span>
              {o.aufgabe && <StandPille aufgabe={o.aufgabe} />}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function HinweisBlock({
  gruppe,
  hinweis,
  zeigeTexte,
  bearbeitbar,
  sendet,
  onUebernehmen,
  onBearbeiten,
  onGesehen,
}: {
  gruppe: AusstattungsGruppe;
  hinweis: AusstattungsHinweis;
  zeigeTexte: boolean;
  bearbeitbar: boolean;
  sendet: boolean;
  onUebernehmen: () => void;
  onBearbeiten: () => void;
  onGesehen: () => void;
}) {
  const sperrId = useId();
  const bezug = `Hinweis an ${gruppe.stelleName}`;
  const sperrGrund = bearbeitbar && !hinweis.aktionen.aendern ? hinweis.aktionen.sperrGrund : null;
  return (
    <div className="mt-2 rounded-lg border border-border bg-muted px-3 py-2" data-hinweis={gruppe.departmentKey}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {hinweis.quelleLabel}
          {hinweis.gesehen ? ` · ${AUSSTATTUNG_KARTE_TEXTE.gesehenVermerk}` : ""}
        </p>
        {hinweis.status && (
          <StandPille aufgabe={{ status: hinweis.status, faelligAm: hinweis.faelligAm, erledigtAm: null, eilt: hinweis.eilt }} />
        )}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
        {zeigeTexte ? hinweis.text : AUSSTATTUNG_KARTE_TEXTE.nurHr}
      </p>
      {sperrGrund && (
        <p id={sperrId} className="mt-1 text-xs text-muted-foreground" data-sperrgrund>
          {sperrGrund}
        </p>
      )}
      {bearbeitbar && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={KNOPF_ZEILE} disabled={sendet} onClick={onUebernehmen}>
            <MitBezug text={AUSSTATTUNG_KARTE_TEXTE.uebernehmen} bezug={bezug} />
          </button>
          <button
            type="button"
            className={KNOPF_ZEILE}
            disabled={sendet || !hinweis.aktionen.aendern}
            aria-describedby={sperrGrund ? sperrId : undefined}
            onClick={onBearbeiten}
          >
            <MitBezug text={AUSSTATTUNG_KARTE_TEXTE.bearbeiten} bezug={bezug} />
          </button>
          {!hinweis.gesehen && (
            <button type="button" className={KNOPF_ZEILE} disabled={sendet} onClick={onGesehen}>
              <MitBezug text={AUSSTATTUNG_KARTE_TEXTE.gesehen} bezug={bezug} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================
// Karte
// =============================================

/** Welcher Dialog offen ist — mit dem Stand beim Oeffnen (der Dialog bleibt stabil, waehrend die Seite neu laedt). */
type OffenerDialog =
  | { art: "hinzufuegen" }
  | { art: "uebernehmen"; gruppe: AusstattungsGruppe; hinweis: AusstattungsHinweis }
  | { art: "bearbeiten"; gruppe: AusstattungsGruppe; zeile: AusstattungsZeile }
  | { art: "streichen"; gruppe: AusstattungsGruppe; zeile: AusstattungsZeile }
  | { art: "hinweis"; gruppe: AusstattungsGruppe | null; hinweis: AusstattungsHinweis | null }
  | { art: "hinweis-entfernen"; gruppe: AusstattungsGruppe };

export interface AusstattungKarteProps {
  /** Aus GET /api/onboarding/[id]; `null`/fehlend (keine HR-Rolle) = keine Karte. */
  uebersicht: AusstattungsUebersicht | null | undefined;
  /** Rolle in HR_EDIT_ROLES. Ohne Recht: keine Aktion und keine Freitexte (Regel 16). */
  darfBearbeiten?: boolean;
  /** Fuehrt eine Aktion aus (senden, dann neu laden). Ohne sie bleibt die Karte lesend. */
  onAktion?: (body: AusstattungAktionBody) => Promise<AusstattungAktionsAusgang>;
}

export function AusstattungKarte({ uebersicht, darfBearbeiten = false, onAktion }: AusstattungKarteProps) {
  const [dialog, setDialog] = useState<OffenerDialog | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string } | null>(null);
  const [sendet, setSendet] = useState(false);
  // Ref zusaetzlich zum Zustand: Zwei Klicks vor dem naechsten Rendern saehen beide noch `sendet === false`.
  const laeuftRef = useRef(false);

  if (!uebersicht) return null;

  const recht = darfBearbeiten && uebersicht.darfBearbeiten;
  const bearbeitbar = recht && uebersicht.zustand === "BEARBEITBAR" && !!onAktion;
  const stellenOhneHinweis = uebersicht.stellen.filter(
    (s) => !uebersicht.gruppen.some((g) => g.departmentKey === s.departmentKey && g.hinweis),
  );

  const oeffnen = (d: OffenerDialog) => {
    setFehler(null);
    setMeldung(null);
    setDialog(d);
  };
  const schliessen = () => {
    if (sendet) return;
    setFehler(null);
    setDialog(null);
  };

  const senden = async (body: AusstattungAktionBody, imDialog: boolean) => {
    if (!onAktion || laeuftRef.current) return;
    laeuftRef.current = true;
    setSendet(true);
    setFehler(null);
    if (!imDialog) setMeldung(null);
    try {
      const ausgang = await onAktion(body);
      if (ausgang.ok) {
        setDialog(null);
        setMeldung({ art: "ok", text: ausgang.meldung });
      } else if (imDialog) {
        setFehler(ausgang.meldung);
      } else {
        setMeldung({ art: "fehler", text: ausgang.meldung });
      }
      // Direktaktion ohne Dialog („Zur Kenntnis genommen“): Ihr Knopf war
      // waehrend des Sendens gesperrt und verschwindet nach dem Neuladen — der
      // Fokus laege auf `body`. Wie das Ersatzziel der Dialoge: der Kartentitel
      // (die Meldung darunter sagt der Bereich `status`/`alert` an).
      if (!imDialog) document.getElementById(AUSSTATTUNG_KARTE_TITEL_ID)?.focus();
    } finally {
      laeuftRef.current = false;
      setSendet(false);
    }
  };
  const ausDialog = (body: AusstattungAktionBody) => void senden(body, true);
  const dialogProps = {
    sendet,
    fehler,
    fokusZiel: AUSSTATTUNG_KARTE_TITEL_ID,
    onAbbrechen: schliessen,
    onSenden: ausDialog,
  };

  return (
    <section
      className="rounded-xl border border-border bg-card p-5"
      aria-labelledby={AUSSTATTUNG_KARTE_TITEL_ID}
      data-karte="ausstattung-checkliste"
      data-zustand={uebersicht.zustand}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3
          id={AUSSTATTUNG_KARTE_TITEL_ID}
          tabIndex={-1}
          className="flex items-center gap-2 text-sm font-bold text-foreground outline-none"
        >
          <span className="h-1 w-1 rounded-full bg-credo-gruen" aria-hidden="true" />
          {AUSSTATTUNG_KATEGORIE}
        </h3>
        {bearbeitbar && (
          <div className="flex flex-wrap gap-2">
            {stellenOhneHinweis.length > 0 && (
              <button
                type="button"
                className={KNOPF_NEBEN}
                disabled={sendet}
                onClick={() => oeffnen({ art: "hinweis", gruppe: null, hinweis: null })}
              >
                {AUSSTATTUNG_KARTE_TEXTE.hinweisNeu}
              </button>
            )}
            <button type="button" className={KNOPF_NEBEN} disabled={sendet} onClick={() => oeffnen({ art: "hinzufuegen" })}>
              {AUSSTATTUNG_KARTE_TEXTE.hinzufuegen}
            </button>
          </div>
        )}
      </div>

      {meldung && (
        <div
          role={meldung.art === "ok" ? "status" : "alert"}
          data-meldung={meldung.art}
          className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-foreground ${
            meldung.art === "ok" ? "border-credo-gruen/40 bg-credo-gruen/10" : "border-credo-rot/30 bg-credo-rot/10"
          }`}
        >
          <span className="min-w-0 flex-1 break-words">{meldung.text}</span>
          <button
            type="button"
            onClick={() => setMeldung(null)}
            aria-label="Meldung schließen"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {uebersicht.satz && <p className="mb-3 text-sm text-muted-foreground">{uebersicht.satz}</p>}
      {uebersicht.gruppen.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          {[uebersicht.einleitung, AUSSTATTUNG_KARTE_TEXTE.erklaerung].filter(Boolean).join(" ")}
        </p>
      )}

      {uebersicht.gruppen.length > 0 ? (
        <div>
          {uebersicht.gruppen.map((gruppe) => (
            <section
              key={gruppe.departmentKey}
              className="border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
              data-stelle={gruppe.departmentKey}
              aria-label={gruppe.stelleName}
            >
              <h4>
                <span className="inline-flex rounded-full border border-credo-blau/40 bg-credo-blau/10 px-2.5 py-0.5 text-xs font-semibold text-foreground">
                  {gruppe.stelleName}
                </span>
              </h4>
              {gruppe.adresseFehlt && <p className="mt-1 text-xs text-destructive">{AUSSTATTUNG_KARTE_TEXTE.adresseFehlt}</p>}
              {gruppe.zeilen.length > 0 && (
                <ul className="mt-1 divide-y divide-border">
                  {gruppe.zeilen.map((zeile) => (
                    <Zeile
                      key={zeile.id}
                      zeile={zeile}
                      gruppe={gruppe}
                      zeigeTexte={recht}
                      bearbeitbar={bearbeitbar}
                      sendet={sendet}
                      onBearbeiten={() => oeffnen({ art: "bearbeiten", gruppe, zeile })}
                      onStreichen={() => oeffnen({ art: "streichen", gruppe, zeile })}
                    />
                  ))}
                </ul>
              )}
              {gruppe.hinweis && (
                <HinweisBlock
                  gruppe={gruppe}
                  hinweis={gruppe.hinweis}
                  zeigeTexte={recht}
                  bearbeitbar={bearbeitbar}
                  sendet={sendet}
                  onUebernehmen={() => gruppe.hinweis && oeffnen({ art: "uebernehmen", gruppe, hinweis: gruppe.hinweis })}
                  onBearbeiten={() => oeffnen({ art: "hinweis", gruppe, hinweis: gruppe.hinweis })}
                  onGesehen={() => void senden({ aktion: "hinweis-gesehen", departmentKey: gruppe.departmentKey }, false)}
                />
              )}
            </section>
          ))}
        </div>
      ) : (
        uebersicht.leer && <p className="text-sm text-muted-foreground">{uebersicht.leer}</p>
      )}

      {dialog?.art === "hinzufuegen" && (
        <HinzufuegenDialog hinzufuegbar={uebersicht.hinzufuegbar} stellen={uebersicht.stellen} {...dialogProps} />
      )}
      {dialog?.art === "uebernehmen" && (
        <HinzufuegenDialog
          hinzufuegbar={uebersicht.hinzufuegbar}
          stellen={uebersicht.stellen}
          hinweis={{
            departmentKey: dialog.gruppe.departmentKey,
            stelleName: dialog.gruppe.stelleName,
            text: dialog.hinweis.text,
            quelleLabel: dialog.hinweis.quelleLabel,
          }}
          {...dialogProps}
        />
      )}
      {dialog?.art === "bearbeiten" && (
        <BearbeitenDialog
          zeile={dialog.zeile}
          departmentKey={dialog.gruppe.departmentKey}
          stelleName={dialog.gruppe.stelleName}
          stellen={uebersicht.stellen}
          {...dialogProps}
        />
      )}
      {dialog?.art === "streichen" && (
        <StreichenDialog zeile={dialog.zeile} stelleName={dialog.gruppe.stelleName} {...dialogProps} />
      )}
      {dialog?.art === "hinweis" && (
        <HinweisDialog
          bestand={
            dialog.gruppe && dialog.hinweis
              ? { departmentKey: dialog.gruppe.departmentKey, stelleName: dialog.gruppe.stelleName, hinweis: dialog.hinweis }
              : null
          }
          stellen={stellenOhneHinweis}
          onEntfernen={dialog.gruppe ? () => dialog.gruppe && oeffnen({ art: "hinweis-entfernen", gruppe: dialog.gruppe }) : undefined}
          {...dialogProps}
        />
      )}
      {dialog?.art === "hinweis-entfernen" && (
        <HinweisEntfernenDialog
          departmentKey={dialog.gruppe.departmentKey}
          stelleName={dialog.gruppe.stelleName}
          {...dialogProps}
        />
      )}
    </section>
  );
}
