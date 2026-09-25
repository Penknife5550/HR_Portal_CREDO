"use client";

/**
 * Karte „Unterlagen nachfordern" (Paket 4, modulneutral; Feinplanung 10.1)
 *
 * Gelb, im Reiter „Dokumente" zwischen „Dokumente versenden" und
 * „Hochgeladene Dokumente" (Einbau in Schritt 10). Zeigt die laufende
 * Nachforderung — Kopf mit Pille, Frist, Fortschritt, je Unterlage Stand,
 * Dateien und Aktionen, Mailverlauf — oder ohne laufende den Knopf
 * „Unterlagen nachfordern…" bzw. den Grund, warum es (noch) nicht geht.
 *
 * Die Karte rechnet NICHTS selbst: Zeilen, Pillen, Texte, erlaubte Aktionen
 * und Datei-URLs kommen fertig aus der Uebersicht des Servers
 * (`uebersichtBauen` in src/lib/unterlagen.ts, geliefert als `unterlagen` von
 * GET /api/onboarding/[id]). So zeigen Karte, Kasten „Offene Nachweise",
 * Upload-Seite und Mail dieselben Begriffe, und die Karte bietet nur an, was
 * der Server auch ausfuehrt. Datei-URLs und Knoepfe gibt es nur mit
 * Bearbeitungsrecht — die Uebersicht laesst sie ohne Recht ohnehin weg, die
 * Karte prueft es trotzdem ein zweites Mal (`darfAktionen`).
 *
 * Aktionen: Die Karte ruft die HR-Routen selbst (Doppelklick-Schutz per Ref,
 * Muster abteilungen-karte.tsx) und laesst danach die Seite neu laden
 * (`onAktualisiert`) — auch nach einem 409, denn dann hat sich der Stand auf
 * dem Server bewegt. Die Dialoge (pruef-dialoge.tsx) bauen nur den Body. Ein
 * Fehler bleibt im Dialog, solange es dessen Ziel nach dem Neuladen noch gibt
 * und der Server die Aktion dort weiter anbietet; sonst schliesst der Dialog,
 * und der Fehler steht als rote Leiste auf der Karte (`dialogZielFinden`).
 * Meldungen zu einer Unterlage tragen deren Bezeichnung vorn.
 *
 * **Eine nicht zugestellte Mail ist nie eine gruene Leiste.** Die HR-Aktionen
 * antworten 2xx, sobald der Zustand gespeichert ist (EP-11); ob die Mail an die
 * Person hinausging, steht in `mail.status`. FAILED ergibt eine rote Leiste,
 * SKIPPED und „versendet, aber nicht gespeichert" (N2) eine gelbe
 * (`unterlagenAntwortAuswerten` in aktionen.ts — dieselbe Auswertung wie im
 * Dialog „Unterlagen nachfordern…").
 *
 * Wiederverwendet aus der Abteilungskarte: `AktionsMeldungen` (gruene/rote
 * Leiste), `PILL_FARBEN`, `datumUhrzeitDE` und das Muster der Rueckfrage
 * (`DialogRahmen`).
 */

import { useEffect, useId, useRef, useState } from "react";
import { AktionsMeldungen, PILL_FARBEN, datumUhrzeitDE } from "@/components/abteilungsaufgaben/abteilungen-karte";
import {
  saetze,
  unterlagenAktionSenden,
  unterlagenApiBasis,
  type UnterlagenMeldung,
} from "@/components/unterlagen/aktionen";
import {
  AnnahmeZuruecknehmenDialog,
  AnnehmenDialog,
  annehmenBrauchtDialog,
  EntfaelltDialog,
  ErneutSendenDialog,
  FristAendernDialog,
  ZurueckweisenDialog,
  ZurueckziehenDialog,
  type NachforderungsBody,
  type PositionsBody,
} from "@/components/unterlagen/pruef-dialoge";
import {
  MELDUNGEN,
  type MailVerlaufEintrag,
  type NachforderungAnsicht,
  type NachforderungDialogAnfrage,
  type NachforderungsAktionen,
  type PositionsAktionen,
  type UnterlagenDateiZeile,
  type UnterlagenFarbe,
  type UnterlagenPille,
  type UnterlagenPositionZeile,
  type UnterlagenUebersicht,
} from "@/lib/unterlagen";

// =============================================
// Typen
// =============================================

/**
 * Was der Dialog „Unterlagen nachfordern…" zum Oeffnen braucht — der Typ steht
 * bei den reinen Regeln (src/lib/unterlagen.ts), weil auch Kasten und
 * Warnbalken ihn dort bekommen (`offeneNachweiseAktion`, `warnbalkenAktion`).
 */
export type { NachforderungDialogAnfrage };

export interface NachforderungKarteProps {
  /** `unterlagen` aus GET /api/onboarding/[id]. */
  uebersicht: UnterlagenUebersicht;
  vorgangId: string;
  /** HR_EDIT_ROLES — ohne Recht nur lesen, ohne Datei-Links. */
  darfAktionen: boolean;
  /** Nach jeder Antwort des Servers: Vorgang neu laden (Dokumente, Kasten, Reiter). */
  onAktualisiert: () => void | Promise<unknown>;
  /** Oeffnet den Dialog „Unterlagen nachfordern…" bzw. „Unterlagen ergänzen…" (Schritt 10). */
  onNachfordern: (anfrage: NachforderungDialogAnfrage) => void;
  /** Nur fuer Tests: Bezugszeit (Sperrzeit „Link erneut senden", Ablauf-Warnung). */
  jetzt?: Date;
}

/**
 * Stellt einer Meldung zu einer Unterlage deren Bezeichnung voran — kein
 * eigener Text, nur die Zuordnung: Die Leiste steht oben ueber bis zu 30
 * Unterlagen, und die Texte des Servers („Die Unterlage ist angenommen.")
 * nennen keine.
 */
function mitBezug(m: UnterlagenMeldung, bezeichnung: string | null | undefined): UnterlagenMeldung {
  return bezeichnung ? { ...m, meldung: `${bezeichnung}: ${m.meldung}` } : m;
}

// =============================================
// Leisten: gruen / rot ueber AktionsMeldungen, gelb hier
// =============================================

export function UnterlagenMeldungen({
  meldung,
  onSchliessen,
}: {
  meldung: UnterlagenMeldung | null | undefined;
  onSchliessen?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const warnung = meldung?.art === "warnung" ? meldung : null;

  // Wie AktionsMeldungen: Die Karte kann lang sein, die Meldung soll nicht
  // ausserhalb des Blicks landen.
  useEffect(() => {
    if (warnung) ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [warnung]);

  if (!meldung) return null;
  if (meldung.art !== "warnung") return <AktionsMeldungen meldung={meldung} onSchliessen={onSchliessen} />;

  return (
    <div ref={ref} className="space-y-2" data-testid="aktions-meldungen">
      <div
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-credo-gelb/50 bg-credo-gelb/15 px-3 py-2 text-sm text-amber-900"
        data-art="warnung"
      >
        <span className="min-w-0 flex-1 break-words">{meldung.meldung}</span>
        {onSchliessen && (
          <button
            type="button"
            onClick={onSchliessen}
            aria-label="Meldung schließen"
            className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {meldung.hinweis && (
        <div
          role="status"
          className="rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2 text-sm text-amber-900"
          data-art="hinweis"
        >
          {meldung.hinweis}
        </div>
      )}
    </div>
  );
}

// =============================================
// Kleine Bausteine
// =============================================

/** Textfarbe je Mailstatus im Verlauf: FAILED rot, SKIPPED gelb (der Server liefert die Farbe). */
const VERLAUF_FARBEN: Partial<Record<UnterlagenFarbe, string>> = {
  rot: "font-medium text-credo-rot",
  gelb: "font-medium text-amber-800",
};

function Pille({ pille, name }: { pille: UnterlagenPille; name?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PILL_FARBEN[pille.farbe]}`}
      data-pille={name}
      data-farbe={pille.farbe}
    >
      {pille.text}
    </span>
  );
}

const KNOPF =
  "rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const KNOPF_JA =
  "rounded-md bg-credo-gruen px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#5a9420] disabled:cursor-not-allowed disabled:opacity-50";
const KNOPF_NEIN =
  "rounded-md border border-credo-rot/40 bg-card px-2.5 py-1 text-[11px] font-medium text-credo-rot transition-colors hover:bg-credo-rot/10 disabled:cursor-not-allowed disabled:opacity-50";

// =============================================
// Karte
// =============================================

type PositionsDialogArt = "annehmen" | "zurueckweisen" | "entfaellt" | "annahme-zuruecknehmen";
type NachforderungsDialogArt = "frist-aendern" | "erneut-senden" | "zurueckziehen";

/**
 * Welcher Dialog offen ist — `bezug` trennt die beiden Arten fuer TypeScript
 * sauber. Die Bezeichnung der Unterlage wird beim Oeffnen gemerkt: Ist die
 * Unterlage nach dem Neuladen verschwunden, braucht die Meldung sie trotzdem.
 */
type OffenerDialog =
  | { bezug: "position"; art: PositionsDialogArt; nachforderungId: string; positionId: string; bezeichnung: string }
  | { bezug: "nachforderung"; art: NachforderungsDialogArt; nachforderungId: string };

/** Die Aktion hinter einem Positions-Dialog, wie sie in `aktionen` heisst. */
const POSITIONS_AKTION: Readonly<Record<PositionsDialogArt, keyof PositionsAktionen>> = {
  annehmen: "annehmen",
  zurueckweisen: "zurueckweisen",
  entfaellt: "entfaellt",
  "annahme-zuruecknehmen": "annahmeZuruecknehmen",
};

function nachforderungsAktionErlaubt(art: NachforderungsDialogArt, a: NachforderungsAktionen): boolean {
  switch (art) {
    case "frist-aendern":
      return a.fristAendern;
    case "erneut-senden":
      // „Gesperrt" heisst nur „gerade nicht": Nach der Sperrzeit wird der Knopf
      // frei, ohne dass eine neue Uebersicht kommt (Timer in NachforderungBlock).
      return a.erneutSenden || a.erneutSendenGesperrt;
    case "zurueckziehen":
      return a.zurueckziehen;
  }
}

/** Das Ziel eines offenen Dialogs in der aktuellen Uebersicht. */
type DialogZiel =
  | { bezug: "nachforderung"; art: NachforderungsDialogArt; nachforderung: NachforderungAnsicht }
  | {
      bezug: "position";
      art: PositionsDialogArt;
      nachforderung: NachforderungAnsicht;
      position: UnterlagenPositionZeile;
    };

/**
 * Sucht das Ziel des offenen Dialogs frisch in der Uebersicht — und nur, wenn
 * der Server die Aktion dort weiter anbietet. `null`: Nachforderung oder
 * Unterlage sind verschwunden (eine Kollegin hat zurueckgezogen, eine neuere
 * Nachforderung laeuft, die Ruecknahmefrist ist vorbei) oder die Aktion passt
 * nicht mehr zum Stand (die Unterlage ist inzwischen angenommen). Dann schliesst
 * die Karte den Dialog und zeigt dessen Fehler als eigene Leiste.
 */
function dialogZielFinden(uebersicht: UnterlagenUebersicht, offen: OffenerDialog): DialogZiel | null {
  const nachforderung = [uebersicht.laufend, uebersicht.zuletztErledigt].find(
    (n): n is NachforderungAnsicht => !!n && n.id === offen.nachforderungId,
  );
  if (!nachforderung) return null;
  if (offen.bezug === "nachforderung") {
    return nachforderungsAktionErlaubt(offen.art, nachforderung.aktionen)
      ? { bezug: "nachforderung", art: offen.art, nachforderung }
      : null;
  }
  const position = nachforderung.positionen.find((p) => p.id === offen.positionId);
  if (!position || !position.aktionen[POSITIONS_AKTION[offen.art]]) return null;
  return { bezug: "position", art: offen.art, nachforderung, position };
}

/** Breite eines Balkenteils in Prozent (0 bis 100, gerundet). */
function balkenProzent(anteil: number): number {
  return Math.min(100, Math.max(0, Math.round(anteil * 100)));
}

export function NachforderungKarte({
  uebersicht,
  vorgangId,
  darfAktionen,
  onAktualisiert,
  onNachfordern,
  jetzt,
}: NachforderungKarteProps) {
  const titelId = `${useId()}-unterlagen-titel`;
  const sectionRef = useRef<HTMLElement>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  // Ref zusaetzlich zum Zustand: Zwei Klicks vor dem naechsten Rendern
  // saehen beide noch `laeuft === null` (Muster abteilungen-karte.tsx).
  const laeuftRef = useRef(false);
  const [meldung, setMeldung] = useState<UnterlagenMeldung | null>(null);
  const [offen, setOffen] = useState<OffenerDialog | null>(null);
  // Mit `hinweis`: Beim Annehmen einer freien Zeile nennt der Server darin den
  // Grund, warum eine vertrauliche Art gesperrt ist (etwa bei Kitas).
  const [dialogFehler, setDialogFehler] = useState<{ meldung: string; hinweis: string | null } | null>(null);
  // Direkte Aktion ohne Dialog („Annehmen"): Wohin der Fokus danach geht — der
  // Knopf ist waehrend der Aktion gesperrt und nach einer Annahme verschwunden.
  const fokusNachAktion = useRef<{ ausloeser: HTMLElement | null; positionId: string } | null>(null);

  // Die Basis der Routen nennt der Server (`uebersicht.apiBasis`); die Tabelle
  // des Moduls nur, wenn eine Uebersicht sie nicht traegt (wie der Dialog).
  const basis = uebersicht.apiBasis ?? unterlagenApiBasis(uebersicht.modul, vorgangId);
  // Doppelt gesichert: Die Uebersicht laesst ohne Recht Aktionen und URLs weg,
  // und die Karte zeigt ohne Recht (oder ohne bekannte Route) keinen Knopf.
  const darf = darfAktionen && uebersicht.darfAktionen && basis !== null;

  const { laufend, zuletztErledigt, anfordern } = uebersicht;
  const ziel = darf && offen ? dialogZielFinden(uebersicht, offen) : null;
  const zielFehlt = offen !== null && ziel === null;

  // Nach dem Neuladen fehlt das Ziel des Dialogs (oder die Aktion passt nicht
  // mehr zum Stand): Der Dialog schliesst, und sein Fehler wird zur Leiste der
  // Karte — sonst verschwaende er samt der Meldung des Servers (etwa „… läuft
  // inzwischen eine neuere Nachforderung …"), und HR hielte die Aktion fuer
  // gelungen. Erst nach der Aktion (`laeuft === null`): Vorher steht der
  // Fehler noch nicht fest.
  useEffect(() => {
    if (!zielFehlt || laeuft !== null) return;
    const bezeichnung = offen?.bezug === "position" ? offen.bezeichnung : null;
    setOffen(null);
    if (dialogFehler) {
      setMeldung(mitBezug({ art: "fehler", meldung: dialogFehler.meldung, hinweis: dialogFehler.hinweis }, bezeichnung));
      setDialogFehler(null);
    }
  }, [zielFehlt, laeuft, offen, dialogFehler]);

  // Fokus nach einer direkten Aktion: zurueck auf den Knopf, wenn es ihn noch
  // gibt und er frei ist (Fehler), sonst auf die Zeile der Unterlage (nach der
  // Annahme steht dort „Angenommen"), sonst auf den Titel der Karte. Hat HR den
  // Fokus inzwischen selbst woanders hingesetzt, bleibt er dort.
  useEffect(() => {
    if (laeuft !== null) return;
    const merker = fokusNachAktion.current;
    if (!merker) return;
    fokusNachAktion.current = null;
    const { ausloeser, positionId } = merker;
    const aktiv = document.activeElement;
    if (aktiv && aktiv !== document.body && aktiv !== ausloeser) return;
    if (ausloeser && ausloeser.isConnected && !ausloeser.hasAttribute("disabled")) {
      ausloeser.focus();
      return;
    }
    const zeile = Array.from(sectionRef.current?.querySelectorAll<HTMLElement>("[data-position]") ?? []).find(
      (el) => el.dataset.position === positionId,
    );
    (zeile ?? document.getElementById(titelId))?.focus();
  }, [laeuft, titelId]);

  const ausfuehren = async (
    schluessel: string,
    url: string,
    body: unknown,
    opts: { ausDialog: boolean; bezeichnung?: string | null },
  ) => {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setLaeuft(schluessel);
    setDialogFehler(null);
    try {
      const ergebnis = await unterlagenAktionSenden(url, body);
      // Jede Antwort kann den Stand geaendert haben — auch 409 (jemand anderes
      // war schneller). Neu laden, bevor die Knoepfe wieder frei werden.
      if (ergebnis.status !== null) {
        try {
          await onAktualisiert();
        } catch {
          // Scheitert das Neuladen, bleibt die Meldung der Aktion stehen.
        }
      }
      if (opts.ausDialog && !ergebnis.ausgefuehrt) {
        // Nichts geaendert: Der Dialog bleibt mit dem Grund offen — solange es
        // sein Ziel nach dem Neuladen noch gibt (sonst der Effekt oben).
        setDialogFehler({ meldung: ergebnis.meldung.meldung, hinweis: ergebnis.meldung.hinweis });
      } else {
        setOffen(null);
        setMeldung(mitBezug(ergebnis.meldung, opts.bezeichnung));
      }
    } finally {
      laeuftRef.current = false;
      setLaeuft(null);
    }
  };

  const positionsAktion = (
    p: Pick<UnterlagenPositionZeile, "id" | "bezeichnung">,
    body: PositionsBody,
    ausDialog: boolean,
    ausloeser: HTMLElement | null = null,
  ) => {
    if (!basis || laeuftRef.current) return;
    if (!ausDialog) fokusNachAktion.current = { ausloeser, positionId: p.id };
    void ausfuehren(`${body.aktion}:${p.id}`, `${basis}/positionen/${p.id}`, body, {
      ausDialog,
      bezeichnung: p.bezeichnung,
    });
  };

  const nachforderungsAktion = (body: NachforderungsBody) => {
    if (!basis) return;
    void ausfuehren(body.aktion, basis, body, { ausDialog: true });
  };

  const dialogOeffnen = (d: OffenerDialog) => {
    setDialogFehler(null);
    setOffen(d);
  };

  const dialogSchliessen = () => {
    setDialogFehler(null);
    setOffen(null);
  };

  const positionsDialog = (art: PositionsDialogArt, n: NachforderungAnsicht, p: UnterlagenPositionZeile) =>
    dialogOeffnen({ bezug: "position", art, nachforderungId: n.id, positionId: p.id, bezeichnung: p.bezeichnung });

  const onAnnehmen = (n: NachforderungAnsicht, p: UnterlagenPositionZeile, ausloeser: HTMLElement | null) => {
    if (annehmenBrauchtDialog(p)) positionsDialog("annehmen", n, p);
    else positionsAktion(p, { aktion: "annehmen" }, false, ausloeser);
  };

  return (
    <section
      ref={sectionRef}
      aria-labelledby={titelId}
      className="rounded-2xl border-2 border-credo-gelb/60 bg-credo-gelb/10 p-5"
      data-karte="unterlagen"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3
          id={titelId}
          tabIndex={-1}
          className="flex items-center gap-2 text-sm font-bold text-foreground outline-none"
        >
          <span className="h-1 w-1 rounded-full bg-credo-gelb" />
          Unterlagen nachfordern
        </h3>
        {uebersicht.pille && <Pille pille={uebersicht.pille} name="karte" />}
      </div>

      {meldung && (
        <div className="mb-3">
          <UnterlagenMeldungen meldung={meldung} onSchliessen={() => setMeldung(null)} />
        </div>
      )}

      {uebersicht.laufHinweis && (
        <p
          className="mb-3 rounded-lg border border-credo-gelb/50 bg-card px-3 py-2 text-xs font-medium text-amber-900"
          data-hinweis="lauf"
        >
          {uebersicht.laufHinweis}
        </p>
      )}

      {laufend ? (
        <NachforderungBlock
          ansicht={laufend}
          darf={darf}
          laeuft={laeuft}
          jetzt={jetzt}
          onAnnehmen={(p, ausloeser) => onAnnehmen(laufend, p, ausloeser)}
          onPositionsDialog={(art, p) => positionsDialog(art, laufend, p)}
          onNachforderungsDialog={(art) =>
            dialogOeffnen({ bezug: "nachforderung", art, nachforderungId: laufend.id })
          }
          onErgaenzen={() => onNachfordern({ modus: "ergaenzen", vorauswahl: null })}
        />
      ) : (
        <div className="space-y-3">
          {darf && anfordern.moeglich ? (
            <>
              {/* Die Aufforderung nur, wo sie sich befolgen laesst — sonst stuende sie gegen den Grund darunter. */}
              <p className="text-sm text-muted-foreground" data-zeile="aufforderung">
                Fordern Sie fehlende oder weitere Unterlagen bei der Person an. Sie erhält eine E-Mail mit einem
                persönlichen Link zum Hochladen.
              </p>
              <button
                type="button"
                onClick={() => onNachfordern({ modus: "neu", vorauswahl: null })}
                disabled={laeuft !== null}
                className="rounded-lg bg-credo-blau px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-blau/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Unterlagen nachfordern…
              </button>
            </>
          ) : darf && anfordern.grund ? (
            <p
              className="rounded-lg border border-credo-gelb/40 bg-card px-3 py-2 text-xs text-amber-900"
              data-hinweis="nicht-verfuegbar"
            >
              {anfordern.grund}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground" data-hinweis="keine-laufende">
              Zurzeit läuft keine Nachforderung.
            </p>
          )}

          {zuletztErledigt && (
            <details className="rounded-lg border border-border bg-card" data-block="zuletzt-erledigt">
              {/* `summary` behaelt `display: list-item` (Tailwind-Preflight) — nur dann zeichnet der
                  Browser das Aufklapp-Dreieck. Die Anordnung steckt im inneren `span`. */}
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-foreground">
                <span className="inline-flex flex-wrap items-center gap-2 align-middle">
                  <span>
                    Letzte Nachforderung
                    {zuletztErledigt.abschlussText ? ` · ${zuletztErledigt.abschlussText}` : ""}
                  </span>
                  <Pille pille={zuletztErledigt.pille} />
                </span>
              </summary>
              <div className="border-t border-border px-3 py-3">
                <NachforderungBlock
                  ansicht={zuletztErledigt}
                  darf={darf}
                  laeuft={laeuft}
                  jetzt={jetzt}
                  onAnnehmen={(p, ausloeser) => onAnnehmen(zuletztErledigt, p, ausloeser)}
                  onPositionsDialog={(art, p) => positionsDialog(art, zuletztErledigt, p)}
                  onNachforderungsDialog={(art) =>
                    dialogOeffnen({ bezug: "nachforderung", art, nachforderungId: zuletztErledigt.id })
                  }
                  onErgaenzen={() => onNachfordern({ modus: "ergaenzen", vorauswahl: null })}
                />
              </div>
            </details>
          )}
        </div>
      )}

      {ziel && (
        <OffenerDialogAnzeige
          ziel={ziel}
          uebersicht={uebersicht}
          sendet={laeuft !== null}
          fehler={dialogFehler ? saetze(dialogFehler.meldung, dialogFehler.hinweis) : null}
          fokusZiel={titelId}
          jetzt={jetzt}
          onAbbrechen={dialogSchliessen}
          onPosition={(p, body) => positionsAktion(p, body, true)}
          onNachforderung={nachforderungsAktion}
        />
      )}
    </section>
  );
}

// =============================================
// Eine Nachforderung (laufend oder zuletzt erledigt)
// =============================================

function NachforderungBlock({
  ansicht,
  darf,
  laeuft,
  jetzt,
  onAnnehmen,
  onPositionsDialog,
  onNachforderungsDialog,
  onErgaenzen,
}: {
  ansicht: NachforderungAnsicht;
  darf: boolean;
  laeuft: string | null;
  jetzt?: Date;
  onAnnehmen: (p: UnterlagenPositionZeile, ausloeser: HTMLElement | null) => void;
  onPositionsDialog: (art: Exclude<PositionsDialogArt, "annehmen">, p: UnterlagenPositionZeile) => void;
  onNachforderungsDialog: (art: NachforderungsDialogArt) => void;
  onErgaenzen: () => void;
}) {
  const [, setTick] = useState(0);
  const a = ansicht.aktionen;

  // „Link erneut senden" waehrend der Sperrzeit: grau, mit dem Ende als
  // sichtbarem Text — und zum Ende neu zeichnen, sonst bliebe der Knopf grau,
  // bis jemand neu laedt (Muster abteilungen-karte.tsx).
  const sperreBis = ansicht.sperreBis ? new Date(ansicht.sperreBis) : null;
  const sperreBisMs = sperreBis && !Number.isNaN(sperreBis.getTime()) ? sperreBis.getTime() : null;
  const nun = (jetzt ?? new Date()).getTime();
  const gesperrt = a.erneutSendenGesperrt && sperreBisMs !== null && sperreBisMs > nun;
  useEffect(() => {
    if (!gesperrt || sperreBisMs === null || jetzt) return;
    const timer = setTimeout(() => setTick((t) => t + 1), Math.max(sperreBisMs - Date.now(), 0) + 500);
    return () => clearTimeout(timer);
  }, [gesperrt, sperreBisMs, jetzt]);

  const zeigeErneut = a.erneutSenden || a.erneutSendenGesperrt;
  const fussKnoepfe = darf && (a.ergaenzen || a.fristAendern || zeigeErneut || a.zurueckziehen);
  // Zwei Balkenteile wie im Mockup (P:1388): angenommen (gruen) und zu pruefen
  // (gelb) — beide Anteile rechnet der Server.
  const prozent = balkenProzent(ansicht.fortschritt.anteil);
  const prozentZuPruefen = balkenProzent(ansicht.fortschritt.anteilZuPruefen);

  return (
    <div className="space-y-3" data-nachforderung={ansicht.id}>
      <div className="space-y-0.5 text-xs">
        <p className="break-words text-muted-foreground" data-zeile="kopf">
          {ansicht.kopfZeile}
        </p>
        {/* Die Frist samt Restlaufzeit nur bei der laufenden: Eine erledigte nimmt nichts
            mehr an, „noch 5 Tage" fuehrte in die Irre. Fuer sie liefert der Server die
            Ersatzzeile „Frist war …" — die Karte formuliert keine eigene. */}
        {ansicht.status === "LAUFEND" ? (
          <p
            className={ansicht.fristVerstrichen ? "font-semibold text-credo-rot" : "text-foreground"}
            data-zeile="frist"
          >
            {ansicht.fristZeile}
          </p>
        ) : (
          <p className="text-muted-foreground" data-zeile="frist-ende">
            {ansicht.fristZeile}
          </p>
        )}
        {ansicht.abschlussText && (
          <p className="text-muted-foreground" data-zeile="abschluss">
            {ansicht.abschlussText}
          </p>
        )}
      </div>

      {ansicht.nachricht && (
        <p className="whitespace-pre-line break-words rounded-lg bg-card px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Nachricht an die Person: </span>
          {ansicht.nachricht}
        </p>
      )}

      <div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={prozent}
          aria-valuetext={ansicht.fortschritt.text}
          aria-label="Fortschritt der Nachforderung"
          className="flex h-1.5 overflow-hidden rounded-full bg-card"
        >
          <div className="h-full bg-credo-gruen" style={{ width: `${prozent}%` }} data-balken="angenommen" />
          {prozentZuPruefen > 0 && (
            <div className="h-full bg-credo-gelb" style={{ width: `${prozentZuPruefen}%` }} data-balken="zu-pruefen" />
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground" data-zeile="fortschritt">
          {ansicht.fortschritt.text}
        </p>
      </div>

      <ul className="space-y-2">
        {ansicht.positionen.map((p) => (
          <PositionAnzeige
            key={p.id}
            position={p}
            darf={darf}
            laeuft={laeuft}
            onAnnehmen={(ausloeser) => onAnnehmen(p, ausloeser)}
            onDialog={(art) => onPositionsDialog(art, p)}
          />
        ))}
      </ul>

      {/* Eingestellter Vorgang: Warum Ergaenzen, Frist aendern, erneut senden und
          Zurueckweisen fehlen — der Text kommt fertig vom Server. */}
      {darf && ansicht.eingestelltHinweis && (
        <p
          className="rounded-lg border border-credo-gelb/50 bg-card px-3 py-2 text-xs text-amber-900"
          data-hinweis="eingestellt"
        >
          {ansicht.eingestelltHinweis}
        </p>
      )}

      {fussKnoepfe && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5" data-block="fuss">
            {a.ergaenzen && (
              <button type="button" onClick={onErgaenzen} disabled={laeuft !== null} className={KNOPF}>
                Unterlagen ergänzen…
              </button>
            )}
            {a.fristAendern && (
              <button
                type="button"
                onClick={() => onNachforderungsDialog("frist-aendern")}
                disabled={laeuft !== null}
                className={KNOPF}
              >
                Frist ändern…
              </button>
            )}
            {zeigeErneut && (
              <button
                type="button"
                onClick={() => onNachforderungsDialog("erneut-senden")}
                disabled={laeuft !== null || gesperrt}
                className={KNOPF}
              >
                {laeuft === "erneut-senden" ? "Wird gesendet…" : "Link erneut senden"}
              </button>
            )}
            {a.zurueckziehen && (
              <button
                type="button"
                onClick={() => onNachforderungsDialog("zurueckziehen")}
                disabled={laeuft !== null}
                className={KNOPF}
              >
                Zurückziehen…
              </button>
            )}
          </div>
          {gesperrt && sperreBis && (
            <p className="text-[11px] text-muted-foreground" data-hinweis="sperrzeit">
              {MELDUNGEN.SPERRZEIT} „Link erneut senden“ ist wieder möglich ab {datumUhrzeitDE(sperreBis)} Uhr.
            </p>
          )}
        </div>
      )}

      <MailVerlauf eintraege={ansicht.mailVerlauf} />
      {ansicht.mailHinweis && (
        <p className="text-xs font-semibold text-credo-rot" data-hinweis="nicht-zustellbar">
          {ansicht.mailHinweis}
        </p>
      )}
      {ansicht.hrMeldungHinweis && (
        <p className="text-xs font-medium text-amber-900" data-hinweis="hr-meldung">
          {ansicht.hrMeldungHinweis}
        </p>
      )}
    </div>
  );
}

/**
 * „E-Mails an die Person: Aufforderung 12.09. · Zurückweisung 16.09." — je
 * Eintrag einzeln, damit FAILED rot und SKIPPED gelb stehen; der Grund des
 * Mailers steht im Tooltip und fuer Screenreader im Text.
 */
function MailVerlauf({ eintraege }: { eintraege: ReadonlyArray<MailVerlaufEintrag> }) {
  if (eintraege.length === 0) return null;
  return (
    <p className="break-words text-[11px] text-muted-foreground" data-block="mailverlauf">
      E-Mails an die Person:{" "}
      {eintraege.map((e, i) => (
        <span key={`${e.anlass}-${i}`}>
          {i > 0 ? " · " : ""}
          <span
            className={e.farbe ? VERLAUF_FARBEN[e.farbe] : undefined}
            data-mail-status={e.status}
            title={e.hinweis ?? undefined}
          >
            {e.text}
            {e.hinweis ? <span className="sr-only"> ({e.hinweis})</span> : null}
          </span>
        </span>
      ))}
    </p>
  );
}

// =============================================
// Eine Unterlage
// =============================================

function PositionAnzeige({
  position: p,
  darf,
  laeuft,
  onAnnehmen,
  onDialog,
}: {
  position: UnterlagenPositionZeile;
  darf: boolean;
  laeuft: string | null;
  onAnnehmen: (ausloeser: HTMLElement | null) => void;
  onDialog: (art: Exclude<PositionsDialogArt, "annehmen">) => void;
}) {
  const a = p.aktionen;
  const knoepfe = darf && (a.annehmen || a.zurueckweisen || a.entfaellt || a.annahmeZuruecknehmen);
  const dialogBeimAnnehmen = annehmenBrauchtDialog(p);
  const begruendung = [p.begruendungText, p.einreichungText].filter(Boolean).join(" · ");

  return (
    // `tabIndex={-1}`: Ziel des Fokus nach einer direkten Aktion, deren Knopf danach fehlt.
    <li
      tabIndex={-1}
      className="rounded-lg border border-border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-position={p.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-semibold text-foreground">{p.bezeichnung}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {p.originalErforderlich && (
            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              Original erforderlich
            </span>
          )}
          <Pille pille={p.pille} name="position" />
        </div>
      </div>

      <div className="mt-1 space-y-0.5 text-xs">
        {p.detail && <p className="text-muted-foreground">{p.detail}</p>}
        {begruendung && (
          <p className="break-words text-muted-foreground" data-zeile="begruendung">
            {begruendung}
          </p>
        )}
        {p.dateien.length > 0 && (
          <ul className="space-y-0.5" data-block="dateien">
            {p.dateien.map((d) => (
              <DateiAnzeige key={d.id} datei={d} darf={darf} />
            ))}
          </ul>
        )}
        {p.gueltigBisAngabeText && <p className="text-muted-foreground">{p.gueltigBisAngabeText}</p>}
        {p.ungeprueftHinweis && (
          <p className="font-semibold text-amber-800" data-hinweis="ungeprueft">
            {p.ungeprueftHinweis}
          </p>
        )}
        {p.entfaelltNotiz && (
          <p className="break-words text-muted-foreground">
            <span className="font-semibold">Interne Notiz: </span>
            {p.entfaelltNotiz}
          </p>
        )}
      </div>

      {knoepfe && (
        <div className="mt-2 flex flex-wrap gap-1.5" data-block="aktionen">
          {a.annehmen && (
            <button
              type="button"
              onClick={(e) => onAnnehmen(e.currentTarget)}
              disabled={laeuft !== null}
              aria-label={`Annehmen – ${p.bezeichnung}`}
              className={KNOPF_JA}
            >
              {laeuft === `annehmen:${p.id}` ? "Wird angenommen…" : dialogBeimAnnehmen ? "Annehmen…" : "Annehmen"}
            </button>
          )}
          {a.zurueckweisen && (
            <button
              type="button"
              onClick={() => onDialog("zurueckweisen")}
              disabled={laeuft !== null}
              aria-label={`Zurückweisen – ${p.bezeichnung}`}
              className={KNOPF_NEIN}
            >
              Zurückweisen…
            </button>
          )}
          {a.entfaellt && (
            <button
              type="button"
              onClick={() => onDialog("entfaellt")}
              disabled={laeuft !== null}
              aria-label={`Entfällt – ${p.bezeichnung}`}
              className={KNOPF}
            >
              Entfällt…
            </button>
          )}
          {a.annahmeZuruecknehmen && (
            <button
              type="button"
              onClick={() => onDialog("annahme-zuruecknehmen")}
              disabled={laeuft !== null}
              aria-label={`Annahme zurücknehmen – ${p.bezeichnung}`}
              className={KNOPF}
            >
              Annahme zurücknehmen…
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Eine Datei: Name, Groesse und „Öffnen" (neuer Tab; die Route liefert
 * `inline`). Kein iframe — die Middleware setzt `X-Frame-Options: DENY`. Die
 * URL kommt vom Server und steht nur mit Recht in der Uebersicht, und nur,
 * solange die Datei bei der Nachforderung liegt (auch eine zurueckgewiesene
 * bis zu ihrer Loeschung); ohne Recht fehlt auch der Name. Zurueckgewiesene
 * und verworfene Dateien durchgestrichen.
 */
function DateiAnzeige({ datei: d, darf }: { datei: UnterlagenDateiZeile; darf: boolean }) {
  const name = (darf ? d.name : null) ?? "Datei";
  const kern = `${name} · ${d.groesseText}`;
  return (
    <li className="break-words text-muted-foreground" data-datei={d.id} data-status={d.status}>
      {d.durchgestrichen ? <s>{kern}</s> : <span>{kern}</span>}
      {darf && d.url && (
        <>
          {" · "}
          <a
            href={d.url}
            target="_blank"
            rel="noopener"
            aria-label={`${name} öffnen`}
            className="font-medium text-credo-blau underline-offset-2 hover:underline"
          >
            Öffnen
          </a>
        </>
      )}
      {d.zusatz ? ` ${d.zusatz}` : ""}
      {d.hinweise.length > 0 && (
        <span className="ml-1 font-medium text-amber-800" data-hinweis="pdf">
          ({d.hinweise.join(", ")})
        </span>
      )}
    </li>
  );
}

// =============================================
// Der gerade offene Dialog
// =============================================

function OffenerDialogAnzeige({
  ziel,
  uebersicht,
  sendet,
  fehler,
  fokusZiel,
  jetzt,
  onAbbrechen,
  onPosition,
  onNachforderung,
}: {
  /** Frisch aus der Uebersicht (`dialogZielFinden`) — fehlt es, schliesst die Karte den Dialog. */
  ziel: DialogZiel;
  uebersicht: UnterlagenUebersicht;
  sendet: boolean;
  fehler: string | null;
  fokusZiel: string;
  jetzt?: Date;
  onAbbrechen: () => void;
  onPosition: (p: UnterlagenPositionZeile, body: PositionsBody) => void;
  onNachforderung: (body: NachforderungsBody) => void;
}) {
  const { nachforderung } = ziel;
  const basis = { sendet, fehler, onAbbrechen, fokusZiel };

  if (ziel.bezug === "nachforderung") {
    switch (ziel.art) {
      case "frist-aendern":
        return <FristAendernDialog {...basis} nachforderung={nachforderung} onBestaetigen={onNachforderung} />;
      case "erneut-senden":
        return (
          <ErneutSendenDialog
            {...basis}
            nachforderung={nachforderung}
            empfaenger={uebersicht.dialog?.empfaenger ?? null}
            onBestaetigen={onNachforderung}
          />
        );
      case "zurueckziehen":
        return <ZurueckziehenDialog {...basis} nachforderung={nachforderung} onBestaetigen={onNachforderung} />;
    }
  }

  const { position } = ziel;
  const senden = (body: PositionsBody) => onPosition(position, body);

  switch (ziel.art) {
    case "annehmen":
      return (
        <AnnehmenDialog
          {...basis}
          position={position}
          auswahl={uebersicht.dialog?.auswahl ?? null}
          jetzt={jetzt}
          onBestaetigen={senden}
        />
      );
    case "zurueckweisen":
      return (
        <ZurueckweisenDialog
          {...basis}
          position={position}
          frist={nachforderung.dialog.zurueckweisenFrist}
          grenzen={nachforderung.dialog.fristGrenzen}
          onBestaetigen={senden}
        />
      );
    case "entfaellt":
      return <EntfaelltDialog {...basis} position={position} nachforderung={nachforderung} onBestaetigen={senden} />;
    case "annahme-zuruecknehmen":
      return (
        <AnnahmeZuruecknehmenDialog
          {...basis}
          position={position}
          nachforderungErledigt={nachforderung.status === "ERLEDIGT"}
          onBestaetigen={senden}
        />
      );
  }
}
