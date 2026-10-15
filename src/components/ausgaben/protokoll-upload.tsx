"use client";

/**
 * Karte „Unterschriebenes Übergabeprotokoll“ im Reiter Dokumente der
 * Onboarding-Detailseite — Ausstattung & Zugaenge Stufe 2, Feinplan A4, S34,
 * G19, 1.8.
 *
 * Der Weg: HR erzeugt das Uebergabeprotokoll (System-Vorlage, eine Seite je
 * Stelle), gibt der ausgebenden Stelle ihre Seite zur Unterschrift und laedt
 * die unterschriebenen Seiten hier hoch (`POST /api/onboarding/[id]/documents`
 * mit `type = UEBERGABEPROTOKOLL`). Danach steht das Dokument in der Liste
 * „hochgeladen“ darunter, und die Zeile der Karte „Ausstattung & Zugänge“
 * wechselt auf „hochgeladen am …“. Die Person sieht es nie (Fragebogen-Route
 * nur mit waehlbaren Typen).
 *
 * Sichtbar nur, wenn es etwas zu tun gibt (`protokollUploadSichtbar`): Der
 * Vorgang hat aktive Ausgaben, die zurueckkommen (`protokoll.noetig`, vom
 * Server aus `protokollStand`), oder es liegt schon ein Protokoll vor. Ohne
 * Ausgaben (A4 aus, G27) zeigt der Reiter nichts Neues. Eingebunden nur mit
 * Bearbeitungsrecht (`HR_EDIT_ROLES`, wie die Route).
 *
 * Die Karte rechnet nichts selbst: Den Stand („fehlt“ bzw. „hochgeladen am …“)
 * liefert der Server (`ProtokollZeile`), Grenzen und Texte kommen aus
 * src/lib/ausgaben.ts. Vor dem Senden prueft sie nur die Groesse
 * (`protokollDateiGrund`, dieselbe Regel wie die Route) — den Typ entscheidet
 * allein der Server aus den Bytes.
 *
 * Bedienung: Der Knopf oeffnet die Dateiauswahl und bleibt waehrend des
 * Hochladens im Fokus (`aria-disabled`, kein `disabled` — sonst fiele der Fokus
 * auf `body`); sein Text ist die Statusmeldung. Ein Fehler steht als Alarm
 * darunter, ein Erfolg als Status.
 *
 * Entfernen (Review A4d): Die hochgeladenen Protokolle stehen als Liste in der
 * Karte, je mit „Entfernen …“. Die Rueckfrage (`DialogRahmen`) nennt Datei und
 * Tag; bestaetigt geht `DELETE /api/onboarding/[id]/documents/[docId]` hinaus
 * (nur dieser Typ). Ein Fehler des Servers bleibt im Dialog stehen. Erst nach
 * dem Neuladen des Vorgangs schliesst der Dialog — dann ist die Zeile weg, und
 * der Fokus geht auf den Titel der Karte (`fokusZiel`) statt auf `body`. Ohne
 * diesen Weg liess sich eine Fehlablage (das Protokoll einer anderen Person)
 * nicht berichtigen.
 *
 * Optik der uebrigen Ausgaben-Bausteine, nur Farb-Tokens und lucide-react (neue
 * Datei, Stand 0 in der Sperrklinke).
 */

import { useId, useRef, useState } from "react";
import { FileCheck, FileText, Trash2, Upload } from "lucide-react";
import { ProtokollZeile } from "@/components/ausgaben/ausgaben-zeile";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import { formatDatumDE } from "@/lib/format";
import {
  PROTOKOLL_ACCEPT,
  PROTOKOLL_UPLOAD_MELDUNGEN as M,
  PROTOKOLL_UPLOAD_TYP,
  protokollDateiGrund,
  protokollDateiGrundText,
  type ProtokollAnzeige,
} from "@/lib/ausgaben";

/** Ein hochgeladenes Uebergabeprotokoll, wie die Dokumentenliste des Vorgangs es liefert. */
export interface ProtokollDokument {
  id: string;
  fileName: string;
  /** ISO-Zeitpunkt des Hochladens. */
  uploadedAt: string;
}

/** Gibt es etwas hochzuladen? Aktive Ausgaben, die zurueckkommen, oder schon ein Protokoll. */
export function protokollUploadSichtbar(protokoll: ProtokollAnzeige | null | undefined, vorhanden: number): boolean {
  return protokoll?.noetig === true || vorhanden > 0;
}

export type ProtokollUploadErgebnis = { ok: true; meldung: string } | { ok: false; fehler: string };

/** Entfernt ein hochgeladenes Protokoll; Fehlertexte kommen vom Server, sonst ein fester Text. */
export async function protokollEntfernen(onboardingId: string, dokumentId: string): Promise<ProtokollUploadErgebnis> {
  try {
    const res = await fetch(`/api/onboarding/${onboardingId}/documents/${dokumentId}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as { error?: unknown; meldung?: unknown } | null;
    if (!res.ok) {
      return { ok: false, fehler: typeof json?.error === "string" && json.error ? json.error : M.ENTFERNEN_NETZ };
    }
    return { ok: true, meldung: typeof json?.meldung === "string" && json.meldung ? json.meldung : M.ENTFERNT };
  } catch {
    return { ok: false, fehler: M.ENTFERNEN_NETZ };
  }
}

/** „Datei.pdf · hochgeladen am TT.MM.JJJJ“ – Zeile der Liste und Untertitel der Rueckfrage. */
function dokumentZeile(d: ProtokollDokument): string {
  const tag = formatDatumDE(d.uploadedAt);
  return tag ? `${d.fileName} · hochgeladen am ${tag}` : d.fileName;
}

/** Schickt die Datei an die Route; Fehlertexte kommen vom Server, sonst ein fester Text. */
export async function protokollHochladen(onboardingId: string, datei: File): Promise<ProtokollUploadErgebnis> {
  const form = new FormData();
  form.append("datei", datei);
  form.append("type", PROTOKOLL_UPLOAD_TYP);
  try {
    const res = await fetch(`/api/onboarding/${onboardingId}/documents`, { method: "POST", body: form });
    const json = (await res.json().catch(() => null)) as { error?: unknown; meldung?: unknown } | null;
    if (!res.ok) {
      return { ok: false, fehler: typeof json?.error === "string" && json.error ? json.error : M.NETZ };
    }
    return { ok: true, meldung: typeof json?.meldung === "string" && json.meldung ? json.meldung : M.ERFOLG };
  } catch {
    return { ok: false, fehler: M.NETZ };
  }
}

export function ProtokollUpload({
  onboardingId,
  protokoll,
  dokumente,
  onAktualisiert,
}: {
  onboardingId: string;
  /** `data.ausstattung.protokoll` — „fehlt“ bzw. „hochgeladen am …“, fertig vom Server. */
  protokoll: ProtokollAnzeige | null | undefined;
  /** Die schon hochgeladenen Dokumente vom Typ UEBERGABEPROTOKOLL. */
  dokumente: ReadonlyArray<ProtokollDokument>;
  /** Nach dem Hochladen bzw. Entfernen: Vorgang leise neu laden (Liste und Zeile der Karte). */
  onAktualisiert?: () => void | Promise<unknown>;
}) {
  const titelId = useId();
  const hilfeId = useId();
  const listeId = useId();
  const eingabe = useRef<HTMLInputElement>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  // Rueckfrage „Übergabeprotokoll entfernen?“: welches Dokument, laeuft es, Fehler des Servers.
  const [entfernen, setEntfernen] = useState<ProtokollDokument | null>(null);
  const [entferntGerade, setEntferntGerade] = useState(false);
  const [entfernenFehler, setEntfernenFehler] = useState<string | null>(null);

  if (!protokollUploadSichtbar(protokoll, dokumente.length)) return null;

  const hochladen = async (dateien: FileList | null) => {
    const datei = dateien?.[0];
    if (!datei || laedt) return;
    setFehler(null);
    setErfolg(null);
    const grund = protokollDateiGrund(datei.size);
    if (grund) {
      setFehler(protokollDateiGrundText(grund));
      return;
    }
    setLaedt(true);
    const ergebnis = await protokollHochladen(onboardingId, datei);
    setLaedt(false);
    if (!ergebnis.ok) {
      setFehler(ergebnis.fehler);
      return;
    }
    setErfolg(ergebnis.meldung);
    await onAktualisiert?.();
  };

  const entfernenBestaetigt = async () => {
    if (!entfernen || entferntGerade) return;
    setEntferntGerade(true);
    setEntfernenFehler(null);
    const ergebnis = await protokollEntfernen(onboardingId, entfernen.id);
    if (!ergebnis.ok) {
      setEntferntGerade(false);
      setEntfernenFehler(ergebnis.fehler);
      return;
    }
    setFehler(null);
    setErfolg(ergebnis.meldung);
    // Erst neu laden, dann schliessen: So ist die Zeile beim Schliessen schon
    // weg, und der Dialog gibt den Fokus an den Titel der Karte statt an einen
    // Knopf, der gleich verschwindet.
    await onAktualisiert?.();
    setEntferntGerade(false);
    setEntfernen(null);
  };

  return (
    <section
      aria-labelledby={titelId}
      className="rounded-xl border border-border bg-card p-4"
      data-block="protokoll-upload"
    >
      <h3 id={titelId} tabIndex={-1} className="text-sm font-semibold text-foreground outline-none">
        {M.TITEL}
      </h3>
      <p id={hilfeId} className="mt-1 text-xs text-muted-foreground">
        {M.HILFE}
      </p>

      <ProtokollZeile protokoll={protokoll} />

      {dokumente.length > 0 && (
        <div className="mt-3">
          <h4 id={listeId} className="text-xs font-semibold text-foreground">
            {M.LISTE}
          </h4>
          <ul
            aria-labelledby={listeId}
            className="mt-1 divide-y divide-border rounded-lg border border-border"
            data-liste="protokolle"
          >
            {dokumente.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-foreground"
                data-dokument={d.id}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span id={`${listeId}-${d.id}`} className="min-w-0 flex-1 break-words">
                  {dokumentZeile(d)}
                </span>
                <button
                  type="button"
                  aria-describedby={`${listeId}-${d.id}`}
                  onClick={() => {
                    setEntfernenFehler(null);
                    setEntfernen(d);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
                  data-aktion="protokoll-entfernen"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {M.ENTFERNEN_KNOPF}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-disabled={laedt ? "true" : undefined}
          aria-describedby={hilfeId}
          onClick={() => {
            if (!laedt) eingabe.current?.click();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent aria-disabled:cursor-wait"
          data-aktion="protokoll-hochladen"
        >
          <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
          {laedt ? M.LAEDT : M.KNOPF}
        </button>
        <input
          ref={eingabe}
          type="file"
          accept={PROTOKOLL_ACCEPT}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          data-feld="protokoll-datei"
          onChange={(e) => {
            const dateien = e.target.files;
            void hochladen(dateien).finally(() => {
              // Dieselbe Datei ein zweites Mal waehlen koennen (nach einem Fehler).
              if (eingabe.current) eingabe.current.value = "";
            });
          }}
        />
      </div>

      <div aria-live="polite">
        {erfolg && (
          <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-foreground" data-meldung="erfolg">
            <FileCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {erfolg}
          </p>
        )}
      </div>
      {fehler && (
        <p role="alert" className="mt-2 text-xs font-medium text-destructive" data-meldung="fehler">
          {fehler}
        </p>
      )}

      {entfernen && (
        <DialogRahmen
          titel={M.ENTFERNEN_TITEL}
          untertitel={dokumentZeile(entfernen)}
          name="protokoll-entfernen"
          sendet={entferntGerade}
          fehler={entfernenFehler}
          fokusZiel={titelId}
          onAbbrechen={() => {
            if (entferntGerade) return;
            setEntfernen(null);
            setEntfernenFehler(null);
          }}
          bestaetigen={{ text: M.ENTFERNEN_BESTAETIGEN, farbe: "rot", onClick: () => void entfernenBestaetigt() }}
        >
          <p className="text-foreground">{M.ENTFERNEN_SATZ}</p>
        </DialogRahmen>
      )}
    </section>
  );
}
