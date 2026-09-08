"use client";

/**
 * Multi-Step Personalfragebogen
 *
 * 10 Steps mit Fortschrittsanzeige, Auto-Save nach jedem Step,
 * und CREDO Corporate Design.
 */

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import {
  getActiveSteps,
  resolveResumeStep,
  type FragebogenStepKey,
} from "@/lib/fragebogen-steps";
import { FieldConfigHelper, type StepFieldConfig } from "@/lib/field-definitions";
import { fehlerMeldung } from "@/lib/formular-fehler";

// Step-Komponenten
import { Step1Personal } from "./steps/step1-personal";
import { Step2Address } from "./steps/step2-address";
import { Step3Bank } from "./steps/step3-bank";
import { Step4SocialSecurity } from "./steps/step4-social-security";
import { Step5Tax } from "./steps/step5-tax";
import { Step6Employment } from "./steps/step6-employment";
import { Step8Education } from "./steps/step8-education";
import { Step9Masern } from "./steps/step9-masern";
import { Step11Rente } from "./steps/step11-rente";
import { Step10Summary } from "./steps/step10-summary";

interface OnboardingData {
  onboardingId: string;
  email: string;
  organization: {
    name: string;
    mandantNumber: string;
    type: string;
    /** Ist beim Mandanten eine BA-Betriebsnummer hinterlegt? */
    betriebsnummerVorhanden?: boolean;
    dsgvoVerantwortlicheName?: string | null;
    dsgvoVerantwortlicheStrasse?: string | null;
    dsgvoVerantwortlichePlz?: string | null;
    dsgvoVerantwortlicheOrt?: string | null;
  };
  questionnaireType: string;
  status: string;
  stepsConfig?: StepFieldConfig[] | null;
  requiredDocuments?: string[] | null;
  personalData: Record<string, unknown> | null;
}

interface FragebogenFormProps {
  token: string;
  initialData: OnboardingData;
}

/**
 * Das Merkmal eines Bereichs, dessen Eingaben NICHT am „Weiter" haengen.
 *
 * Gesetzt wird es von `DocumentUpload` (steps/document-upload.tsx). Der Grund
 * ist der Selbstumbau dieser Karte: Ein Upload — oder ein Loeschen, ein
 * nachgetragenes Datum, ein Wechsel der Dokumentenart — laedt die
 * Dokumentenliste neu und aendert dabei die Feldmenge, weil „Gültig bis" nur
 * VOR dem Upload steht. `beruehrtRef` schuetzt davor nicht: Als Beruehrung
 * zaehlt schon der Klick auf „Hochladen" selbst, und der friert den
 * Ausgangsstand eine Sekunde vor dem Umbau ein. Die Rueckfrage kam damit nach
 * JEDEM Upload — und behauptete, Eingaben gingen verloren, waehrend die Datei
 * nachweislich auf dem Server lag (Nachpruefung 08.09.2026).
 *
 * Ausklammern ist hier richtig und nicht bloss bequem: Jedes Feld in diesem
 * Bereich speichert sich ueber einen EIGENEN Knopf sofort selbst (POST beim
 * Hochladen, PATCH beim Nachtragen des Ablaufdatums). Der Satz des Dialogs —
 * „Gespeichert wird erst mit Weiter" — waere dort schlicht falsch; in der
 * Zusammenfassung gibt es gar kein „Weiter". Der Preis ist ein eingetipptes,
 * aber noch nicht abgeschicktes Ablaufdatum: Es geht beim Sprung ohne
 * Rueckfrage verloren. Das ist die kleinere Einbusse — eine Warnung, die
 * immer kommt, wird weggeklickt, und dann auch die vor echten Eingaben.
 */
const DATEIBEREICH = "[data-dateibereich]";

export function FragebogenForm({ token, initialData }: FragebogenFormProps) {
  // Die Schritte, die dieser Mitarbeiter laut Vorlage durchlaeuft —
  // in Anzeigereihenfolge, ohne die abgeschalteten.
  const activeSteps = useMemo(
    () => getActiveSteps(initialData.stepsConfig),
    [initialData.stepsConfig]
  );

  // Einstiegsposition: bei einem neuen Fragebogen 0, bei einem fortgesetzten
  // die Position des gespeicherten Schritts. Bewusst bei jedem Rendern neu
  // berechnet statt als lazy initializer — `resolveResumeStep` ist ein
  // findIndex, und so steht der Wert auch dem zweiten useState darunter zur
  // Verfuegung, ohne die Berechnung zu verdoppeln.
  const startIndex = resolveResumeStep(
    activeSteps,
    initialData.personalData?.currentStep as number | null | undefined
  );

  // `currentStep` ist die Position in `activeSteps`, nicht die Registry-Nummer.
  // Gespeichert wird die Registry-Nummer — sie bleibt gueltig, auch wenn sich
  // die Vorlage aendert, waehrend der Vorgang laeuft.
  const [currentStep, setCurrentStep] = useState(startIndex);

  /**
   * Die weiteste Position, die diese Person schon gesehen hat.
   *
   * Bis hierher darf die Schrittleiste springen — in BEIDE Richtungen. Vorher
   * war nur `index < currentStep` anklickbar: Wer von Schritt 8 auf 5
   * zuruecksprang, kam nur wieder nach vorn, indem er sich durch jeden Schritt
   * einzeln klickte (Beobachtung aus dem Betrieb, 09/2026).
   *
   * Ein NIE gesehener Schritt bleibt gesperrt. Sonst ueberspringt man
   * Pflichtangaben und erfaehrt davon erst beim Absenden, wo der Server den
   * gesamten Fragebogen prueft.
   *
   * Der Startwert kommt aus dem gespeicherten Schritt. Nach einem Neuladen ist
   * das nicht zwingend die weiteste je erreichte Position: `saveStepData`
   * schreibt den Schritt, zu dem "Weiter" fuehrt — sprang jemand von 8 auf 5
   * zurueck und klickte dort "Weiter", steht in der Datenbank die 6. Die Leiste
   * sperrt 7 und 8 dann wieder, bis sie erneut durchlaufen sind. Das ist der
   * Preis dafuer, dass EIN gespeichertes Feld zwei Fragen beantwortet (Wo
   * steige ich wieder ein? Wie weit ist der Vorgang?); die eingegebenen Daten
   * sind laengst gespeichert und gehen dabei nicht verloren.
   */
  const [maxErreicht, setMaxErreicht] = useState(startIndex);
  const [formData, setFormData] = useState<Record<string, unknown>>(
    initialData.personalData || {}
  );
  const [saving, setSaving] = useState(false);
  // Erfolg und Fehler getrennt halten. Vorher lief beides ueber `saveMessage`
  // und wurde als kleiner gruener Text im Kopf angezeigt — eine Fehlermeldung
  // in der Farbe des Erfolgs, die dazu noch leicht zu uebersehen war.
  const [saveMessage, setSaveMessage] = useState("");
  const [fehler, setFehler] = useState("");
  const [submitted, setSubmitted] = useState(false);
  /**
   * Position, zu der gewechselt werden soll, sobald die Person den Verlust
   * ihrer ungespeicherten Eingaben bestaetigt hat. `null` = keine Rueckfrage
   * offen.
   */
  const [sprungZiel, setSprungZiel] = useState<number | null>(null);

  // FieldConfig-Helper für jeden Step erstellen
  const getFieldConfig = useCallback(
    (stepNumber: number): FieldConfigHelper => {
      const stepConfig = initialData.stepsConfig?.find(
        (s) => s.step === stepNumber
      );
      return new FieldConfigHelper(stepNumber, stepConfig?.fields ?? undefined);
    },
    [initialData.stepsConfig]
  );

  // Auto-Save: Step-Daten an API senden. `nextStepNumber` ist die Registry-Nummer.
  const saveStepData = useCallback(
    async (stepData: Record<string, unknown>, nextStepNumber: number) => {
      setSaving(true);
      setSaveMessage("");
      setFehler("");
      try {
        const res = await fetch(`/api/fragebogen/${token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...stepData,
            currentStep: nextStepNumber,
          }),
        });

        if (!res.ok) {
          // Die Antwort nennt in `details` das betroffene Feld. Frueher wurde
          // nur `error` angezeigt — also woertlich "Validierungsfehler", ohne
          // Feld und ohne Grund. `catch` faengt Antworten ohne JSON-Koerper ab
          // (etwa eine Fehlerseite des Reverse Proxy).
          const koerper = await res.json().catch(() => null);
          setFehler(fehlerMeldung(koerper));
          return false;
        }

        setSaveMessage("Gespeichert");
        setTimeout(() => setSaveMessage(""), 2000);
        return true;
      } catch {
        setFehler(
          "Die Verbindung zum Server ist fehlgeschlagen. Bitte prüfen Sie Ihre " +
            "Internetverbindung und versuchen Sie es erneut."
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [token]
  );

  // Weiter zum naechsten Step
  const handleNext = async (stepData: Record<string, unknown>) => {
    const merged = { ...formData, ...stepData };
    setFormData(merged);

    const nextIndex = currentStep + 1;
    if (nextIndex >= activeSteps.length) return;

    const saved = await saveStepData(stepData, activeSteps[nextIndex].step);
    // In beiden Faellen nach oben: bei Erfolg steht dort der neue Schritt, im
    // Fehlerfall die Meldung. Ohne das Scrollen bleibt die Person am Ende eines
    // langen Schritts stehen und sieht auf ihren Klick hin gar nichts.
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (saved) {
      setCurrentStep(nextIndex);
      // Erst jetzt gilt der neue Schritt als erreicht — nach dem GESPEICHERTEN
      // "Weiter". Ein fehlgeschlagener Speicherversuch darf die Leiste nicht
      // aufschliessen.
      setMaxErreicht((bisher) => Math.max(bisher, nextIndex));
    }
  };

  // =============================================
  // Sprung ueber die Schrittleiste
  // =============================================

  /**
   * Der Bereich, in dem die Maske des aktuellen Schritts steht.
   *
   * Gebraucht wird er fuer die Frage "hat die Person hier gerade etwas
   * eingetippt, das noch nicht gespeichert ist?". Jeder Schritt fuehrt sein
   * eigenes react-hook-form; der Rahmen hier kommt an diese Werte nur ueber
   * "Weiter" (also `handleNext`) heran. Ein Sprung ueber die Leiste laeuft
   * daran vorbei — deshalb wird am DOM nachgesehen statt geraten.
   */
  const inhaltRef = useRef<HTMLDivElement>(null);

  /** Stand der Maske, gegen den verglichen wird. */
  const ausgangswerteRef = useRef<string | null>(null);

  /**
   * Hat die Person in dieser Maske ueberhaupt etwas angefasst?
   *
   * Wer nichts angefasst hat, kann nichts verlieren — und solange das so ist,
   * ist der zuletzt gezeichnete Stand der Ausgangsstand (siehe den Effekt
   * unten). Das ist die Gegenmassnahme gegen den Fehlalarm: Die Zusammenfassung
   * laedt ihre Dokumentenliste NACH dem Zeichnen nach und bringt dabei neue
   * Felder mit (je Nachweis ein "Gueltig bis"). Ohne diesen Merker haette
   * allein das Nachladen jeden Sprung von dort mit einer Rueckfrage belegt —
   * und wer Fehlalarme gewohnt ist, klickt auch den echten weg.
   *
   * Der Merker allein genuegt nicht: Ein Klick in ein Feld hinein oder auf
   * "Hochladen" aendert nichts. Erst beide Bedingungen zusammen — angefasst
   * UND anderer Stand — ergeben die Rueckfrage.
   */
  const beruehrtRef = useRef(false);

  /**
   * Der Zustand der gesamten Maske als ein Vergleichstext.
   *
   * Frueher standen hier nur Felder MIT `name`, also die von react-hook-form
   * ueber `register()` gebundenen. Das hat ausgerechnet die folgenreichsten
   * Eingaben des Fragebogens uebersehen:
   *
   *  - Die **Ja/Nein-Fragen** sind Schaltflaechen (`<button role="radio">`)
   *    und tragen ihren Wert per `setValue` ins Formular, nicht ueber ein
   *    Eingabefeld. Ein "Nein" bei "Brauchen Sie einen Aufenthaltstitel?" —
   *    die Antwort, die Aufenthaltstitel und Arbeitserlaubnis aus den
   *    Pflichtdokumenten fallen laesst — verschwand lautlos.
   *  - Die **Zeilentabellen** (Kinder in Schritt 4; weitere Beschaeftigung,
   *    Vorbeschaeftigung und Ausland in Schritt 6) fuehren ihren Zustand in
   *    `useState` und rendern namenlose Felder. Drei eingetragene
   *    Beschaeftigungszeilen waren beim Sprung weg, ohne dass gefragt wurde.
   *
   * Gelesen wird deshalb alles, was Zustand traegt: jedes Eingabefeld — mit
   * `name` oder ohne — und jedes Element mit `aria-checked`, das sind die
   * Ja/Nein-Schaltflaechen. Namenlose Felder haengen an ihrer **Position**,
   * und das ist Absicht: Eine hinzugefuegte oder entfernte Tabellenzeile
   * verschiebt alles Nachfolgende und faellt damit auch dann auf, wenn sie
   * selbst noch leer ist.
   *
   * Ausgenommen bleiben die **Datei-Felder** (Masernnachweis, Bescheinigungen,
   * Anlagen). Sie laden beim Auswaehlen sofort hoch, haengen nicht am
   * Speichern des Schritts, und ihr `value` wird nach dem Upload ohnehin
   * zurueckgesetzt. Mit ihnen faellt der ganze **Dateibereich** heraus —
   * siehe `DATEIBEREICH` oben.
   */
  const leseEingaben = useCallback((): string | null => {
    const wurzel = inhaltRef.current;
    if (!wurzel) return null;

    const teile: string[] = [];

    // Eigener Zaehler statt des Laufindex der Knotenliste. Verschwindet im
    // Dateibereich ein Feld, duerfen sich die Positionen der Felder DAHINTER
    // (in der Zusammenfassung: Ort und die beiden Haken) nicht verschieben —
    // sonst kaeme der Fehlalarm durch die Hintertuer zurueck.
    let position = 0;
    const felder = wurzel.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea");
    felder.forEach((feld) => {
      const typ = (feld as HTMLInputElement).type;
      if (typ === "file") return;
      if (feld.closest(DATEIBEREICH)) return;
      // Bei Haken und Radioknoepfen steht die Antwort in `checked`; `value`
      // ist dort der feste Wert der Option und aendert sich nie.
      const wert =
        typ === "checkbox" || typ === "radio"
          ? (feld as HTMLInputElement).checked
            ? "1"
            : "0"
          : feld.value;
      position += 1;
      // Trennzeichen, die in keiner Eingabe vorkommen koennen.
      teile.push(`${position}\u001f${feld.name}\u001f${wert}`);
    });

    // Alles, was seinen Zustand ueber `aria-checked` fuehrt statt ueber ein
    // Eingabefeld — im Fragebogen sind das die Ja/Nein-Schaltflaechen.
    // Derselbe eigene Zaehler und dieselbe Ausnahme wie oben: Im Dateibereich
    // gibt es heute keine solche Schaltflaeche, aber eine morgen ergaenzte
    // duerfte die Zaehlung der uebrigen nicht verschieben.
    let ariaPosition = 0;
    wurzel.querySelectorAll("[aria-checked]").forEach((knopf) => {
      if (knopf.closest(DATEIBEREICH)) return;
      ariaPosition += 1;
      // Eigener Zaehlerstand unter dem Namen, den die Zeile darunter erwartet.
      const position = ariaPosition;
      teile.push(`a${position}\u001f${knopf.getAttribute("aria-checked")}`);
    });

    return teile.join("\u001e");
  }, []);

  // Ein neu betretener Schritt faengt unberuehrt an. Der Effekt laeuft nach dem
  // Zeichnen, react-hook-form hat seine `defaultValues` dann bereits in die
  // Felder geschrieben.
  useEffect(() => {
    beruehrtRef.current = false;
    ausgangswerteRef.current = leseEingaben();
  }, [currentStep, leseEingaben]);

  // Solange niemand etwas angefasst hat, ist der zuletzt gezeichnete Stand der
  // Ausgangsstand. Bewusst OHNE Abhaengigkeitsliste, also nach JEDEM Zeichnen:
  // Was eine Maske nach dem Oeffnen von sich aus nachlaedt, darf keine
  // Rueckfrage ausloesen. Mit der ersten Beruehrung friert der Ausgangsstand
  // ein — ab da ist jeder Unterschied die Eingabe der Person.
  useEffect(() => {
    if (!beruehrtRef.current) ausgangswerteRef.current = leseEingaben();
  });

  // Was als "angefasst" zaehlt: tippen (`input`), auswaehlen (`change`) und
  // klicken (`click`). Das Klicken gehoert dazu, weil die Ja/Nein-Schaltflaechen
  // und die Knoepfe "Zeile hinzufuegen"/"Entfernen" weder das eine noch das
  // andere ausloesen. In der Auffangphase (`true`), damit der Merker auch dann
  // gesetzt wird, wenn ein Handler die Weitergabe des Ereignisses stoppt.
  useEffect(() => {
    const wurzel = inhaltRef.current;
    if (!wurzel) return;
    const merken = () => {
      beruehrtRef.current = true;
    };
    const arten = ["input", "change", "click"] as const;
    arten.forEach((art) => wurzel.addEventListener(art, merken, true));
    return () => {
      arten.forEach((art) => wurzel.removeEventListener(art, merken, true));
    };
  }, []);

  /** Wechsel ausfuehren — ohne weitere Rueckfrage. */
  const wechsleZu = (index: number) => {
    setSprungZiel(null);
    // Die Meldung gehoert zum verlassenen Schritt — sie stehen zu lassen
    // hiesse, einen Fehler an einer Stelle anzuzeigen, an der er nicht ist.
    setFehler("");
    setCurrentStep(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * Zu einem bereits erreichten Schritt wechseln.
   *
   * Ein Sprung speichert NICHT: Die Werte des aktuellen Schritts liegen im
   * Formular des Schritts, nicht hier, und sie ungeprueft am Zod-Schema vorbei
   * zum Server zu schicken waere schlimmer als sie zu verwerfen. Also wird
   * gefragt, bevor etwas verloren geht — und nur dann, wenn wirklich etwas zu
   * verlieren ist. Wer nichts angefasst hat, springt ohne Rueckfrage.
   */
  const springeZu = (index: number) => {
    if (index === currentStep) return;
    if (index < 0 || index > maxErreicht) return;
    // Waehrend ein "Weiter" laeuft, wuerde dessen setCurrentStep den Sprung
    // gleich wieder ueberschreiben.
    if (saving) return;

    // Beide Bedingungen: Ohne Beruehrung gibt es nichts zu verlieren, und ohne
    // Unterschied ist nichts verloren gegangen. Die erste haelt die Rueckfrage
    // vom Nachladen fern, die zweite vom blossen Anklicken.
    if (beruehrtRef.current && leseEingaben() !== ausgangswerteRef.current) {
      setSprungZiel(index);
      return;
    }
    wechsleZu(index);
  };

  // Zurück zum vorherigen Step. Bewusst ueber denselben Weg wie die Leiste:
  // Auch hier gehen ungespeicherte Eingaben verloren, und es waere schwer zu
  // erklaeren, warum die Leiste davor warnt und der Knopf daneben nicht.
  const handleBack = () => springeZu(currentStep - 1);

  // Fragebogen endgültig absenden.
  //
  // Ort und Fassung der Erklaerung gehen mit an den Server: Sie sind Teil des
  // Unterschriftsersatzes. Zeitpunkt, IP und Pruefsumme setzt der Server selbst
  // — was der Browser behauptet, taugt als Nachweis nichts.
  const handleSubmit = async (erklaerung: { ort: string; version: string }) => {
    setSaving(true);
    setSaveMessage("");
    setFehler("");
    try {
      const res = await fetch(`/api/fragebogen/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dsgvoAccepted: true,
          erklaerungAccepted: true,
          erklaerungOrt: erklaerung.ort,
          erklaerungVersion: erklaerung.version,
        }),
      });

      if (!res.ok) {
        // Beim Absenden prueft der Server den GESAMTEN Fragebogen. Fehlt eine
        // Angabe aus einem frueheren Schritt, nennt `details` sie — genau das
        // braucht die Person, um den richtigen Schritt wieder aufzusuchen.
        const koerper = await res.json().catch(() => null);
        setFehler(fehlerMeldung(koerper));
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      setSubmissionTime(new Date());
      setSubmitted(true);
    } catch {
      setFehler(
        "Die Verbindung zum Server ist fehlgeschlagen. Bitte prüfen Sie Ihre " +
          "Internetverbindung und versuchen Sie es erneut."
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  // Signatur-ID generieren (deterministisch aus Onboarding-ID + Zeitstempel)
  const generateSignatureId = () => {
    const year = new Date().getFullYear();
    const shortId = initialData.onboardingId.substring(0, 8).toUpperCase();
    return `CREDO-PF-${year}-${shortId}`;
  };

  const [submissionTime, setSubmissionTime] = useState<Date | null>(null);
  const fullName = formData.firstName && formData.lastName
    ? `${formData.firstName} ${formData.lastName}`
    : initialData.email;
  const verificationCode = `${token.substring(0, 4)}-${token.substring(token.length - 4)}`.toUpperCase();

  // Erfolgsmeldung nach Absenden – mit digitaler Signatur
  if (submitted && submissionTime) {
    const signatureId = generateSignatureId();

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 py-8">
        <div className="w-full max-w-lg overflow-hidden rounded-xl bg-card shadow-2xl">
          {/* Header */}
          <div className="bg-primary px-8 py-6 text-center">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO"
              width={180}
              height={58}
              className="mx-auto mb-3 brightness-0 invert"
              priority
            />
            <p className="text-xs font-medium text-primary-foreground/80">
              Digitale Bestaetigung &middot; Personalfragebogen
            </p>
          </div>

          {/* Erfolg */}
          <div className="px-8 pt-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Erfolgreich eingereicht!
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ihr Personalfragebogen wurde sicher übermittelt.
            </p>
          </div>

          {/* ============================================= */}
          {/* Digitale Signatur / Bestaetigungszertifikat */}
          {/* ============================================= */}
          <div className="px-8 py-6">
            <div className="relative overflow-hidden rounded-xl border-2 border-primary/20 bg-muted/50 p-6">
              {/* Dezentes Wasserzeichen */}
              <div className="pointer-events-none absolute -right-6 -top-6 text-[120px] font-black leading-none text-primary/[0.03]">
                FES
              </div>

              {/* Signatur-ID */}
              <div className="mb-5 text-center">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Bestaetigungs-ID
                </p>
                <p className="mt-1 font-mono text-lg font-bold tracking-wider text-primary">
                  {signatureId}
                </p>
              </div>

              {/* Trennlinie im CREDO-Stil */}
              <div className="mb-5 flex h-[2px]">
                <div className="flex-1 bg-accent" />
                <div className="w-[12.5%] bg-credo-gelb" />
                <div className="w-[12.5%] bg-credo-gruen" />
                <div className="w-[12.5%] bg-credo-rot" />
                <div className="w-[12.5%] bg-credo-blau" />
              </div>

              {/* Details */}
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-semibold text-foreground">{fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Einrichtung</span>
                  <span className="font-medium text-foreground">
                    {initialData.organization.name} ({initialData.organization.mandantNumber})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Eingereicht am</span>
                  <span className="font-medium text-foreground">
                    {submissionTime.toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}{" "}
                    um{" "}
                    {submissionTime.toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}{" "}
                    Uhr
                  </span>
                </div>
              </div>

              {/* Bestaetigung */}
              <div className="mt-5 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Personalfragebogen vollständig
                </div>
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Erklärung des Arbeitnehmers akzeptiert
                </div>
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Datenschutzerklaerung akzeptiert
                </div>
              </div>

              {/* Signatur-Darstellung */}
              <div className="mt-6 border-t border-border/50 pt-5 text-center">
                <div className="inline-block">
                  {/* Handschrift-artige Signatur */}
                  <p
                    className="text-2xl text-primary"
                    style={{
                      fontFamily: "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {fullName}
                  </p>
                  <div className="mx-auto mt-1 h-[1px] w-48 bg-primary/40" />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Digitale Signatur via CREDO HR-Portal
                  </p>
                </div>
              </div>

              {/* Verifizierungscode */}
              <div className="mt-5 rounded-lg bg-card/60 px-3 py-2 text-center">
                <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  Verifizierungscode
                </p>
                <p className="font-mono text-xs font-bold tracking-widest text-foreground">
                  {verificationCode}
                </p>
              </div>
            </div>
          </div>

          {/* Hinweis */}
          <div className="px-8 pb-6">
            <div className="rounded-lg bg-muted p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Bitte bewahren Sie die Bestätigungs-ID{" "}
                <strong className="text-foreground">{signatureId}</strong>{" "}
                für Ihre Unterlagen auf.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sie können dieses Fenster jetzt schließen.
              </p>
            </div>
          </div>

          {/* CREDO-Linie */}
          <CredoLinie />
        </div>

        {/* Footer */}
        <p className="mt-6 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
        </p>
      </div>
    );
  }

  // Step-Komponente rendern
  const stepProps = {
    data: formData,
    onNext: handleNext,
    onBack: handleBack,
    saving,
    questionnaireType: initialData.questionnaireType,
    organization: initialData.organization,
  };

  // Masken je Schritt-Schluessel. Welche davon der Mitarbeiter zu sehen bekommt
  // und in welcher Reihenfolge, entscheidet allein `activeSteps`.
  const stepComponents: Record<FragebogenStepKey, ReactNode> = {
    personal: <Step1Personal {...stepProps} fieldConfig={getFieldConfig(1)} />,
    address: <Step2Address {...stepProps} fieldConfig={getFieldConfig(2)} />,
    bank: <Step3Bank {...stepProps} fieldConfig={getFieldConfig(3)} />,
    social: (
      <Step4SocialSecurity {...stepProps} fieldConfig={getFieldConfig(4)} token={token} />
    ),
    tax: <Step5Tax {...stepProps} fieldConfig={getFieldConfig(5)} />,
    employment: <Step6Employment {...stepProps} fieldConfig={getFieldConfig(6)} />,
    education: <Step8Education {...stepProps} fieldConfig={getFieldConfig(8)} />,
    masern: <Step9Masern {...stepProps} fieldConfig={getFieldConfig(9)} token={token} />,
    rente: (
      <Step11Rente
        {...stepProps}
        fieldConfig={getFieldConfig(11)}
        token={token}
        antragErzeugbar={initialData.organization.betriebsnummerVorhanden !== false}
      />
    ),
    summary: (
      <Step10Summary
        {...stepProps}
        fieldConfig={getFieldConfig(10)}
        allData={formData}
        onSubmit={handleSubmit}
        token={token}
        requiredDocuments={initialData.requiredDocuments ?? undefined}
        antragErzeugbar={initialData.organization.betriebsnummerVorhanden !== false}
      />
    ),
  };

  const activeStep = activeSteps[currentStep];
  const progress = ((currentStep + 1) / activeSteps.length) * 100;

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/credo_logo.svg"
              alt="CREDO"
              width={100}
              height={33}
              priority
            />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-foreground">
                Personalfragebogen
              </h1>
              <p className="text-xs text-muted-foreground">
                {initialData.organization.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saving && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                Speichern...
              </span>
            )}
            {/* Nur Erfolgsmeldungen ("Gespeichert") — Fehler stehen rot im
                Inhaltsbereich, nicht hier in Gruen. */}
            {saveMessage && !saving && (
              <span className="text-xs text-green-600">{saveMessage}</span>
            )}
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Schritt {currentStep + 1} / {activeSteps.length}
            </span>
          </div>
        </div>

        {/* Fortschrittsbalken */}
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <CredoLinie height={2} />
      </header>

      {/* Step-Navigator (Horizontal) */}
      <nav className="border-b bg-card">
        <div className="mx-auto max-w-3xl overflow-x-auto px-4 py-2">
          <div className="flex gap-1">
            {activeSteps.map((step, index) => {
              const isActive = index === currentStep;
              // Anklickbar ist alles, was schon einmal auf dem Bildschirm
              // stand — vorwaerts wie rueckwaerts. Der Haken bleibt den
              // Schritten vorbehalten, die mit "Weiter" abgeschlossen wurden;
              // `maxErreicht` selbst wurde betreten, aber noch nicht bestaetigt.
              const erreicht = index <= maxErreicht;
              const isDone = index < maxErreicht;

              return (
                <button
                  key={step.step}
                  type="button"
                  onClick={() => springeZu(index)}
                  disabled={!erreicht || saving}
                  aria-current={isActive ? "step" : undefined}
                  title={
                    erreicht
                      ? `Schritt ${index + 1}: ${step.title}`
                      : `Schritt ${index + 1}: ${step.title} — noch nicht erreicht`
                  }
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : erreicht
                        ? "bg-green-100 text-green-800 hover:bg-green-200"
                        : "text-muted-foreground opacity-50"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      isActive
                        ? "bg-primary-foreground text-primary"
                        : erreicht
                          ? "bg-green-600 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? (
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="hidden lg:inline">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Formular-Inhalt */}
      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* Fehler des letzten Speicher- oder Absendeversuchs. Bewusst hier im
            Inhalt und in Rot statt als kleiner gruener Text im Kopf: Wer auf
            "Weiter" klickt und nichts passieren sieht, muss den Grund finden
            koennen. `role="alert"` liest ihn auch dem Screenreader vor. */}
        {fehler && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
          >
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v3.75m0 3.75h.008M10.34 3.94l-8.1 14.02A1.5 1.5 0 003.54 20.25h16.92a1.5 1.5 0 001.3-2.29l-8.1-14.02a1.5 1.5 0 00-2.6 0z"
              />
            </svg>
            {/* Ohne eigene Ueberschrift: Die Meldung ist bereits ein
                vollstaendiger Satz, und eine feste Zeile darueber („nicht
                gespeichert") waere beim Absenden oder bei einem
                Verbindungsabbruch schlicht falsch. */}
            <p className="text-sm font-medium text-destructive">{fehler}</p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          {/* Step-Header */}
          <div className="border-b bg-muted/50 px-6 py-4">
            <h2 className="text-lg font-bold text-foreground">
              {activeStep?.title ?? ""}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {activeStep?.description ?? ""}
            </p>
          </div>

          {/* Step-Inhalt. Der Ref liest vor einem Sprung ueber die Leiste die
              Eingabefelder dieser Maske aus — siehe `leseEingaben`. */}
          <div className="p-6" ref={inhaltRef}>
            {activeStep?.key ? stepComponents[activeStep.key] : null}
          </div>
        </div>
      </main>

      {/* Rueckfrage vor dem Verwerfen ungespeicherter Eingaben.
          Sie erscheint NUR, wenn sich in der Maske tatsaechlich etwas
          geaendert hat: Ein Sprung, der stillschweigend Eingaben verwirft,
          waere schlimmer als die alte, gesperrte Leiste — eine Rueckfrage bei
          jedem Klick waere aber genau die Muehsal, die hier abgeschafft wird. */}
      {sprungZiel !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sprung-titel"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") setSprungZiel(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <h2 id="sprung-titel" className="text-base font-bold text-foreground">
              Eingaben auf dieser Seite gehen verloren
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sie haben auf dieser Seite etwas eingetragen oder geändert.
              Gespeichert wird erst mit „Weiter“ am Ende der Seite. Wenn Sie
              jetzt zu „{activeSteps[sprungZiel]?.title ?? "einem anderen Schritt"}“
              wechseln, sind diese Eingaben weg.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => setSprungZiel(null)}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Hier bleiben
              </button>
              <button
                type="button"
                onClick={() => wechsleZu(sprungZiel)}
                className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Ohne Speichern wechseln
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto border-t bg-card py-4 text-center">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
          &middot; Ihre Daten werden verschlüsselt übertragen.
        </p>
      </footer>
    </div>
  );
}
