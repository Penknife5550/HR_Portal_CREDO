"use client";

/**
 * Pruef-Dialoge und Rueckfragen der Karte „Unterlagen nachfordern" (Paket 4)
 *
 * Je Position: Annehmen, Zurückweisen, Entfällt, Annahme zurücknehmen. Je
 * Nachforderung: Frist ändern, Link erneut senden, Zurückziehen (Feinplanung
 * 10.1, Z1).
 *
 * Die Dialoge rufen KEINE Schnittstelle. Sie bauen den Body genau in der Form,
 * die der Server prueft (`positionsAktionSchema` bzw. `unterlagenAktionSchema`
 * in src/lib/validations/unterlagen.ts), und melden ihn an die Karte
 * (`onBestaetigen`). Die Karte fuehrt die Aktion aus und gibt einen Fehler des
 * Servers in den Dialog zurueck (`fehler`) — so bleibt eine Eingabe stehen,
 * die sich korrigieren laesst (etwa ein Ablaufdatum 30 Jahre voraus).
 *
 * Was sie anzeigen, kommt aus der Uebersicht des Servers (`uebersichtBauen`)
 * und aus den reinen Regeln in src/lib/unterlagen.ts: Fristgrenzen und
 * Vorschlag beim Zurueckweisen (EP-1), der Erinnerungssatz zur neuen Frist,
 * der Wochenend-Hinweis (EP-5), die Freigabe einer abweichenden Adresse
 * (`empfaengerFreigegeben`, dieselbe Funktion wie auf dem Server). Die Dialoge
 * pruefen vorab nur, was sie ohnehin anzeigen muessen; die Schranke ist der
 * Server.
 *
 * Jede Rueckfrage nennt die Folgen, bevor etwas geschieht — was die Person
 * bekommt (oder nicht), was geloescht wird und was sich zuruecknehmen laesst.
 */

import { useState, type ReactNode } from "react";
import { ADRESS_TEXTE, adresseGleich, adressFormatFehler, dialogHeute } from "@/components/unterlagen/aktionen";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import { ablaufAmpel } from "@/lib/dokument-fristen";
import { empfaengerFreigegeben } from "@/lib/empfaenger-freigabe";
import { formatKalendertag, formatKalendertagLang, istKalendertag } from "@/lib/kalendertag";
import {
  BEGRUENDUNG_MAX,
  dialogErinnerungsSatz,
  ENTFAELLT_NOTIZ_MAX,
  fristGrenzen,
  fristPruefen,
  fristWochenendeHinweis,
  LOESCHEN_NACH_TAGEN,
  MELDUNGEN,
  RUECKNAHME_MAX_TAGE,
  SAMMELARTEN,
  type AuswahlEintrag,
  type FristGrenzen,
  type Kalendertag,
  type NachforderungAnsicht,
  type UnterlagenDialogDaten,
  type UnterlagenPositionZeile,
} from "@/lib/unterlagen";

// =============================================
// Bodies (Form wie in src/lib/validations/unterlagen.ts)
// =============================================

export type AnnehmenBody = {
  aktion: "annehmen";
  gueltigBis?: string | null;
  unbefristet?: true;
  dokumentTyp?: string;
};
export type ZurueckweisenBody = { aktion: "zurueckweisen"; begruendung: string; frist?: string };
export type EntfaelltBody = { aktion: "entfaellt"; notiz?: string };
export type AnnahmeZuruecknehmenBody = { aktion: "annahme-zuruecknehmen" };
export type PositionsBody = AnnehmenBody | ZurueckweisenBody | EntfaelltBody | AnnahmeZuruecknehmenBody;

export type FristAendernBody = { aktion: "frist-aendern"; nachforderungId: string; frist: string };
export type ErneutSendenBody = {
  aktion: "erneut-senden";
  nachforderungId: string;
  empfaenger?: string;
  adresseBestaetigt?: true;
  fruehereSperren?: true;
};
export type ZurueckziehenBody = { aktion: "zurueckziehen"; nachforderungId: string };
export type NachforderungsBody = FristAendernBody | ErneutSendenBody | ZurueckziehenBody;

/** Was alle Dialoge von der Karte bekommen. */
interface DialogBasis<B> {
  /** Laeuft die Aktion gerade? */
  sendet?: boolean;
  /** Fehler des Servers zur letzten Bestaetigung. */
  fehler?: string | null;
  onAbbrechen: () => void;
  onBestaetigen: (body: B) => void;
  /** Id des Elements, das nach dem Schliessen den Fokus bekommt, falls der Ausloeser fehlt. */
  fokusZiel?: string;
}

// =============================================
// Kleine Helfer
// =============================================

/**
 * Freie Zeilen werden ohne Wahl unter der Sammelart uebernommen (4.4: SONSTIGES
 * im Onboarding). Die Auswahl des Servers enthaelt sie nicht — sie laesst sich
 * nicht anfordern (SAMMELARTEN) —, deshalb steht sie hier als erster Eintrag.
 */
const STANDARDART = SAMMELARTEN[0];
const STANDARDART_LABEL = "Sonstiges (Standard)";

/**
 * Arten, bei denen die Annahme ein Datum NICHT mitnimmt, das HR selbst
 * festhalten muss: Das Eingangsdatum des RV-Befreiungsantrags stellt der
 * Arbeitgeber fest (4.4, `PersonalData.rvAntragEingangAm` bleibt unberuehrt).
 */
const EINGANGSDATUM_SELBST_ERFASSEN: readonly string[] = ["RV_BEFREIUNG"];

/**
 * Braucht „Annehmen" einen Dialog? Bei Ablaufdatum (Z1), bei einer freien Zeile
 * (Wahl der Art) und beim RV-Befreiungsantrag (Hinweis). Sonst nimmt der Knopf
 * direkt an — die Annahme laesst sich 30 Tage lang zuruecknehmen (E-3).
 */
export function annehmenBrauchtDialog(position: Pick<UnterlagenPositionZeile, "typ" | "fristpflichtig">): boolean {
  return (
    position.typ === null ||
    position.fristpflichtig ||
    EINGANGSDATUM_SELBST_ERFASSEN.includes(position.typ)
  );
}

const EINGABE =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus:border-ring focus:ring-1 focus:ring-ring sm:text-sm";

/** Die Folgen einer Rueckfrage — immer als Liste, damit keine im Fliesstext untergeht. */
function Folgen({ punkte }: { punkte: string[] }) {
  return (
    <div data-block="folgen">
      <p className="text-xs font-semibold text-foreground">Das passiert:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {punkte.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function Hinweis({ art, children, name }: { art: "gelb" | "rot" | "grau"; children: ReactNode; name?: string }) {
  const klassen =
    art === "gelb"
      ? "border-credo-gelb/40 bg-credo-gelb/10 text-amber-900"
      : art === "rot"
        ? "border-credo-rot/30 bg-credo-rot/10 text-credo-rot"
        : "border-border bg-muted/40 text-muted-foreground";
  return (
    <p className={`rounded-lg border px-3 py-2 text-xs ${klassen}`} data-hinweis={name}>
      {children}
    </p>
  );
}

/** Wochentag und Wochenend-Hinweis zu einer gewaehlten Frist (EP-5: sperrt nichts). */
function FristZusatz({ frist }: { frist: string }) {
  if (!istKalendertag(frist)) return null;
  const wochenende = fristWochenendeHinweis(frist);
  return (
    <>
      <p className="mt-1 text-xs text-muted-foreground" data-zeile="frist-lang">
        {formatKalendertagLang(frist)}
      </p>
      {wochenende && (
        <p className="mt-1 text-xs text-amber-900" data-hinweis="wochenende">
          {wochenende}
        </p>
      )}
    </>
  );
}

// =============================================
// Annehmen (4.4, Z1)
// =============================================

type AblaufWahl = "DATUM" | "UNBEFRISTET" | "SPAETER";

export interface AnnehmenDialogProps extends DialogBasis<AnnehmenBody> {
  position: UnterlagenPositionZeile;
  /** Waehlbare Arten aus dem Modul-Baustein (`uebersicht.dialog.auswahl`) — fuer freie Zeilen. */
  auswahl: ReadonlyArray<AuswahlEintrag> | null;
  /** Nur fuer Tests: Bezugszeit der Ablauf-Warnung. */
  jetzt?: Date;
}

/**
 * „Unterlage annehmen": Jede eingereichte Datei wird ein Dokument des
 * Vorgangs.
 *
 * - **Ablaufdatum (Z1)**, wenn die Art eines traegt: genau eine von drei
 *   Moeglichkeiten — ein Datum (vorbelegt mit der Angabe der Person, als
 *   Kalendertag, ohne Umweg ueber `Date` und damit ohne Zeitzonen-Versatz),
 *   „Unbefristet (z. B. Niederlassungserlaubnis)" oder „Datum später
 *   nachtragen". Ohne Angabe der Person ist nichts vorgewaehlt: HR soll sich
 *   entscheiden, nicht einen Vorschlag des Dialogs bestaetigen.
 * - Liegt das Datum zurueck, warnt `ablaufAmpel` — angenommen wird trotzdem
 *   (ein abgelaufener Titel ist eine Tatsache, die HR sehen muss, EP-7).
 * - **Freie Zeile:** die Art waehlen, Standard „Sonstiges". Traegt die gewaehlte
 *   Art ein Ablaufdatum, erscheint das Datumsfeld; nicht erlaubte vertrauliche
 *   Arten sind gesperrt, mit Grund.
 * - **RV-Befreiung:** Hinweis, dass die Annahme das Eingangsdatum nicht setzt.
 */
export function AnnehmenDialog({
  position,
  auswahl,
  sendet,
  fehler,
  onAbbrechen,
  onBestaetigen,
  fokusZiel,
  jetzt,
}: AnnehmenDialogProps) {
  const frei = position.typ === null;
  const [art, setArt] = useState<string>(STANDARDART);
  const [wahl, setWahl] = useState<AblaufWahl | null>(position.gueltigBisAngabe ? "DATUM" : null);
  const [datum, setDatum] = useState<string>(position.gueltigBisAngabe ?? "");

  const eintraege = auswahl ?? [];
  const artEintrag = frei ? eintraege.find((a) => a.typ === art) : undefined;
  const wirksameArt = frei ? art : (position.typ as string);
  const mitAblauf = frei ? !!artEintrag?.fristpflichtig : position.fristpflichtig;
  const gesperrteArten = frei ? eintraege.filter((a) => !a.erlaubt) : [];

  const ampel = mitAblauf && wahl === "DATUM" && istKalendertag(datum) ? ablaufAmpel(datum, jetzt ?? new Date()) : null;

  let grund: string | null = null;
  if (frei && artEintrag && !artEintrag.erlaubt) grund = artEintrag.grund ?? MELDUNGEN.ART_NICHT_UEBERNEHMBAR;
  else if (mitAblauf && wahl === null) grund = "Bitte wählen Sie, wie das Ablaufdatum erfasst wird.";
  else if (mitAblauf && wahl === "DATUM" && !istKalendertag(datum)) grund = "Bitte geben Sie das Ablaufdatum an.";

  const senden = () => {
    const body: AnnehmenBody = { aktion: "annehmen" };
    if (frei) body.dokumentTyp = art;
    if (mitAblauf) {
      if (wahl === "DATUM") body.gueltigBis = datum;
      else if (wahl === "UNBEFRISTET") {
        body.gueltigBis = null;
        body.unbefristet = true;
      } else body.gueltigBis = null;
    }
    onBestaetigen(body);
  };

  const radioName = `ablauf-${position.id}`;

  return (
    <DialogRahmen
      titel="Unterlage annehmen"
      untertitel={position.bezeichnung}
      name="annehmen"
      sendet={sendet}
      fehler={fehler}
      onAbbrechen={onAbbrechen}
      fokusZiel={fokusZiel}
      bestaetigen={{ text: "Annehmen", onClick: senden, grund, farbe: "gruen" }}
    >
      <p className="text-muted-foreground">
        Die eingereichten Dateien werden in die Dokumente des Vorgangs übernommen. Die Annahme lässt sich{" "}
        {RUECKNAHME_MAX_TAGE} Tage lang zurücknehmen.
      </p>

      {frei && (
        <div>
          <label htmlFor={`art-${position.id}`} className="block text-xs font-semibold text-foreground">
            Art des Dokuments
          </label>
          <select
            id={`art-${position.id}`}
            value={art}
            onChange={(e) => setArt(e.target.value)}
            disabled={sendet}
            className={`mt-1 ${EINGABE}`}
          >
            <option value={STANDARDART}>{STANDARDART_LABEL}</option>
            {eintraege.map((a) => (
              <option key={a.typ} value={a.typ} disabled={!a.erlaubt}>
                {a.erlaubt ? a.label : `${a.label} (gesperrt)`}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Die Bezeichnung „{position.bezeichnung}“ bleibt am Dokument erhalten.
          </p>
          {gesperrteArten.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground" data-block="gesperrte-arten">
              <p className="font-semibold">Nicht wählbar:</p>
              <ul className="mt-0.5 space-y-0.5">
                {gesperrteArten.map((a) => (
                  <li key={a.typ}>
                    {a.label} – {a.grund ?? MELDUNGEN.ART_NICHT_UEBERNEHMBAR}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {mitAblauf && (
        <fieldset className="space-y-2" data-block="ablauf">
          <legend className="text-xs font-semibold text-foreground">Ablaufdatum des Nachweises</legend>
          {position.gueltigBisAngabe && (
            <p className="text-xs text-muted-foreground">
              Angabe der Person: {formatKalendertag(position.gueltigBisAngabe)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={radioName}
                checked={wahl === "DATUM"}
                onChange={() => setWahl("DATUM")}
                disabled={sendet}
              />
              <span>Gültig bis</span>
            </label>
            <input
              type="date"
              aria-label="Gültig bis (Datum)"
              value={datum}
              onChange={(e) => {
                setDatum(e.target.value);
                setWahl("DATUM");
              }}
              disabled={sendet}
              className="rounded-lg border border-input bg-background px-2 py-1 text-base outline-none focus:border-ring focus:ring-1 focus:ring-ring sm:text-sm"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={radioName}
              checked={wahl === "UNBEFRISTET"}
              onChange={() => setWahl("UNBEFRISTET")}
              disabled={sendet}
            />
            <span>Unbefristet (z. B. Niederlassungserlaubnis)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={radioName}
              checked={wahl === "SPAETER"}
              onChange={() => setWahl("SPAETER")}
              disabled={sendet}
            />
            <span>Datum später nachtragen</span>
          </label>
          {wahl === "UNBEFRISTET" && (
            <Hinweis art="grau" name="unbefristet">
              Für diese Art endet damit die Überwachung des Ablaufs: kein Warnbalken, keine Erinnerung.
            </Hinweis>
          )}
          {wahl === "SPAETER" && (
            <Hinweis art="grau" name="spaeter">
              Ohne Datum überwacht das Portal den Ablauf dieses Dokuments nicht. Tragen Sie das Datum später im
              Reiter „Dokumente“ nach.
            </Hinweis>
          )}
          {ampel?.kategorie === "ABGELAUFEN" && (
            <Hinweis art="rot" name="abgelaufen">
              Das Ablaufdatum liegt in der Vergangenheit: {ampel.text}. Die Unterlage wird trotzdem angenommen und
              als abgelaufen angezeigt.
            </Hinweis>
          )}
        </fieldset>
      )}

      {EINGANGSDATUM_SELBST_ERFASSEN.includes(wirksameArt) && (
        <Hinweis art="gelb" name="eingangsdatum">
          Eingangsdatum bitte selbst erfassen: Die Annahme übernimmt nur die Datei, das Eingangsdatum des
          Befreiungsantrags trägt sie nicht ein.
        </Hinweis>
      )}
    </DialogRahmen>
  );
}

// =============================================
// Zurueckweisen (EP-1, E-2)
// =============================================

export interface ZurueckweisenDialogProps extends DialogBasis<ZurueckweisenBody> {
  position: UnterlagenPositionZeile;
  /** `nachforderung.dialog` aus der Uebersicht: Vorschlag und Pflicht nach EP-1, Grenzen nach EP-5. */
  frist: NachforderungAnsicht["dialog"]["zurueckweisenFrist"];
  /** Die Grenzen des Servers — daraus sein Tag; nie frueher als heute im Browser (`dialogHeute`). */
  grenzen: FristGrenzen;
  /** Bezugszeit (Tests); ohne Angabe jetzt. */
  jetzt?: Date;
}

/**
 * „Unterlage zurückweisen": Begruendung fuer die Person (Pflicht, bis 1000
 * Zeichen) und die Frist fuer die erneute Einreichung. Die Frist gilt fuer die
 * GANZE Nachforderung (EP-1) und geht mit der Zurueckweisung in EINER Mail
 * hinaus. Vorgeschlagen ist, was der Server vorschlaegt; ist der Link schon
 * tot, ist sie Pflicht.
 *
 * Bei einer vertraulichen Unterlage steht die Begruendung nur auf der
 * Upload-Seite, nicht in der Mail (E-2) — das sagt der Dialog vorher.
 */
export function ZurueckweisenDialog({
  position,
  frist: fristVorgabe,
  grenzen: serverGrenzen,
  jetzt,
  sendet,
  fehler,
  onAbbrechen,
  onBestaetigen,
  fokusZiel,
}: ZurueckweisenDialogProps) {
  const [begruendung, setBegruendung] = useState("");
  const [frist, setFrist] = useState<string>(fristVorgabe.vorschlag);
  const heute = dialogHeute(serverGrenzen, jetzt);
  const grenzen = fristGrenzen(heute);

  const fristWert = frist.trim();
  let fristFehler: string | null = null;
  if (fristWert) {
    const pruefung = fristPruefen(fristWert, heute);
    if (!pruefung.ok) fristFehler = pruefung.meldung;
  } else if (fristVorgabe.pflicht) {
    fristFehler = MELDUNGEN.ZURUECKWEISEN_FRIST_NOETIG;
  }

  const grund = !begruendung.trim() ? "Bitte geben Sie eine Begründung für die Person an." : fristFehler;

  const senden = () => {
    const body: ZurueckweisenBody = { aktion: "zurueckweisen", begruendung: begruendung.trim() };
    if (fristWert) body.frist = fristWert;
    onBestaetigen(body);
  };

  const idBasis = `zurueckweisen-${position.id}`;

  return (
    <DialogRahmen
      titel="Unterlage zurückweisen"
      untertitel={position.bezeichnung}
      name="zurueckweisen"
      sendet={sendet}
      fehler={fehler}
      onAbbrechen={onAbbrechen}
      fokusZiel={fokusZiel}
      mitPflichtfeldern
      bestaetigen={{ text: "Zurückweisen und E-Mail senden", onClick: senden, grund, farbe: "rot" }}
    >
      <div>
        <label htmlFor={`${idBasis}-begruendung`} className="block text-xs font-semibold text-foreground">
          Begründung für die Person *
        </label>
        <textarea
          id={`${idBasis}-begruendung`}
          value={begruendung}
          onChange={(e) => setBegruendung(e.target.value)}
          maxLength={BEGRUENDUNG_MAX}
          required
          aria-required="true"
          rows={4}
          disabled={sendet}
          className={`mt-1 ${EINGABE}`}
        />
        <p className="mt-1 text-right text-[11px] text-muted-foreground">
          {begruendung.length}/{BEGRUENDUNG_MAX}
        </p>
        {position.sensibel ? (
          <Hinweis art="gelb" name="sensibel">
            Die Begründung erscheint nur auf der Upload-Seite, nicht in der E-Mail. Die E-Mail nennt vertrauliche
            Unterlagen nicht beim Namen.
          </Hinweis>
        ) : (
          <p className="text-xs text-muted-foreground">
            Die Person erhält Ihre Begründung per E-Mail und kann die Unterlage erneut hochladen.
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${idBasis}-frist`} className="block text-xs font-semibold text-foreground">
          Frist für die erneute Einreichung{fristVorgabe.pflicht ? " *" : ""}
        </label>
        <input
          id={`${idBasis}-frist`}
          type="date"
          value={frist}
          min={grenzen.min}
          max={grenzen.max}
          onChange={(e) => setFrist(e.target.value)}
          required={fristVorgabe.pflicht}
          aria-required={fristVorgabe.pflicht ? "true" : undefined}
          disabled={sendet}
          className={`mt-1 ${EINGABE}`}
        />
        <FristZusatz frist={fristWert} />
        <p className="mt-1 text-xs text-muted-foreground">
          Die Frist gilt für die ganze Nachforderung. Die Person erhält genau eine E-Mail: die Zurückweisung mit
          dieser Frist.
        </p>
        {fristVorgabe.pflicht && (
          <Hinweis art="gelb" name="frist-pflicht">
            {MELDUNGEN.ZURUECKWEISEN_FRIST_NOETIG}
          </Hinweis>
        )}
      </div>
    </DialogRahmen>
  );
}

// =============================================
// Entfaellt (EP-2)
// =============================================

export interface EntfaelltDialogProps extends DialogBasis<EntfaelltBody> {
  position: UnterlagenPositionZeile;
  /** Die Nachforderung der Unterlage — ob sich „Entfällt" danach rueckgaengig machen laesst, haengt an ihr. */
  nachforderung: NachforderungAnsicht;
}

/**
 * „Entfällt…": Die Unterlage wird nicht mehr verlangt und zaehlt als erledigt
 * (EP-2). Die interne Notiz ist optional; die Person bekommt keine Mail.
 *
 * Der Weg zurueck steht nur da, wo es ihn gibt: „Unterlagen ergänzen…" nur,
 * solange die Nachforderung danach noch laeuft und der Server das Ergaenzen
 * anbietet. Ist es die letzte offene Unterlage, erledigt „Entfällt" die
 * Nachforderung (2.1) — dann bleibt nur eine neue Nachforderung, und die auch
 * nur, solange der Vorgang nicht eingestellt ist (EP-3).
 */
export function EntfaelltDialog({
  position,
  nachforderung,
  sendet,
  fehler,
  onAbbrechen,
  onBestaetigen,
  fokusZiel,
}: EntfaelltDialogProps) {
  const [notiz, setNotiz] = useState("");

  // „Entfällt" gibt es nur fuer offene und eingereichte Unterlagen — diese ist
  // also mitgezaehlt. Wartet sonst nichts mehr, ist die Nachforderung danach ERLEDIGT.
  const letzte = nachforderung.zaehler.offen + nachforderung.zaehler.zuPruefen <= 1;
  // „Frist ändern" verweigert der Server einer laufenden Nachforderung nur bei
  // eingestelltem Vorgang (EP-3) — dann gibt es auch keine neue Nachforderung.
  const vorgangLaeuft = nachforderung.aktionen.fristAendern;

  const folgen = [
    letzte
      ? "Die Unterlage wird nicht mehr verlangt. Es ist die letzte offene Unterlage – die Nachforderung ist damit erledigt."
      : "Die Unterlage wird nicht mehr verlangt und zählt als erledigt.",
    "Die Person bekommt keine E-Mail.",
    "Nicht übermittelte Entwürfe der Person werden gelöscht.",
  ];
  if (position.status === "EINGEREICHT") {
    folgen.push(
      `Die eingereichten, noch nicht geprüften Dateien werden verworfen und nach ${LOESCHEN_NACH_TAGEN} Tagen gelöscht.`,
    );
  }
  if (!letzte && nachforderung.aktionen.ergaenzen) {
    folgen.push(
      position.typ !== null
        ? "Rückgängig machen Sie das über „Unterlagen ergänzen…“ mit derselben Unterlage."
        : "Wird sie doch gebraucht, fordern Sie sie über „Unterlagen ergänzen…“ neu an.",
    );
  } else if (letzte && vorgangLaeuft) {
    folgen.push("Wird die Unterlage doch gebraucht, fordern Sie sie danach über „Unterlagen nachfordern…“ neu an.");
  }

  const senden = () => {
    const text = notiz.trim();
    onBestaetigen(text ? { aktion: "entfaellt", notiz: text } : { aktion: "entfaellt" });
  };

  return (
    <DialogRahmen
      titel="Unterlage entfällt"
      untertitel={position.bezeichnung}
      name="entfaellt"
      sendet={sendet}
      fehler={fehler}
      onAbbrechen={onAbbrechen}
      fokusZiel={fokusZiel}
      bestaetigen={{ text: "Als entfallen vermerken", onClick: senden, farbe: "blau" }}
    >
      <Folgen punkte={folgen} />
      <div>
        <label htmlFor={`entfaellt-${position.id}-notiz`} className="block text-xs font-semibold text-foreground">
          Interne Notiz (optional)
        </label>
        <textarea
          id={`entfaellt-${position.id}-notiz`}
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          maxLength={ENTFAELLT_NOTIZ_MAX}
          rows={3}
          disabled={sendet}
          placeholder="z. B. Arbeitserlaubnis steht auf dem Aufenthaltstitel"
          className={`mt-1 ${EINGABE}`}
        />
        <p className="mt-1 text-xs text-muted-foreground">Nur für die Personalabteilung sichtbar.</p>
      </div>
    </DialogRahmen>
  );
}

// =============================================
// Annahme zuruecknehmen (E-3)
// =============================================

export interface AnnahmeZuruecknehmenDialogProps extends DialogBasis<AnnahmeZuruecknehmenBody> {
  position: UnterlagenPositionZeile;
  /** Steht die Nachforderung auf ERLEDIGT? Dann laeuft sie danach wieder. */
  nachforderungErledigt: boolean;
  /**
   * `nachforderung.dialog.ruecknahmeFolge` — bei eingestelltem Vorgang die
   * Folge aus Z2 (der naechste Lauf zieht zurueck), sonst null.
   */
  zusatzFolge?: string | null;
}

/**
 * „Annahme zurücknehmen": Die uebernommenen Dokumente werden geloescht und die
 * Dateien zurueckgeholt — auch wenn HR ihr Ablaufdatum inzwischen geaendert
 * hat (E-3). Die Unterlage steht danach wieder auf „Zu prüfen". Versprochen
 * wird nur das erneute Annehmen: Zurueckweisen sperrt der Server bei einem
 * eingestellten Vorgang (EP-3) — und dort zieht der naechste Lauf die wieder
 * laufende Nachforderung zurueck (Z2); das sagt `zusatzFolge` VOR der Aktion.
 */
export function AnnahmeZuruecknehmenDialog({
  position,
  nachforderungErledigt,
  zusatzFolge,
  sendet,
  fehler,
  onAbbrechen,
  onBestaetigen,
  fokusZiel,
}: AnnahmeZuruecknehmenDialogProps) {
  const folgen = [
    "Die übernommenen Dokumente (eines je Datei) verschwinden aus dem Reiter „Dokumente“ – auch wenn Sie ihr Ablaufdatum inzwischen geändert haben.",
    "Die Unterlage steht danach wieder auf „Zu prüfen“ und lässt sich erneut annehmen.",
    "Die Person bekommt keine E-Mail.",
  ];
  if (nachforderungErledigt) folgen.push("Die Nachforderung läuft danach wieder.");
  if (zusatzFolge) folgen.push(zusatzFolge);

  return (
    <DialogRahmen
      titel="Annahme zurücknehmen?"
      untertitel={position.bezeichnung}
      name="annahme-zuruecknehmen"
      sendet={sendet}
      fehler={fehler}
      onAbbrechen={onAbbrechen}
      fokusZiel={fokusZiel}
      bestaetigen={{
        text: "Annahme zurücknehmen",
        onClick: () => onBestaetigen({ aktion: "annahme-zuruecknehmen" }),
        farbe: "rot",
      }}
    >
      <Folgen punkte={folgen} />
    </DialogRahmen>
  );
}

// =============================================
// Frist aendern (EP-5, 5.1)
// =============================================

export interface FristAendernDialogProps extends DialogBasis<FristAendernBody> {
  nachforderung: NachforderungAnsicht;
  /** Bezugszeit (Tests); ohne Angabe jetzt. */
  jetzt?: Date;
}

/**
 * „Frist ändern…": eine neue Frist fuer alle Unterlagen. Wartet noch etwas
 * auf die Person, bekommt sie eine Mail mit neuem Link; sonst keine. Der Satz
 * zu den Erinnerungen kommt aus `dialogErinnerungsSatz` — nur, was auch stimmt:
 * Wartet nichts mehr auf die Person, erinnert der Lauf sie nicht und meldet HR
 * keine verstrichene Frist (Abschnitt 9), der Satz entfaellt dann. Die Mail
 * „Frist verstrichen" geht an die ANFORDERNDE HR-Kraft, nicht an „Sie" (8.1).
 */
export function FristAendernDialog({
  nachforderung,
  jetzt,
  sendet,
  fehler,
  onAbbrechen,
  onBestaetigen,
  fokusZiel,
}: FristAendernDialogProps) {
  const heute = dialogHeute(nachforderung.dialog.fristGrenzen, jetzt);
  const grenzen = fristGrenzen(heute);
  const [frist, setFrist] = useState<string>(grenzen.vorschlag);

  const wert = frist.trim();
  const pruefung = fristPruefen(wert, heute);
  const grund = !pruefung.ok
    ? pruefung.meldung
    : pruefung.tag === nachforderung.frist
      ? MELDUNGEN.FRIST_UNVERAENDERT
      : null;
  const wartet = nachforderung.zaehler.offen > 0;

  return (
    <DialogRahmen
      titel="Frist ändern"
      untertitel={`Bisherige Frist: ${nachforderung.fristLang}`}
      name="frist-aendern"
      sendet={sendet}
      fehler={fehler}
      onAbbrechen={onAbbrechen}
      fokusZiel={fokusZiel}
      bestaetigen={{
        text: "Frist ändern",
        onClick: () => onBestaetigen({ aktion: "frist-aendern", nachforderungId: nachforderung.id, frist: wert }),
        grund,
        farbe: "blau",
      }}
    >
      <div>
        <label htmlFor={`frist-${nachforderung.id}`} className="block text-xs font-semibold text-foreground">
          Neue Frist
        </label>
        <input
          id={`frist-${nachforderung.id}`}
          type="date"
          value={frist}
          min={grenzen.min}
          max={grenzen.max}
          onChange={(e) => setFrist(e.target.value)}
          disabled={sendet}
          className={`mt-1 ${EINGABE}`}
        />
        <FristZusatz frist={wert} />
      </div>
      <p className="text-muted-foreground" data-zeile="mail">
        {wartet
          ? "Die Person erhält eine E-Mail mit der neuen Frist und einem neuen Link."
          : "Es wartet keine Unterlage mehr auf die Person – sie erhält keine E-Mail."}
      </p>
      {wartet && pruefung.ok && (
        <p className="text-xs text-muted-foreground" data-zeile="erinnerung">
          {dialogErinnerungsSatz(pruefung.tag, heute, "ANFORDERNDE")}
        </p>
      )}
    </DialogRahmen>
  );
}

// =============================================
// Link erneut senden (EP-16, E-5, 5.1)
// =============================================

export interface ErneutSendenDialogProps extends DialogBasis<ErneutSendenBody> {
  nachforderung: NachforderungAnsicht;
  /** `uebersicht.dialog.empfaenger` — Adresse im Vorgang und freigegebene Domains; `null` ohne Angabe. */
  empfaenger: UnterlagenDialogDaten["empfaenger"] | null;
}

/**
 * „Link erneut senden": ein neuer Link, dieselbe Aufforderung.
 *
 * - Die Adresse ist aenderbar. Weicht die NEUE von der im Vorgang ab, zeigt der
 *   Dialog sie gelb und verlangt „Adresse geprüft" (der Server verlangt
 *   `adresseBestaetigt`); liegt sie in keiner freigegebenen Domain, rot und
 *   gesperrt. Bei einer neuen Adresse werden alle bisherigen Links SOFORT
 *   ungueltig (404 — wer die Mail an eine falsche Adresse bekam, erfaehrt
 *   nichts).
 * - „Frühere Links sperren": erst NACH der Zustellung der neuen Mail (410).
 *   Bei einer neuen Adresse entfaellt das Kaestchen — der Server hat dann
 *   schon vor dem Versand alle bisherigen Links entwertet (5.1 a), der Haken
 *   aendert nichts mehr und sein Text („erst ungültig, wenn …") fuehrte in die Irre.
 * - Nach der Frist: Hinweis auf das Linkende (EP-16).
 */
export function ErneutSendenDialog({
  nachforderung,
  empfaenger,
  sendet,
  fehler,
  onAbbrechen,
  onBestaetigen,
  fokusZiel,
}: ErneutSendenDialogProps) {
  const [adresse, setAdresse] = useState(nachforderung.empfaenger);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [sperren, setSperren] = useState(false);

  const wert = adresse.trim();
  // Erst das Format (wie „Unterlagen nachfordern…"): Rot und Gelb gelten nur
  // fuer eine Adresse, die als solche stimmt.
  const formatFehler = adressFormatFehler(wert);
  const neu = !adresseGleich(wert, nachforderung.empfaenger);
  const adresswechsel = neu && !!wert;
  const ausVorgang = empfaenger?.vorgang ?? null;
  const abweichend = neu && (ausVorgang === null || !adresseGleich(wert, ausVorgang));
  const freigegeben =
    !abweichend ||
    !empfaenger ||
    empfaengerFreigegeben({
      empfaenger: wert,
      empfaengerVorgang: empfaenger.vorgang,
      domains: empfaenger.erlaubteDomains,
    });

  // Der ausfuehrliche Text steht rot bzw. gelb am Feld; unten am Knopf nur kurz.
  let grund: string | null = null;
  if (formatFehler) grund = formatFehler;
  else if (!freigegeben) grund = ADRESS_TEXTE.NICHT_FREIGEGEBEN_KURZ;
  else if (abweichend && !bestaetigt) grund = MELDUNGEN.ADRESSE_NICHT_BESTAETIGT;

  const senden = () => {
    const body: ErneutSendenBody = { aktion: "erneut-senden", nachforderungId: nachforderung.id };
    if (neu) body.empfaenger = wert;
    if (abweichend && bestaetigt) body.adresseBestaetigt = true;
    // Ein vor dem Adresswechsel gesetzter Haken geht nicht mit — das Kaestchen ist dann ausgeblendet.
    if (sperren && !adresswechsel) body.fruehereSperren = true;
    onBestaetigen(body);
  };

  const idBasis = `erneut-${nachforderung.id}`;

  return (
    <DialogRahmen
      titel="Link erneut senden"
      untertitel="Die Person erhält eine E-Mail mit einem neuen Link."
      name="erneut-senden"
      sendet={sendet}
      fehler={fehler}
      onAbbrechen={onAbbrechen}
      fokusZiel={fokusZiel}
      bestaetigen={{ text: "Link erneut senden", onClick: senden, grund, farbe: "blau" }}
    >
      <div>
        <label htmlFor={`${idBasis}-adresse`} className="block text-xs font-semibold text-foreground">
          E-Mail-Adresse der Person
        </label>
        <input
          id={`${idBasis}-adresse`}
          type="email"
          value={adresse}
          onChange={(e) => {
            setAdresse(e.target.value);
            setBestaetigt(false);
          }}
          autoComplete="off"
          aria-invalid={(!!wert && !!formatFehler) || (!formatFehler && !freigegeben) || undefined}
          disabled={sendet}
          className={`mt-1 ${EINGABE} ${!formatFehler && !freigegeben ? "border-credo-rot" : ""}`}
        />
        {adresswechsel && (
          <p className="mt-1 text-xs text-muted-foreground" data-hinweis="adresswechsel">
            Neue Adresse: Alle bisherigen Links werden sofort ungültig.
          </p>
        )}
      </div>

      {abweichend && !formatFehler && !freigegeben && (
        <Hinweis art="rot" name="nicht-freigegeben">
          {MELDUNGEN.EMPFAENGER_NICHT_FREIGEGEBEN}
        </Hinweis>
      )}
      {abweichend && !formatFehler && freigegeben && (
        <div className="rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2" data-hinweis="abweichend">
          <p className="text-xs text-amber-900">
            Die Adresse weicht von der im Vorgang hinterlegten ab
            {ausVorgang ? ` (${ausVorgang})` : ""}. Bitte prüfen Sie sie, bevor der Link hinausgeht.
          </p>
          <label className="mt-2 flex items-center gap-2 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={bestaetigt}
              onChange={(e) => setBestaetigt(e.target.checked)}
              disabled={sendet}
            />
            <span>Adresse geprüft</span>
          </label>
        </div>
      )}

      {!adresswechsel && (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={sperren}
            onChange={(e) => setSperren(e.target.checked)}
            disabled={sendet}
          />
          <span>
            Frühere Links sperren
            <span className="block text-xs text-muted-foreground">
              Etwa wenn eine E-Mail weitergeleitet wurde. Die bisherigen Links werden erst ungültig, wenn die neue
              E-Mail zugestellt ist.
            </span>
          </span>
        </label>
      )}

      {nachforderung.fristVerstrichen && (
        <Hinweis art="gelb" name="linkende">
          Die Frist ist am {formatKalendertag(nachforderung.frist)} abgelaufen. Der neue Link ist nur noch bis{" "}
          {formatKalendertag(nachforderung.linkende)} nutzbar; die E-Mail nennt dieses Datum. Soll die Person länger
          Zeit haben, ändern Sie stattdessen die Frist.
        </Hinweis>
      )}
    </DialogRahmen>
  );
}

// =============================================
// Zurueckziehen (EP-9)
// =============================================

export interface ZurueckziehenDialogProps extends DialogBasis<ZurueckziehenBody> {
  nachforderung: NachforderungAnsicht;
}

/** „Zurückziehen…": Endzustand — die Rueckfrage nennt alle Folgen. */
export function ZurueckziehenDialog({
  nachforderung,
  sendet,
  fehler,
  onAbbrechen,
  onBestaetigen,
  fokusZiel,
}: ZurueckziehenDialogProps) {
  const folgen = [
    "Der Link der Person wird sofort ungültig.",
    "Die Person bekommt keine E-Mail.",
    "Nicht übermittelte Entwürfe der Person werden sofort gelöscht.",
    `Eingereichte, noch nicht geprüfte Dateien werden verworfen und nach ${LOESCHEN_NACH_TAGEN} Tagen gelöscht.`,
    // Die Ruecknahme endet mit dem Zurueckziehen (2.1, E-3) — obwohl der
    // Annehmen-Dialog 30 Tage zusagt. Das muss HR vorher lesen.
    "Bereits angenommene Unterlagen bleiben in den Dokumenten des Vorgangs; ihre Annahme lässt sich danach nicht mehr zurücknehmen.",
    "Eine zurückgezogene Nachforderung lässt sich nicht wieder öffnen.",
  ];

  return (
    <DialogRahmen
      titel="Nachforderung zurückziehen?"
      untertitel={nachforderung.kopfZeile}
      name="zurueckziehen"
      sendet={sendet}
      fehler={fehler}
      onAbbrechen={onAbbrechen}
      fokusZiel={fokusZiel}
      bestaetigen={{
        text: "Zurückziehen",
        onClick: () => onBestaetigen({ aktion: "zurueckziehen", nachforderungId: nachforderung.id }),
        farbe: "rot",
      }}
    >
      <Folgen punkte={folgen} />
    </DialogRahmen>
  );
}
