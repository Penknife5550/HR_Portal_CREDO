"use client";

/**
 * Dokumenten-Upload Komponente
 *
 * Erlaubt das Hochladen von Unterlagen (PDF, Bilder, Word)
 * mit Kategorisierung und Vorschau.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DOCUMENT_TYPE_LABELS,
  PFLICHT_HINWEISE,
  effektivePflichtDokumente,
  istNachreichbar,
} from "@/lib/required-documents";
import { ablaufAmpel, istFristpflichtig } from "@/lib/dokument-fristen";
import { masernschutzPflichtig } from "@/lib/masernschutz";
import { formatBytes } from "@/lib/format";

interface UploadedDoc {
  id: string;
  fileName: string;
  fileSize: number;
  type: string;
  /** Ablaufdatum als ISO-Zeichenkette; `null` = keine Frist erfasst. */
  gueltigBis?: string | null;
  uploadedAt: string;
}

interface DocumentUploadProps {
  token: string;
  hasChildren?: boolean;
  /** Wie viele Kinder eingetragen sind — fuer den Abgleich mit den Urkunden. */
  anzahlKinder?: number;
  /** Pflicht-Dokumenttypen aus der Vorlagen-Konfiguration (DocumentType-Werte). */
  requiredDocuments?: string[];
  /** Entscheidung aus Schritt 11 — sie kann eine Pflicht erzeugen. */
  rvEntscheidung?: string | null;
  /**
   * Geburtsdatum aus Schritt 1 und Einrichtungstyp des Mandanten.
   *
   * Daraus — und nur daraus — entsteht die Masernschutz-Pflicht. Bewusst die
   * Rohwerte statt eines fertigen Wahrheitswerts: Die Regel liegt in
   * `src/lib/masernschutz.ts` und wird hier ausgewertet, damit der Aufrufer
   * sie nicht anwenden (und dabei falsch anwenden) kann. Der Server ruft
   * dieselbe Funktion mit denselben Eingaben auf.
   *
   * Fehlt eines von beiden: keine Pflicht. Ein Vorgang ohne Geburtsdatum darf
   * keine Forderung erzeugen — die Person wurde nie danach gefragt.
   */
  geburtsdatum?: unknown;
  organisationstyp?: string | null;
  /**
   * Selbstauskunft aus Schritt 1 — sie erzeugt die Pflicht zu Aufenthaltstitel
   * und Arbeitserlaubnis.
   *
   * `null`/`undefined` heisst "noch nicht beantwortet" und erzeugt KEINE
   * Pflicht; die Regel dazu steht in `required-documents.ts` und wird hier nur
   * uebergeben, damit Client und Server dieselbe Antwort bekommen.
   */
  aufenthaltstitelErforderlich?: boolean | null;
  /** "gesetzlich" | "privat" aus Schritt 4 — "privat" verlangt den PKV-Nachweis. */
  healthInsuranceType?: string | null;
  /** Ist beim Mandanten eine Betriebsnummer hinterlegt? */
  antragErzeugbar?: boolean;
  /**
   * Meldet nach oben, was noch fehlt — Schritt 10 sperrt damit das Absenden.
   *
   * Enthaelt nur die **sperrenden** Pflichten. Eine nachreichbare Unterlage
   * (Masernschutz) steht bewusst nicht darin, sonst sperrte sie ueber diesen
   * Umweg doch. Wer wissen will, welche der nachreichbaren Pflichten noch offen
   * ist, nimmt `onNachzureichenChange` — die beiden Kanaele sind bewusst
   * getrennt, damit kein Umbau an der Anzeige versehentlich die Sperre erweitert.
   */
  onMissingChange?: (missing: string[]) => void;
  /**
   * Das Gegenstueck: die **nachreichbaren** Pflichten, die noch offen sind.
   *
   * Schritt 10 sperrt damit NICHTS — er sagt nur, was tatsaechlich noch fehlt,
   * und blendet seinen Ausblick aus, sobald alles da ist. Der Kanal existiert,
   * weil `documents` lokaler Zustand dieser Komponente ist: Ein zweiter
   * Ladeweg daneben liefe der Upload-Karte zwangslaeufig hinterher, und wer
   * gerade hochgeladen hat, laese eine Sekunde spaeter, die Unterlage fehle
   * noch. Gemeldet wird deshalb aus DERSELBEN Liste, aus der die Karte oben
   * ihre Haken zeichnet.
   */
  onNachzureichenChange?: (offen: string[]) => void;
}

// Fallback-Pflichtdokumente, falls die Vorlage keine Konfiguration liefert.
const FALLBACK_REQUIRED_TYPES = ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"];

// Optionale Dokumente (Dropdown)
const OPTIONAL_DOCUMENT_CATEGORIES = [
  { value: "kk_bescheinigung", label: "Mitgliedsbescheinigung Krankenkasse" },
  { value: "pkv_nachweis", label: "Nachweis private Krankenversicherung" },
  { value: "sv_ausweis", label: "Sozialversicherungsausweis" },
  { value: "masernschutz", label: "Masernschutz-Nachweis" },
  { value: "sb_ausweis", label: "Schwerbehindertenausweis" },
  { value: "rv_befreiung", label: "Antrag RV-Befreiung (Minijob)" },
  { value: "vl_vertrag", label: "VL-Vertrag (Vermoeg. Leistungen)" },
  { value: "bav_vertrag", label: "bAV-Vertrag (Altersvorsorge)" },
  { value: "aufenthaltstitel", label: "Aufenthaltstitel" },
  { value: "arbeitserlaubnis", label: "Arbeitserlaubnis / Zusatzblatt" },
  { value: "zeugnis", label: "Zeugnis / Qualifikationsnachweis" },
  { value: "sonstiges", label: "Sonstiges Dokument" },
];

const TYPE_LABELS: Record<string, string> = {
  KK_BESCHEINIGUNG: "KK-Bescheinigung",
  PKV_NACHWEIS: "PKV-Nachweis",
  GEBURTSURKUNDE_EIGEN: "Geburtsurkunde (eigene)",
  GEBURTSURKUNDE_KIND: "Geburtsurkunde Kind",
  SV_AUSWEIS: "SV-Ausweis",
  MASERNSCHUTZ: "Masernschutz",
  SB_AUSWEIS: "SB-Ausweis",
  RV_BEFREIUNG: "RV-Befreiung",
  VL_VERTRAG: "VL-Vertrag",
  BAV_VERTRAG: "bAV-Vertrag",
  AUFENTHALTSTITEL: "Aufenthaltstitel",
  ARBEITSERLAUBNIS: "Arbeitserlaubnis",
  ZEUGNIS: "Zeugnis",
  SONSTIGES: "Sonstiges",
  ARBEITSVERTRAG: "Arbeitsvertrag",
  FUEHRUNGSZEUGNIS: "Fuehrungszeugnis",
  ABSCHLUSSZEUGNIS: "Abschlusszeugnis",
  INFEKTIONSSCHUTZ: "Infektionsschutz",
};

/**
 * Der Satz unter dem Datumsfeld — er beantwortet die Frage „warum wollt ihr das
 * wissen?", bevor sie entsteht.
 *
 * Und er verspricht NICHT, dass die Person selbst erinnert wird: Die Erinnerung
 * geht an das Postfach der Personalabteilung (Entscheidung 07.09.2026). Ein
 * Satz, der etwas anderes zusagt, waere in einem Jahr eine gebrochene Zusage.
 */
const FRIST_ERKLAERUNG =
  "Damit die Personalabteilung Sie rechtzeitig vor Ablauf ansprechen kann.";

export function DocumentUpload({
  token,
  hasChildren = false,
  anzahlKinder = 0,
  requiredDocuments,
  rvEntscheidung,
  geburtsdatum,
  organisationstyp,
  aufenthaltstitelErforderlich,
  healthInsuranceType,
  antragErzeugbar = true,
  onMissingChange,
  onNachzureichenChange,
}: DocumentUploadProps) {
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("sonstiges");
  /**
   * Der Bestand konnte nicht geladen werden — nicht: es gibt keinen.
   *
   * Die Unterscheidung ist der ganze Punkt. `documents` ist bei beidem ein
   * leeres Array, und ohne dieses Kennzeichen behauptet die Seite nach einer
   * kurz gestoerten Verbindung, saemtliche Pflichtunterlagen fehlten. Wer das
   * liest, laedt alles ein zweites Mal hoch.
   */
  const [ladeFehler, setLadeFehler] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  /**
   * Das eingetippte Ablaufdatum je Dokumenttyp, bevor die Datei gewaehlt wird
   * — und das nachgetragene je Dokument-Id.
   *
   * Zwei Schluesselraeume in EINER Ablage waeren verwechselbar, deshalb zwei
   * Zustaende. Der Wert ist die Zeichenkette aus `<input type="date">`
   * ("JJJJ-MM-TT" oder ""), nicht `Date`: Umgerechnet wird erst auf dem Server,
   * damit die Zeitzone des Browsers nicht in ein reines Datum hineinredet.
   */
  const [fristEingabe, setFristEingabe] = useState<Record<string, string>>({});
  const [nachtragEingabe, setNachtragEingabe] = useState<Record<string, string>>({});
  const [nachtragLaeuft, setNachtragLaeuft] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requiredFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Pruefen ob ein Pflichtdokument bereits hochgeladen wurde
  const isRequiredUploaded = (dbType: string) => {
    return documents.some((doc) => doc.type === dbType);
  };

  // Dokumente laden
  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/fragebogen/${token}/documents`);
      if (!res.ok) {
        setLadeFehler(true);
        return;
      }
      const data = await res.json();
      setDocuments(data.documents || []);
      setLadeFehler(false);
    } catch {
      setLadeFehler(true);
    }
  }, [token]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Upload-Funktion (optionaler Typ-Override für Pflichtdokumente)
  const handleUpload = async (file: File, typeOverride?: string) => {
    setError("");
    setSuccess("");

    // Client-seitige Dateigroessen-Validierung (max. 10 MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setError(`Datei "${file.name}" ist zu gross (max. 10 MB).`);
      return;
    }

    const kategorie = typeOverride || selectedCategory;
    const dbTyp = kategorie.toUpperCase();

    setUploading(true);
    if (typeOverride) setUploadingType(typeOverride);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", kategorie);
    // Nur bei den Typen mitschicken, die ueberhaupt eine Frist tragen: Der
    // Server weist ein Datum an allen anderen mit 400 zurueck — ein
    // vergessener Eintrag im Zustand duerfte nicht den naechsten Upload eines
    // ganz anderen Nachweises scheitern lassen.
    const frist = istFristpflichtig(dbTyp) ? (fristEingabe[dbTyp] ?? "") : "";
    if (frist) formData.append("gueltigBis", frist);

    try {
      const res = await fetch(`/api/fragebogen/${token}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Hochladen.");
        return;
      }

      setSuccess(`${file.name} erfolgreich hochgeladen.`);
      setTimeout(() => setSuccess(""), 3000);
      // Das Datum ist jetzt am Dokument gespeichert; bliebe es zusaetzlich im
      // Eingabefeld stehen, ginge es beim naechsten Upload desselben Typs
      // ungefragt mit.
      if (frist) setFristEingabe((v) => ({ ...v, [dbTyp]: "" }));
      await loadDocuments();
    } catch {
      setError("Verbindungsfehler beim Hochladen.");
    } finally {
      setUploading(false);
      setUploadingType(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /**
   * Ablaufdatum an einem bereits hochgeladenen Nachweis nachtragen.
   *
   * Der Weg existiert, damit „Frist fehlt" keine Sackgasse ist: Ohne ihn muesste
   * die Person ihren Scan loeschen und dieselbe Datei erneut hochladen, nur um
   * ein Datum zu ergaenzen.
   */
  const handleFristNachtragen = async (docId: string) => {
    const wert = (nachtragEingabe[docId] ?? "").trim();
    if (!wert) {
      setError("Bitte geben Sie ein Ablaufdatum an.");
      return;
    }

    setError("");
    setNachtragLaeuft(docId);
    try {
      const res = await fetch(`/api/fragebogen/${token}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId, gueltigBis: wert }),
      });
      if (!res.ok) {
        const koerper = await res.json().catch(() => null);
        const meldung =
          koerper && typeof koerper.error === "string" ? koerper.error : "";
        setError(meldung || "Das Ablaufdatum konnte nicht gespeichert werden.");
        return;
      }
      setNachtragEingabe((v) => ({ ...v, [docId]: "" }));
      setSuccess("Ablaufdatum gespeichert.");
      setTimeout(() => setSuccess(""), 3000);
      await loadDocuments();
    } catch {
      setError("Verbindungsfehler beim Speichern des Ablaufdatums.");
    } finally {
      setNachtragLaeuft(null);
    }
  };

  // Dokument löschen
  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(
        `/api/fragebogen/${token}/documents?documentId=${docId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        // Ohne Meldung wirkt ein fehlgeschlagenes Loeschen wie ein Klick ins
        // Leere: Die Zeile bleibt stehen, und niemand weiss, warum.
        const koerper = await res.json().catch(() => null);
        const meldung =
          koerper && typeof koerper.error === "string" ? koerper.error : "";
        setError(meldung || "Das Dokument konnte nicht gelöscht werden.");
        return;
      }
      setError("");
      await loadDocuments();
    } catch {
      setError("Verbindungsfehler beim Löschen.");
    }
  };

  // Drag & Drop Handler
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleUpload(e.dataTransfer.files[0]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCategory, token]
  );

  // Pflichtdokumente aus der Vorlagen-Konfiguration ableiten (Fallback: Geburtsurkunden).
  //
  // Die Bedingungen stehen bewusst NICHT hier, sondern in required-documents.ts:
  // Der Server prueft beim Absenden mit derselben Funktion. Zwei Nachbauten
  // liefen frueher oder spaeter auseinander — und dann sperrt der Server etwas,
  // wovon das Formular nichts weiss.
  const requiredTypes =
    requiredDocuments && requiredDocuments.length > 0
      ? requiredDocuments
      : FALLBACK_REQUIRED_TYPES;

  const pflichtTypen = effektivePflichtDokumente({
    required: requiredTypes,
    hasChildren,
    rvEntscheidung,
    masernschutzPflichtig: masernschutzPflichtig({
      geburtsdatum,
      organisationstyp,
    }),
    aufenthaltstitelErforderlich,
    healthInsuranceType,
  });

  const activeRequiredDocs = pflichtTypen.map((t) => ({
    value: t.toLowerCase(),
    dbType: t,
    label: DOCUMENT_TYPE_LABELS[t] ?? t,
    /** Haelt das Fehlen dieser Unterlage das Absenden auf? */
    nachreichbar: istNachreichbar(t),
    /** Braucht dieser Nachweis zusaetzlich ein Ablaufdatum? */
    mitFrist: istFristpflichtig(t),
    /** Der erklaerende Satz, falls dieser Typ einen hat. */
    hinweis: PFLICHT_HINWEISE[t],
  }));

  // Was hier Pflicht ist, gehoert nicht zusaetzlich ins Dropdown der freiwilligen
  // Unterlagen — sonst stuende derselbe Typ zweimal auf der Seite.
  const optionaleKategorien = OPTIONAL_DOCUMENT_CATEGORIES.filter(
    (k) => !pflichtTypen.includes(k.value.toUpperCase())
  );

  // Der Absende-Knopf in Schritt 10 haengt an dieser Liste. Sie liegt nur hier
  // vor, weil `documents` lokaler Zustand dieser Komponente ist.
  //
  // Bei `ladeFehler` wird NICHTS gemeldet: Was fehlt, ist dann unbekannt, und
  // eine geratene Liste sperrte das Absenden mit Namen von Unterlagen, die
  // laengst hochgeladen sind. Ein zu grosszuegiges Nichtstun ist hier gefahrlos
  // — verbindlich prueft ohnehin der Server gegen den Datenbankstand.
  //
  // Gemeldet wird nur, was sperrt. Der Masernschutz-Nachweis steht als Pflicht
  // in der Liste oben und wird angemahnt, darf das Absenden aber nicht
  // aufhalten (Entscheidung 07.09.2026, Begruendung in required-documents.ts).
  // Ginge er hier mit nach oben, waere die Nachreichbarkeit eine Behauptung und
  // der Absende-Knopf trotzdem gesperrt.
  const fehlend = ladeFehler
    ? []
    : pflichtTypen.filter(
        (t) => !istNachreichbar(t) && !documents.some((d) => d.type === t),
      );
  const fehlendSchluessel = fehlend.join(",");
  useEffect(() => {
    onMissingChange?.(fehlendSchluessel ? fehlendSchluessel.split(",") : []);
    // Bewusst am Schluessel haengen, nicht am Array: Ein neues Array bei jedem
    // Rendern wuerde eine Endlosschleife ausloesen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fehlendSchluessel]);

  // Der zweite Kanal: die nachreichbaren Pflichten, die noch OFFEN sind.
  //
  // Er sperrt nichts — Schritt 10 sagt damit nur, was tatsaechlich noch fehlt,
  // statt alle nachreichbaren Pflichten des Vorgangs aufzuzaehlen (auch die
  // laengst hochgeladenen). Bewusst aus `pflichtTypen` gefiltert und nicht aus
  // einer zweiten Auswertung der Regeln: Die Karte oben zeichnet ihre Haken aus
  // genau dieser Liste, und zwei Berechnungen liefen frueher oder spaeter
  // auseinander — etwa ueber den Rueckfall auf FALLBACK_REQUIRED_TYPES, den
  // nur diese Komponente kennt.
  //
  // Bei `ladeFehler` wird — wie oben — nichts gemeldet: Was fehlt, ist dann
  // unbekannt, und der Ausblick verschwindet lieber, als offene Posten zu
  // behaupten. An seiner Stelle steht ohnehin der Fehlerkasten der Karte.
  const offeneNachreichbare = ladeFehler
    ? []
    : pflichtTypen.filter(
        (t) => istNachreichbar(t) && !documents.some((d) => d.type === t),
      );
  const offeneNachreichbareSchluessel = offeneNachreichbare.join(",");
  useEffect(() => {
    onNachzureichenChange?.(
      offeneNachreichbareSchluessel
        ? offeneNachreichbareSchluessel.split(",")
        : [],
    );
    // Schluessel statt Array — siehe oben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offeneNachreichbareSchluessel]);

  // Die Pflicht ist erfuellt, sobald EIN Dokument dieses Typs vorliegt — auch
  // bei mehreren Kindern. Das bleibt bewusst so: Ein Scan kann zwei Urkunden
  // enthalten, und wer solche Faelle aussperrt, schafft mehr Aerger als er
  // verhindert. Ein stiller Durchlauf waere aber auch falsch, deshalb der
  // Hinweis — er blockiert nicht.
  const urkundenKinder = documents.filter(
    (d) => d.type === "GEBURTSURKUNDE_KIND"
  ).length;
  const urkundenFehlenMoeglicherweise =
    anzahlKinder > 1 && urkundenKinder > 0 && urkundenKinder < anzahlKinder;

  return (
    /*
     * `data-dateibereich` sagt dem Rahmen (fragebogen-form.tsx), dass die
     * Eingaben hier drin NICHT am „Weiter" haengen und deshalb aus der
     * Verlust-Rueckfrage vor einem Schrittsprung herausfallen.
     *
     * Der Grund ist die Selbstumbau-Eigenschaft dieser Karte: Ein Upload — oder
     * ein Loeschen, ein nachgetragenes Datum, ein Wechsel der Dokumentenart —
     * aendert die Feldmenge, weil „Gültig bis" nur VOR dem Upload steht. Ohne
     * das Merkmal las der Rahmen dieselbe Maske vorher und nachher
     * unterschiedlich und warnte vor dem Verlust von Eingaben, die gerade
     * nachweislich auf dem Server gelandet sind. Eine Warnung, die immer kommt,
     * wird weggeklickt — und dahinter stehen echte ungespeicherte Eingaben.
     *
     * Verloren gehen kann hier nichts: Datei und Ablaufdatum speichert der
     * POST, das nachgetragene Datum der PATCH — beide sofort und ueber eigene
     * Knoepfe, nicht ueber das „Weiter" des Schritts.
     */
    <div className="space-y-4" data-dateibereich="">
      {/* ============================================= */}
      {/* PFLICHTDOKUMENTE */}
      {/* ============================================= */}
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50/50 p-4">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
          <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          Pflichtdokumente
        </h3>
        <p className="mb-4 text-xs text-amber-800">
          Die folgenden Unterlagen werden benötigt. Bitte laden Sie diese hoch
          (PDF, JPG, PNG, Word). Max. 10 MB pro Datei.
          {/* Ohne diesen Zusatz stuende ueber einer nachreichbaren Unterlage
              „zwingend benötigt", und wer sie nicht zur Hand hat, sucht den
              Fehler bei sich oder bricht ab. */}
          {pflichtTypen.some((t) => istNachreichbar(t)) && (
            <>
              {" "}
              Einzelne Nachweise dürfen Sie nachreichen — das ist beim
              jeweiligen Eintrag vermerkt.
            </>
          )}
        </p>

        {/* Solange der Bestand unbekannt ist, wird er nicht dargestellt. Eine
            Liste aus lauter „Noch nicht hochgeladen" waere hier keine
            Unbekannte, sondern eine falsche Auskunft. */}
        {ladeFehler ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3"
          >
            <p className="text-xs font-medium text-destructive">
              Ihre bereits hochgeladenen Unterlagen konnten nicht abgerufen
              werden.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Das liegt meist an einer kurz gestörten Verbindung. Bitte
              versuchen Sie es erneut — laden Sie nichts vorsorglich ein
              zweites Mal hoch, Ihre Dateien sind gespeichert.
            </p>
            <button
              type="button"
              onClick={() => loadDocuments()}
              className="mt-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Erneut versuchen
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeRequiredDocs.map((reqDoc) => {
              const uploaded = isRequiredUploaded(reqDoc.dbType);
              const isCurrentlyUploading = uploadingType === reqDoc.value;
              const doc = documents.find((d) => d.type === reqDoc.dbType);
              // Nur bei fristpflichtigen Typen ueberhaupt gerechnet — sonst
              // stuende an einer Geburtsurkunde „Keine Frist erfasst", was
              // richtig, aber sinnlos ist.
              const ampel =
                reqDoc.mitFrist && doc ? ablaufAmpel(doc.gueltigBis) : null;
              const fristFehlt = ampel !== null && ampel.kategorie === null;

              return (
                <div
                  key={reqDoc.value}
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                    uploaded
                      ? "border-green-300 bg-green-50"
                      : "border-amber-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {uploaded ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                        <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                        <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{reqDoc.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {uploaded
                          ? ampel
                            ? `Hochgeladen – ${ampel.text}`
                            : "Hochgeladen"
                          : reqDoc.nachreichbar
                            ? "Noch nicht hochgeladen – Pflicht, nachreichbar"
                            : "Noch nicht hochgeladen – Pflicht"}
                      </p>
                      {/* Die Erklaerung steht genau dort, wo die Person die
                          Datei gerade in der Hand haelt. Sie kommt aus
                          required-documents.ts und nicht aus einer Kette von
                          `if`s hier: Sonst bekommt der naechste Dokumenttyp
                          seinen Satz nie, weil niemand die Verzweigung
                          nachtraegt. */}
                      {!uploaded && reqDoc.hinweis && (
                        <p className="mt-1.5 max-w-md text-[11px] leading-relaxed text-amber-800">
                          {reqDoc.hinweis}
                        </p>
                      )}
                      {/* Der Befreiungsantrag braucht ueber den Satz hinaus das
                          Blatt selbst — sonst weiss niemand, woher es kommt. */}
                      {reqDoc.dbType === "RV_BEFREIUNG" && !uploaded && (
                        <div className="mt-1 max-w-md">
                          {antragErzeugbar ? (
                            <a
                              href={`/api/fragebogen/${token}/rv-antrag?art=BEFREIUNG`}
                              className="inline-block text-[11px] font-semibold text-primary underline underline-offset-2"
                            >
                              Antrag ausgefüllt herunterladen (PDF)
                            </a>
                          ) : (
                            <p className="text-[11px] font-medium text-amber-900">
                              Der Antrag kann derzeit nicht erstellt werden. Bitte
                              wenden Sie sich an die Personalabteilung — Ihre
                              Eingaben bleiben gespeichert.
                            </p>
                          )}
                        </div>
                      )}
                      {/* Das Ablaufdatum wird VOR der Datei abgefragt, damit es
                          mit ihr zusammen gespeichert werden kann. Es ist
                          freiwillig: Ein Pflichtfeld daneben liesse den Upload
                          scheitern, und der Scan ist das Wichtigere. */}
                      {reqDoc.mitFrist && !uploaded && (
                        <div className="mt-2 max-w-md">
                          <label
                            htmlFor={`frist-${reqDoc.value}`}
                            className="mb-1 block text-[11px] font-medium text-foreground"
                          >
                            Gültig bis (Ablaufdatum)
                          </label>
                          <input
                            id={`frist-${reqDoc.value}`}
                            type="date"
                            value={fristEingabe[reqDoc.dbType] ?? ""}
                            onChange={(e) =>
                              setFristEingabe((v) => ({
                                ...v,
                                [reqDoc.dbType]: e.target.value,
                              }))
                            }
                            className="rounded-lg border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {FRIST_ERKLAERUNG}
                          </p>
                        </div>
                      )}
                      {/* Hochgeladen, aber ohne Datum: Das darf nicht still
                          bleiben. Die Ampel kann dann naemlich gar nichts
                          sagen — und ein Nachweis ohne Frist sieht auf jeder
                          Uebersicht genauso vollstaendig aus wie einer mit. */}
                      {uploaded && fristFehlt && doc && (
                        <div className="mt-2 max-w-md rounded-lg border border-amber-300 bg-amber-50 p-2">
                          <p className="text-[11px] font-medium text-amber-900">
                            Kein Ablaufdatum erfasst — wir können vor Ablauf
                            nicht erinnern.
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <input
                              type="date"
                              aria-label={`Ablaufdatum für ${reqDoc.label}`}
                              value={nachtragEingabe[doc.id] ?? ""}
                              onChange={(e) =>
                                setNachtragEingabe((v) => ({
                                  ...v,
                                  [doc.id]: e.target.value,
                                }))
                              }
                              className="rounded-lg border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                            />
                            <button
                              type="button"
                              disabled={nachtragLaeuft === doc.id}
                              onClick={() => handleFristNachtragen(doc.id)}
                              className="rounded-lg border border-amber-600 px-2 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50"
                            >
                              {nachtragLaeuft === doc.id
                                ? "Wird gespeichert..."
                                : "Datum speichern"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {!uploaded && (
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => requiredFileInputRefs.current[reqDoc.value]?.click()}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                    >
                      {isCurrentlyUploading ? "Wird hochgeladen..." : "Hochladen"}
                    </button>
                  )}
                  {uploaded && (
                    <button
                      type="button"
                      onClick={() => {
                        const doc = documents.find((d) => d.type === reqDoc.dbType);
                        if (doc) handleDelete(doc.id);
                      }}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Löschen"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}

                  <input
                    ref={(el) => { requiredFileInputRefs.current[reqDoc.value] = el; }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleUpload(e.target.files[0], reqDoc.value);
                    }}
                    disabled={uploading}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {urkundenFehlenMoeglicherweise && (
        <div className="rounded-lg border border-[#FBC900]/50 bg-[#FBC900]/10 px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            {urkundenKinder} von {anzahlKinder} Geburtsurkunden hochgeladen
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/80">
            Sie haben {anzahlKinder} Kinder eingetragen, aber{" "}
            {urkundenKinder === 1
              ? "nur eine Geburtsurkunde"
              : `${urkundenKinder} Geburtsurkunden`}{" "}
            hochgeladen. Falls eine Datei mehrere Urkunden enthält, ist alles in
            Ordnung — Sie können absenden. Andernfalls ergänzen Sie die
            fehlenden bitte oben.
          </p>
        </div>
      )}

      {/* ============================================= */}
      {/* OPTIONALE DOKUMENTE */}
      {/* ============================================= */}
      <div className="rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
          <svg className="h-5 w-5 text-[#009AC6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Weitere Unterlagen (optional)
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Falls vorhanden, können Sie hier weitere Dokumente hochladen. Max. 10 MB pro Datei.
        </p>

        {/* Kategorie waehlen */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-foreground">
            Dokumentenart
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            {optionaleKategorien.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Auch freiwillig hochgeladene Titel laufen ab. Ohne dieses Feld waere
            das Ablaufdatum eine Eigenschaft des Weges („nur wenn es Pflicht
            war") statt eine des Dokuments. */}
        {istFristpflichtig(selectedCategory.toUpperCase()) && (
          <div className="mb-3">
            <label
              htmlFor="frist-optional"
              className="mb-1 block text-xs font-medium text-foreground"
            >
              Gültig bis (Ablaufdatum)
            </label>
            <input
              id="frist-optional"
              type="date"
              value={fristEingabe[selectedCategory.toUpperCase()] ?? ""}
              onChange={(e) =>
                setFristEingabe((v) => ({
                  ...v,
                  [selectedCategory.toUpperCase()]: e.target.value,
                }))
              }
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {FRIST_ERKLAERUNG}
            </p>
          </div>
        )}

        {/* Drag & Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          }`}
        >
          <svg
            className="mx-auto mb-2 h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          <p className="text-sm text-muted-foreground">
            {uploading && !uploadingType
              ? "Wird hochgeladen..."
              : "Datei hierher ziehen oder klicken zum Auswaehlen"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleUpload(e.target.files[0]);
            }}
            disabled={uploading}
          />
        </div>

        {/* Status-Meldungen */}
        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
        {success && (
          <p className="mt-2 text-xs text-green-600">{success}</p>
        )}
      </div>

      {/* ============================================= */}
      {/* ALLE HOCHGELADENEN DOKUMENTE */}
      {/* ============================================= */}
      {documents.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="border-b bg-muted/50 px-4 py-2">
            <h4 className="text-xs font-semibold text-foreground">
              Hochgeladene Dokumente ({documents.length})
            </h4>
          </div>
          <div className="divide-y">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                    <svg
                      className="h-4 w-4 text-[#009AC6]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {doc.fileName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {TYPE_LABELS[doc.type] || doc.type} &middot;{" "}
                      {formatBytes(doc.fileSize)}
                      {/* Bei fristpflichtigen Nachweisen gehoert die Frist in
                          dieselbe Zeile wie der Typ — sonst steht sie nur oben
                          bei den Pflichten, und ein freiwillig hochgeladener
                          Titel traegt sie nirgends. */}
                      {istFristpflichtig(doc.type) && (
                        <> &middot; {ablaufAmpel(doc.gueltigBis).text}</>
                      )}
                    </p>
                  </div>
                </div>
                {/* type="button" ist Pflicht: ohne das Attribut ist der Knopf
                    ein Submit-Knopf und loest zusaetzlich zum Loeschen den
                    verbindlichen Absende-Dialog aus (Schritt 10). */}
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Löschen"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
