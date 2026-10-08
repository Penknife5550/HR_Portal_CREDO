"use client";

/**
 * Neue Detailseite eines Vertragsende-Vorgangs (UX-Umbau „Klarer Weg", Pilot)
 *
 * Von oben nach unten: Seitenkopf (Name, Einrichtung, Nummer, eine
 * Statuspille, Menue „…"), Prozessleiste mit „Jetzt dran", die Hinweise und
 * die Reiter Übersicht · Vertragsdaten · Dokumente · E-Mails.
 *
 * Regeln:
 *   - Die Seite RECHNET nichts selbst. Schritte, „Jetzt dran", Pille, Menue
 *     und Hinweise kommen aus den reinen Adaptern (`src/lib/prozess/
 *     vertragsende.ts`, `vertragsende-hinweise.ts`), die Aufrufe aus
 *     `aufrufe.ts` (dieselben wie die alte Ansicht). Hier wird nur aus
 *     Schluesseln ein Knopf, ein Menuepunkt oder ein Dialog.
 *   - Jede Handlung hat GENAU einen Ort: als Knopf in „Jetzt dran" oder als
 *     Punkt im Menue des Kopfs. Knoepfe, Menue, „Stand setzen …" und Dialoge
 *     nur mit Bearbeitungsrecht UND aktuellem Stand (`handlungenFrei`); ohne
 *     Recht ist die Seite reines Lesen (und ohne Reiter „E-Mails").
 *   - „Erinnerung senden" laeuft ohne Rueckfrage (der bestehende Link bleibt,
 *     nichts geht verloren); alles andere fragt in einem Dialog
 *     (`dialoge.tsx`).
 *   - Nach einer Handlung ist die Seite `beschaeftigt`, bis der neue Stand da
 *     ist — waehrend die Erinnerung laeuft und waehrend des stillen
 *     Neuladens nach einem Dialog. Bis dahin zeigt sie den ALTEN Stand, und
 *     jede Handlung darauf ginge von ihm aus (ein zweites „Anfrage senden …"
 *     schickte eine zweite Mail und machte den ersten Link ungueltig). Darum
 *     sind dann Knoepfe, Menuepunkte und „Stand setzen …" gesperrt — sichtbar
 *     und fokussierbar (`aria-disabled`), damit der Fokus, den der Dialog an
 *     seinen Ausloeser zurueckgibt, nicht auf `body` faellt —, und ein Dialog
 *     geht nicht auf. Frei bleiben nur reine Verweise („Zu den Dokumenten",
 *     „Zum Offboarding"): Sie aendern nichts.
 *   - Ging die Mail nicht hinaus (Antwort mit `mailStatus`, siehe
 *     `aufrufe.ts`), hat die Route trotzdem gespeichert. Die Erinnerung meldet
 *     den Fehler der Route und laedt neu wie nach jedem Versuch; der Dialog
 *     „Anfrage senden" bleibt offen, und die Seite laedt dahinter still neu
 *     (`dialogGeaendert`) — `beschaeftigt` erst, wenn der Dialog vor dem Ende
 *     dieses Ladens schliesst (`dialogAbbrechen`). Ein Webhook statt
 *     der Portal-Mail steht in der Meldung (`anfrageMeldung`,
 *     `erinnerungMeldung`).
 *   - Laden: beim ersten Mal ein Skelett, danach — nach jeder Handlung — still
 *     im Hintergrund: Die alten Daten bleiben stehen, bis die neuen da sind.
 *     Eine veraltete Antwort (zwei Ladevorgaenge kurz nacheinander) wird
 *     verworfen. Scheitert das Neuladen, bleibt der alte Stand lesbar, aber
 *     nicht bedienbar: Jede Handlung darauf ginge von einem Stand aus, den es
 *     so vielleicht nicht mehr gibt. Ein Hinweis ueber der Leiste sagt das und
 *     bietet „Neu laden" an. Ein geschlossener Dialog bleibt dabei eingehaengt
 *     (nur am Bearbeitungsrecht), damit Radix ihn ordentlich schliesst.
 *   - Genau EINE `h1` in jedem Zustand. Geladen ist es der Name im Seitenkopf.
 *     Beim Laden und nach einem Fehler ist der Name noch unbekannt; dann
 *     steht „Vertragsende" als `h1` nur fuer Screenreader da. Ein sichtbarer
 *     Ersatztitel wuerde beim Eintreffen der Daten umspringen, und im Fehlerfall
 *     sagt der Hinweis darunter alles Noetige.
 *   - Der gewaehlte Reiter steht in der Adresse (`?tab=…`), ohne die Seite neu
 *     zu laden — ein Verweis aus einer Mail oder aus dem Offboarding kann so
 *     direkt auf einen Reiter zeigen. Den Startwert liest die Ansicht beim
 *     Einhaengen aus der Adresse des Browsers (`useSearchParams`,
 *     `reiterAusSuche`), nicht aus einer Eigenschaft der Seite: Die kennt nur
 *     die Adresse ihres Server-Aufrufs — nach einem Reiterwechsel und
 *     Zurueck/Vor stuende dort noch der alte Reiter.
 *   - „Jetzt" ist je Zeichnen `new Date()`: Fristen, Pille, Hinweise und die
 *     Texte der Dialoge rechnen alle mit demselben Zeitpunkt.
 *
 * Feinplan: docs/module/ux-ui/pilot-feinplan.md, Abschnitte 3.4 bis 3.6.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { Button, type ButtonVariante } from "@/components/ui/button";
import { Hinweis } from "@/components/ui/hinweis";
import { Prozessleiste } from "@/components/ui/prozessleiste";
import { Reiter, ReiterInhalt } from "@/components/ui/reiter";
import { SEITENTITEL_ID, Seitenkopf, type MenuePunkt } from "@/components/ui/seitenkopf";
import { Skelett } from "@/components/ui/skelett";
import { Statuspille } from "@/components/ui/statuspille";
import { toast } from "@/components/ui/toast";
import { MailProtokoll } from "@/components/vorgangs-mails/mail-protokoll";
import { vorgangPfad, vorgangslistePfad } from "@/lib/adressen";
import { formatDatumDE } from "@/lib/format";
import {
  vertragsendeMenue,
  vertragsendePille,
  vertragsendeProzessStand,
  type VertragsendeAktion,
} from "@/lib/prozess/vertragsende";
import { vertragsendeHinweise } from "@/lib/prozess/vertragsende-hinweise";
import { aufrufen, erinnerungMeldung, vertragsendeAufruf } from "./aufrufe";
import { VertragsendeDialog, type DialogArt } from "./dialoge";
import { ReiterDokumente } from "./reiter-dokumente";
import { ReiterUebersicht } from "./reiter-uebersicht";
import { ReiterVertragsdaten } from "./reiter-vertragsdaten";
import {
  aktionText,
  anzeigeName,
  menueText,
  reiterAusSuche,
  vertragsendeReiter,
  type ReiterWert,
  type VertragsendeDetail,
} from "./typen";

/** Text, wenn die Route keinen eigenen Fehler nennt oder gar nicht antwortet. */
const LADEFEHLER_ERSATZ = "Verbindungsfehler.";

/** Handlungen, die nur woandershin fuehren — sie bleiben auch `beschaeftigt` frei. */
const NUR_VERWEIS: readonly VertragsendeAktion[] = ["dokumente", "zum-offboarding"];

type LadeErgebnis = { ok: true; vorgang: VertragsendeDetail } | { ok: false; fehler: string };

async function vorgangLaden(vorgangId: string): Promise<LadeErgebnis> {
  try {
    const res = await fetch(`/api/contract-end/${encodeURIComponent(vorgangId)}`, { cache: "no-store" });
    const daten: unknown = await res.json().catch(() => null);
    if (res.ok && daten && typeof daten === "object") return { ok: true, vorgang: daten as VertragsendeDetail };
    const fehler =
      daten && typeof daten === "object" && typeof (daten as { error?: unknown }).error === "string"
        ? (daten as { error: string }).error.trim()
        : "";
    return { ok: false, fehler: fehler || LADEFEHLER_ERSATZ };
  } catch {
    return { ok: false, fehler: LADEFEHLER_ERSATZ };
  }
}

/** Der offene Dialog. `nr` haengt ihn je Oeffnen neu ein (frischer Zustand). */
interface DialogZustand {
  art: DialogArt;
  offen: boolean;
  nr: number;
}

export interface VertragsendeDetailAnsichtProps {
  vorgangId: string;
  darfBearbeiten: boolean;
}

export function VertragsendeDetailAnsicht({ vorgangId, darfBearbeiten }: VertragsendeDetailAnsichtProps) {
  const router = useRouter();
  const suche = useSearchParams();
  const [vorgang, setVorgang] = useState<VertragsendeDetail | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  // Nur der Startwert kommt aus der Adresse; danach fuehrt die Ansicht den
  // Reiter selbst und schreibt ihn zurueck (`reiterWechseln`).
  const [reiter, setReiter] = useState<ReiterWert>(() => reiterAusSuche(suche.get("tab"), darfBearbeiten));
  const [dialog, setDialog] = useState<DialogZustand | null>(null);
  const [erinnertGerade, setErinnertGerade] = useState(false);
  // Ladevorgaenge nach einer Dialog-Handlung, auf deren Stand die Seite noch
  // wartet. Ein Zaehler, kein Merker: Zwei koennen sich ueberlappen (siehe
  // `dialogAbbrechen`), und das Ende des einen gaebe die Seite sonst frei,
  // waehrend das andere noch laeuft.
  const [wartetAufStand, setWartetAufStand] = useState(0);
  const aktualisiert = wartetAufStand > 0;
  // Das stille Laden nach einem Fehlschlag MIT `mailStatus`, solange es laeuft.
  const stillesLaden = useRef<Promise<void> | null>(null);
  const [neuLaedt, setNeuLaedt] = useState(false);
  // Zaehlt die abgeschlossenen Ladevorgaenge (Erfolg UND Fehler, ohne die
  // verworfenen) — der Takt der Fokuspruefung, siehe unten.
  const [ladeStand, setLadeStand] = useState(0);
  // Nummer des juengsten Ladevorgangs; aeltere Antworten werden verworfen.
  const ladeNr = useRef(0);
  // Nach dem naechsten Laden pruefen, ob der Fokus noch auf der Seite liegt.
  const fokusPruefen = useRef(false);

  // Handeln nur mit Recht und auf einem aktuellen Stand (siehe Kopf, „Laden"),
  // und nicht, solange die Seite noch auf den Stand nach der letzten Handlung
  // wartet (siehe Kopf, `beschaeftigt`).
  const handlungenFrei = darfBearbeiten && !ladeFehler;
  const beschaeftigt = erinnertGerade || aktualisiert;
  // Der Waechter von `dialogOeffnen` und `erinnern` liest den zuletzt
  // GEZEICHNETEN Stand, nicht den seiner Closure: Ein Handler kann seinen
  // Durchgang ueberleben (der Seitenkopf fuehrt einen Menuepunkt erst nach dem
  // Schliessen des Menues aus) und hielte sonst einen Stand fuer frei, der es
  // nicht mehr ist. Wer selbst sperrt, setzt den Merker sofort mit — so faengt
  // er auch einen zweiten Klick vor dem naechsten Zeichnen ab.
  const handelnGesperrt = useRef(true);
  // Ohne Abhaengigkeiten: nach JEDEM Zeichnen aus dem Zustand neu gerechnet.
  useLayoutEffect(() => {
    handelnGesperrt.current = !handlungenFrei || beschaeftigt;
  });

  /**
   * Laedt den Vorgang. Gelingt es, ersetzt er den alten; misslingt es, bleibt
   * der alte stehen, und `ladeFehler` sagt es: ohne Vorgang als Fehler der
   * Seite, mit Vorgang als Hinweis „nicht aktuell". Eine veraltete Antwort
   * aendert nichts — auch nicht `ladeStand`.
   */
  const laden = useCallback(async () => {
    const nr = ++ladeNr.current;
    const ergebnis = await vorgangLaden(vorgangId);
    if (nr !== ladeNr.current) return;
    setLadeStand((n) => n + 1);
    if (ergebnis.ok) {
      setVorgang(ergebnis.vorgang);
      setLadeFehler(null);
      return;
    }
    setLadeFehler(ergebnis.fehler);
  }, [vorgangId]);

  useEffect(() => {
    void laden();
    // Beim Aushaengen eine laufende Antwort verwerfen.
    return () => {
      ladeNr.current += 1;
    };
  }, [laden]);

  /**
   * Nach einer Handlung (und ueber „Neu laden"): still neu laden. Scheitert
   * es, bleibt der alte Stand stehen, und `ladeFehler` sperrt die Handlungen —
   * der Hinweis darueber ist die Meldung, ein Toast dazu waere doppelt.
   * Danach den Fokus pruefen (siehe `fokusPruefen`).
   */
  const neuLaden = useCallback(async () => {
    fokusPruefen.current = true;
    await laden();
  }, [laden]);

  // Der Knopf, der eine Handlung ausloeste, verschwindet oft mit dem neuen
  // Stand (der Vorgang steht dann woanders) — oder mit einem gescheiterten
  // Neuladen (die Handlungen sind dann gesperrt). Der Dialog gibt den Fokus
  // beim Schliessen noch an ihn zurueck — erst das Neuladen nimmt ihn weg, und
  // der Fokus fiele auf `body`. Dann bekommt ihn der Seitentitel.
  // Takt ist `ladeStand`, nicht `[vorgang, ladeFehler]`: Endet ein Laden ohne
  // sichtbare Aenderung (derselbe Fehlertext noch einmal), muss der Merker
  // trotzdem fallen — sonst zoege ein spaeteres Laden, das von keiner
  // Handlung kam, den Fokus auf den Titel.
  useEffect(() => {
    if (!fokusPruefen.current) return;
    fokusPruefen.current = false;
    const aktiv = document.activeElement;
    if (!aktiv || aktiv === document.body) document.getElementById(SEITENTITEL_ID)?.focus();
  }, [ladeStand]);

  /** „Neu laden" im Hinweis; der Knopf laedt, bis die Antwort da ist. */
  async function neuLadenGeklickt() {
    if (neuLaedt) return;
    setNeuLaedt(true);
    await neuLaden();
    setNeuLaedt(false);
  }

  const reiterWechseln = useCallback(
    (wert: ReiterWert) => {
      setReiter(wert);
      // Ohne Neuladen; Next.js uebernimmt die Adresse in seinen Verlauf.
      window.history.replaceState(
        null,
        "",
        vorgangPfad("vertragsende", vorgangId, wert === "uebersicht" ? undefined : wert),
      );
    },
    [vorgangId],
  );

  /**
   * Oeffnet einen Dialog — nur, wenn gerade gehandelt werden darf
   * (`handlungenFrei`, nicht `beschaeftigt`). Der Waechter hinter den
   * gesperrten Knoepfen und Menuepunkten.
   */
  const dialogOeffnen = (art: DialogArt) => {
    if (handelnGesperrt.current) return;
    setDialog((d) => ({ art, offen: true, nr: (d?.nr ?? 0) + 1 }));
  };
  const dialogSchliessen = () => setDialog((d) => (d ? { ...d, offen: false } : d));
  /** Bis `laden` fertig ist, ist die Seite `beschaeftigt` (sofort, auch fuer den Waechter). */
  const bisZumStand = (laden: Promise<void>) => {
    handelnGesperrt.current = true;
    setWartetAufStand((n) => n + 1);
    void laden.finally(() => setWartetAufStand((n) => n - 1));
  };
  /**
   * „Abbrechen", Escape, Kreuz. Laeuft noch das stille Laden nach einem
   * Fehlschlag (`dialogGeaendert`), wartet die Seite darauf — sonst liesse sie
   * kurz Handlungen auf dem alten Stand zu (z. B. „Erinnerung senden" zu
   * einem Link, den es nicht mehr gibt).
   */
  const dialogAbbrechen = () => {
    dialogSchliessen();
    if (stillesLaden.current) bisZumStand(stillesLaden.current);
  };
  /** Der Aufruf des Dialogs ist gelungen: schliessen, melden, und bis zum neuen Stand `beschaeftigt`. */
  const dialogErledigt = (meldung: string) => {
    dialogSchliessen();
    toast.ok(meldung);
    bisZumStand(neuLaden());
  };
  /**
   * Der Aufruf des Dialogs ist gescheitert, hat aber gespeichert (die Anfrage
   * ging nicht hinaus, der neue Link steht trotzdem in der Datenbank, ein
   * frueherer ist tot): still neu laden, der Dialog bleibt OFFEN.
   *
   * Ohne `beschaeftigt`, solange der Dialog offen ist: Er liest es nicht, und
   * ein zweiter Versuch darin muss gehen. Gelingt der, wartet die Seite ueber
   * `dialogErledigt` auf ihr eigenes Laden; das juengere Laden gewinnt ohnehin
   * (`ladeNr`). Schliesst HR den Dialog vorher, wartet die Seite auf DIESES
   * Laden (`dialogAbbrechen`). `neuLaden` setzt den Fokus-Merker: Bei offenem
   * Dialog liegt der Fokus darin (auf der Fehlermeldung), die Pruefung tut
   * dann nichts; schliesst der Dialog vor dem neuen Stand und verschwindet
   * sein Ausloeser damit, bekommt der Seitentitel den Fokus — wie nach einem
   * Erfolg. Scheitert das Neuladen, bleibt der Dialog offen (er haengt am
   * Recht, nicht an `handlungenFrei`); ein neuer Versuch darin geht an die
   * Route, die den Stand selbst prueft.
   */
  const dialogGeaendert = () => {
    const laden = neuLaden();
    stillesLaden.current = laden;
    void laden.finally(() => {
      if (stillesLaden.current === laden) stillesLaden.current = null;
    });
  };

  async function erinnern() {
    if (handelnGesperrt.current) return;
    handelnGesperrt.current = true;
    setErinnertGerade(true);
    const ergebnis = await aufrufen(vertragsendeAufruf("erinnern", vorgangId));
    // Ging die Mail nicht hinaus (Fehler mit `mailStatus`), steht der Grund im
    // Text der Route; gezaehlt hat sie nichts. Neu geladen wird in jedem Fall.
    if (ergebnis.ok) toast.ok(erinnerungMeldung(ergebnis.mailStatus));
    else toast.fehler(ergebnis.fehler);
    // Der Knopf bleibt gesperrt, bis der neue Stand da ist — sonst ginge mit
    // einem zweiten Klick eine zweite Erinnerung hinaus.
    await neuLaden();
    setErinnertGerade(false);
  }

  // =============================================
  // Laden und Fehler
  // =============================================

  if (!vorgang) {
    return (
      <main className="bg-surface">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          <h1 className="sr-only">Vertragsende</h1>
          {ladeFehler ? (
            <Hinweis
              ton="critical"
              ansagen
              titel="Vorgang konnte nicht geladen werden"
              aktion={
                <Button asChild groesse="sm">
                  <Link href={vorgangslistePfad("vertragsende")}>Zur Liste</Link>
                </Button>
              }
            >
              {ladeFehler}
            </Hinweis>
          ) : (
            <>
              {/* Platzhalter fuer Prozessleiste und Uebersicht. EIN Satz fuer
                  Screenreader genuegt: Das zweite Skelett schweigt. */}
              <Skelett art="gruppe" zeilen={2} label="Vorgang wird geladen" />
              <Skelett art="gruppe" zeilen={6} mitTitel aria-hidden="true" />
            </>
          )}
        </div>
      </main>
    );
  }

  // =============================================
  // Geladen
  // =============================================

  const jetzt = new Date();
  const name = anzeigeName(vorgang);
  const pille = vertragsendePille(vorgang, jetzt);
  const stand = vertragsendeProzessStand(vorgang, jetzt);
  const hinweise = vertragsendeHinweise(vorgang, jetzt);
  const reiterListe = vertragsendeReiter(darfBearbeiten);
  const ende = formatDatumDE(vorgang.contractEndDate);
  const unterzeile = [vorgang.organization.name, vorgang.displayId, ende ? `Vertragsende ${ende}` : ""]
    .filter(Boolean)
    .join(" · ");

  /** Eine Handlung aus „Jetzt dran" oder dem Menue ausfuehren. */
  function handlung(aktion: VertragsendeAktion) {
    switch (aktion) {
      case "erinnern":
        void erinnern();
        return;
      case "dokumente":
        reiterWechseln("dokumente");
        return;
      case "zum-offboarding":
        // In „Jetzt dran" ist das ein Verweis; hier nur fuer den Fall, dass
        // ein Adapter es einmal als Menuepunkt fuehrt.
        if (vorgang?.offboarding) router.push(vorgangPfad("offboarding", vorgang.offboarding.id));
        return;
      default:
        dialogOeffnen(aktion);
    }
  }

  /**
   * Knopf zu einer Handlung in „Jetzt dran". `key` = Handlung: Wechselt sie mit
   * dem neuen Stand, entsteht ein NEUER Knopf. Ohne ihn baute React denselben
   * Knopf nur um — der Fokus, den der Dialog an den Ausloeser zurueckgab, laege
   * dann auf der naechsten Handlung (nach „Anfrage senden …" auf „Erinnerung
   * senden", die ohne Rueckfrage mailt). So verschwindet der Ausloeser, und
   * der Seitentitel bekommt den Fokus (siehe `fokusPruefen`).
   * `beschaeftigt`: gesperrt, aber fokussierbar (`aria-disabled`) — ausser
   * den reinen Verweisen (`NUR_VERWEIS`).
   */
  function knopf(aktion: VertragsendeAktion | undefined, variante: ButtonVariante) {
    if (!aktion || !vorgang) return undefined;
    const text = aktionText(aktion, vorgang);
    const gesperrt = beschaeftigt && !NUR_VERWEIS.includes(aktion);
    if (aktion === "zum-offboarding") {
      if (!vorgang.offboarding) return undefined;
      return (
        <Button key={aktion} asChild variante={variante}>
          <Link href={vorgangPfad("offboarding", vorgang.offboarding.id)}>{text}</Link>
        </Button>
      );
    }
    if (aktion === "erinnern") {
      return (
        <Button
          key={aktion}
          variante={variante}
          laedt={erinnertGerade}
          aria-disabled={gesperrt || undefined}
          onClick={() => void erinnern()}
        >
          {erinnertGerade ? "Erinnerung wird gesendet …" : text}
        </Button>
      );
    }
    return (
      <Button key={aktion} variante={variante} aria-disabled={gesperrt || undefined} onClick={() => handlung(aktion)}>
        {text}
      </Button>
    );
  }

  const menue: MenuePunkt[] | undefined = handlungenFrei
    ? vertragsendeMenue(vorgang, jetzt).map((aktion) => ({
        text: menueText(aktion, vorgang),
        onWaehlen: () => handlung(aktion),
        kritisch: aktion === "stornieren",
        // Solange die Seite auf den neuen Stand wartet, beginnt keine weitere
        // Handlung — sie ginge vom alten aus (siehe Kopf, `beschaeftigt`).
        gesperrt: beschaeftigt,
      }))
    : undefined;

  return (
    <main className="bg-surface">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <Seitenkopf
          pfad={[
            { text: "Vorgänge", href: vorgangslistePfad() },
            { text: "Vertragsende", href: vorgangslistePfad("vertragsende") },
            { text: name },
          ]}
          titel={name}
          unterzeile={unterzeile}
          status={<Statuspille ton={pille.ton}>{pille.text}</Statuspille>}
          menue={menue}
        />

        {/* Nur nach einem gescheiterten NEUladen — ohne Vorgang zeigt die Seite
            oben ihren eigenen Fehler. Angesagt, weil er nach dem Laden erscheint. */}
        {ladeFehler && (
          <Hinweis
            ton="critical"
            ansagen
            titel="Die Ansicht ist nicht aktuell"
            aktion={
              <Button groesse="sm" laedt={neuLaedt} onClick={() => void neuLadenGeklickt()}>
                {neuLaedt ? "Wird neu geladen …" : "Neu laden"}
              </Button>
            }
          >
            {`Der neue Stand konnte nicht geladen werden (${ladeFehler.replace(/[.\s]+$/, "")}). Bis dahin sind die Handlungen gesperrt.`}
          </Hinweis>
        )}

        <Prozessleiste
          stand={stand}
          aktion={handlungenFrei ? knopf(stand.jetztDran?.aktion, "primary") : undefined}
          nebenAktion={handlungenFrei ? knopf(stand.jetztDran?.nebenAktion, "secondary") : undefined}
          onReiter={(wert) => {
            const ziel = reiterListe.find((r) => r.wert === wert);
            if (ziel) reiterWechseln(ziel.wert);
          }}
        />

        {/* Ueber allen Reitern: Sie gelten fuer den ganzen Vorgang. Nicht
            angesagt — sie stehen schon beim Oeffnen der Seite da. */}
        {hinweise.length > 0 && (
          <div className="space-y-3">
            {hinweise.map((hinweis) => (
              <Hinweis
                key={hinweis.schluessel}
                ton={hinweis.ton}
                titel={hinweis.titel}
                symbol={hinweis.schluessel === "weitere-mandanten" ? Users : undefined}
              >
                {hinweis.text}
              </Hinweis>
            ))}
          </div>
        )}

        <Reiter label="Bereiche des Vorgangs" wert={reiter} onWechsel={reiterWechseln} reiter={reiterListe}>
          <ReiterInhalt wert="uebersicht">
            <ReiterUebersicht
              vorgang={vorgang}
              darfBearbeiten={handlungenFrei}
              gesperrt={beschaeftigt}
              jetzt={jetzt}
              onMavSetzen={() => dialogOeffnen("mav-setzen")}
            />
          </ReiterInhalt>
          <ReiterInhalt wert="vertragsdaten">
            <ReiterVertragsdaten daten={vorgang.renewalData} />
          </ReiterInhalt>
          <ReiterInhalt wert="dokumente">
            <ReiterDokumente
              vorgangId={vorgangId}
              organizationId={vorgang.organization.id}
              darfBearbeiten={darfBearbeiten}
            />
          </ReiterInhalt>
          {darfBearbeiten && (
            <ReiterInhalt wert="e-mails">
              {/* Die Karte bringt eine h3 mit; ohne diese h2 spraengen die
                  Ueberschriften von der h1 des Kopfs direkt auf h3. */}
              <h2 className="sr-only">E-Mails</h2>
              <MailProtokoll modul="contract-end" vorgangId={vorgangId} />
            </ReiterInhalt>
          )}
        </Reiter>
      </div>

      {/* Eingehaengt am Recht, nicht an `handlungenFrei`: Scheitert das
          Neuladen, schliesst Radix den Dialog ordentlich, statt dass er
          mitten aus dem Baum faellt. Ob einer AUFgeht, entscheidet
          `dialogOeffnen`. */}
      {dialog && darfBearbeiten && (
        <VertragsendeDialog
          key={dialog.nr}
          art={dialog.art}
          offen={dialog.offen}
          vorgang={vorgang}
          jetzt={jetzt}
          onSchliessen={dialogAbbrechen}
          onErledigt={dialogErledigt}
          onGeaendert={dialogGeaendert}
        />
      )}
    </main>
  );
}
