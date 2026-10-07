# Pilot Vertragsende – Feinplan

Stand 02.10.2026 · gehört zu [ux-ui-plan-2026-09.html](ux-ui-plan-2026-09.html), Abschnitt 4 D (Prozessleiste), Abschnitt 5 (Pakete U2 und U4, Schritt 5) und Entscheidung E10 ·
Branch `ux-umbau` · Status: **freigegeben am 02.10.2026 (F1–F9, Abschnitt 10). Tag 1–2 (Regeln, Bausteine auf der Musterseite) dürfen sofort laufen; die Seite selbst erst nach dem Prototyp-Tag (V0).** ·
Stand und Protokoll: [projekt-ux-umbau.md](projekt-ux-umbau.md)

## 1. Ziel

Der Pilot ist ein senkrechter Schnitt durch EIN Modul: Die Detailseite eines
Vertragsende-Vorgangs steht danach vollständig im Zielbild – Seitenkopf, Prozessleiste mit
„Jetzt dran“, Reiter, Gruppen, Dialoge statt Browser-Rückfragen. Alte und neue Ansicht laufen
nebeneinander; jede Person schaltet für sich um (Vorschau-Schalter). Das Personalbüro arbeitet
zwei Wochen damit, erst danach wird ein weiteres Modul umgestellt.

Der Pilot prüft laut E10: Rahmen, Kopf, Prozessleiste im Grundsatz (mit Verzweigung) und den
Vorschau-Schalter. **Ungeprüft bleiben bis zum Ausrollen:** parallele Schritte, Checkliste, der
Inhalt des Reiters Dokumente (U10), die Zeitachse.

Grundlage:

| # | Entscheidung | Folge für den Pilot |
|---|---|---|
| E1 | eine Interaktionsfarbe, Zustände funktional | Status und Frist-Ampel bekommen Töne aus einem Katalog (3.5); die CI-Farben der heutigen Seite entfallen |
| E4 | `/vorgaenge/vertragsende/<uuid>` | Adresse bleibt; neu: `?tab=` öffnet einen Reiter |
| E6 | „du“ hinter der Anmeldung, möglichst ohne Anrede | alle Texte der neuen Ansicht (3.6) |
| E10 | Pilot Vertragsende | dieser Plan |
| U1-F1 | Seitenkopf und Breite je Modul mit dessen Paket | die neue Ansicht bekommt `Seitenkopf` (mit `h1`) und `max-w-6xl` |
| U1-F4 | Dateien ziehen mit U4 um | 3.7 |

### Was ohne den Prototyp-Tag nur angenommen ist

| Annahme | Hängt an | Was sich ändern könnte |
|---|---|---|
| Wortlaut von „Jetzt dran“ und „Danach“ je Status (3.3) | V0: die häufigsten Aufgaben, Klick-Dummy | Texte, Reihenfolge der Knöpfe |
| Vorgangsnummer in der Unterzeile des Kopfs, nicht im Titel | E9 (Dichte, Nummer) | Stelle und Größe der Nummer |
| Modulname „Vertragsende“ in Pfad und Unterzeile | E11 (Anzeigenamen) | ein Wort in zwei Tabellen |
| Reiter „E-Mails“ bleibt eigenständig | E12 (Verlauf, U10) | nichts im Pilot |
| Welche Hinweise oben stehen dürfen (3.4) | V0: Was liest HR wirklich? | Reihenfolge, Zusammenlegen |

E13 (Textbausteine der individuellen E-Mail) berührt den Pilot nicht.

## 2. Umfang

### Im Pilot

1. **Prozessleiste** als Baustein mit dem Datenmodell `ProzessStand` (3.2) – nur der Modus
   „Schritte“ mit den Zuständen erledigt, aktiv, kommend, übersprungen, verzweigt, abgebrochen.
2. **Adapter Vertragsende** (3.3): reine Funktion Vorgang → `ProzessStand`.
3. **Neue Detailseite** (3.4): Seitenkopf, Prozessleiste, Reiter, Gruppen, Hinweise, Dialoge.
4. **Drei weitere Bausteine**, die es noch nicht gibt und die die Seite braucht (3.1): Reiter,
   Hinweis, Textfeld.
5. **Vorschau-Schalter** (3.8).
6. **Tests, Abnahme, Sperrklinke** (Abschnitte 5 und 7).

### Bewusst nicht im Pilot

| Was | Kommt mit | Grund |
|---|---|---|
| Liste der Vertragsenden (bei 390 px breiter als das Fenster), Dialog „Neuer Vorgang“ | U3 | Listen sind ein eigenes Paket und hängen an Paket 6 |
| Die drei Karten im Reiter Dokumente (Vorlage erstellen, Dokumentenpaket, Individuelle E-Mail) und das Mailprotokoll | U10 bzw. U4 des jeweiligen Moduls | Sie werden von vier bis sechs Modulen geteilt. Im Pilot stehen sie **im alten Aussehen in der neuen Seite** – das ist sichtbar uneinheitlich und so gewollt (E10). |
| Zustände „parallel“, „blockiert“, „Schleife“ und der Zeitachsen-Modus der Prozessleiste | U2 für Onboarding/Offboarding, Verbeamtung, Mutterschutz/Elternzeit | Vertragsende hat keinen Fall dafür; ein Zustand ohne Aufrufer wäre geraten |
| Kompaktmodus der Leiste beim Scrollen (klebend, eine Zeile) | siehe F6 | Empfehlung: im Pilot nur „klebt nicht, bricht am Handy um“; siehe Frage |
| Gruppe „Verlauf“ aus dem Audit-Protokoll | U10 (E12) | Die Route liefert schon heute 20 Einträge mit, die Seite zeigt sie nicht; der Ort dafür ist noch nicht entschieden |
| Verweis „Personenseite öffnen“ | U8 | gibt es noch nicht |
| Formular der Führungskraft (`/vertrag-formular/[token]`) | U5 | Link-Seite, eigene Anrede, eigenes Paket |
| Mandanten-Einstellung „Vertragsende“ | U6 | Verwaltung |
| Handbuch neu bebildern | nach Schritt 8 des Plans | bis dahin gilt die alte Ansicht als Standard |

### Nicht angefasst

- Keine Fachlogik: Statusübergänge (`VALID_TRANSITIONS`), Anspruch in `/nicht-uebernehmen`,
  Token und Rücksetzen in `/supervisor-link`, Erinnerungslauf, Webhook-Eingang, Frist-Ampel
  (`getContractEndCategory`) und beide Warnregeln (`contract-end-warnings.ts`) bleiben, wie sie
  sind. Die neue Seite ruft dieselben Routen mit denselben Körpern wie die alte (`GET`/`PATCH
  /api/contract-end/[id]`, `/supervisor-link`, `/reminder`, `/nicht-uebernehmen`).
- Kein Prisma-Schema (in der empfohlenen Variante von F1), keine Mail- und keine Word-Vorlage.
- Die alte Ansicht bleibt Zeile für Zeile unverändert, solange der Schalter existiert.

## 3. Was gebaut wird

### 3.1 Neue Bausteine in `src/components/ui/`

Jeder nach den Regeln aus U0: eine Datei, Farbpaare als exportierte Tabelle (der Kontrasttest
liest sie), Eintrag auf `/ui-muster`, Regeln in `ui-bausteine.test.tsx` mit axe.

| Baustein | Datei | Regeln |
|---|---|---|
| **Prozessleiste** | `prozessleiste.tsx` | Zeichnet einen `ProzessStand` (3.2). Schritte als geordnete Liste (`ol`), der aktive trägt `aria-current="step"`; jeder Zustand hat Text oder ein Symbol mit Namen, nie nur Farbe. Darunter der Kasten „Jetzt dran“: ein Satz, eine Unterzeile („Danach …“ bzw. Frist), höchstens ein Hauptknopf und ein Nebenknopf. Die Leiste kennt keine Fachbegriffe und ruft keine Schnittstelle; Knöpfe bekommt sie als fertige Elemente von der Seite. Ein Klick auf einen Schritt mit `reiter` wechselt den Reiter (Schritte ohne `reiter` sind kein Knopf). Unter 640 px: Punkte in einer Zeile, darunter „Schritt 4 von 5 · Vertrag“. |
| **Reiter** | `reiter.tsx` | Radix Tabs (echte Reiter mit Inhaltsfeld – das Gegenstück zu `Segment`, das nur filtert). Optionaler Zähler am Namen. Gesteuert (`wert`/`onWechsel`), damit die Seite den Reiter in der Adresse führen kann. Rollt am Handy waagerecht. |
| **Hinweis** | `hinweis.tsx` | Kasten für eine Aussage, die über der Arbeit stehen muss: `ton` `critical`/`wait`/`info`, Symbol aus `lucide-react`, Titel, Text, optional ein Knopf. `critical` ist `role="alert"` nur, wenn der Hinweis NACH dem Laden neu erscheint; sonst ein gewöhnlicher Bereich mit Überschrift – ein Screenreader soll nicht bei jedem Öffnen der Seite unterbrochen werden. Keine Emojis (heute: ⚠ und 👥). |
| **Textfeld** | `textfeld.tsx` | Eingabefeld mit sichtbarer Beschriftung, optionalem Hilfetext und Fehlertext (`aria-describedby`, `aria-invalid`). Platzhalter in `ink-2`. Erster Aufrufer: die Adresse der Führungskraft im Dialog „Anfrage senden“. Kein Datumsfeld, keine Auswahl – die kommen mit ihrem ersten Aufrufer. |

`Button`, `Statuspille`, `Gruppe`/`Zeile`, `Dialog`/`BestaetigungsDialog`, `toast`,
`Seitenkopf`, `Skelett` gibt es; `Segment` und `Leerzustand` braucht die Seite nur im Reiter
Vertragsdaten (Leerzustand).

### 3.2 Datenmodell `ProzessStand`

`src/lib/prozess/prozess-stand.ts` – rein, client-sicher, ohne Uhr (jede Funktion bekommt
`jetzt`), getestet. Nur was der Pilot braucht; die Typen sind so geschnitten, dass U2 die
fehlenden Zustände ergänzt, ohne bestehende Aufrufer zu ändern.

```ts
type SchrittStatus = "erledigt" | "aktiv" | "kommend" | "uebersprungen";

interface ProzessSchritt {
  key: string;
  titel: string;            // „Rückmeldung“
  status: SchrittStatus;
  zustaendig?: string;      // „Führungskraft“, „HR“
  notiz?: string;           // „Übernahme“, „abgelehnt“, „MAV offen“
  datum?: string;           // ISO; die Leiste formatiert mit formatDatumDE
  /** Verzweigung: der NICHT gewählte Weg, als gestrichelter Hinweis. */
  sonst?: string;           // „sonst: Offboarding anlegen“
  reiter?: string;          // Klick springt zu diesem Reiter
}

interface JetztDran {
  satz: string;             // „Unterschriebenen Vertrag erfassen“
  bei: "HR" | "FUEHRUNGSKRAFT" | "NIEMAND";
  unterzeile?: string;      // Frist oder „Danach: …“
  dringlichkeit?: "critical" | "wait";
  /** Schlüssel der Handlung; die SEITE macht daraus den Knopf (und nur mit Bearbeitungsrecht). */
  aktion?: string;
  nebenAktion?: string;
}

interface ProzessStand {
  modus: "schritte";
  schritte: ProzessSchritt[];
  jetztDran: JetztDran | null;        // null: abgeschlossen oder storniert
  ende?: "abgeschlossen" | "abgebrochen";
}
```

Der Adapter liefert **Schlüssel**, keine Knöpfe und keine Handler: So bleibt er rein, und
dieselbe Zeile kann später Listen und Startseite füttern (U3, „Nächster Schritt bei HR“).

### 3.3 Adapter Vertragsende

`src/lib/prozess/vertragsende.ts` – `vertragsendeProzessStand(vorgang, jetzt)`, mit enger
Eingabeschnittstelle (wie `SchritteStand` im Onboarding; kein Import der Seite).

Fünf Schritte: **Angelegt · Anfrage · Rückmeldung · Vertrag *oder* Offboarding · Abschluss**.

| Status | Leiste | Jetzt dran | bei | Knopf (nur `HR_EDIT_ROLES`) |
|---|---|---|---|---|
| `ANGELEGT` | Anfrage aktiv | „Anfrage an die Führungskraft senden“ | HR | **Anfrage senden …** (Dialog mit Adresse); Menü: „Ohne Anfrage: Offboarding anlegen …“ |
| `ANFRAGE_VORGESETZTER`, Alt `ENTSCHEIDUNG_UEBERNAHME` | Rückmeldung aktiv, zuständig Führungskraft | „Wartet auf die Rückmeldung der Führungskraft“ · „Anfrage vom TT.MM. an … · n× erinnert, zuletzt TT.MM.“ | Führungskraft | **Erinnerung senden**; Menü: „Anfrage neu senden …“, „Ohne Rückmeldung: Offboarding anlegen …“ |
| `RUECKMELDUNG_UEBERNAHME`, `VERTRAG_ERSTELLT` | Rückmeldung erledigt („Übernahme“, sonst: Offboarding), Vertrag aktiv | „Verlängerungsvertrag erstellen und unterschrieben zurückholen“ · Frist aus `getSignatureWarning` | HR | **Unterschriebenen Vertrag erfassen …**, daneben „Zu den Dokumenten“ |
| `VERTRAG_UNTERSCHRIEBEN` | Vertrag erledigt (Datum), Abschluss aktiv | „Vorgang abschließen“ · „MAV: offen“, falls kein Stand gesetzt | HR | **Abschließen …** |
| `RUECKMELDUNG_KEINE_UEBERNAHME` | Rückmeldung erledigt („abgelehnt“, sonst: Vertrag), Offboarding aktiv | „Ablehnung bestätigen und Offboarding anlegen“ | HR | **Offboarding anlegen …** |
| `ENTSCHEIDUNG_KEINE_UEBERNAHME` | Offboarding erledigt (Nummer), Abschluss aktiv | „Auslaufmitteilung erstellen, Zeugnis im Offboarding“ | HR | **Zum Offboarding OFF-…** (Verweis), daneben „Zu den Dokumenten“; Menü: „Abschließen …“ (F3, entschieden) |
| `ABGESCHLOSSEN` | alles erledigt | – | – | – |
| `STORNIERT` | bis zum letzten erreichten Schritt, `ende: "abgebrochen"` | – | – | – |

Regeln des Adapters:

- **Verzweigung:** Solange die Entscheidung offen ist, heißt Schritt 4 „Vertrag oder
  Offboarding“. Danach steht der gewählte Weg in der Linie und der andere als `sonst` an der
  Rückmeldung (Mockup des Plans).
- **Übersprungen:** Legt HR das Offboarding ohne Anfrage oder ohne Rückmeldung an
  (`ANGELEGT`/`ANFRAGE_VORGESETZTER` → `ENTSCHEIDUNG_KEINE_UEBERNAHME`), sind „Anfrage“ bzw.
  „Rückmeldung“ `uebersprungen` – erkennbar an `supervisorLinkSentAt` bzw.
  `supervisorRespondedAt` = leer.
- **Der Schritt „Vertrag“ hängt an `contractSignedReturnedAt`, nicht am Status
  `VERTRAG_ERSTELLT`.** Befund beim Lesen: Kein Code setzt `VERTRAG_ERSTELLT` (weder das
  Erzeugen des Dokuments noch ein Knopf der Seite); der Status entsteht nur per Hand-PATCH.
  Der Adapter behandelt ihn deshalb wie `RUECKMELDUNG_UEBERNAHME`. Die Leiste behauptet nicht
  „Vertrag erstellt“, solange das Portal es nicht weiß (Leitplanke „keine erfundenen
  Prozessaussagen“).
- **MAV ist ein Hinweis, keine Sperre.** Die Route lässt den Abschluss ohne MAV-Stand zu; die
  neue Seite ändert das nicht. „MAV offen“ steht als Notiz am Abschluss und als Satz im
  Bestätigungsdialog.
- **Dringlichkeit** kommt nur aus den vorhandenen Regeln: `getSignatureWarning` (`warn` →
  `critical`) und der Frist-Ampel (3.5). Keine neue Fristregel – mit einer Ausnahme, die zu
  entscheiden ist (F4).

### 3.4 Die neue Detailseite

Aufbau von oben nach unten, Breite `max-w-6xl`:

1. **Seitenkopf.** Pfad „Vorgänge › Vertragsende › Vorname Nachname“. Titel = Name (die `h1`,
   die der Seite seit U1 fehlt). Unterzeile „Einrichtung · VE-2026-… · Vertragsende
   TT.MM.JJJJ“. Eine Statuspille (3.5). Kein Primärknopf im Kopf – die eine Handlung steht in
   der Prozessleiste. Menü „…“: die Nebenhandlungen des Status (Tabelle 3.3) und, falls F2 so
   entschieden wird, „Vorgang stornieren …“.
2. **Prozessleiste** mit „Jetzt dran“.
3. **Hinweise** (nur die zutreffenden, in dieser Reihenfolge), sichtbar über allen Reitern –
   heute stehen sie nur im Reiter Übersicht, die Vorstand-Warnung zusätzlich doppelt:

   | Hinweis | Ton | Quelle (unverändert) |
   |---|---|---|
   | Entfristungsrisiko (§ 15 Abs. 5 TzBfG) | critical | `getSignatureWarning().warn` |
   | Nicht mit Vorstand/Geschäftsführung abgestimmt | critical | `vorstandAbgestimmt === false` |
   | Hinweis zur Befristung (§ 14 TzBfG) | wait | `getKettenbefristungWarning` |
   | Vertragsende von DokuBit geändert | wait | `contractEndDateGeaendertAm`, nicht bei abgeschlossen/storniert |
   | Person hat weitere Einstellungen | info | `weitereMandanten` |

4. **Reiter** Übersicht · Vertragsdaten · Dokumente · E-Mails (E-Mails nur `HR_EDIT_ROLES`,
   wie heute). Der Reiter steht in der Adresse (`?tab=vertragsdaten|dokumente|e-mails`;
   `vorgangPfad(modul, id, reiter)` gibt es schon) – ein Verweis aus einer Mail oder aus dem
   Offboarding kann damit direkt auf „Dokumente“ zeigen. Heute versteht die Seite `?tab=` nicht.

   - **Übersicht:** Gruppe „Person und Vertrag“ (Name, E-Mail, Einrichtung, Personalnummer,
     Vertragsbeginn, Vertragsende, Befristungsart). Gruppe „Führungskraft“ (Adresse, Anfrage
     vom, Rückmeldung vom, Erinnerungen; bei Ablehnung die Begründung; bei Übernahme „Mit
     Vorstand/GF abgestimmt“ samt Vermerk). Gruppe „Mitarbeitervertretung“ (erst nach der
     Entscheidung, wie heute): Stand als Statuspille, Auswahl über **einen** Knopf „Stand
     setzen …“ mit Dialog statt vier gleichrangiger Knöpfe, die heute ohne Rückfrage speichern.
     Gruppe „Offboarding“ (nur bei Nicht-Übernahme): Nummer, Status, Verweis.
   - **Vertragsdaten:** dieselben Felder wie heute als `Gruppe`/`Zeile`, Pille „abgesendet“;
     leer = `Leerzustand` („Noch keine Vertragsdaten. Sie entstehen, sobald die Führungskraft
     das Formular abgesendet hat.“).
   - **Dokumente** und **E-Mails:** die bestehenden Komponenten, unverändert eingebunden.

5. **Laden und Fehler:** `Skelett` statt „Wird geladen…“; gescheitertes Laden als `Hinweis`
   mit Verweis zur Liste. Rückmeldungen der Handlungen über `toast.ok`/`toast.fehler`; ein
   Fehler, zu dem etwas zu korrigieren ist (Adresse abgelehnt), steht im Dialog.

**Dieselbe Handlung, ein Ort.** Heute gibt es „Zu den Dokumenten“ zweimal, „Offboarding
anlegen“ an zwei Stellen mit zwei Texten und die Vorstand-Warnung in zwei Reitern. Nachher:
jede Handlung genau einmal – als Knopf in „Jetzt dran“ oder als Menüpunkt.

**Dialoge** (alle `BestaetigungsDialog` bzw. `Dialog`, Bestätigen-Knopf mit dem Verb):

| Handlung | Heute | Nachher |
|---|---|---|
| Anfrage senden | Feld und Knopf in der Karte | Dialog mit `Textfeld` (Adresse vorbelegt), Knopf „Anfrage senden“ |
| Anfrage neu senden | **ohne Rückfrage**, obwohl der neue Link begonnene Eingaben der Führungskraft verwirft und Rückmeldung, Erinnerungszähler und Vorstand-Vermerk zurücksetzt | Rückfrage, die genau das sagt; Adresse änderbar |
| Erinnerung senden | ohne Rückfrage | ohne Rückfrage, Toast (nutzt den bestehenden Link, nichts geht verloren) |
| Offboarding anlegen | `window.confirm` | Rückfrage, kritisch; nennt Namen und letzten Arbeitstag (= Vertragsende) |
| Unterschriebenen Vertrag erfassen | `window.confirm` | Rückfrage „Unterschriebener Vertrag liegt vor?“ |
| Abschließen | `window.confirm` | Rückfrage; nennt offene Punkte (MAV offen, kein unterschriebener Vertrag) als Text, sperrt nicht |
| MAV-Stand setzen | vier Knöpfe, sofort | Dialog mit Auswahl |

Damit sinkt der Stand der Sperrklinke für die Datei erst, wenn die alte Ansicht gelöscht
wird (3 × `confirm`, 1 × Datum, 8 × Palettenklasse); die neue Datei startet bei 0.

### 3.5 Kataloge: Fachstatus → Ton

`src/lib/prozess/vertragsende.ts`, als exportierte Tabellen, getestet (jeder Status des Enums
hat einen Eintrag). Regel: **`wait` = wartet auf jemand anderen, `info` = HR ist dran,
`critical` = Frist oder Risiko, `ok` = erledigt, `neutral` = beendet ohne Ergebnis.**

| Status | Text der Pille | Ton |
|---|---|---|
| `ANGELEGT` | Anfrage offen | info |
| `ANFRAGE_VORGESETZTER`, `ENTSCHEIDUNG_UEBERNAHME` | Wartet auf Führungskraft | wait |
| `RUECKMELDUNG_UEBERNAHME`, `VERTRAG_ERSTELLT` | Übernahme · Vertrag offen | info |
| `VERTRAG_UNTERSCHRIEBEN` | Vertrag unterschrieben | ok |
| `RUECKMELDUNG_KEINE_UEBERNAHME` | Abgelehnt · Offboarding offen | info |
| `ENTSCHEIDUNG_KEINE_UEBERNAHME` | Keine Übernahme | neutral |
| `ABGESCHLOSSEN` | Abgeschlossen | ok |
| `STORNIERT` | Storniert | neutral |

Greift `getSignatureWarning().warn`, ersetzt „Entfristungsrisiko · in n Tagen“ (critical) die
Pille des Status – der Kopf trägt genau eine Pille.

**Frist-Ampel** (heute zweite Pille im Kopf, mit festen Hex-Farben): nachher Teil der
Unterzeile von „Jetzt dran“ („Vertragsende in 5 Wochen“), Ton `critical` bei KRITISCH, `wait`
bei WARNUNG, ohne Hervorhebung bei BEOBACHTEN; bei abgeschlossenen und stornierten Vorgängen
gar nicht (heute steht dort weiter „Kritisch“). Die Stufen selbst rechnet weiter
`getContractEndCategory`.

Die alten Tabellen (`CONTRACT_END_STATUS_LABELS`, `CONTRACT_END_CATEGORY_META`) bleiben für
Liste und alte Ansicht.

### 3.6 Sprache

- Portal-Texte ohne Anrede, wo es geht („Vertrag im Reiter Dokumente erstellen“), sonst „du“.
  Die alte Ansicht siezt an fünf Stellen; sie bleibt, wie sie ist.
- „Führungskraft“ durchgehend (heute gemischt: Vorgesetzter, Vorgesetzte/r, Führungskraft –
  `rollenName()` sagt „Führungskraft“).
- Keine Großschreibung als Betonung („NICHT übernehmen“, „UNBEFRISTET“), keine Pfeile in
  Knöpfen, keine Emojis.
- Daten über `formatDatumDE` (deutsche Zeit) statt `toLocaleDateString` (Zeitzone des Geräts).
  Sichtbarer Unterschied nur bei Zeitstempeln kurz nach Mitternacht.
- Der Leertext der Vorlagen-Karte („Vorlagen legen Sie unter …“) kommt als Eigenschaft von der
  Seite und wird in der neuen Ansicht ohne Anrede übergeben; die Karte selbst bleibt.

### 3.7 Wohin die Dateien ziehen

| Was | Ort |
|---|---|
| Seite (dünn, entscheidet alt/neu) | `src/app/(portal)/vorgaenge/vertragsende/[id]/page.tsx` (gibt es) |
| Neue Ansicht, je Reiter eine Datei | daneben: `detail.tsx`, `reiter-uebersicht.tsx`, `reiter-vertragsdaten.tsx`, `reiter-dokumente.tsx`, `dialoge.tsx`, `typen.ts` |
| Reine Regeln | `src/lib/prozess/prozess-stand.ts`, `src/lib/prozess/vertragsende.ts` |
| Bausteine | `src/components/ui/` |
| Alte Ansicht | bleibt in `(portal)/dashboard/contract-end/[id]/` und wird mit dem Schalter gelöscht |
| Liste, Listen-Konfiguration, „Neuer Vorgang“ | bleiben (U3) |

Begründung für „neben der Seite“ statt `src/components/`: Die Dateien gehören nur dieser
Seite; Next.js erlaubt Dateien ohne `page`-Namen im Routenordner. Der Wächter aus U1 (keine
`page.tsx` unter `dashboard/`) bleibt erfüllt. Die bestehenden Dateien `src/lib/contract-end-*.ts`
werden nicht umbenannt (Aufrufer in Läufen, Routen und Tests).

### 3.8 Vorschau-Schalter

- **Wo gespeichert (F1, entschieden): als Cookie im Browser**, `ansicht-vertragsende=neu`,
  ein Jahr, `SameSite=Lax`, kein Personenbezug. Die Seite liest ihn auf dem Server und lädt
  genau eine der beiden Ansichten (kein Umspringen nach dem Laden). Kein Schema-Delta, nichts
  zurückzubauen außer einer Datei.
  Preis: Die Wahl gilt je Gerät und Browser, nicht je Konto; und es lässt sich nicht
  auswerten, wer umgeschaltet hat.
- **Wer:** jede Rolle, die die Seite öffnen darf (`PORTAL_ROLES`). Einrichtungsleitung und
  Führungskräfte sehen in beiden Ansichten nur Lesendes.
- **Vorgabe:** alte Ansicht. Niemand wird ohne eigenen Klick umgestellt.
- **Wo:** eine schmale Zeile über dem Inhalt der Vertragsende-Detailseite, in beiden
  Ansichten: „Neue Ansicht ausprobieren“ bzw. „Zur bisherigen Ansicht“ – dazu in der neuen
  ein Verweis „Rückmeldung geben“ (`mailto:` an `personalbuchhaltung@fes-minden.de`, F5 –
  kein neuer Versandweg). Umschalten lädt die Seite neu (`seiteNeuLaden`).
- **Ende:** Nach den zwei Wochen und der Entscheidung des Personalbüros wird die neue Ansicht
  Vorgabe, danach entfallen Schalter, Cookie und alte Datei in einem Commit.

## 4. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/components/ui/prozessleiste.tsx`, `reiter.tsx`, `hinweis.tsx`, `textfeld.tsx` | neu |
| `src/app/(portal)/ui-muster/…` | vier Bausteine eintragen (der Test „Vollständigkeit“ verlangt es) |
| `src/lib/prozess/prozess-stand.ts`, `src/lib/prozess/vertragsende.ts` | neu, rein |
| `src/app/(portal)/vorgaenge/vertragsende/[id]/page.tsx` | liest den Schalter, bindet alt oder neu ein |
| `src/app/(portal)/vorgaenge/vertragsende/[id]/*.tsx` | neu: die Ansicht (3.7) |
| `src/lib/ansicht.ts` (Name vorläufig) | neu: Name des Cookies, Lesen/Setzen – eine Stelle |
| `src/__tests__/lib/ui-kontrast.test.ts` | Farbtabellen der vier Bausteine aufnehmen |
| `src/lib/utils.ts`, `src/app/globals.css` | nur, falls die Leiste ein neues Größen-Token braucht |
| `scripts/ux-abnahme.js` | Vertragsende-Seite alt/neu in drei Breiten; Testdaten je Status |
| `CLAUDE.md`, `projekt-ux-umbau.md` | Regeln (Prozessleiste, Reiter, Hinweis, Textfeld, Schalter), Protokoll |
| `docs/module/vertragsende/vertragsende-implementierung.md` | Tabelle „UI Detail“ nachziehen (nennt noch `dashboard/…/page.tsx`) |

**Nicht geändert:** `contract-end-detail-content.tsx` (alte Ansicht), alle Routen unter
`src/app/api/contract-end/`, `contract-end-fristen.ts`, `contract-end-warnings.ts`,
`constants.ts`, Läufe, Webhook.

**Schema-Delta:** keines (Variante Cookie). Variante Benutzerkonto: eine Spalte
`User.neueAnsichten String[]` o. ä. – additiv, läuft über die Sicherung des Entrypoints; nach
dem Pilot wieder zu entfernen (dann mit `--accept-data-loss` gewollt).

**Mail-Vorlagen:** keine betroffen. Geprüft: `contract-end-created`,
`contract-end-supervisor-link`, `contract-end-supervisor-reminder`, `contract-end-eskalation`,
`contract-end-unbearbeitet`, dazu die Paketmail der Vertragsverlängerung und
`individuelle-mail` – kein Text und kein Payload-Feld ändert sich; `portalLink` zeigt weiter
auf `/vorgaenge/vertragsende/<id>` und öffnet die Ansicht, die die Person gewählt hat.
Niemand muss „auf Standard zurücksetzen“. **Webhooks:** keine Änderung.

**Word-Vorlagen:** keine betroffen (Modul `VERTRAGSVERLAENGERUNG`, Platzhalter und Resolver
unverändert).

## 5. Tests

- **`prozess-vertragsende.test.ts`**: jeder Status des Enums × Entscheidung als Fall
  (Schritte, Zustände, „Jetzt dran“, Schlüssel der Handlung); Verzweigung in beide Richtungen;
  übersprungene Schritte bei direktem Offboarding; `VERTRAG_ERSTELLT` wie
  `RUECKMELDUNG_UEBERNAHME`; storniert aus jedem Status; Dringlichkeit an den Grenzen von
  `getSignatureWarning`; **Gegenprobe:** Für jeden Status ist die angebotene Handlung eine,
  die `VALID_TRANSITIONS` bzw. die Zielroute auch annimmt (die Tabelle wird dafür aus der
  Route exportiert oder im Test gespiegelt – siehe F7).
- **Kataloge**: jeder Status hat Pille und Ton; kein Text leer.
- **`ui-bausteine.test.tsx`** je neuem Baustein mit axe: Prozessleiste (`aria-current`,
  Zustand nie nur Farbe, Schritt mit `reiter` ist Knopf, sonst nicht), Reiter (Pfeiltasten,
  gesteuert), Hinweis (Rolle), Textfeld (Beschriftung, Fehler verknüpft).
- **`vertragsende-detail.test.tsx`** (jsdom, axe): je Status die richtige Handlung; ohne
  `HR_EDIT_ROLES` kein Knopf, kein Menüpunkt, kein Reiter E-Mails; jede Rückfrage sendet
  denselben Aufruf wie die alte Seite (Methode, Adresse, Körper – als Tabelle gegen die alte
  Datei gehalten); Fehler der Route steht im Dialog; `?tab=` öffnet den Reiter; genau eine `h1`.
- **Schalter**: Seite ohne Cookie → alte Ansicht; mit Cookie → neue; unbekannter Wert → alte.
- **Kontrast**: neue Farbtabellen im Kontrasttest. **Musterseite**: Vollständigkeit.
- **Sperrklinke**: neue Dateien mit Stand 0; der Gesamtstand bleibt, bis die alte Ansicht fällt.
- Bestehende Tests des Moduls (API, Läufe, Fristen, Warnungen) bleiben unverändert grün – sie
  sind der Beleg, dass keine Fachlogik berührt wurde.

## 6. Reihenfolge

| Tag | Arbeit | Ergebnis |
|---|---|---|
| 1 | `prozess-stand.ts`, Adapter und Kataloge mit Tests | Regeln stehen, noch nichts sichtbar |
| 2 | Bausteine Prozessleiste und Reiter, Musterseite, Kontrast | Leiste auf `/ui-muster` in allen Zuständen |
| 3 | Bausteine Hinweis und Textfeld; Seite: Kopf, Leiste, Hinweise, Reiter Übersicht (lesend) | neue Ansicht zeigt einen Vorgang |
| 4 | Handlungen und Dialoge; Reiter Vertragsdaten, Dokumente, E-Mails; `?tab=` | neue Ansicht kann alles, was die alte kann |
| 5 | Vorschau-Schalter; Testdaten je Status (Skript); Seitentest | umschaltbar |
| 6 | Abnahme: Bilder in drei Breiten je Status, Rollen, Tastatur, Durchsicht (Code-Review) | Befunde |
| 7 | Befunde beheben, `CLAUDE.md`, Logbuch, Ankündigungstext | deploybar |

Sieben Tage; der Plan nennt 7–9. Puffer: Kompaktmodus der Leiste (F6) und Stornieren (F2)
kosten je einen halben Tag zusätzlich. Je Tag ein Commit auf `ux-umbau`.

## 7. Abnahme

1. `npm run pruefen` und `npm run build` grün.
2. Ohne Cookie ist die Vertragsende-Seite bildgleich mit dem Stand vor dem Pilot – bis auf
   die Zeile des Schalters (`scripts/ux-abnahme.js vergleich`).
3. Neue Ansicht in 1440, 1366×768 und 390 px für je einen Vorgang in jedem der acht
   erreichbaren Zustände; Bilder in `screenshots/pilot/pilot-*.jpg` (JPEG, gebaut 07.10.2026). Bei 1366×768 wird gemessen,
   wie viel Höhe Kopf, Leiste und Reiter belegen (Ziel des Plans: höchstens ein Drittel).
4. Ein Vorgang einmal ganz durch beide Stränge geklickt (Dev-Datenbank, Port 5433): Anfrage,
   Erinnerung, Formular der Führungskraft, Vertrag erfassen, Abschluss; Ablehnung, Offboarding.
   Danach dieselben Einträge im Audit-Protokoll wie über die alte Ansicht.
5. Je Rolle: HR-Leitung, Sachbearbeitung (Knöpfe), Einrichtungsleitung und Führungskraft
   (nur lesen, kein Reiter E-Mails), fremder Mandant (Fehlermeldung wie heute).
6. Tastatur: Sprunglink → Kopf → Menü → Leiste → Reiter (Pfeiltasten) → Dialog (Fokus auf
   „Abbrechen“, zurück zum Auslöser).
7. Umschalten hin und zurück; in einem zweiten Browser bleibt die alte Ansicht.

## 8. Deploy

Kein Schema-Delta, keine Umgebungsvariable, keine Vorlage zurückzusetzen. Voraussetzung:
U0 + U1 sind deployt (noch offen) – der Pilot kann mit ihnen zusammen hinausgehen oder danach.

**Was das Personalbüro bemerkt:** zunächst nur eine Zeile „Neue Ansicht ausprobieren“ auf der
Vertragsende-Seite. Ankündigung mit: Was ist neu, wie schaltet man zurück, wohin mit
Rückmeldungen, und dass die Karten im Reiter Dokumente noch alt aussehen.

**Zwei Wochen Rückmeldung**, gemessen an den Erfolgsmaßen des Plans (Klicks je Top-Aufgabe –
der Ausgangswert kommt aus V0 –, Rückfragen „Wo finde ich …“). Danach Entscheidung:
neue Ansicht wird Vorgabe, Onboarding folgt.

**Nach dem Deploy prüfen:** Verweis aus einer echten `contract-end-eskalation`-Mail öffnen;
ein echter Vorgang in beiden Ansichten nebeneinander.

## 9. Befunde beim Lesen des Moduls

Nicht Teil des Pilots, aber für die Entscheidungen in Abschnitt 10 wichtig:

1. **`VERTRAG_ERSTELLT` wird nie gesetzt.** Weder das Erzeugen eines Dokuments noch ein Knopf
   schreibt den Status; die Doku nennt ihn im Status-Flow. In der Praxis geht ein Vorgang von
   „Rückmeldung: Übernahme“ direkt auf „Vertrag unterschrieben“ oder „Abgeschlossen“.
2. **Stornieren gibt es nur in der Route.** `STORNIERT` ist aus jedem offenen Status erlaubt,
   die Seite bietet es nirgends an.
3. **Nach „keine Übernahme“ lässt sich der Vorgang in der Oberfläche nicht abschließen.** Die
   Route erlaubt `ENTSCHEIDUNG_KEINE_UEBERNAHME → ABGESCHLOSSEN`, die Seite hat dort keinen
   Knopf. Solche Vorgänge bleiben offen stehen, bis der Webhook oder jemand per Hand sie
   schließt – das habe ich nicht weiter verfolgt.
4. **„Anfrage erneut senden“ läuft ohne Rückfrage**, setzt aber Rückmeldung, Erinnerungszähler,
   Eskalation und Vorstand-Vermerk zurück und macht den alten Link ungültig.
5. **Abgelaufenes Vertragsende zeigt keine Ampel.** `monthsUntilContractEnd` liefert bei
   überschrittenem Datum 0 → „AUSSERHALB“. Eine Warnung gibt es dann nur im Übernahme-Strang
   (Entfristungsrisiko); ein Vorgang, der bei „Angelegt“ oder „Anfrage“ über das Vertragsende
   hinaus liegen bleibt, sieht auf der Detailseite unauffällig aus.
6. **Fremder Mandant: 403 statt 404** in den drei gelesenen Routen (`[id]`, `/supervisor-link`,
   `/nicht-uebernehmen`; im Modul bewusst so belassen, weicht von der Regel der neueren Pakete
   ab). Der Pilot ändert das nicht.
7. Die Route liefert `auditLogs` (20 Einträge) mit, die Seite zeigt sie nicht.

## 10. Fragen vor dem Bau

**Alle neun Fragen entschieden am 02.10.2026:** F1 Cookie, F2, F4, F6, F7, F8, F9 wie
empfohlen. F3 ja, mit Zusatz (siehe unten). F5: Rückmeldungen gehen an
`personalbuchhaltung@fes-minden.de` (steht als `mailto:` im Quelltext des öffentlichen
Repositorys – bestätigt).

**F3, Zusatz:** Abschließen im Ablehnungsstrang ja – und dabei wie heute das Offboarding
anbieten („Soll ein neuer Vorgang gestartet werden?“). Umsetzung, soweit ohne Änderung der
Fachlogik möglich: Die Rückfrage „Offboarding anlegen?“ sagt ausdrücklich, dass ein neuer
Offboarding-Vorgang gestartet wird (Name, letzter Arbeitstag); nach dem Anlegen und im
Abschluss-Dialog steht der Verweis „Zum Offboarding OFF-…“. „Keine Übernahme“ OHNE
Offboarding gibt es weiterhin nicht (bestätigt): Die Route legt es immer an, daran ändert der
Pilot nichts.

| # | Frage | Empfehlung |
|---|---|---|
| F1 | **Vorschau-Schalter speichern:** Cookie im Browser (kein Schema-Delta, gilt je Gerät) oder Spalte am Benutzerkonto (gilt überall, auswertbar, Schema-Delta hin und nach dem Pilot zurück)? | Cookie. Der Schalter lebt wenige Wochen; das Personalbüro arbeitet an festen Rechnern. |
| F2 | **„Vorgang stornieren …“** als kritischer Menüpunkt in die neue Ansicht aufnehmen (Befund 2)? Die Route kann es; es wäre aber eine Handlung, die es in der Oberfläche bisher nicht gibt. | Ja, nur für `HR_EDIT_ROLES`, mit Rückfrage. Ohne sie bleibt ein irrtümlich angelegter Vorgang für immer in der Liste. |
| F3 | **„Abschließen …“ auch nach „keine Übernahme“** anbieten (Befund 3)? | Ja – sonst hat der Schritt „Abschluss“ in diesem Strang keine Handlung, und die Leiste zeigte ein Ziel, das man nicht erreichen kann. |
| F4 | **Überschrittenes Vertragsende bei offenem Vorgang** als kritischen Hinweis zeigen (Befund 5)? Das ist eine neue Anzeige aus vorhandenen Daten, keine neue Regel für Läufe oder Mails. | Ja, als Zeile in „Jetzt dran“ („Vertragsende seit n Tagen überschritten“). Die Ampel-Funktion bleibt unverändert. |
| F5 | **Rückmeldungen im Pilot:** an welche Adresse (HR-Postfach, deine, keine)? | Deine Adresse als `mailto:` – kein neuer Versandweg. |
| F6 | **Klebende Leiste mit Kompaktmodus** schon im Pilot? Der Plan sieht sie vor; Vertragsende-Seiten sind kurz, der Nutzen zeigt sich erst im Onboarding (1.760 px). | Nein, erst mit Onboarding. Im Pilot wird bei 1366×768 nur gemessen. |
| F7 | **`VALID_TRANSITIONS` aus der Route exportieren** (in eine reine Datei `src/lib/contract-end-status.ts`), damit Adapter-Test und Route dieselbe Tabelle lesen? Das verschiebt eine Konstante, ändert kein Verhalten – ist aber ein Eingriff in eine Routen-Datei. | Ja. Sonst prüft der Test gegen eine Kopie, die auseinanderlaufen kann. |
| F8 | **Statustexte der Pille** (3.5) sagen, wer dran ist („Wartet auf Führungskraft“), statt den Fachstatus zu wiederholen („Anfrage beim Vorgesetzten“). Liste und alte Ansicht zeigen bis U3 weiter die alten Texte – dieselbe Sache heißt zwei Wochen lang zweierlei. In Ordnung? | Ja; in der Ankündigung erwähnen. Endgültig nach dem Prototyp-Tag. |
| F9 | **Reihenfolge mit V0:** Der Feinplan lässt sich jetzt freigeben; gebaut wird laut Leitplanke erst nach dem Prototyp-Tag. Sollen Tag 1 und 2 (reine Regeln und Bausteine auf der Musterseite – nichts davon sieht das Personalbüro) schon vorher laufen? | Ja für Tag 1–2, nein für die Seite. Die Texte aus 3.3 sind genau das, was der Prototyp-Tag prüfen soll; die Musterseite mit der Leiste taugt dort als Klick-Dummy. |

## 11. Fortschritt

| Tag | Stand | Commit |
|---|---|---|
| 1 Regeln: `ProzessStand`, Adapter, Kataloge, Statustabelle in eigener Datei | **erledigt 02.10.2026** | siehe Logbuch, Abschnitt 8 |
| 2 Bausteine Prozessleiste und Reiter, Musterseite, Kontrast | **erledigt 02.10.2026** | siehe Logbuch, Abschnitt 8 |
| 3, erster Teil: Bausteine Hinweis und Textfeld, Musterseite, Kontrast | **erledigt 06.10.2026** – vor V0 vorgezogen (Entscheidung 06.10.2026) | siehe Logbuch, Abschnitt 8 |
| 3 Rest bis 5: Seite (Kopf, Leiste, Hinweise, Reiter), Handlungen und Dialoge, `?tab=`, Vorschau-Schalter, Testdaten, Seitentest | **erledigt 06./07.10.2026** – vor V0 gebaut (Entscheidung 06.10.2026: der Prototyp-Tag läuft mit der echten Seite in Docker); Durchsicht in vier Blickwinkeln und Codereview, alle Befunde behoben | siehe Logbuch, Abschnitt 8 |
| 6–7, technischer Teil: Bilder je Lage in drei Breiten mit Höhenmessung (`ux-abnahme.js vertragsende`), Rollen, Tastatur, beide Stränge mit Protokollvergleich, Schalter (`ux-abnahme-pilot.js`, 154 Prüfungen) | **erledigt 07.10.2026** – vor V0; Ergebnisse im Logbuch | siehe Logbuch, Abschnitt 8 |
| 6–7, Rest: Bilder nach den Textänderungen des Prototyp-Tags erneuern, Vergleich alte Ansicht bildgleich (`vergleich`), Durchsicht, Ankündigungstext | offen – nach dem Prototyp-Tag | |

**Technische Abnahme vom 07.10.2026 – was sie ergab** (Einzelheiten im Logbuch):

- **Höhe bei 1366×768:** Die Reiterleiste beginnt bei 466–886 px (61–115 % der Höhe), das
  Ziel des Plans (ein Drittel, 256 px) erreicht keine Lage. Portal-Kopf 67, Schalterzeile 49,
  Seitenkopf 114, Prozessleiste mit „Jetzt dran“ 233 (mit umbrechender Schrittzeile 273),
  Reiterleiste 65 px; Hinweise je 94–114 px (T04 mit drei: 318 px). Zum Vergleich: In der
  alten Ansicht beginnen die Reiter bei rund 290 px. Entscheidung am Prototyp-Tag
  (Leitfaden, Frage 16) – im Pilot wird laut P-F6 nur gemessen.
- **Rollen:** Einrichtungsleitung und Führungskraft sehen die Seite (alt wie neu) gar nicht:
  Das Mandanten-Gate der Middleware (`src/lib/mandanten-gate.ts`) antwortet auf
  `GET /api/contract-end/[id]` mit 403, auch beim eigenen Mandanten. 3.8 („sehen in beiden
  Ansichten nur Lesendes“) stimmt deshalb heute nicht; die Ansicht selbst ist für sie richtig
  nur lesend (mit simulierter Antwort geprüft). Die Freigabe ist eine offene Entscheidung des
  Codereviews vom 01.09.2026 (Gate), nicht des Pilots.
- **Beide Stränge** über die neue Ansicht: Status und Protokolleinträge je Schritt genau wie
  von den Routen erwartet (SUPERVISOR_LINK_CREATED, SUPERVISOR_REMINDER_SENT,
  SUPERVISOR_DECISION_UEBERNAHME, STATUS_CHANGED, CONTRACT_END_NO_RENEWAL …).
- **Nebenbefunde (alter Bestand, nicht geändert):** Die Erinnerung von Hand wird ohne Konto
  protokolliert (`contract-end-reminder.ts`); Mails ohne aktiven Mailserver stehen als FAILED
  statt SKIPPED im Versandprotokoll; die alte Ansicht zählt die Tage bis zum Vertragsende einen
  Tag anders (Millisekunden gegen Kalendertage).

**Beim Bau von Tag 3 Rest bis 5 genauer gefasst** (gegenüber 3.4 bis 3.8; Einzelheiten im Logbuch):

- **Dateien wie 3.7**, dazu `aufrufe.ts` (die Aufrufe der alten Ansicht als Tabelle) und
  `src/lib/prozess/vertragsende-hinweise.ts` (die Hinweise aus 3.4 als reine Funktion).
- **Hinweise:** Die Vorstand-Warnung greift nur bei entschiedener Übernahme und laufendem
  Vorgang (das Formular speichert den Vermerk schon beim Zwischenspeichern; bei späterer
  Ablehnung bliebe ein `false` stehen). Die Kettenbefristung nur bei laufendem Vorgang.
- **„Anfrage neu senden“** sagt NICHT, dass begonnene Eingaben verloren gehen (so stand es in
  der alten Ansicht und in 3.4): `/supervisor-link` legt die Vertragsdaten per `upsert`
  unverändert an, das Formular füllt sie wieder vor. Zurückgesetzt werden Erinnerungen und der
  Vorstand-Vermerk; der alte Link wird ungültig – bei schon abgelaufenem Link heißt es
  „ist bereits abgelaufen“.
- **Gesperrt statt veraltet:** Nach jeder Handlung sind Knöpfe und Menü gesperrt, bis der neue
  Stand da ist; scheitert das Neuladen, bleiben sie gesperrt, und ein Hinweis bietet „Neu
  laden“ an.
- **Reiter:** Startwert aus der Adresse des Browsers (`useSearchParams`), nicht als Eigenschaft
  der Seite; Wechsel per `replaceState`.
- **Betriebsstätte:** `GET /api/contract-end/[id]` liefert additiv `betriebsstaetteName`
  (Abweichung von „alle Routen unverändert“, Abschnitt 4: nur ein zusätzliches Feld der
  Antwort, keine Logik).
- **Neuer Baustein `Textverweis`** (Verweis im Text, intern über `next/link`, extern `<a>`).
- **Testdaten:** `scripts/vertragsende-testdaten.js`, zehn Lagen (VE-…-T01 bis T10).

**Beim Bau von Tag 3 (Bausteine) genauer gefasst** (gegenüber 3.1):

- **Hinweis:** Ob er angesagt wird, entscheidet die Seite über `ansagen` (nur bei `critical`
  wirksam) – der Baustein rät nicht, ob er „neu“ ist. Ohne Titel zeichnet er nichts. Jeder
  Ton hat ein eigenes Standardsymbol; Text in `ink`, weil `ink-2` auf `critical-soft` über
  dem Seitengrund unter 4,5:1 fällt.
- **Textfeld:** nur `text`, `email`, `tel`, `url`; Reihenfolge der Beschreibung Hilfe →
  Fehler → eigene `aria-describedby`; Rand `ink-2` (3:1); `className` an die Hülle.
- Tests in eigener Datei `ui-hinweis-textfeld.test.tsx` statt in `ui-bausteine.test.tsx`.

**Beim Bau von Tag 1 genauer gefasst** (gegenüber 3.2 und 3.3):

- `JetztDran` trägt die Frist als eigenes Feld (`frist`, dazu `dringlichkeit`), getrennt von
  der `unterzeile` – im Zustand „wartet auf die Führungskraft“ braucht die Seite beides.
- Die Menüpunkte liefert eine eigene Funktion `vertragsendeMenue()`; keine Handlung steht
  zugleich in „Jetzt dran“ und im Menü (Test).
- **Tage in Berliner Kalendertagen:** Am Tag des Vertragsendes steht „heute“, überschritten
  ist es erst am Tag danach. Ob die Entfristungswarnung greift, entscheidet unverändert
  `getSignatureWarning`; nur die angezeigte Zahl wird neu gezählt (die alte Seite zeigt am
  letzten Tag schon „überschritten“).
- **„Erinnern“ nur mit zugestellter, gültiger Anfrage** – gefunden von der Gegenprobe gegen
  die Routen: Steht der Vorgang auf „Anfrage beim Vorgesetzten“, ohne dass je eine Anfrage
  verschickt wurde (Status von Hand gesetzt), ist „Anfrage senden“ dran. Ist der Link
  abgelaufen, ist „Anfrage neu senden“ dran (die Route `/reminder` lehnt in beiden Fällen ab).
- Nach dem Vollzug (Vertrag unterschrieben bzw. Offboarding angelegt) zeigt „Jetzt dran“
  keine Frist mehr.
- ~~Die Listen der drei eigenen Routen sind im Test gespiegelt, nicht exportiert.~~ Überholt
  durch die Durchsicht, siehe unten.

**Nach der Durchsicht von Tag 1 geändert** (02.10.2026, acht Befunde, alle behoben; Einzelheiten
im Logbuch):

- **Wer dran ist, kommt aus einer Lage, nicht aus dem Status.** Steht der Vorgang auf „Anfrage
  beim Vorgesetzten“, kann die Führungskraft aber gar nicht antworten (nie eine Anfrage
  verschickt, oder ihr Link ist abgelaufen), ist HR dran: Der Schritt „Anfrage“ ist wieder
  aktiv (bei abgelaufenem Link mit der Notiz „Link abgelaufen“), und die Pille heißt „Anfrage
  offen“ bzw. **„Link abgelaufen“** statt „Wartet auf Führungskraft“. Das ergänzt den Katalog
  aus 3.5 um einen Eintrag und die Tabelle aus 3.3 um eine Zeile. Der Erinnerungslauf
  überspringt solche Vorgänge – ohne diese Anzeige blieben sie unbemerkt liegen.
- **Der Tag des Vertragsendes ist kritisch.** Die Ampel meldet an diesem Tag schon
  „außerhalb“; „Jetzt dran“ zeigt „heute“ jetzt mit kritischer Hervorhebung, wie den Tag davor
  und danach.
- **Kein zweites Offboarding.** Hängt schon eines am Vorgang, bietet die Seite „Offboarding
  anlegen“ nicht an (die Route lehnte ab), sondern führt dorthin.
- **Nur der Schritt „Vertrag“ springt in den Reiter Dokumente.** Der Schritt „Offboarding“
  ist kein Knopf; zum Offboarding führt die Handlung in „Jetzt dran“.
- **Statuslisten aller vier HR-Routen in `src/lib/contract-end-status.ts`** (Erweiterung von
  P-F7, freigegeben am 02.10.2026): Die Routen `/nicht-uebernehmen`, `/supervisor-link` und
  `/reminder` lesen ihre Liste von dort, Inhalt unverändert; die Gegenprobe prüft gegen
  dieselben Listen und in jeder Kombination von Status, Stand der Anfrage und Offboarding.
  Für die Route `/supervisor-link` des Vertragsendes gab es bisher keinen Test – er ist neu.
  Dasselbe Statuspaar „Anfrage offen“ steht weiter im Formular der Führungskraft und im
  Erinnerungslauf; beide lesen die gemeinsame Liste noch nicht (nicht angefasst).

**Tag 2 – wie gebaut** (Einzelheiten und Befunde der Durchsicht im Logbuch):

- **Prozessleiste** wie in 3.1, mit diesen Festlegungen: Die Linie ist grün, soweit der Ablauf
  sie hinter sich hat – auch über übersprungene Schritte hinweg. Die Kurzform unter 640 px
  steht nur bei laufendem Ablauf (am Ende sagt es der Kasten). Ein kommender Schritt in einem
  beendeten Ablauf heißt für Screenreader „nicht erreicht“. Dringlichkeit steht als Pille mit
  Wort („Kritisch“, „Frist naht“) neben der Frist.
- **Reiter** als `Reiter` + `ReiterInhalt` (Inhalte stehen in der Seite, nicht in der
  Eintragsliste). Der gewählte Reiter wird am Handy in den sichtbaren Teil der Leiste geholt.
- **Musterseite:** acht Lagen der Prozessleiste aus dem echten Adapter mit festem Datum –
  das ist der Klick-Dummy für den Prototyp-Tag (P-F9). Je Lage steht darunter, was im
  „…“-Menü des Seitenkopfs läge.
- **Offen für den Prototyp-Tag** (nicht entschieden, bewusst nicht gebaut):
  1. Unter 640 px (und bei starker Vergrößerung am Laptop) sehen Sehende von den Schritten
     nur Punkte und „Schritt 4 von 5 · Vertrag“; Zuständigkeit, Notiz („MAV offen“), Datum
     und der andere Weg sind dann nur für Screenreader da. So steht es in 3.1 und im Mockup
     des Plans; die Angaben stehen auf der Detailseite zusätzlich im Reiter Übersicht.
     Alternative: die Unterzeile des aktiven Schritts in die Kurzform nehmen.
  2. Ein klickbarer Schritt („Vertrag“ → Reiter Dokumente) zeigt das nur beim Überfahren und
     am Fokusring – auf dem Handy gibt es kein sichtbares Zeichen dafür.
  3. Nach dem Abschluss steht an der Rückmeldung weiter „sonst: Offboarding“ (der nicht
     gewählte Weg). Frage an den Adapter, ob das nach dem Ende noch gezeigt werden soll.
