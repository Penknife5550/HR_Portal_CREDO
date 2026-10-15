"use client";

/**
 * Die Ausgaben an einer Ausstattungsaufgabe in der Karte „Ausstattung &
 * Zugänge“ (Reiter Checkliste der Onboarding-Detailseite) — Ausstattung &
 * Zugaenge Stufe 2, Feinplan A4, S26, G7, G19, G20, 1.8.
 *
 *   AusgabenZeile   je Option bzw. ganzer Position: die Stuecke („übergeben
 *                   28.01.2027 · FES-IPAD-0412 · über den Link“, fruehere mit
 *                   ihrem Zustand dahinter, grau), darunter gelb „Übergabe nicht
 *                   vermerkt“ (erledigte Aufgabe ohne Vermerk und ohne
 *                   Loeschmerker) bzw. grau „Ausgaben nach Ablauf der
 *                   Aufbewahrungsfrist gelöscht“; dazu die Aktionen, die der
 *                   Server je Stueck erlaubt (`aktionen`), und „Übergabe
 *                   vermerken…“ (`vermerken`). Ein an einen Austritt
 *                   gebundenes Stueck nennt seinen Sperrgrund.
 *   ProtokollZeile  je Vorgang „Unterschriebenes Übergabeprotokoll: fehlt“ bzw.
 *                   „… hochgeladen am TT.MM.JJJJ“ (`uebersicht.protokoll`),
 *                   nur, solange ein aktives Stueck zurueckkommt.
 *
 * Die Bausteine rechnen NICHTS selbst: Texte, Hinweis, erlaubte Aktionen und
 * Sperrgrund kommen fertig vom Server (`ausgabenAnzeigeBauen`, `ausgabenZeile`,
 * `protokollAnzeige` in src/lib/ausgaben.ts). Fehlen die Ausgabe-Felder an
 * einer Aufgabe (Zeile ohne „Beim Austritt“: A4 ist dort aus, G27), zeichnet
 * `AusgabenZeile` nichts. Die Aktionen gibt es nur mit `bearbeitbar` (die
 * Karte: Rolle in HR_EDIT_ROLES, `ausgabenBearbeitbar` — auch bei einem
 * abgeschlossenen oder abgesagten Vorgang — und eine Aktion der Seite); die
 * Anzeige bleibt ohne Recht. Ein Klick oeffnet einen Dialog der Karte
 * (ausgaben-dialoge.tsx).
 *
 * Optik der Karte, nur Farb-Tokens und lucide-react (neue Datei, Stand 0 in
 * der Sperrklinke).
 */

import { useId } from "react";
import { FileCheck, FileWarning, TriangleAlert } from "lucide-react";
import { artTexte, type AusgabenDialogAnfrage, type StueckDialogArt } from "@/components/ausgaben/ausgaben-dialoge";
import type { AusgabeStand, ProtokollAnzeige } from "@/lib/ausgaben";
import type { AusstattungsAufgabeStand, AusstattungsUebersicht } from "@/lib/ausstattung";

export const AUSGABEN_ZEILE_TEXTE = {
  korrigieren: "Korrigieren…",
  tauschen: "Tauschen…",
  entfernen: "Entfernen…",
  liste: (bezug: string): string => `Ausgaben: ${bezug}`,
  /** Unter dem Satz „… nur noch lesbar“: Die Ausgaben bleiben bearbeitbar (G7). */
  nachAbschluss: "Übergaben lassen sich weiterhin vermerken, korrigieren und tauschen.",
} as const;

const KNOPF =
  "rounded-md border border-border bg-card px-2 py-0.5 text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
const KNOPF_KRITISCH =
  "rounded-md border border-credo-rot/40 bg-card px-2 py-0.5 text-xs text-credo-rot hover:bg-credo-rot/10 disabled:cursor-not-allowed disabled:opacity-50";
const KNOPF_VERMERKEN =
  "rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";

/** Sichtbarer Text eines Knopfs, dahinter der Bezug nur fuer Screenreader („Tauschen… Dienst-iPad FES-0412“). */
function MitBezug({ text, bezug }: { text: string; bezug: string }) {
  return (
    <>
      {text}
      <span className="sr-only">{` ${bezug}`}</span>
    </>
  );
}

/**
 * Zeigt die Karte Ausgaben-Felder? Dann gilt der Satz „nur noch lesbar“ eines
 * abgeschlossenen Vorgangs fuer die Ausgaben nicht (G7).
 */
export function hatAusgabenFelder(u: Pick<AusstattungsUebersicht, "gruppen"> | null | undefined): boolean {
  return (u?.gruppen ?? []).some((g) => g.zeilen.some((z) => z.aufgaben.some((a) => a.ausgaben !== undefined)));
}

interface StueckProps {
  stueck: AusgabeStand;
  aufgabe: AusstattungsAufgabeStand;
  bezug: string;
  stelleName: string;
  bearbeitbar: boolean;
  sendet: boolean;
  onDialog: (anfrage: AusgabenDialogAnfrage) => void;
}

function Stueck({ stueck, aufgabe, bezug, stelleName, bearbeitbar, sendet, onDialog }: StueckProps) {
  const sperrId = useId();
  const texte = artTexte(aufgabe.ausgabeArt);
  const a = stueck.aktionen;
  const bezugStueck = [bezug, stueck.kennung].filter(Boolean).join(" ");
  const oeffnen = (art: StueckDialogArt) => onDialog({ art, aufgabe, stueck, bezug, stelleName });
  const knoepfe: { art: StueckDialogArt; text: string; kritisch?: boolean }[] =
    bearbeitbar
      ? [
          ...(a.korrigieren ? [{ art: "korrigieren" as const, text: AUSGABEN_ZEILE_TEXTE.korrigieren }] : []),
          ...(a.tauschen ? [{ art: "tauschen" as const, text: AUSGABEN_ZEILE_TEXTE.tauschen }] : []),
          ...(a.zurueckgenommen ? [{ art: "zurueckgenommen" as const, text: `${texte.zuruecknehmen}…` }] : []),
          ...(a.entfernen ? [{ art: "entfernen" as const, text: AUSGABEN_ZEILE_TEXTE.entfernen, kritisch: true }] : []),
        ]
      : [];
  const sperrGrund = bearbeitbar ? stueck.sperrGrund : null;

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-muted px-2.5 py-1.5"
      data-ausgabe={stueck.id}
      data-ausgabe-zustand={stueck.zustand}
    >
      <span className={`min-w-0 break-words text-xs ${stueck.aktiv ? "text-foreground" : "text-muted-foreground"}`}>
        {stueck.text}
      </span>
      {knoepfe.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {knoepfe.map((k) => (
            <button
              key={k.art}
              type="button"
              className={k.kritisch ? KNOPF_KRITISCH : KNOPF}
              disabled={sendet}
              onClick={() => oeffnen(k.art)}
            >
              <MitBezug text={k.text} bezug={bezugStueck} />
            </button>
          ))}
        </span>
      )}
      {sperrGrund && (
        <span id={sperrId} className="w-full text-xs text-muted-foreground" data-ausgabe-sperrgrund>
          {sperrGrund}
        </span>
      )}
    </li>
  );
}

export interface AusgabenZeileProps {
  /** Die Aufgabe mit ihren Ausgabe-Feldern (`AusgabenAufgabeAnzeige`); ohne sie zeichnet der Baustein nichts. */
  aufgabe: AusstattungsAufgabeStand;
  /** Bezeichnung des Stuecks („Schlüssel: Haupteingang“, `ausgabeBezeichnung`). */
  bezug: string;
  /** Ausgebende Stelle (Untertitel der Dialoge). */
  stelleName: string;
  /** Aktionen anbieten (Recht, `ausgabenBearbeitbar`, Aktion der Seite). */
  bearbeitbar: boolean;
  sendet: boolean;
  onDialog: (anfrage: AusgabenDialogAnfrage) => void;
}

export function AusgabenZeile({ aufgabe, bezug, stelleName, bearbeitbar, sendet, onDialog }: AusgabenZeileProps) {
  if (!aufgabe.ausgaben) return null;
  const stuecke = aufgabe.ausgaben;
  const hinweis = aufgabe.ausgabenHinweis ?? null;
  const vermerken = bearbeitbar && aufgabe.vermerken === true;
  if (stuecke.length === 0 && !hinweis && !vermerken) return null;
  const texte = artTexte(aufgabe.ausgabeArt);

  return (
    <div className="mt-1.5 space-y-1.5" data-ausgaben={aufgabe.checklistItemId}>
      {stuecke.length > 0 && (
        <ul className="space-y-1" aria-label={AUSGABEN_ZEILE_TEXTE.liste(bezug)}>
          {stuecke.map((s) => (
            <Stueck
              key={s.id}
              stueck={s}
              aufgabe={aufgabe}
              bezug={bezug}
              stelleName={stelleName}
              bearbeitbar={bearbeitbar}
              sendet={sendet}
              onDialog={onDialog}
            />
          ))}
        </ul>
      )}
      {(hinweis || vermerken) && (
        <div className="flex flex-wrap items-center gap-2">
          {hinweis &&
            (hinweis.ton === "gelb" ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-credo-gelb/50 bg-credo-gelb/10 px-2 py-0.5 text-xs font-medium text-foreground"
                data-ausgaben-hinweis="gelb"
              >
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {hinweis.text}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground" data-ausgaben-hinweis="grau">
                {hinweis.text}
              </span>
            ))}
          {vermerken && (
            <button
              type="button"
              className={KNOPF_VERMERKEN}
              disabled={sendet}
              onClick={() => onDialog({ art: "vermerken", aufgabe, bezug, stelleName })}
            >
              <MitBezug text={`${texte.vermerken}…`} bezug={bezug} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** „Unterschriebenes Übergabeprotokoll: fehlt / hochgeladen am …“ — nur mit Text (G19). */
export function ProtokollZeile({ protokoll }: { protokoll: ProtokollAnzeige | null | undefined }) {
  if (!protokoll?.text) return null;
  const fehlt = !protokoll.hochgeladenAm;
  return (
    <p
      className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-foreground ${
        fehlt ? "border-credo-gelb/50 bg-credo-gelb/10" : "border-border bg-muted"
      }`}
      data-protokoll={fehlt ? "fehlt" : "hochgeladen"}
    >
      {fehlt ? (
        <FileWarning className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <FileCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{protokoll.text}</span>
    </p>
  );
}
