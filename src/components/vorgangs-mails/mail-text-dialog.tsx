"use client";

/**
 * Dialog „E-Mail ansehen“: der Text einer protokollierten Mail, so wie er
 * hinausging — mit ersetzten persoenlichen Links (src/lib/mail-text-archiv.ts).
 *
 * Gemeinsam fuer den Reiter „E-Mails“ eines Vorgangs und Einstellungen →
 * Versandprotokoll; beide geben nur die Adresse der Textroute mit. Der Text
 * wird erst beim Oeffnen geladen, nie mit der Liste.
 *
 * Die Mail steht in einem Rahmen ohne jede Berechtigung (`sandbox=""`: keine
 * Skripte, kein Zugriff auf das Portal, keine Formulare) und mit eigener CSP;
 * der Server hat sie vorher von aktiven Inhalten und klickbaren Adressen
 * befreit (htmlFuerAnsicht). Nie `dangerouslySetInnerHTML`.
 *
 * Der Client rechnet nichts: Kopfzeilen, Ansicht, abgeleiteter Text und die
 * Hinweissaetze kommen fertig vom Server (MailTextAntwort).
 */

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Hinweis } from "@/components/ui/hinweis";
import { Segment } from "@/components/ui/segment";
import { Skelett } from "@/components/ui/skelett";
import { formatZeitpunktDE } from "@/lib/format";
import { MAIL_TEXT_MELDUNGEN } from "@/lib/mail-text-archiv";
import type { MailTextAntwort } from "@/lib/mail-text-dienst";

type Stand =
  | { art: "laedt" }
  | { art: "fehler"; text: string }
  | { art: "da"; daten: MailTextAntwort };

type Darstellung = "ansicht" | "text";

const DARSTELLUNGEN = [
  { wert: "ansicht", text: "Ansicht" },
  { wert: "text", text: "Nur Text" },
] as const;

export interface MailTextDialogProps {
  /** Adresse der Textroute der Mail; `null` = Dialog geschlossen. */
  quelle: string | null;
  onSchliessen: () => void;
}

export function MailTextDialog({ quelle, onSchliessen }: MailTextDialogProps) {
  const [stand, setStand] = useState<Stand>({ art: "laedt" });
  const [darstellung, setDarstellung] = useState<Darstellung>("ansicht");
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    if (!quelle) return;
    let abgebrochen = false;
    setStand({ art: "laedt" });
    setDarstellung("ansicht");

    (async () => {
      try {
        const res = await fetch(quelle, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? MAIL_TEXT_MELDUNGEN.nichtGefunden
              : typeof json.error === "string"
                ? json.error
                : MAIL_TEXT_MELDUNGEN.ladefehler,
          );
        }
        if (!abgebrochen) setStand({ art: "da", daten: json as MailTextAntwort });
      } catch (e) {
        if (!abgebrochen) {
          setStand({ art: "fehler", text: e instanceof Error ? e.message : MAIL_TEXT_MELDUNGEN.ladefehler });
        }
      }
    })();

    return () => {
      abgebrochen = true;
    };
  }, [quelle, versuch]);

  const daten = stand.art === "da" ? stand.daten : null;

  return (
    <Dialog
      offen={quelle !== null}
      onSchliessen={onSchliessen}
      titel="E-Mail ansehen"
      beschreibung={
        daten ? `${daten.kopf.ereignisName} · ${daten.kopf.statusText} am ${formatZeitpunktDE(daten.kopf.zeitpunkt)}` : undefined
      }
      breite="lg"
      name="mail-text"
    >
      {stand.art === "laedt" && <Skelett art="gruppe" zeilen={4} label="Text der E-Mail wird geladen" />}

      {stand.art === "fehler" && (
        <Hinweis
          ton="critical"
          ebene={3}
          ansagen
          titel={stand.text}
          aktion={
            <Button groesse="sm" onClick={() => setVersuch((v) => v + 1)}>
              Erneut versuchen
            </Button>
          }
        />
      )}

      {daten && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <Kopfzeile name="An" wert={daten.kopf.empfaenger} />
            <Kopfzeile name="CC" wert={daten.kopf.cc} />
            <Kopfzeile name="BCC" wert={daten.kopf.bcc} />
            <Kopfzeile name="Betreff" wert={daten.kopf.betreff} />
          </dl>

          {daten.hinweis && <Hinweis ton="wait" ebene={3} titel={MAIL_TEXT_MELDUNGEN.nichtZugestelltTitel}>{daten.hinweis}</Hinweis>}
          <Hinweis ton="info" ebene={3} titel={MAIL_TEXT_MELDUNGEN.zugangslinksTitel}>
            {daten.linkHinweis}
          </Hinweis>
          {daten.gekuerzt && <Hinweis ton="info" ebene={3} titel={MAIL_TEXT_MELDUNGEN.gekuerzt} />}

          <Segment label="Darstellung" wert={darstellung} onWechsel={setDarstellung} optionen={DARSTELLUNGEN} />

          {darstellung === "ansicht" ? (
            <iframe
              title="Text der E-Mail"
              sandbox=""
              srcDoc={daten.html}
              referrerPolicy="no-referrer"
              className="h-[26rem] w-full rounded-lg border border-hairline bg-card"
            />
          ) : (
            <pre className="max-h-[26rem] overflow-auto rounded-lg border border-hairline bg-card p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink wrap-break-word">
              {daten.text}
            </pre>
          )}
        </>
      )}
    </Dialog>
  );
}

function Kopfzeile({ name, wert }: { name: string; wert: string | null }) {
  if (!wert) return null;
  return (
    <>
      <dt className="text-ink-2">{name}</dt>
      <dd className="min-w-0 wrap-anywhere text-ink">{wert}</dd>
    </>
  );
}

/**
 * Knopf „Text ansehen“ — gemeinsam fuer beide Orte. Oeffnet NICHTS selbst;
 * der Aufrufer haelt den Zustand und gibt der Dialogkomponente die Adresse.
 */
export function TextAnsehenKnopf({ onClick }: { onClick: () => void }) {
  return (
    <Button groesse="sm" onClick={onClick}>
      <Eye aria-hidden="true" className="h-3.5 w-3.5" />
      Text ansehen
    </Button>
  );
}
