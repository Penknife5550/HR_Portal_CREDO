/**
 * Vorpruefung eines Dokumentenpakets.
 *
 * POST /api/dokumentenpaket/pruefen
 *   Sagt vor dem Versand, was hinausgehen wuerde: leere Felder je Vorlage,
 *   Gesamtgroesse, Erreichbarkeit des PDF-Dienstes und ob die Mailvorlage die
 *   persoenliche Nachricht ueberhaupt kennt. Dazu — unabhaengig davon, ob eine
 *   Adresse mitgeschickt wurde — die im Vorgang hinterlegte Adresse
 *   (`empfaengerVorgang`) und die gepflegte Freigabeliste (`erlaubteDomains`).
 *
 * Was die Route mit `empfaenger` macht, wenn das Feld FEHLT: nichts. Es ist im
 * Schema optional, und der Dialog schickt es seit dem Umbau nicht mehr mit.
 * Fehlt es (oder ist es leer), beurteilt die Bibliothek die Adresse gar nicht;
 * die Antwort traegt dann `empfaengerErlaubt: true` und
 * `empfaengerAbweichend: false`. Das ist KEINE Freigabe, sondern schlicht
 * "nichts zu pruefen" — wer diese beiden Felder als Schranke lesen wollte,
 * laege falsch. Die Schranke sitzt im Versand (409 EMPFAENGER_NICHT_ERLAUBT).
 *
 * Der Dialog rechnet beide Werte im Browser selbst aus, aus
 * `angebot.empfaengerVorschlag` und der einmal gelieferten `erlaubteDomains`,
 * mit derselben reinen Funktion `empfaengerFreigegeben`, die serverseitig die
 * Entscheidung faellt. Das Feld bleibt trotzdem im Rumpf erlaubt: Ein
 * Aufrufer, der die Adresse schon kennt, bekommt die Beurteilung weiterhin
 * fertig geliefert.
 *
 * Persistiert nichts und entschluesselt nichts — sensible Platzhalter zaehlen
 * hier als "wird beim Versand befuellt", nicht als leer. Die Bibliothek prueft
 * den Mandanten selbst; diese Route bleibt duenn.
 *
 * AUSDRUECKLICH OHNE Rate-Limit, anders als die Versandroute: Der Dialog ruft
 * die Vorpruefung 500 ms verzoegert nach jeder Aenderung der AUSWAHL erneut
 * auf — bei jedem Haken. Eine Bremse traefe hier den Normalfall. Sie versendet
 * nichts, legt nichts ab und entschluesselt nichts; es gibt also nichts zu
 * deckeln.
 *
 * Frueher loeste auch jeder Tastendruck im Adressfeld einen vollen Durchlauf
 * aus — Vorgang laden, Zugriff pruefen, jede Vorlage lesen und probeweise
 * rendern, alles fuer einen einzigen booleschen Wert. Genau deshalb steht die
 * Adresse nicht mehr im Anfragekoerper des Dialogs.
 *
 * Berechtigung: HR_EDIT_ROLES + Mandant des Vorgangs.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { pruefePaket, statusFuerFehler } from "@/lib/dokumentenpaket";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { pruefePaketSchema, type PruefePaket } from "@/lib/validations/dokumentenpaket";

export const POST = apiHandler<PruefePaket>(
  {
    roles: HR_EDIT_ROLES,
    bodySchema: pruefePaketSchema,
    logLabel: "Dokumentenpaket Vorpruefung",
  },
  async ({ body, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const ergebnis = await pruefePaket({
      modul: body.modul,
      refId: body.refId,
      positionen: body.positionen,
      empfaenger: body.empfaenger,
      session,
    });

    if (ergebnis.status === "FEHLER") {
      return NextResponse.json(
        { error: ergebnis.detail, fehler: ergebnis.fehler },
        { status: statusFuerFehler(ergebnis.fehler) },
      );
    }

    return NextResponse.json({ data: ergebnis.pruefung });
  },
);
