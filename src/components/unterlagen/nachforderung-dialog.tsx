"use client";

/**
 * Dialog „Unterlagen nachfordern…" / „Unterlagen ergänzen…" (Paket 4,
 * modulneutral; Feinplanung 10.1, Mockup P:1298-1322)
 *
 * Geoeffnet von der Karte (nachforderung-karte.tsx), vom Kasten „Offene
 * Nachweise" und vom Warnbalken (Einbau in detail-content.tsx). Zwei Modi:
 *   - „neu":       legt die Nachforderung an (`{ aktion: "anfordern" }`, 201),
 *   - „ergaenzen": fuegt der laufenden Unterlagen hinzu (`{ aktion: "ergaenzen" }`, 200).
 *
 * **Der Dialog rechnet keine Pflichtregel selbst.** Welche Arten es gibt,
 * welche vorgeschlagen sind (offene Nachweise), welche vertraulich und ob sie
 * fuer diesen Vorgang angefordert werden duerfen (samt Grund), welche die
 * Schriftform verlangen und welcher Hinweis vorgeschlagen ist
 * (`NACHFORDERUNG_HINWEISE`) — das liefert der Server fertig in
 * `uebersicht.dialog` (Modul-Baustein `auswahl`), dazu die Adressvorschlaege
 * und die freigegebenen Domains. Was der Dialog vorab prueft, prueft er mit
 * denselben reinen Funktionen wie der Server: `eingabePruefen` (Frist morgen
 * bis heute + 90, hoechstens 30 Unterlagen, keine Art doppelt, beim Ergaenzen
 * eine schon angeforderte Art nur, wenn sie entfaellt) und
 * `empfaengerFreigegeben` (nur Anzeige). Die Schranke bleibt der Server.
 *
 * **Was angekreuzt ist, legt der Aufrufer fest** (`vorauswahl`):
 *   - eine Liste (Kasten „Offene Nachweise", Warnbalken): genau diese Arten,
 *     soweit waehlbar. Sie stehen oben, die uebrigen Vorschlaege sichtbar,
 *     aber nicht angekreuzt darunter, unter eigener Ueberschrift „Weitere
 *     offene Nachweise (nicht vorausgewählt)" — Kasten und Warnbalken sagen
 *     vorher, worum es geht, und der Dialog kreuzt nicht mehr an als dort
 *     genannt;
 *   - `null` (Knoepfe der Karte): alle Vorschlaege, ausser einer Art, die HR
 *     in einer frueheren Nachforderung als entfallen vermerkt hat
 *     (`frueherEntfallen`, dieselbe Regel wie im Kasten). Sie steht mit dem
 *     Hinweis „Entfällt laut einer früheren Nachforderung …" da und laesst
 *     sich ankreuzen.
 *
 * Der Weg einer Art, die schon in der Nachforderung steht, kommt aus den
 * Aktionen der Karte (`positionen[].aktionen`): „Annahme zurücknehmen, dann
 * zurückweisen" nennt der Dialog nur, wenn der Server die Ruecknahme auch
 * anbietet.
 *
 * Was HR vor dem Senden wissen muss, steht im Dialog: Name · Vorgangsnummer
 * unter dem Titel (`kopf`, vom Aufrufer), beim Ergaenzen, dass eine neue Frist
 * fuer alle Unterlagen gilt (EP-1), und im Modus „neu", dass sich Annahmen der
 * letzten Nachforderung danach nicht mehr zuruecknehmen lassen (E-3).
 *
 * Eine nicht zugestellte Mail ist nie ein Erfolg: Die Route antwortet 2xx,
 * sobald die Nachforderung gespeichert ist (EP-11). Wie auf der Karte
 * (`unterlagenAntwortAuswerten`) meldet sich FAILED an `onErfolg` als `fehler`
 * (rot: gespeichert, aber nicht zugestellt, dazu der Weg ueber „Link erneut
 * senden"), SKIPPED und „versendet, aber nicht gespeichert" (N2) als
 * `warnung` (gelb), nur SENT als `erfolg`. Ein Fehler ohne gespeicherte Aktion
 * (400/403/404/409/429) bleibt im Dialog (`role="alert"`), damit die Eingabe
 * korrigiert werden kann. Nach `onErfolg` schliesst der Aufrufer den Dialog.
 */

import { useEffect, useId, useRef, useState } from "react";
import {
  ADRESS_TEXTE,
  adresseGleich,
  adressFormatFehler,
  dialogHeute,
  saetze,
  unterlagenAktionSenden,
} from "@/components/unterlagen/aktionen";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import { empfaengerFreigegeben } from "@/lib/empfaenger-freigabe";
import { formatKalendertag, formatKalendertagLang, istKalendertag } from "@/lib/kalendertag";
import {
  BEZEICHNUNG_MAX,
  dialogErinnerungsSatz,
  eingabePruefen,
  fristGrenzen,
  fristPruefen,
  fristWochenendeHinweis,
  frueherEntfallen,
  HINWEIS_MAX,
  MAX_POSITIONEN,
  MELDUNGEN,
  NACHRICHT_MAX,
  SAMMELARTEN,
  type AuswahlEintrag,
  type EmpfaengerVorschlag,
  type FristGrenzen,
  type Kalendertag,
  type UnterlagenPositionZeile,
  type UnterlagenUebersicht,
} from "@/lib/unterlagen";

// =============================================
// Bodies (Form wie `unterlagenAktionSchema` in src/lib/validations/unterlagen.ts)
// =============================================

export type KatalogPositionBody = { typ: string; hinweis?: string };
export type FreiePositionBody = { typ: null; bezeichnung: string; hinweis?: string; originalErforderlich: boolean };
export type NachforderungPositionBody = KatalogPositionBody | FreiePositionBody;

export type AnfordernBody = {
  aktion: "anfordern";
  empfaenger: string;
  adresseBestaetigt?: true;
  frist: string;
  nachricht?: string;
  positionen: NachforderungPositionBody[];
};
export type ErgaenzenBody = {
  aktion: "ergaenzen";
  nachforderungId: string;
  positionen: NachforderungPositionBody[];
  frist?: string;
  nachricht?: string;
};

export interface NachforderungDialogProps {
  /** `unterlagen` aus GET /api/onboarding/[id] — Auswahl, Adressen und `apiBasis` (nur mit Bearbeitungsrecht). */
  uebersicht: UnterlagenUebersicht;
  modus: "neu" | "ergaenzen";
  /**
   * Genau diese Katalogarten sind angekreuzt (Kasten, Warnbalken); `null` =
   * alle Vorschlaege ausser frueher als entfallen vermerkten (Karte).
   */
  vorauswahl: string[] | null;
  onSchliessen: () => void;
  /**
   * 200/201, gespeichert: Meldung fuer die Leiste — `erfolg` nur bei
   * zugestellter Mail, `fehler` (rot) bei nicht zugestellter (FAILED),
   * `warnung` (gelb) bei uebersprungener (SKIPPED) bzw. N2.
   */
  onErfolg: (meldung: { art: "erfolg" | "warnung" | "fehler"; text: string }) => void | Promise<void>;
  /**
   * Zeile unter dem Titel: Name der Person und Vorgangsnummer (Mockup P:1299)
   * — die letzte Kontrolle, ob man im richtigen Vorgang ist, bevor eine Mail an
   * eine private Adresse geht. Fehlen beide, steht dort ein allgemeiner Satz.
   */
  kopf?: { name?: string | null; vorgangsnummer?: string | null } | null;
  /**
   * Id eines Elements, das beim Schliessen den Fokus bekommt, wenn der
   * Ausloeser fehlt: Nach dem Anfordern ist „Unterlagen nachfordern…" weg,
   * der Fokus laege sonst auf `body` (wie `fokusZiel` der Karten-Dialoge).
   */
  fokusZiel?: string;
  /**
   * Bezugszeit (Tests); ohne Angabe jetzt. Der Tag des Servers aus der
   * Uebersicht gilt, solange er nicht aelter ist als dieser.
   */
  jetzt?: Date;
}

// =============================================
// Texte und kleine Helfer
// =============================================

const TEXTE = {
  UNTERTITEL_NEU: "Die Person erhält eine E-Mail mit einem persönlichen Link zum Hochladen.",
  UNTERTITEL_ERGAENZEN: "Die Person erhält eine E-Mail mit einem neuen Link; neue Unterlagen sind darin gekennzeichnet.",
  AUS_DEM_VORGANG: "Aus dem Vorgang. Eine andere Adresse braucht eine freigegebene Domain.",
  // Leere Freigabeliste = keine Einschraenkung (Auslieferungszustand) — dann
  // gibt es keine Domain-Schranke zu nennen, nur die Bestaetigung.
  AUS_DEM_VORGANG_OHNE_LISTE: "Aus dem Vorgang. Eine andere Adresse müssen Sie ausdrücklich als geprüft bestätigen.",
  EMPFAENGER_ERGAENZEN: "Die Adresse ändern Sie über „Link erneut senden“.",
  ...ADRESS_TEXTE,
  DATEN_FEHLEN: "Die Auswahl der Unterlagen fehlt. Bitte laden Sie die Seite neu.",
  BEZEICHNUNG_FEHLT: "Bitte geben Sie jeder weiteren Unterlage eine Bezeichnung oder entfernen Sie die leere Zeile.",
  FREIE_ZEILEN: "Für Unterlagen, die oben fehlen. Bitte keine Gesundheitsdaten über freie Zeilen anfordern.",
  SENSIBEL_HINWEIS: "Erscheint nur auf der Upload-Seite, nicht in der E-Mail.",
  SENSIBEL_CHIP: "Vertraulich",
  SENSIBEL_CHIP_TITEL: "Die E-Mail nennt diese Unterlage nur neutral; Einzelheiten stehen auf der Upload-Seite.",
  BEREITS_ANGEFORDERT: "Bereits angefordert.",
  BEREITS_EINGEGANGEN: "Bereits angefordert und eingegangen.",
  EINGEGANGEN_WEG: "Bereits angefordert und eingegangen. Eine neue Fassung erbitten Sie in der Karte über „Zurückweisen…“.",
  BEREITS_ANGENOMMEN: "Bereits angenommen.",
  ANGENOMMEN_WEG: "Bereits angenommen. Für eine neue Fassung: „Annahme zurücknehmen“, dann zurückweisen.",
  ZULETZT_ANGENOMMEN:
    "In der letzten Nachforderung bereits angenommen. War die Annahme ein Versehen: dort „Annahme zurücknehmen“, dann zurückweisen – statt neu anzufordern.",
  WIEDER_ANFORDERN: "entfällt bisher – wieder anfordern",
  // E-3: Solange eine neuere Nachforderung laeuft, laesst sich keine Annahme
  // der aelteren zuruecknehmen — und danach zeigt die Karte nur noch die neue.
  RUECKNAHME_ENDET:
    "Mit dem Anfordern lässt sich keine Annahme der letzten Nachforderung mehr zurücknehmen. War eine Annahme ein Versehen, nehmen Sie sie vorher dort zurück.",
  // Ueberschrift der Vorschlaege, die eine Vorauswahl (Kasten, Warnbalken) nicht nennt.
  WEITERE_VORSCHLAEGE: "Weitere offene Nachweise (nicht vorausgewählt)",
  NACHRICHT_HINWEIS: "Erscheint in der E-Mail und auf der Upload-Seite.",
  NACHRICHT_BLEIBT: "Leer lassen: Die bisherige Nachricht bleibt.",
  // Nach FAILED (EP-11): gespeichert ist die Aktion — das sagt schon der Satz
  // des Servers („sind angefordert", „ist ergänzt") —, nur die Mail fehlt. Der
  // naechste Schritt steht dabei, als Moeglichkeit, nicht als Zusage: Auch
  // „Link erneut senden" kann an derselben Adresse scheitern, und nach einer
  // zugestellten ERNEUT-Mail ist der Knopf 10 Minuten gesperrt.
  NICHT_ZUGESTELLT:
    "Über „Link erneut senden“ in der Karte können Sie die E-Mail auch selbst noch einmal senden, bei Bedarf an eine korrigierte Adresse.",
} as const;

const EINGABE =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60 sm:text-sm";
const UEBERSCHRIFT = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * „3 Unterlagen" — beim Ergaenzen „2 weitere Unterlagen": Dort zaehlt die
 * Summe nur, was hinzukommt, und laese sich sonst wie der Umfang der ganzen
 * Nachforderung.
 */
function anzahlText(n: number, weitere: boolean): string {
  if (weitere) return `${n} ${n === 1 ? "weitere Unterlage" : "weitere Unterlagen"}`;
  return `${n} ${n === 1 ? "Unterlage" : "Unterlagen"}`;
}

/**
 * Der Info-Satz zur Frist (KO-K3). Beim Ergaenzen bleibt die anfordernde
 * Person dieselbe (8.1): Die Meldung zum Fristablauf geht an sie, nicht an
 * „Sie", wenn eine andere HR-Kraft ergaenzt (`dialogErinnerungsSatz`).
 */
function erinnerungsSatz(frist: Kalendertag, heute: Kalendertag, ergaenzen: boolean): string {
  return dialogErinnerungsSatz(frist, heute, ergaenzen ? "ANFORDERNDE" : "SIE");
}

/**
 * Kennzeichen einer vertraulichen Art. Welche Art sensibler Daten es ist
 * (E-1: Gesundheitsdaten, Art. 10 DSGVO, Aufenthaltsstatus — Mockup P:1305),
 * liefert der Modul-Baustein in `sensibelKategorie`; fehlt die Angabe, bleibt
 * das allgemeine „Vertraulich". Der Dialog ordnet selbst nichts zu, er bleibt
 * modulneutral.
 */
function sensibelKennzeichen(a: AuswahlEintrag & { sensibelKategorie?: string | null }): string {
  return a.sensibelKategorie?.trim() || TEXTE.SENSIBEL_CHIP;
}

/** Ids fuer `aria-describedby` — nur die sichtbaren, sonst gar keine. */
function beschriebenVon(...ids: Array<string | false | null | undefined>): string | undefined {
  const liste = ids.filter((id): id is string => !!id);
  return liste.length > 0 ? liste.join(" ") : undefined;
}

const QUELLE_TEXT: Readonly<Record<EmpfaengerVorschlag["quelle"], string>> = {
  VORGANG: "aus dem Vorgang",
  PERSONALAKTE: "aus der Personalakte",
};

/**
 * Der Satz zu einer Art, die HR in einer frueheren Nachforderung als entfallen
 * vermerkt hat — dieselbe Aussage wie im Kasten („entfällt laut Nachforderung
 * (vermerkt am …)"). Er erklaert, warum der Vorschlag nicht angekreuzt ist.
 */
function frueherEntfallenText(am: Kalendertag | null): string {
  return am
    ? `Entfällt laut einer früheren Nachforderung (vermerkt am ${formatKalendertag(am)}).`
    : "Entfällt laut einer früheren Nachforderung.";
}

/** Stand einer Katalogart im Dialog: waehlbar oder gesperrt mit Grund. */
interface ArtStand {
  waehlbar: boolean;
  /** Warum nicht waehlbar — sichtbar unter der Art. */
  grund: string | null;
  /** Zusatz im Label („entfällt bisher – wieder anfordern"). */
  zusatz: string | null;
  /**
   * Hinweis, der die Wahl nicht sperrt (Modus „neu": in der letzten
   * Nachforderung angenommen; beide Modi: frueher als entfallen vermerkt).
   */
  info: { text: string; name: "zuletzt-angenommen" | "frueher-entfallen" } | null;
  /** Steht schon in der laufenden Nachforderung (Modus „ergaenzen")? */
  bestehend: boolean;
  /** Frueher als entfallen vermerkt (`frueherEntfallen`) — ohne Vorauswahl nicht angekreuzt. */
  frueherEntfallen: boolean;
}

function artStand(
  a: AuswahlEintrag,
  bestand: UnterlagenPositionZeile | undefined,
  zuletztAngenommen: UnterlagenPositionZeile | undefined,
  entfallen: { am: Kalendertag | null } | null,
): ArtStand {
  const frueher = !bestand && !!entfallen;
  if (!a.erlaubt) {
    return {
      waehlbar: false,
      grund: a.grund ?? MELDUNGEN.SENSIBEL_NICHT_ERLAUBT,
      zusatz: null,
      info: null,
      bestehend: !!bestand,
      frueherEntfallen: frueher,
    };
  }
  if (bestand) {
    const basis = { info: null, bestehend: true, frueherEntfallen: false } as const;
    switch (bestand.status) {
      case "ENTFAELLT":
        return { ...basis, waehlbar: true, grund: null, zusatz: TEXTE.WIEDER_ANFORDERN };
      case "ANGENOMMEN":
        return {
          ...basis,
          waehlbar: false,
          grund: bestand.aktionen.annahmeZuruecknehmen ? TEXTE.ANGENOMMEN_WEG : TEXTE.BEREITS_ANGENOMMEN,
          zusatz: null,
        };
      case "EINGEREICHT":
        return {
          ...basis,
          waehlbar: false,
          grund: bestand.aktionen.zurueckweisen ? TEXTE.EINGEGANGEN_WEG : TEXTE.BEREITS_EINGEGANGEN,
          zusatz: null,
        };
      default:
        return { ...basis, waehlbar: false, grund: TEXTE.BEREITS_ANGEFORDERT, zusatz: null };
    }
  }
  return {
    waehlbar: true,
    grund: null,
    zusatz: null,
    info: zuletztAngenommen
      ? { text: TEXTE.ZULETZT_ANGENOMMEN, name: "zuletzt-angenommen" }
      : entfallen
        ? { text: frueherEntfallenText(entfallen.am), name: "frueher-entfallen" }
        : null,
    bestehend: false,
    frueherEntfallen: frueher,
  };
}

interface KatalogWahl {
  gewaehlt: boolean;
  hinweis: string;
}

interface FreieZeile {
  schluessel: number;
  bezeichnung: string;
  hinweis: string;
  original: boolean;
}

// =============================================
// Dialog
// =============================================

export function NachforderungDialog({
  uebersicht,
  modus,
  vorauswahl,
  onSchliessen,
  onErfolg,
  kopf,
  fokusZiel,
  jetzt,
}: NachforderungDialogProps) {
  const idBasis = useId();
  const ergaenzen = modus === "ergaenzen";
  const daten = uebersicht.dialog;
  const laufend = uebersicht.laufend;
  // Wie die Karte: die Basis der HR-Routen vom Server — ohne sie (kein
  // Bearbeitungsrecht) fehlen auch die Dialogdaten, der Knopf bleibt gesperrt.
  const basis = uebersicht.apiBasis;

  // Heute wie der Server (aus einer Nachforderung der Uebersicht), aber nie
  // frueher als der Berliner Tag im Browser (`dialogHeute`, KO-K3).
  const serverGrenzen = (laufend ?? uebersicht.zuletztErledigt)?.dialog.fristGrenzen ?? null;
  const heute = dialogHeute(serverGrenzen, jetzt);
  const grenzen = fristGrenzen(heute);
  const fristPflichtErgaenzen = ergaenzen && !!laufend?.dialog.ergaenzenFristPflicht;

  // ---- Katalog ----
  const eintraege = (daten?.auswahl ?? []).filter((a) => !SAMMELARTEN.includes(a.typ));
  const bestehend = ergaenzen ? (laufend?.positionen ?? []) : [];
  const bestandJeTyp = new Map(bestehend.filter((p) => p.typ !== null).map((p) => [p.typ as string, p]));
  const zuletztAngenommen = new Map(
    (!ergaenzen ? (uebersicht.zuletztErledigt?.positionen ?? []) : [])
      .filter((p) => p.typ !== null && p.status === "ANGENOMMEN" && p.aktionen.annahmeZuruecknehmen)
      .map((p) => [p.typ as string, p]),
  );
  // Frueher als entfallen vermerkt: dieselbe Quelle wie der Kasten (`typen`).
  const entfallen = (typ: string) =>
    frueherEntfallen(typ, uebersicht) ? { am: uebersicht.typen[typ]?.entschiedenAm ?? null } : null;
  const stand = (a: AuswahlEintrag) =>
    artStand(a, bestandJeTyp.get(a.typ), zuletztAngenommen.get(a.typ), entfallen(a.typ));
  const inVorauswahl = (a: AuswahlEintrag) => vorauswahl !== null && vorauswahl.includes(a.typ);

  /**
   * Angekreuzt beim Oeffnen: Mit Vorauswahl genau diese Arten (Kasten,
   * Warnbalken). Ohne (Karte) die Vorschlaege — aber nur, wenn die Art noch
   * nicht in der Nachforderung steht (eine dort entfallene hat HR bewusst
   * abgewaehlt) und nicht frueher als entfallen vermerkt ist; wieder anfordern
   * beides nur auf Zuruf.
   */
  const anfangsWahl = (a: AuswahlEintrag): boolean => {
    const s = stand(a);
    if (!s.waehlbar) return false;
    if (vorauswahl !== null) return inVorauswahl(a);
    return a.vorgeschlagen && !s.bestehend && !s.frueherEntfallen;
  };

  const [katalog, setKatalog] = useState<Record<string, KatalogWahl>>(() => {
    const anfang: Record<string, KatalogWahl> = {};
    for (const a of eintraege) anfang[a.typ] = { gewaehlt: anfangsWahl(a), hinweis: a.hinweis ?? "" };
    return anfang;
  });
  const [freie, setFreie] = useState<FreieZeile[]>([]);
  const naechsteZeile = useRef(1);
  // Eine neue freie Zeile bekommt den Fokus in ihr Bezeichnungsfeld — gemerkt
  // im Ref, gesetzt nach dem Rendern, in dem es das Feld gibt.
  const fokusZeileRef = useRef<number | null>(null);
  // Nach „Entfernen" gehoert der Fokus auf „+ Weitere Unterlage hinzufügen" —
  // ebenfalls erst nach dem Rendern: An der Obergrenze ist der Knopf im Klick
  // noch gesperrt und nimmt `focus()` nicht an, und der fokussierte
  // „Entfernen"-Knopf verschwindet danach.
  const fokusHinzufuegenRef = useRef(false);
  const hinzufuegenRef = useRef<HTMLButtonElement>(null);
  const freieUeberschriftRef = useRef<HTMLParagraphElement>(null);

  const [empfaenger, setEmpfaenger] = useState(daten?.empfaenger.vorgang ?? "");
  const [bestaetigt, setBestaetigt] = useState(false);
  const [frist, setFrist] = useState<string>(!ergaenzen || fristPflichtErgaenzen ? grenzen.vorschlag : "");
  const [nachricht, setNachricht] = useState("");

  const [sendet, setSendet] = useState(false);
  // Ref zusaetzlich zum Zustand: Zwei Klicks vor dem naechsten Rendern saehen
  // beide noch `sendet === false` (Muster der Karte).
  const sendetRef = useRef(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const ziel = fokusZeileRef.current;
    if (ziel !== null) {
      fokusZeileRef.current = null;
      document.getElementById(`${idBasis}-frei-${ziel}-bezeichnung`)?.focus();
    }
    if (fokusHinzufuegenRef.current) {
      fokusHinzufuegenRef.current = false;
      const knopf = hinzufuegenRef.current;
      // Bleibt der Knopf gesperrt (die Katalogauswahl allein fuellt die 30),
      // die Ueberschrift des Blocks statt `body`.
      if (knopf && !knopf.disabled) knopf.focus();
      else freieUeberschriftRef.current?.focus();
    }
  }, [freie, idBasis]);

  // ---- Empfaenger (nur Modus „neu") ----
  const vorgangsAdresse = daten?.empfaenger.vorgang ?? "";
  const vorschlaege = daten?.empfaenger.vorschlaege ?? [];
  const erlaubteDomains = daten?.empfaenger.erlaubteDomains ?? [];
  const adresse = empfaenger.trim();
  const abweichend = !ergaenzen && !!adresse && !adresseGleich(adresse, vorgangsAdresse);
  const freigegeben =
    !abweichend ||
    empfaengerFreigegeben({ empfaenger: adresse, empfaengerVorgang: vorgangsAdresse, domains: erlaubteDomains });
  const quelle = vorschlaege.find((v) => adresseGleich(v.adresse, adresse))?.quelle ?? null;
  // Erst das Format: Rot („nicht freigegeben") und gelb („weicht ab") gelten nur
  // fuer eine Adresse, die als solche stimmt — sonst naennte das Feld eine
  // falsche Ursache, waehrend der Fuss „ungültig" sagt.
  const formatFehler = ergaenzen ? null : adressFormatFehler(adresse);
  const zeigeNichtFreigegeben = !formatFehler && abweichend && !freigegeben;
  const zeigeAbweichend = !formatFehler && abweichend && freigegeben;
  const zeigeAusDemVorgang = !formatFehler && !abweichend;

  let empfaengerGrund: string | null = null;
  if (!ergaenzen) {
    if (formatFehler) empfaengerGrund = formatFehler;
    else if (!freigegeben) empfaengerGrund = TEXTE.NICHT_FREIGEGEBEN_KURZ;
    else if (abweichend && !bestaetigt) empfaengerGrund = MELDUNGEN.ADRESSE_NICHT_BESTAETIGT;
  }

  // ---- Positionen, in der Reihenfolge der Anzeige ----
  // Ohne Vorauswahl oben die Vorschlaege in der Reihenfolge des Servers. Mit
  // Vorauswahl oben genau diese Arten, darunter die uebrigen Vorschlaege unter
  // eigener Ueberschrift — sonst stuende etwa beim Warnbalken ein offener
  // Nachweis ohne Kreuz und ohne Erklaerung zwischen den angekreuzten.
  const obenEintraege =
    vorauswahl !== null ? eintraege.filter(inVorauswahl) : eintraege.filter((a) => a.vorgeschlagen);
  const offeneEintraege = vorauswahl !== null ? eintraege.filter((a) => a.vorgeschlagen && !inVorauswahl(a)) : [];
  const weitereEintraege = eintraege.filter((a) => !a.vorgeschlagen && !inVorauswahl(a));
  const gewaehlteArten = [...obenEintraege, ...offeneEintraege, ...weitereEintraege].filter(
    (a) => katalog[a.typ]?.gewaehlt && stand(a).waehlbar,
  );
  const positionen: NachforderungPositionBody[] = [
    ...gewaehlteArten.map((a): KatalogPositionBody => {
      const h = (katalog[a.typ]?.hinweis ?? "").trim();
      return h ? { typ: a.typ, hinweis: h } : { typ: a.typ };
    }),
    ...freie.map((z): FreiePositionBody => {
      const h = z.hinweis.trim();
      return {
        typ: null,
        bezeichnung: z.bezeichnung.trim(),
        ...(h ? { hinweis: h } : {}),
        originalErforderlich: z.original,
      };
    }),
  ];
  const neuAnzahl = positionen.filter((p) => p.typ === null || !bestandJeTyp.has(p.typ)).length;
  const platz = MAX_POSITIONEN - bestehend.length - neuAnzahl;

  // ---- Frist ----
  const fristWert = frist.trim();
  const fristPruefung = fristWert ? fristPruefen(fristWert, heute) : null;
  const fristFehler = fristPruefung && !fristPruefung.ok ? fristPruefung.meldung : null;
  const bisherigeFrist = ergaenzen ? (laufend?.frist ?? null) : null;
  // Die Frist, die nach dem Senden gilt: die neue — beim Ergaenzen ohne Angabe die bisherige.
  const wirksameFrist: Kalendertag | null = fristPruefung?.ok
    ? fristPruefung.tag
    : !fristWert && bisherigeFrist && !fristPflichtErgaenzen
      ? bisherigeFrist
      : null;
  // Beim Ergaenzen ersetzt eine neue Frist die EINE Frist der Nachforderung
  // (EP-1) — auch fuer die schon angeforderten Unterlagen. Frueher als bisher
  // ist erlaubt, aber HR soll es merken (sperrt nicht).
  const fristKuerzer =
    ergaenzen && bisherigeFrist && fristPruefung?.ok && fristPruefung.tag < bisherigeFrist ? bisherigeFrist : null;

  const eingabe = eingabePruefen(
    { aktion: ergaenzen ? "ergaenzen" : "anfordern", frist: fristWert, positionen },
    {
      heute,
      katalog: eintraege.map((a) => a.typ),
      bestehend: bestehend.map((p) => ({ typ: p.typ, status: p.status })),
      bisherigeFrist,
    },
  );

  // ---- Warum der Knopf gesperrt ist (sichtbar, nie nur als Tooltip) ----
  let grund: string | null = null;
  if (!daten || !basis) grund = TEXTE.DATEN_FEHLEN;
  else if (ergaenzen && (!laufend || laufend.status !== "LAUFEND")) grund = MELDUNGEN.NICHT_LAUFEND;
  else if (!ergaenzen && laufend) grund = MELDUNGEN.LAEUFT_BEREITS;
  else if (!ergaenzen && !uebersicht.anfordern.moeglich && uebersicht.anfordern.grund) {
    grund = uebersicht.anfordern.grund;
  }
  else if (empfaengerGrund) grund = empfaengerGrund;
  else if (positionen.length === 0) grund = MELDUNGEN.KEINE_POSITION;
  else if (freie.some((z) => !z.bezeichnung.trim())) grund = TEXTE.BEZEICHNUNG_FEHLT;
  else if (!eingabe.ok) grund = eingabe.meldung;

  // ---- Senden ----
  const body = (): AnfordernBody | ErgaenzenBody => {
    const text = nachricht.trim();
    if (ergaenzen) {
      return {
        aktion: "ergaenzen",
        nachforderungId: laufend?.id ?? "",
        positionen,
        ...(fristWert ? { frist: fristWert } : {}),
        ...(text ? { nachricht: text } : {}),
      };
    }
    return {
      aktion: "anfordern",
      empfaenger: adresse,
      ...(abweichend ? { adresseBestaetigt: true as const } : {}),
      frist: fristWert,
      ...(text ? { nachricht: text } : {}),
      positionen,
    };
  };

  const senden = async () => {
    if (grund || !basis || sendetRef.current) return;
    sendetRef.current = true;
    setSendet(true);
    setFehler(null);
    try {
      const ergebnis = await unterlagenAktionSenden(basis, body());
      const { art } = ergebnis.meldung;
      const text = saetze(ergebnis.meldung.meldung, ergebnis.meldung.hinweis);
      if (ergebnis.ausgefuehrt) {
        // Gespeichert — gruen nur, wenn die Mail wirklich hinausging; rot, wenn
        // sie nicht zugestellt wurde (FAILED), dann mit dem Weg „Link erneut senden".
        await onErfolg({ art, text: saetze(text, art === "fehler" ? TEXTE.NICHT_ZUGESTELLT : null) });
      } else {
        setFehler(text);
      }
    } catch {
      // `onErfolg` des Aufrufers ist gescheitert (etwa das Neuladen) — die Aktion selbst ist gespeichert.
    } finally {
      sendetRef.current = false;
      setSendet(false);
    }
  };

  // ---- Aenderungen ----
  const artSetzen = (typ: string, teil: Partial<KatalogWahl>) =>
    setKatalog((k) => {
      const bisher: KatalogWahl = k[typ] ?? { gewaehlt: false, hinweis: "" };
      return { ...k, [typ]: { ...bisher, ...teil } };
    });

  const zeileHinzufuegen = () => {
    const schluessel = naechsteZeile.current++;
    fokusZeileRef.current = schluessel;
    setFreie((f) => [...f, { schluessel, bezeichnung: "", hinweis: "", original: false }]);
  };
  const zeileAendern = (schluessel: number, teil: Partial<FreieZeile>) =>
    setFreie((f) => f.map((z) => (z.schluessel === schluessel ? { ...z, ...teil } : z)));
  const zeileEntfernen = (schluessel: number) => {
    fokusHinzufuegenRef.current = true;
    setFreie((f) => f.filter((z) => z.schluessel !== schluessel));
  };

  const anzahl = positionen.length;
  const summenAdresse = ergaenzen ? (laufend?.empfaenger ?? "") : adresse;
  const wochenende = istKalendertag(fristWert) ? fristWochenendeHinweis(fristWert) : null;
  const fristPflicht = !ergaenzen || fristPflichtErgaenzen;
  // Im Modus „neu" neben einer eingeklappten letzten Nachforderung, deren
  // Annahmen sich noch zuruecknehmen lassen: Das endet mit dem Anfordern (E-3).
  const ruecknahmeEndet =
    !ergaenzen && !laufend && !!uebersicht.zuletztErledigt?.positionen.some((p) => p.aktionen.annahmeZuruecknehmen);
  const kopfText = [kopf?.name?.trim(), kopf?.vorgangsnummer?.trim()].filter(Boolean).join(" · ");

  const empfaengerId = `${idBasis}-empfaenger`;
  const fristId = `${idBasis}-frist`;
  const nachrichtId = `${idBasis}-nachricht`;
  const ids = {
    empfaengerFehler: `${empfaengerId}-fehler`,
    empfaengerVorgang: `${empfaengerId}-vorgang`,
    empfaengerRot: `${empfaengerId}-nicht-freigegeben`,
    empfaengerGelb: `${empfaengerId}-abweichend`,
    fristLang: `${fristId}-lang`,
    fristFehler: `${fristId}-fehler`,
    fristWochenende: `${fristId}-wochenende`,
    fristKuerzer: `${fristId}-kuerzer`,
    fristBleibt: `${fristId}-bleibt`,
    fristPflicht: `${fristId}-pflicht`,
    nachrichtHinweis: `${nachrichtId}-hinweis`,
    nachrichtZaehler: `${nachrichtId}-zaehler`,
  };

  const artListe = (liste: AuswahlEintrag[]) => (
    <ul className="space-y-2">
      {liste.map((a) => (
        <ArtZeile
          key={a.typ}
          eintrag={a}
          stand={stand(a)}
          wahl={katalog[a.typ] ?? { gewaehlt: false, hinweis: a.hinweis ?? "" }}
          idBasis={`${idBasis}-art-${a.typ}`}
          sendet={sendet}
          onWahl={(teil) => artSetzen(a.typ, teil)}
        />
      ))}
    </ul>
  );

  const nurVorschlaege = obenEintraege.every((a) => a.vorgeschlagen);

  return (
    <DialogRahmen
      titel={ergaenzen ? "Unterlagen ergänzen" : "Unterlagen nachfordern"}
      untertitel={kopfText || (ergaenzen ? TEXTE.UNTERTITEL_ERGAENZEN : TEXTE.UNTERTITEL_NEU)}
      name={ergaenzen ? "ergaenzen" : "nachfordern"}
      sendet={sendet}
      fehler={fehler}
      onAbbrechen={onSchliessen}
      fokusZiel={fokusZiel}
      mitPflichtfeldern
      bestaetigen={{
        text: ergaenzen ? "Ergänzen und E-Mail senden" : "Anfordern und E-Mail senden",
        onClick: () => void senden(),
        grund,
        farbe: "blau",
      }}
    >
      {/* ===== Empfaenger ===== */}
      {ergaenzen ? (
        <div data-block="empfaenger">
          <p className={UEBERSCHRIFT}>Empfänger</p>
          <p className="mt-1 break-words text-sm text-foreground" data-zeile="empfaenger">
            {laufend?.empfaenger ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{TEXTE.EMPFAENGER_ERGAENZEN}</p>
        </div>
      ) : (
        <div data-block="empfaenger">
          <label htmlFor={empfaengerId} className={`block ${UEBERSCHRIFT}`}>
            Empfänger *
          </label>
          <input
            id={empfaengerId}
            type="email"
            value={empfaenger}
            onChange={(e) => {
              setEmpfaenger(e.target.value);
              setBestaetigt(false);
            }}
            autoComplete="off"
            required
            aria-required="true"
            aria-invalid={!!formatFehler || zeigeNichtFreigegeben || undefined}
            aria-describedby={beschriebenVon(
              !!formatFehler && ids.empfaengerFehler,
              zeigeAusDemVorgang && ids.empfaengerVorgang,
              zeigeNichtFreigegeben && ids.empfaengerRot,
              zeigeAbweichend && ids.empfaengerGelb,
            )}
            disabled={sendet}
            className={`mt-1 ${EINGABE} ${formatFehler || zeigeNichtFreigegeben ? "border-credo-rot" : ""}`}
          />
          {formatFehler && (
            <p id={ids.empfaengerFehler} className="mt-1 text-xs text-credo-rot" data-hinweis="empfaenger-fehler">
              {formatFehler}
            </p>
          )}
          {zeigeAusDemVorgang && (
            <p id={ids.empfaengerVorgang} className="mt-1 text-xs text-muted-foreground" data-hinweis="aus-dem-vorgang">
              {erlaubteDomains.length > 0 ? TEXTE.AUS_DEM_VORGANG : TEXTE.AUS_DEM_VORGANG_OHNE_LISTE}
            </p>
          )}
          {(vorschlaege.length > 1 || abweichend) && vorschlaege.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" data-block="vorschlaege">
              <span className="text-muted-foreground">Vorschläge:</span>
              {vorschlaege.map((v) => (
                <button
                  key={`${v.quelle}-${v.adresse}`}
                  type="button"
                  onClick={() => {
                    setEmpfaenger(v.adresse);
                    setBestaetigt(false);
                  }}
                  aria-pressed={adresseGleich(v.adresse, adresse)}
                  disabled={sendet}
                  className="min-h-[44px] rounded-md border border-border bg-card px-2 py-1.5 text-foreground transition-colors hover:bg-muted aria-pressed:border-credo-blau aria-pressed:bg-credo-blau/10 disabled:opacity-50 sm:min-h-0 sm:py-0.5"
                  data-quelle={v.quelle}
                >
                  {v.adresse} ({QUELLE_TEXT[v.quelle]})
                </button>
              ))}
            </div>
          )}
          {zeigeNichtFreigegeben && (
            <p
              id={ids.empfaengerRot}
              className="mt-2 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-3 py-2 text-xs text-credo-rot"
              data-hinweis="nicht-freigegeben"
            >
              {MELDUNGEN.EMPFAENGER_NICHT_FREIGEGEBEN}
              {erlaubteDomains.length > 0 ? ` Freigegeben sind: ${erlaubteDomains.join(", ")}.` : ""}
            </p>
          )}
          {zeigeAbweichend && (
            <div
              className="mt-2 rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2"
              data-hinweis="abweichend"
            >
              <p id={ids.empfaengerGelb} className="text-xs text-amber-900">
                {quelle === "PERSONALAKTE" ? "Adresse aus der Personalakte. " : ""}
                Die Adresse weicht von der im Vorgang hinterlegten ab
                {vorgangsAdresse ? ` (${vorgangsAdresse})` : ""}. Bitte prüfen Sie sie, bevor der Link hinausgeht.
              </p>
              <label className="mt-2 flex min-h-[44px] items-center gap-2 text-sm text-amber-900 sm:min-h-0">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  checked={bestaetigt}
                  onChange={(e) => setBestaetigt(e.target.checked)}
                  disabled={sendet}
                  aria-required="true"
                  aria-describedby={ids.empfaengerGelb}
                />
                <span>Adresse geprüft *</span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* ===== Unterlagen aus dem Katalog ===== */}
      <div data-block="katalog">
        {ergaenzen && bestehend.length > 0 && (
          <p className="mb-2 break-words text-xs text-muted-foreground" data-zeile="bestehend">
            Bereits in der Nachforderung: {bestehend.map((p) => p.bezeichnung).join(", ")}
          </p>
        )}
        {obenEintraege.length > 0 && (
          <div data-block="vorgeschlagen">
            <p className={`mb-1 ${UEBERSCHRIFT}`}>
              {nurVorschlaege ? "Vorgeschlagen (offene Nachweise)" : "Vorgeschlagen"}
            </p>
            {artListe(obenEintraege)}
          </div>
        )}
        {offeneEintraege.length > 0 && (
          <div className={obenEintraege.length > 0 ? "mt-3" : undefined} data-block="weitere-vorschlaege">
            <p className={`mb-1 ${UEBERSCHRIFT}`}>{TEXTE.WEITERE_VORSCHLAEGE}</p>
            {artListe(offeneEintraege)}
          </div>
        )}
        {weitereEintraege.length > 0 && (
          <div className="mt-3" data-block="weitere">
            <p className={`mb-1 ${UEBERSCHRIFT}`}>Weitere</p>
            {artListe(weitereEintraege)}
          </div>
        )}
      </div>

      {/* ===== Freie Zeilen ===== */}
      <div data-block="freie">
        {/* Per Programm fokussierbar (nicht per Tab): Ersatzziel nach „Entfernen", wenn Hinzufuegen gesperrt bleibt. */}
        <p ref={freieUeberschriftRef} tabIndex={-1} className={`${UEBERSCHRIFT} outline-none`}>
          Weitere Unterlagen
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground" data-hinweis="freie-zeilen">
          {TEXTE.FREIE_ZEILEN}
        </p>
        {freie.length > 0 && (
          <ul className="mt-2 space-y-2">
            {freie.map((z, i) => {
              const zid = `${idBasis}-frei-${z.schluessel}`;
              const nummer = `Weitere Unterlage ${i + 1}`;
              return (
                <li key={z.schluessel} className="rounded-lg border border-border bg-card p-3" data-frei={i + 1}>
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-semibold text-foreground">{nummer}</legend>
                    <div>
                      <label htmlFor={`${zid}-bezeichnung`} className="block text-xs text-muted-foreground">
                        Bezeichnung *
                      </label>
                      <input
                        id={`${zid}-bezeichnung`}
                        type="text"
                        value={z.bezeichnung}
                        onChange={(e) => zeileAendern(z.schluessel, { bezeichnung: e.target.value })}
                        maxLength={BEZEICHNUNG_MAX}
                        required
                        aria-required="true"
                        disabled={sendet}
                        placeholder="z. B. Unterschriebener RV-Antrag"
                        className={`mt-1 ${EINGABE}`}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${zid}-hinweis`} className="block text-xs text-muted-foreground">
                        Hinweis an die Person (optional)
                      </label>
                      <textarea
                        id={`${zid}-hinweis`}
                        value={z.hinweis}
                        onChange={(e) => zeileAendern(z.schluessel, { hinweis: e.target.value })}
                        maxLength={HINWEIS_MAX}
                        rows={2}
                        disabled={sendet}
                        placeholder="z. B. Bitte beide Seiten."
                        className={`mt-1 ${EINGABE}`}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex min-h-[44px] items-center gap-2 text-sm sm:min-h-0">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0"
                          checked={z.original}
                          onChange={(e) => zeileAendern(z.schluessel, { original: e.target.checked })}
                          disabled={sendet}
                        />
                        <span>Original erforderlich (Schriftform)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => zeileEntfernen(z.schluessel)}
                        disabled={sendet}
                        aria-label={`${nummer} entfernen`}
                        className="min-h-[44px] rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50 sm:min-h-0 sm:py-0.5"
                      >
                        Entfernen
                      </button>
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            ref={hinzufuegenRef}
            type="button"
            onClick={zeileHinzufuegen}
            disabled={sendet || platz <= 0}
            className="min-h-[44px] rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
          >
            + Weitere Unterlage hinzufügen
          </button>
          {platz <= 0 && (
            <span className="text-xs text-muted-foreground" data-hinweis="obergrenze">
              {MELDUNGEN.ZU_VIELE_POSITIONEN}
            </span>
          )}
        </div>
      </div>

      {/* ===== Frist ===== */}
      <div data-block="frist">
        {/* Beim Ergaenzen gilt die neue Frist fuer ALLE Unterlagen der Nachforderung (EP-1) — das sagt das Label. */}
        <label htmlFor={fristId} className={`block ${UEBERSCHRIFT}`}>
          {ergaenzen ? "Neue Frist für alle Unterlagen" : "Frist"}
          {fristPflicht ? " *" : " (optional)"}
        </label>
        <input
          id={fristId}
          type="date"
          value={frist}
          min={grenzen.min}
          max={grenzen.max}
          onChange={(e) => setFrist(e.target.value)}
          required={fristPflicht}
          aria-required={fristPflicht ? "true" : undefined}
          aria-invalid={!!fristFehler || undefined}
          aria-describedby={beschriebenVon(
            istKalendertag(fristWert) && ids.fristLang,
            !!fristFehler && ids.fristFehler,
            !!wochenende && !fristFehler && ids.fristWochenende,
            !!fristKuerzer && ids.fristKuerzer,
            ergaenzen && !fristPflichtErgaenzen && !!bisherigeFrist && ids.fristBleibt,
            fristPflichtErgaenzen && ids.fristPflicht,
          )}
          disabled={sendet}
          className={`mt-1 ${EINGABE}`}
        />
        {istKalendertag(fristWert) && (
          <p id={ids.fristLang} className="mt-1 text-xs text-muted-foreground" data-zeile="frist-lang">
            {formatKalendertagLang(fristWert)}
          </p>
        )}
        {fristFehler && (
          <p id={ids.fristFehler} className="mt-1 text-xs text-credo-rot" data-hinweis="frist-fehler">
            {fristFehler}
          </p>
        )}
        {wochenende && !fristFehler && (
          <p id={ids.fristWochenende} className="mt-1 text-xs text-amber-900" data-hinweis="wochenende">
            {wochenende}
          </p>
        )}
        {fristKuerzer && (
          <p
            id={ids.fristKuerzer}
            className="mt-2 rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2 text-xs text-amber-900"
            data-hinweis="frist-kuerzer"
          >
            Die Frist wird für alle Unterlagen der Nachforderung verkürzt (bisher {formatKalendertagLang(fristKuerzer)}).
          </p>
        )}
        {ergaenzen && !fristPflichtErgaenzen && bisherigeFrist && (
          <p id={ids.fristBleibt} className="mt-1 text-xs text-muted-foreground" data-zeile="frist-bleibt">
            Leer lassen: Die bisherige Frist ({formatKalendertagLang(bisherigeFrist)}) bleibt.
          </p>
        )}
        {fristPflichtErgaenzen && (
          <p
            id={ids.fristPflicht}
            className="mt-2 rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2 text-xs text-amber-900"
            data-hinweis="frist-pflicht"
          >
            {MELDUNGEN.NEUE_FRIST_NOETIG}
          </p>
        )}
      </div>

      {/* ===== Nachricht ===== */}
      <div data-block="nachricht">
        <label htmlFor={nachrichtId} className={`block ${UEBERSCHRIFT}`}>
          Nachricht an die Person (optional)
        </label>
        <textarea
          id={nachrichtId}
          value={nachricht}
          onChange={(e) => setNachricht(e.target.value)}
          maxLength={NACHRICHT_MAX}
          rows={3}
          disabled={sendet}
          aria-describedby={beschriebenVon(ids.nachrichtHinweis, ids.nachrichtZaehler)}
          className={`mt-1 ${EINGABE}`}
        />
        <div className="mt-1 flex justify-between gap-2 text-[11px] text-muted-foreground">
          <span id={ids.nachrichtHinweis}>
            {ergaenzen && laufend?.nachricht ? TEXTE.NACHRICHT_BLEIBT : TEXTE.NACHRICHT_HINWEIS}
          </span>
          <span id={ids.nachrichtZaehler} data-zeile="zaehler">
            {nachricht.length}/{NACHRICHT_MAX}
          </span>
        </div>
      </div>

      {/* ===== Info-Satz, Warnung und Summe ===== */}
      {wirksameFrist && (
        <p className="text-xs text-muted-foreground" data-zeile="erinnerung">
          {erinnerungsSatz(wirksameFrist, heute, ergaenzen)}
        </p>
      )}
      {ruecknahmeEndet && (
        <p
          className="rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2 text-xs text-amber-900"
          data-hinweis="ruecknahme-endet"
        >
          {TEXTE.RUECKNAHME_ENDET}
        </p>
      )}
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs font-semibold text-foreground" data-zeile="summe">
        {anzahlText(anzahl, ergaenzen)} · Frist {wirksameFrist ? formatKalendertag(wirksameFrist) : "—"} · an{" "}
        {summenAdresse || "—"}
      </p>
    </DialogRahmen>
  );
}

// =============================================
// Eine Katalogart
// =============================================

function ArtZeile({
  eintrag: a,
  stand: s,
  wahl,
  idBasis,
  sendet,
  onWahl,
}: {
  eintrag: AuswahlEintrag;
  stand: ArtStand;
  wahl: KatalogWahl;
  idBasis: string;
  sendet: boolean;
  onWahl: (teil: Partial<KatalogWahl>) => void;
}) {
  const gewaehlt = s.waehlbar && wahl.gewaehlt;
  const grundId = `${idBasis}-grund`;
  const infoId = `${idBasis}-info`;
  const sensibelId = `${idBasis}-sensibel-chip`;
  const originalId = `${idBasis}-original-chip`;
  const hinweisId = `${idBasis}-hinweis`;
  return (
    <li
      className={`rounded-lg border p-2.5 ${gewaehlt ? "border-credo-blau/40 bg-card" : "border-border bg-card"}`}
      data-art={a.typ}
      data-gesperrt={s.waehlbar ? undefined : "true"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label
          className={`flex min-h-[44px] min-w-0 items-start gap-2 sm:min-h-0 ${s.waehlbar ? "" : "text-muted-foreground"}`}
        >
          {/* Die Kennzeichen gehoeren zur Beschreibung, nicht zum Namen: Der Name bleibt die Art. */}
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0"
            checked={gewaehlt}
            onChange={(e) => onWahl({ gewaehlt: e.target.checked })}
            disabled={!s.waehlbar || sendet}
            aria-describedby={beschriebenVon(
              a.sensibel && sensibelId,
              a.originalErforderlich && originalId,
              !!s.grund && grundId,
              !!s.info && infoId,
            )}
          />
          <span className="min-w-0 break-words text-sm font-medium">
            {a.label}
            {s.zusatz && <span className="font-normal text-muted-foreground"> ({s.zusatz})</span>}
          </span>
        </label>
        <span className="flex flex-wrap gap-1">
          {a.sensibel && (
            <span
              id={sensibelId}
              className="inline-flex rounded-full bg-credo-rot/10 px-2 py-0.5 text-[10px] font-semibold text-credo-rot"
              title={TEXTE.SENSIBEL_CHIP_TITEL}
              data-chip="vertraulich"
            >
              {sensibelKennzeichen(a)}
            </span>
          )}
          {a.originalErforderlich && (
            <span
              id={originalId}
              className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
              data-chip="original"
            >
              Original<span className="sr-only"> erforderlich</span>
            </span>
          )}
        </span>
      </div>
      {s.grund && (
        <p id={grundId} className="mt-1 text-xs text-muted-foreground" data-zeile="art-grund">
          {s.grund}
        </p>
      )}
      {s.info && (
        <p
          id={infoId}
          className={`mt-1 text-xs ${s.info.name === "zuletzt-angenommen" ? "text-amber-900" : "text-muted-foreground"}`}
          data-hinweis={s.info.name}
        >
          {s.info.text}
        </p>
      )}
      {gewaehlt && (
        <div className="mt-2">
          {/* Die Art im Namen des Felds: Bei mehreren angekreuzten Arten hiessen sonst alle Felder gleich. */}
          <label htmlFor={hinweisId} className="block text-xs text-muted-foreground">
            Hinweis an die Person (optional)<span className="sr-only"> – {a.label}</span>
          </label>
          <textarea
            id={hinweisId}
            value={wahl.hinweis}
            onChange={(e) => onWahl({ hinweis: e.target.value })}
            maxLength={HINWEIS_MAX}
            rows={2}
            disabled={sendet}
            aria-describedby={a.sensibel ? `${hinweisId}-sensibel` : undefined}
            className={`mt-1 ${EINGABE}`}
          />
          {a.sensibel && (
            <p id={`${hinweisId}-sensibel`} className="mt-0.5 text-[11px] text-muted-foreground" data-hinweis="sensibel">
              {TEXTE.SENSIBEL_HINWEIS}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
