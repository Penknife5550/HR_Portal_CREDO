/**
 * Die Freigaberegel fuer abweichende Empfaengeradressen — als reine Funktionen.
 *
 * DIESE DATEI IMPORTIERT NICHTS UND DARF NICHTS IMPORTIEREN. Das ist ihr
 * einziger Daseinsgrund: Server (src/lib/dokumentenpaket.ts, die
 * Einstellungs-Route) und Browser (src/components/dokumentenpaket-dialog.tsx)
 * brauchen dieselbe Entscheidung. Der Dialog ist eine "use client"-Komponente;
 * zoege sie ueber eine Importkette prisma, fs oder node:crypto herein, landete
 * der Prisma-Client im Browser-Bundle. Deshalb hatte der Dialog die Regel
 * frueher NACHGEBAUT — mit dem absehbaren Ende, dass eine Aenderung an zwei
 * Stellen haette erfolgen muessen und die zweite vergessen worden waere.
 *
 * Der DB-Leser `ladeErlaubteDomains` bleibt daher drueben in
 * src/lib/empfaenger-allowlist.ts, das von hier re-exportiert und damit fuer
 * bestehende Server-Importe unveraendert bleibt. Wer hier etwas ergaenzt, das
 * einen Import braucht, hat es an der falschen Stelle ergaenzt.
 *
 * Zur Sache selbst: Der Normalfall ist eine PRIVATE Adresse. Beim Onboarding
 * geht das Paket an gmail.com oder web.de, weil die neue Person noch kein
 * dienstliches Postfach hat. Eine Allowlist ueber alle Adressen wuerde also
 * genau den Regelfall blockieren. Deshalb gilt sie nur fuer die ABWEICHUNG:
 * Die im Vorgang hinterlegte Adresse ist immer erlaubt, egal welche Domain sie
 * traegt — sie stammt aus dem Vorgang und nicht aus dem Eingabefeld des
 * Dialogs.
 *
 * Was die Liste verhindert, ist der Fall aus der Durchsicht: Ein Konto mit
 * Zugriff auf alle 16 Mandanten traegt eine eigene Freemail-Adresse ein und
 * laesst sich Vorgang fuer Vorgang Unterlagen mit IBAN, SV-Nummer und
 * Steuer-ID schicken. Die Abweichung stand bisher zwar im Nachweis — aber
 * erst hinterher, und die Mail ist nicht zurueckzuholen.
 *
 * Leere Liste = keine Einschraenkung. Das ist bewusst der Auslieferungszustand:
 * Eine Liste, die niemand gepflegt hat, darf den Versand nicht lahmlegen.
 * ABER: "leer" heisst leeres Feld und nicht "Feld voller Trennzeichen" — siehe
 * `leerTrotzEingabe` bei normalisiereDomains. Sonst schaltete ein Tippfehler in
 * der Konfiguration die Schranke ab, ohne dass jemand es saehe.
 */

/**
 * Hoechstzahl gepflegter Domains — begrenzt Eingabefeld und Vergleich.
 *
 * Keine Sicherheitsgrenze, sondern eine Vernunftgrenze: 16 Mandanten plus
 * Steuerbuero, Versorgungskasse und dergleichen bleiben deutlich darunter.
 * Wer hunderte Domains eintraegt, hat die Liste missverstanden — dann ist sie
 * keine Freigabeliste mehr, sondern eine umstaendliche Art, nichts zu pruefen.
 */
export const MAX_ERLAUBTE_DOMAINS = 50;

/**
 * Die Domain einer Adresse, klein geschrieben.
 *
 * Genommen wird der Teil nach dem LETZTEN @ und nicht nach dem ersten. Ein
 * lokaler Teil darf laut RFC 5321 in Anfuehrungszeichen ein @ enthalten
 * ("a@b"@example.org); wer nach dem ersten @ trennte, bekaeme dort eine
 * Domain, die es gar nicht gibt — und liesse sich damit womoeglich eine
 * erlaubte vorgaukeln.
 *
 * Fehlt das @ oder bleibt nichts uebrig, gibt es keine Domain. Der Aufrufer
 * behandelt das als nicht freigegeben (fail closed): Lieber eine abgelehnte
 * krumme Adresse als eine durchgelassene.
 */
export function domainVon(adresse: string): string | null {
  const at = adresse.lastIndexOf("@");
  if (at < 0) return null;
  const domain = adresse.slice(at + 1).trim().toLowerCase();
  return domain === "" ? null : domain;
}

/**
 * Wie eine Domain aussehen muss: Labels aus a-z/0-9 mit Bindestrichen im
 * Inneren, mindestens ein Punkt.
 *
 * Absichtlich streng und ohne Umlaute: Internationalisierte Domains kommen als
 * Punycode (xn--…) daher und passen damit trotzdem. Ein zu lockerer Ausdruck
 * waere hier das groessere Uebel — er liesse "http://x.de" oder "a b.de"
 * durch, die dann NIE auf eine echte Adresse passen und die Liste still
 * unwirksam machen.
 */
const DOMAIN_MUSTER = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Zerlegt das gepflegte Feld in normalisierte Domains.
 *
 * Ein vorangestelltes "@" oder "." wird abgeschnitten, damit ein eingefuegtes
 * "@web.de" (so steht es in jeder Mailadresse) oder ".fes-minden.de" (so
 * schreiben es Cookie- und Proxy-Konfigurationen) nicht stillschweigend
 * wirkungslos bleibt — es waere sonst nie gleich "web.de" und die Person
 * saehe eine gefuellte Liste, die nichts freigibt.
 *
 * `ungueltig` nennt alles, was danach nicht wie eine Domain aussieht. Die
 * Einstellungs-Route lehnt damit ab, statt eine kaputte Liste zu speichern,
 * die spaeter jeden abweichenden Versand blockiert, ohne dass jemand den Grund
 * saehe. Zurueckgegeben wird dort der getrimmte Originaltext, nicht der
 * bearbeitete Rest — die Person soll in der Meldung wiedererkennen, was sie
 * getippt hat.
 *
 * Doppelte Eintraege fallen weg; die Reihenfolge der ersten Nennung bleibt,
 * weil die Liste so in Meldungen und im Einstellungsfeld erscheint, wie sie
 * gepflegt wurde.
 *
 * `leerTrotzEingabe` meldet den unangenehmen Sonderfall: Es STAND etwas im
 * Feld, aber es bleibt keine einzige Domain uebrig. So sieht ",,, @" aus, oder
 * ein Kopierfehler, der nur Trennzeichen mitgebracht hat — die leeren Teile
 * werden uebersprungen, also landet auch nichts in `ungueltig`. Ohne dieses
 * Kennzeichen sieht das Ergebnis genauso aus wie ein bewusst geleertes Feld,
 * und eine leere Liste heisst "keine Einschraenkung": Die Schranke schaltete
 * sich durch einen Tippfehler selbst ab, ohne dass jemand es merkte. Die
 * Einstellungs-Route lehnt deshalb ab, statt zu speichern.
 *
 * Bewusst gilt das Kennzeichen fuer JEDE nicht leere Eingabe ohne Ergebnis —
 * auch fuer eine, die nur aus ungueltigen Eintraegen besteht. Die Route nennt
 * dann zuerst die ungueltigen Eintraege, weil das die genauere Meldung ist;
 * faellt diese Pruefung jemals weg, greift immer noch diese hier. Zwei
 * Schranken, die dasselbe Loch decken, sind hier die richtige Wahl: Der
 * Fehlerfall ist eine stille Abschaltung.
 *
 * Ein KOMPLETT leeres Feld (nach trim) bleibt ausdruecklich erlaubt — das ist
 * der legitime Weg, die Einschraenkung wieder abzuschalten.
 */
export function normalisiereDomains(roh: string): {
  domains: string[];
  ungueltig: string[];
  leerTrotzEingabe: boolean;
} {
  const domains: string[] = [];
  const ungueltig: string[] = [];
  for (const teil of roh.split(",")) {
    const wert = teil.trim().toLowerCase().replace(/^[@.]+/, "");
    if (wert === "") continue;
    if (!DOMAIN_MUSTER.test(wert)) {
      ungueltig.push(teil.trim());
      continue;
    }
    if (!domains.includes(wert)) domains.push(wert);
  }
  return {
    domains,
    ungueltig,
    leerTrotzEingabe: roh.trim() !== "" && domains.length === 0,
  };
}

/**
 * Darf an diese Adresse versendet werden?
 *
 * Vier Faelle in dieser Reihenfolge:
 *  1. Adresse ist die des Vorgangs -> immer ja.
 *  2. Keine Domain gepflegt        -> ja (Abweichung steht im Nachweis).
 *  3. Domain steht in der Liste    -> ja.
 *  4. Sonst                        -> nein.
 *
 * Fall 1 steht bewusst VOR Fall 3 und ist nicht an die Liste gebunden: Die
 * Adresse stammt aus dem Vorgang, nicht aus dem Eingabefeld des Dialogs. Wer
 * sie aendern will, muss den Vorgang aendern — und diese Aenderung wird
 * protokolliert, sonst waere Fall 1 eine offene Tuer: Man traegt die
 * Wunschadresse in den Vorgang ein und versendet danach voellig regulaer.
 *
 * WO diese Protokollierung sitzt, ist deshalb Teil der Regel und keine
 * Nebensache — Fall 1 ruht auf ihr. Sie steht im AuditLog-Eintrag der
 * PATCH-Route des jeweiligen Moduls, also in
 * src/app/api/{offboarding,onboarding,civil-service,contract-end}/[id]/route.ts,
 * und zwar mit VORHER und NACHHER: Die Route laedt den Vorgang ohnehin vor dem
 * Schreiben (`existing`), um ihn zu pruefen, und legt den alten neben den neuen
 * Wert in die `details` desselben Eintrags, der die Aenderung ohnehin
 * festhaelt. In der Offboarding-Route sind das die Schluessel
 * `employeePrivateEmailFrom` / `employeePrivateEmailTo` unter der Aktion
 * "OFFBOARDING_UPDATED" bzw. "STATUS_CHANGED".
 *
 * Das Vorher ist nicht Zierde, sondern der Kern: Ohne es sieht der Weg
 * "Adresse auf die eigene setzen -> versenden -> Adresse zuruecksetzen" im
 * Protokoll wie zwei harmlose Eintraege mit der richtigen Adresse aus — und
 * der Versandnachweis meldet dazu noch "empfaengerAbweichend: false", weil das
 * Ziel ja die Vorgangsadresse war.
 *
 * Wer diese Protokollierung entfernt, entfernt die Begruendung fuer Fall 1
 * mit. Dann bleibt nur, Fall 1 zu streichen und auch die Vorgangsadresse an
 * die Liste zu binden — was den Regelfall des Onboardings (private
 * Freemail-Adresse) blockieren wuerde. Anders gesagt: Die Bequemlichkeit hier
 * ist geliehen, und die Sicherheit dafuer liegt drueben in den PATCH-Routen.
 *
 * Verglichen wird die Domain EXAKT und nicht mit endsWith: "credo-gruppe.de"
 * darf nicht auf "boesecredo-gruppe.de" passen. Genau so wird eine Allowlist
 * leise loechrig — die Domain zu registrieren kostet ein paar Euro. Unter-
 * domains muessen deshalb einzeln eingetragen werden; bei einer Allowlist ist
 * das die richtige Richtung des Irrtums.
 *
 * Im Browser ist dieselbe Funktion nur eine ANZEIGE: Sie sagt frueh, was der
 * Server ohnehin ablehnen wuerde (409 EMPFAENGER_NICHT_ERLAUBT). Die Schranke
 * ist der Serveraufruf in src/lib/dokumentenpaket.ts.
 */
export function empfaengerFreigegeben(opts: {
  empfaenger: string;
  empfaengerVorgang: string;
  domains: string[];
}): boolean {
  const ziel = opts.empfaenger.trim().toLowerCase();
  const ausVorgang = opts.empfaengerVorgang.trim().toLowerCase();
  // Der leere Vergleich waere sonst wahr: Ohne die Pruefung auf ziel !== ""
  // liesse ein Vorgang ohne Empfaengeradresse eine leere Adresse durch.
  if (ziel !== "" && ziel === ausVorgang) return true;
  if (opts.domains.length === 0) return true;
  const domain = domainVon(ziel);
  return domain !== null && opts.domains.includes(domain);
}
