"use client";

/**
 * Neue Detailseite Vertragsende: die Dialoge der Handlungen (UX-Umbau, Pilot)
 *
 * EIN Dialog zur Zeit; welcher, entscheidet die Seite (`detail.tsx`). Sie
 * haengt ihn je Oeffnen neu ein (`key`), damit Eingabe, Fehler und Sperre
 * jedes Mal frisch beginnen — und laesst ihn beim Schliessen eingehaengt
 * (`offen = false`), damit Radix ihn ordentlich schliesst und der Fokus
 * zurueckfindet.
 *
 * Regeln:
 *   - Jeder Dialog ruft genau EINEN Aufruf aus `aufrufe.ts` (dieselben wie die
 *     alte Ansicht). Waehrend er laeuft, ist der Dialog gesperrt; ein Fehler
 *     der Route steht im Dialog, und der Dialog bleibt offen. Erst ein Erfolg
 *     schliesst ihn (`onErledigt` mit dem Satz fuer die Meldung — die Seite
 *     schliesst, meldet und laedt neu). Ein Fehler MIT `mailStatus` (die
 *     Anfrage ging nicht hinaus, der neue Link ist trotzdem gespeichert, ein
 *     frueherer tot) laesst den Dialog ebenso offen, aber die Seite laedt
 *     dahinter still neu (`onGeaendert`) — sonst zeigte sie einen Stand, den
 *     es nicht mehr gibt. Ein neuer Versuch im selben Dialog geht. Was die
 *     Rueckfrage ueber den bisherigen Link sagt, haengt am Stand beim Oeffnen
 *     und aendert sich nur EINMAL, zugleich mit der Meldung: auf „gilt bereits
 *     nicht mehr" — nicht mit dem neu geladenen Vorgang, waehrend die Meldung
 *     gelesen wird. Bei Erfolg nennt die Meldung, ob ein Webhook statt der Portal-Mail
 *     uebernahm (`anfrageMeldung`). Auch ein Formatfehler der Adresse geht
 *     an den Dialog (`fehler`): Nur so bekommt er den Fokus und wird angesagt,
 *     auch nach Enter im Feld. Sichtbar steht er nur DORT; das Feld traegt
 *     `aria-invalid`, aber keinen zweiten Fehlertext. Der Dialog sagt nur
 *     einen NEUEN Fehler an — deshalb wird der Fehler vor jeder Wiederholung
 *     erst geleert und gezeichnet (`flushSync`), dann neu gesetzt.
 *   - Ersatzziel fuer den Fokus ist der Seitentitel: Der ausloesende Knopf
 *     verschwindet nach der Handlung oft (der Vorgang steht dann woanders).
 *   - Texte ohne Anrede. Jede Rueckfrage sagt die Folge, die die Routen
 *     wirklich haben — nicht mehr und nicht weniger. „Der Link wird ungueltig"
 *     nur, solange die Fuehrungskraft antworten kann
 *     (`fuehrungskraftKannAntworten`, mit demselben `jetzt` wie Pille und
 *     Leiste) — ein abgelaufener Link wird durch nichts mehr ungueltig.
 *   - Beim Oeffnen liegt der Fokus auf „Abbrechen" (Regel des Dialogs). Nur
 *     die erste Anfrage setzt ihn ins Adressfeld: Dort ist die Eingabe die
 *     Arbeit. „Anfrage neu senden" ist zuerst eine Rueckfrage — ein schnelles
 *     Enter im vorbelegten Feld machte sonst den bisherigen Link ungueltig.
 */
import { useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { BestaetigungsDialog, Dialog } from "@/components/ui/dialog";
import { SEITENTITEL_ID } from "@/components/ui/seitenkopf";
import { Textfeld } from "@/components/ui/textfeld";
import { Textverweis } from "@/components/ui/textverweis";
import { vorgangPfad } from "@/lib/adressen";
import { formatDatumDE } from "@/lib/format";
import { fuehrungskraftKannAntworten, mavOffen } from "@/lib/prozess/vertragsende";
import { anfrageMeldung, aufrufen, textFeld, vertragsendeAufruf, type Aufruf } from "./aufrufe";
import { MAV_AUSWAHL, anzeigeName, type VertragsendeDetail } from "./typen";

export type DialogArt =
  | "anfrage-senden"
  | "anfrage-neu-senden"
  | "offboarding-anlegen"
  | "vertrag-erfassen"
  | "abschliessen"
  | "stornieren"
  | "mav-setzen";

export interface VertragsendeDialogProps {
  art: DialogArt;
  offen: boolean;
  vorgang: VertragsendeDetail;
  /** Derselbe Zeitpunkt, mit dem die Seite Pille und Leiste rechnet. */
  jetzt: Date;
  /** „Abbrechen", Escape, Kreuz — nie waehrend ein Aufruf laeuft. */
  onSchliessen: () => void;
  /** Der Aufruf ist gelungen: Die Seite schliesst, meldet `meldung` und laedt neu. */
  onErledigt: (meldung: string) => void;
  /**
   * Der Aufruf ist gescheitert, die Route hat aber gespeichert (Fehler mit
   * `mailStatus`): Die Seite laedt still neu — ohne den Dialog zu schliessen
   * und ohne sich zu sperren.
   */
  onGeaendert: () => void;
}

/** Der eine Dialog zur gewaehlten Handlung. */
export function VertragsendeDialog(props: VertragsendeDialogProps) {
  switch (props.art) {
    case "anfrage-senden":
    case "anfrage-neu-senden":
      return <AnfrageDialog {...props} neu={props.art === "anfrage-neu-senden"} />;
    case "mav-setzen":
      return <MavDialog {...props} />;
    default:
      return <RueckfrageDialog {...props} art={props.art} />;
  }
}

// =============================================
// Gemeinsam
// =============================================

/**
 * Fuehrt einen Aufruf aus und haelt Sperre und Fehler des Dialogs. Ein
 * zweiter Aufruf, waehrend der erste laeuft, faellt still weg (der Knopf ist
 * dann ohnehin gesperrt; der Merker faengt auch ein Enter im Feld ab).
 * Ein Fehler mit `mailStatus` meldet zusaetzlich `onGeaendert` (siehe Kopf).
 */
function useAusfuehren(onErledigt: (meldung: string) => void, onGeaendert: () => void) {
  const [gesperrt, setGesperrt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const laeuft = useRef(false);

  async function ausfuehren(aufruf: Aufruf, meldung: (daten: unknown, mailStatus: string | undefined) => string) {
    if (laeuft.current) return;
    laeuft.current = true;
    setGesperrt(true);
    // Erst leeren: Derselbe Fehler noch einmal gilt dem Dialog dann als neu
    // und bekommt wieder den Fokus.
    setFehler(null);
    const ergebnis = await aufrufen(aufruf);
    laeuft.current = false;
    setGesperrt(false);
    if (ergebnis.ok) {
      onErledigt(meldung(ergebnis.daten, ergebnis.mailStatus));
      return;
    }
    setFehler(ergebnis.fehler);
    // Gespeichert, nur die Mail ging nicht hinaus: Der Stand hinter dem
    // Dialog stimmt nicht mehr. Der Dialog bleibt offen und bedienbar.
    // Im selben Takt wie `setFehler`, damit ein Dialog, der dazu etwas
    // anzeigt, zugleich mit der Meldung zeichnet.
    if (ergebnis.mailStatus) onGeaendert();
  }

  /** Ein Fehler der Route gilt nicht mehr (etwa, weil ein neuer Versuch schon vorher scheitert). */
  const fehlerLeeren = () => setFehler(null);

  return { gesperrt, fehler, ausfuehren, fehlerLeeren };
}

/** Der Formatfehler der Adresse (nur das Offensichtliche, siehe `senden`). */
const ADRESS_FORMATFEHLER = "Das ist keine E-Mail-Adresse.";

// =============================================
// Anfrage senden / neu senden
// =============================================

function AnfrageDialog({
  offen,
  vorgang,
  jetzt,
  onSchliessen,
  onErledigt,
  onGeaendert,
  neu,
}: VertragsendeDialogProps & { neu: boolean }) {
  // Ein Versuch dieses Dialogs hat gespeichert, ohne dass die Mail hinausging
  // (nur hier gelesen: nur die Anfrage kennt dieses Ergebnis).
  const [gespeichertOhneMail, setGespeichertOhneMail] = useState(false);
  const { gesperrt, fehler, ausfuehren, fehlerLeeren } = useAusfuehren(onErledigt, () => {
    setGespeichertOhneMail(true);
    onGeaendert();
  });
  const [adresse, setAdresse] = useState(vorgang.supervisorEmail ?? "");
  const [adressFehler, setAdressFehler] = useState("");
  const wert = adresse.trim();
  // „Neu senden" gibt es mit gueltigem Link (Menue) und mit abgelaufenem
  // („Jetzt dran"); nur im ersten Fall wird der bisherige ungueltig. Stand
  // beim Oeffnen, NICHT aus dem neu geladenen Vorgang: Geht die Anfrage nicht
  // hinaus, laedt die Seite dahinter neu (`onGeaendert`), und der Text
  // spraenge sonst auf „bereits abgelaufen" — falsch, der bisherige Link ist
  // ersetzt, nicht abgelaufen. Stattdessen sagt der Text ab diesem
  // Fehlschlag, was die Meldung der Route darunter sagt: Der bisherige gilt
  // schon nicht mehr (`gespeichertOhneMail`, zugleich mit der Meldung).
  const [linkGilt] = useState(() => fuehrungskraftKannAntworten(vorgang, jetzt));
  const bisherigerLink = gespeichertOhneMail
    ? "der bisherige gilt bereits nicht mehr"
    : linkGilt
      ? "der bisherige wird ungültig"
      : "der bisherige ist bereits abgelaufen";

  function senden(e?: FormEvent) {
    e?.preventDefault();
    if (!wert || gesperrt) return;
    // Nur das Offensichtliche; das Format prueft die Route ohnehin (400 mit Text).
    // Der Fehler steht EINMAL sichtbar im Dialog, der ihm den Fokus gibt und
    // ihn ansagt; das Feld traegt nur `aria-invalid`. Ein alter Fehler der
    // Route gilt dann nicht mehr — er kaeme sonst beim Tippen wieder hoch und
    // zoege den Fokus mit.
    if (!wert.includes("@")) {
      // Erst leeren UND zeichnen: Derselbe Text noch einmal waere fuer den
      // Dialog kein neuer Fehler — kein Fokus, keine Ansage, und wer Enter
      // drueckt, hoerte nichts. Zwei getrennte Durchgaenge machen ihn neu.
      flushSync(() => {
        fehlerLeeren();
        setAdressFehler("");
      });
      setAdressFehler(ADRESS_FORMATFEHLER);
      return;
    }
    void ausfuehren(vertragsendeAufruf("anfrage-senden", vorgang.id, { supervisorEmail: wert }), (daten, mailStatus) =>
      anfrageMeldung(textFeld(daten, "supervisorEmail") ?? wert, neu, mailStatus),
    );
  }

  return (
    <Dialog
      offen={offen}
      onSchliessen={onSchliessen}
      name={neu ? "anfrage-neu-senden" : "anfrage-senden"}
      rolle={neu ? "alertdialog" : "dialog"}
      titel={neu ? "Anfrage neu senden?" : "Anfrage an die Führungskraft senden"}
      beschreibung={
        neu
          ? // Bewusst NICHT der Satz der alten Ansicht („setzt begonnene Eingaben
            // zurück"): `/supervisor-link` legt die Vertragsdaten per `upsert`
            // ohne Aenderung an, das Formular fuellt sie wieder vor. Zurueck
            // auf null gehen Erinnerungen und die Vorstand-Abstimmung.
            `Die Führungskraft bekommt einen neuen Link; ${bisherigerLink}. Erinnerungen beginnen von vorn, und der Vermerk zur Abstimmung mit Vorstand oder Geschäftsführung wird zurückgesetzt. Die übrigen bereits gespeicherten Eingaben im Formular bleiben erhalten.`
          : "Die Führungskraft bekommt per E-Mail einen Link zum Formular. Darin entscheidet sie über die Weiterbeschäftigung und erfasst bei einer Übernahme die Vertragsdaten."
      }
      gesperrt={gesperrt}
      fehler={adressFehler || fehler}
      fokusZiel={SEITENTITEL_ID}
      bestaetigen={{
        text: neu ? "Anfrage neu senden" : "Anfrage senden",
        onClick: () => senden(),
        sperrGrund: wert ? null : "Bitte die E-Mail-Adresse der Führungskraft eintragen.",
        laeuftText: "Wird gesendet …",
      }}
    >
      {/* Ein Formular, damit Enter im Feld sendet; `noValidate`, weil die
          Pruefung des Browsers ihre eigene Blase zeigte. */}
      <form noValidate onSubmit={senden}>
        <Textfeld
          label="E-Mail der Führungskraft"
          type="email"
          autoComplete="off"
          {...(neu ? {} : { "data-autofokus": "" })}
          value={adresse}
          readOnly={gesperrt}
          // Kein `fehler` am Feld: Der Text steht schon im Dialog (siehe oben).
          // Dessen Fehlerzeile hat keine Kennung, auf die `aria-describedby`
          // zeigen koennte — sie bekommt dafuer den Fokus und wird angesagt.
          aria-invalid={adressFehler ? true : undefined}
          onChange={(e) => {
            setAdresse(e.target.value);
            setAdressFehler("");
          }}
        />
      </form>
    </Dialog>
  );
}

// =============================================
// Rueckfragen
// =============================================

type RueckfrageArt = "offboarding-anlegen" | "vertrag-erfassen" | "abschliessen" | "stornieren";

function RueckfrageDialog({
  art,
  offen,
  vorgang,
  jetzt,
  onSchliessen,
  onErledigt,
  onGeaendert,
}: VertragsendeDialogProps & { art: RueckfrageArt }) {
  const { gesperrt, fehler, ausfuehren } = useAusfuehren(onErledigt, onGeaendert);
  const gemeinsam = {
    offen,
    onAbbrechen: onSchliessen,
    gesperrt,
    fehler,
    fokusZiel: SEITENTITEL_ID,
    name: art,
  };
  // Nach einem Offboarding oder einer Stornierung lehnt das Formular
  // (`/api/vertrag-formular/[token]`) ab, und der Erinnerungslauf laesst den
  // Vorgang aus — das zu sagen lohnt nur, solange der Link noch gilt.
  const linkEntfaellt = fuehrungskraftKannAntworten(vorgang, jetzt);

  switch (art) {
    case "offboarding-anlegen":
      return (
        <BestaetigungsDialog
          {...gemeinsam}
          variante="critical"
          titel="Offboarding anlegen?"
          bestaetigenText="Offboarding anlegen"
          laeuftText="Wird angelegt …"
          onBestaetigen={() =>
            void ausfuehren(vertragsendeAufruf("offboarding-anlegen", vorgang.id), (daten) => {
              const nummer = textFeld(daten, "offboarding", "displayId");
              return nummer ? `Offboarding ${nummer} angelegt.` : "Offboarding angelegt.";
            })
          }
        >
          <p>
            Für {anzeigeName(vorgang)} startet ein neuer Offboarding-Vorgang (Befristungsende) mit dem letzten
            Arbeitstag {formatDatumDE(vorgang.contractEndDate)}. Dieser Vorgang steht danach auf „Keine Übernahme“.
            {linkEntfaellt && " Der Link der Führungskraft wird damit ungültig."}
          </p>
        </BestaetigungsDialog>
      );

    case "vertrag-erfassen":
      return (
        <BestaetigungsDialog
          {...gemeinsam}
          titel="Unterschriebener Vertrag liegt vor?"
          bestaetigenText="Vertrag erfassen"
          laeuftText="Wird erfasst …"
          onBestaetigen={() =>
            void ausfuehren(vertragsendeAufruf("vertrag-erfassen", vorgang.id), () => "Unterschriebener Vertrag erfasst.")
          }
        >
          <p>
            Der Vorgang steht danach auf „Vertrag unterschrieben“, der heutige Tag wird als Rücklauf vermerkt. Damit
            entfällt die Warnung zum Entfristungsrisiko.
          </p>
        </BestaetigungsDialog>
      );

    case "abschliessen": {
      // Offene Punkte nennen, nicht sperren: Die Route laesst den Abschluss
      // ohne MAV-Stand und ohne Vertrag zu (Feinplan 3.3, „MAV ist ein Hinweis").
      const offenePunkte: string[] = [];
      if (vorgang.decision !== "OFFEN" && mavOffen(vorgang)) {
        offenePunkte.push("Der Stand der Mitarbeitervertretung ist noch offen.");
      }
      if (vorgang.decision === "UEBERNAHME" && !vorgang.contractSignedReturnedAt) {
        offenePunkte.push("Es ist kein unterschriebener Vertrag erfasst.");
      }
      return (
        <BestaetigungsDialog
          {...gemeinsam}
          titel="Vorgang abschließen?"
          bestaetigenText="Abschließen"
          laeuftText="Wird abgeschlossen …"
          onBestaetigen={() =>
            void ausfuehren(vertragsendeAufruf("abschliessen", vorgang.id), () => "Vorgang abgeschlossen.")
          }
        >
          <div className="space-y-2">
            <p>Der Vorgang wird beendet und lässt sich danach nicht wieder öffnen.</p>
            {offenePunkte.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {offenePunkte.map((punkt) => (
                  <li key={punkt}>{punkt}</li>
                ))}
              </ul>
            )}
            {vorgang.offboarding && (
              <p>
                <Textverweis href={vorgangPfad("offboarding", vorgang.offboarding.id)}>
                  Zum Offboarding {vorgang.offboarding.displayId}
                </Textverweis>
              </p>
            )}
          </div>
        </BestaetigungsDialog>
      );
    }

    case "stornieren":
      return (
        <BestaetigungsDialog
          {...gemeinsam}
          variante="critical"
          titel="Vorgang stornieren?"
          bestaetigenText="Stornieren"
          laeuftText="Wird storniert …"
          onBestaetigen={() =>
            void ausfuehren(vertragsendeAufruf("stornieren", vorgang.id), () => "Vorgang storniert.")
          }
        >
          <p>
            Der Vorgang wird ohne Ergebnis beendet und lässt sich danach nicht wieder öffnen.
            {linkEntfaellt && " Der Link der Führungskraft wird damit ungültig, Erinnerungen entfallen."}
            {/* Die Route aendert nur den Status; ein verknuepftes Offboarding laeuft weiter. */}
            {vorgang.offboarding && ` Das Offboarding ${vorgang.offboarding.displayId} bleibt bestehen.`}
          </p>
        </BestaetigungsDialog>
      );
  }
}

// =============================================
// Stand der Mitarbeitervertretung
// =============================================

function MavDialog({ offen, vorgang, onSchliessen, onErledigt, onGeaendert }: VertragsendeDialogProps) {
  const { gesperrt, fehler, ausfuehren } = useAusfuehren(onErledigt, onGeaendert);
  const gruppenName = useId();
  // „Ausstehend" steht nicht zur Wahl (setzt niemand von Hand) — dann ohne Vorauswahl.
  const vorwahl = MAV_AUSWAHL.find((o) => o.wert === vorgang.mavStatus)?.wert ?? "";
  const [wahl, setWahl] = useState(vorwahl);
  // Der Fokus geht auf die gewaehlte Moeglichkeit, sonst auf die erste: Die
  // Pfeiltasten waehlen dann sofort.
  const fokusWert = vorwahl || MAV_AUSWAHL[0]?.wert;

  return (
    <Dialog
      offen={offen}
      onSchliessen={onSchliessen}
      name="mav-setzen"
      titel="Stand der Mitarbeitervertretung"
      beschreibung="Beteiligung der Mitarbeitervertretung vor dem Vollzug (MVG-EKD/MAVO). Trifft sie für die Einrichtung nicht zu: „Nicht erforderlich“."
      gesperrt={gesperrt}
      fehler={fehler}
      fokusZiel={SEITENTITEL_ID}
      bestaetigen={{
        text: "Stand speichern",
        laeuftText: "Wird gespeichert …",
        sperrGrund: wahl ? null : "Bitte einen Stand wählen.",
        onClick: () => {
          if (!wahl) return;
          void ausfuehren(
            vertragsendeAufruf("mav-setzen", vorgang.id, { mavStatus: wahl }),
            () => "Stand der Mitarbeitervertretung gespeichert.",
          );
        },
      }}
    >
      {/* Kein `disabled` am fieldset, solange gespeichert wird: Ein gesperrtes
          Feld verliert den Fokus, und der fiele aus dem Dialog. Die Wahl
          haelt stattdessen still. */}
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Stand</legend>
        <div className="mt-2 space-y-1">
          {MAV_AUSWAHL.map((moeglichkeit) => (
            <label
              key={moeglichkeit.wert}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-neutral-soft"
            >
              <input
                type="radio"
                name={gruppenName}
                value={moeglichkeit.wert}
                checked={wahl === moeglichkeit.wert}
                onChange={() => {
                  if (!gesperrt) setWahl(moeglichkeit.wert);
                }}
                {...(moeglichkeit.wert === fokusWert ? { "data-autofokus": "" } : {})}
                className="h-4 w-4 shrink-0 accent-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              />
              <span>{moeglichkeit.text}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </Dialog>
  );
}
