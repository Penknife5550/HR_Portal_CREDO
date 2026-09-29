# Paket 4 „Unterlagen nachfordern“ — Übergabe nach Stufe 1

> **Stand:** 26.09.2026, zuletzt ergänzt am 29.09.2026 als Übergabe für die nächste Sitzung.
> Stufe 1 (Onboarding) ist umgesetzt, per Fast-Forward nach `main` gemergt und nach `origin/main`
> gepusht (bis `9cab6b4`). Seitdem **nur lokal**: Code-Review mit Fix (`4875fba`), Ablaufplan
> nachgezogen (`33e420f`, `82b118f`, `8d1c558`), Datenschutzhinweise des DSB (`d774e4c`), diese
> Übergabe (`92e67a2`), V-7 (Prüfskript im Ablaufplan 1.7, `6ab7f40`; am 29.09. auf dem Server
> erledigt) und dessen Ergebnis, dazu die n8n-Import-Dateien für V-2 und V-3 (Ablaufplan 6.5; die
> Dateien selbst liegen nur lokal in `n8n/`), am 29.09. in n8n importiert. Gepusht wird erst auf
> ausdrückliche Freigabe. **Nicht deployt.** Die Produktion läuft
> weiter auf Code `7bc91ec` (Deploy vom 24.09.2026).
> **Zweck:** In einer neuen Sitzung ohne Vorwissen weitermachen können: was fertig ist, was
> geprüft wurde, was vor dem Deploy noch fehlt und wie Stufe 2 anschließt.

Die maßgeblichen Dokumente:

| Dokument | Inhalt |
|---|---|
| `docs/module/onboarding/paket4-feinplanung.md` | Spezifikation. Abschnitt 16.1: die Entscheidungen E-1 bis E-8 (alle wie empfohlen). Abschnitt 18: Ergänzungen Z1–Z3, Regeln N1–N4 und **alle Abweichungen bei der Umsetzung** |
| `CLAUDE.md`, Abschnitt „Unterlagen nachfordern (Paket 4)“ | Die zwölf Regeln, die bei jeder Änderung gelten, dazu die Checkliste für Stufe 2 |
| `docs/historie/deploy-paket4-stufe1.md` | Ablaufplan für den Deploy: Voraussetzungen, lesende Prüfabfragen, Handschritte, Rückfall |
| `docs/handbuch/handbuch.html`, Kapitel „Unterlagen nachfordern“ | Bedienung für HR |
| `docs/module/onboarding/aenderungsplan-2026-09.html` | Gesamtplan (Fassung 7), Mockups in Abschnitt 4 |

---

## 0 · Nächste Sitzung: so geht es weiter

**Einstieg:** diese Datei, dann im Ablaufplan `docs/historie/deploy-paket4-stufe1.md` Abschnitt 0
(„Voraussetzungen“) und die dort genannten Abschnitte. Die Regeln für Codeänderungen stehen in
CLAUDE.md, Abschnitt „Unterlagen nachfordern (Paket 4)“.

**Stand am 29.09.2026:**

- `main` steht **10 Commits vor `origin/main`** (`4875fba`, `33e420f`, `82b118f`, `8d1c558`,
  `d774e4c`, die Übergabe `92e67a2`, V-7 vorbereitet `6ab7f40`, das Ergebnis von V-7 `915dbbb`,
  die n8n-Import-Dateien `5d7371c` und ihr Import) — alles nur lokal. **Push nur auf ausdrückliche Freigabe**, das
  Repo ist öffentlich.
- Gates zuletzt grün: `lint` 0 Fehler, `tsc` 0 Fehler, 168 Suiten / 4344 Tests, Build ok.
- Arbeitsweise, die der Nutzer vorgegeben hat: nur lokal committen, nicht pushen, nicht
  deployen, vor dem Deploy anhalten. Die offenen Punkte der Reihe nach abarbeiten und alles
  dokumentieren.
- Erledigt sind V-1, V-4, V-7 und die Vorprüfung von V-5. V-9 ist eine vertagte Entscheidung.
- **V-7 erledigt (29.09.):** `N8N_API_KEY` ist auf dem Server leer, die Rolle `SERVICE` gibt es
  also nicht. `CRON_SECRET` hat 32 Zeichen, `APP_URL` stimmt, `NEXT_PUBLIC_APP_URL` ist nicht
  gesetzt (Ablaufplan 1.7, Ergebnis). Nebenbei zeigte sich, dass das Journal nur bis zum 26.09.
  zurückreicht; das ändert die Grundlage der vertagten V-9-Entscheidung (1.9, Nachträge).
- **Punkte 2 und 3 (V-2, V-3): vier n8n-Workflows importiert (29.09.)** — Dateien in `n8n/`
  (lokal, nicht im Repo), Quelle und Tests in `n8n/quelle/`, Anleitung im Ablaufplan 6.5. Der
  Nutzer hat das Credential „HR-Portal Cron (Bearer)“ angelegt und alle vier importiert; beide
  Credentials sind verknüpft, alle vier inaktiv. **V-3 ist damit erledigt.** Für V-2 fehlt nur
  noch die Umstellung: HR informieren, die alten Workflows deaktivieren, 1 und 2 an einem Werktag
  vor 08:00 aktivieren, den ersten Bericht an Claude, danach die alten löschen.

**Arbeitsliste** (Reihenfolge nach Abhängigkeit; Stand je Punkt in Abschnitt 4):

| # | Punkt | Wer macht was | Claude kann vorbereiten |
|---|---|---|---|
| 1 | **V-7, dazu `CRON_SECRET`, `APP_URL` und `NEXT_PUBLIC_APP_URL` lesend prüfen** (Ablaufplan 1.7) | **Erledigt am 29.09.** — Prüfskript aus 1.7 auf dem Server gelaufen | `N8N_API_KEY` leer, Umgebung in Ordnung, keine Webhooks, keine Anfrage mit `X-API-Key` (Ergebnis in 1.7) |
| 2 | **V-2: bestehende n8n-Läufe reparieren** (6.1): `reminders` und `offboarding-reminders` auf `https://hr.fes-credo.de/…` | Nutzer/IT in der n8n-Oberfläche. **Achtung:** Der erste Lauf nach der Korrektur verschickt alle fälligen Erinnerungen auf einmal — HR vorher informieren, an einem Werktag morgens | **Importiert 29.09.** (Ablaufplan 6.5). Offen: Umstellung (alte deaktivieren, 1 und 2 aktivieren), dann Auswertung des ersten Berichts |
| 3 | **V-3: neue n8n-Läufe anlegen, zunächst inaktiv** (6.2, 6.3 Nr. 1): `unterlagen-fristen` (07:00 Europe/Berlin, `?dryRun=1`, Timeout 300 000 ms, Retry aus, Bericht bei `errors > 0` oder `nichtZugestellt > 0`) und `dokument-ablauf` (07:30) | Nutzer/IT in n8n; das Credential (`Authorization: Bearer <CRON_SECRET>`) legt der Nutzer selbst an | **Erledigt 29.09.:** Import-Dateien 3 und 4 importiert, inaktiv (Ablaufplan 6.5). Aktivieren: 3 nach 4.3, 4 nach 5.1 |
| 4 | **V-6: Antwortadresse** (= HR-Postfach) unter Einstellungen → SMTP | Nutzer im Portal | — |
| 5 | **V-8: Freigabeliste** (empfohlen) unter Einstellungen → SMTP → Erlaubte Empfänger-Domains | Nutzer im Portal | Vorschlag für die Domains |
| 6 | **V-9: Caddy-Entscheidung** (vertagt): `debug` aus, `?Referrer-Policy`, Aufbewahrung des Journals mit dem DSB | Nutzer/IT, DSB | Fragen, Empfehlung und der lokal geprobte Ablauf stehen in 1.9. Neu seit 29.09. (1.9, Nachträge): Das Journal reicht nur etwa dreieinhalb Tage zurück; nach dem Abschalten von `debug` blieben die letzten Einträge mit Tokens womöglich Monate liegen — Löschen mitentscheiden |
| 7 | **DSB-Themen** (blockieren den Deploy nicht): Verarbeitungsverzeichnis, Führungszeugnis bei Kitas (in Stufe 1 gesperrt), Aufbewahrung (E-7), Art. 10 in den Datenschutzhinweisen, Aufbewahrung des Journals | Nutzer mit dem DSB | Textentwürfe auf Wunsch |
| 8 | **Deploy** nach Ablaufplan, sobald 1–6 erledigt sind: Push (Freigabe), Vorab-Prüfungen 1.1, 1.2, 1.5, 1.6, SQL VORHER (2), Deploy (3), NACHHER (4), Handschritte (5), n8n scharf (6.3), HR informieren | Nutzer auf dem Server, Claude wertet jede Ausgabe aus | Ablauf steht. Die Zählung in 3.3 ist gegen `4875fba` nachgerechnet; neu rechnen nur, wenn sich das Schema ändert |

Server-Befehle für den Nutzer so schreiben, wie es Abschnitt 8 beschreibt (höchstens ein `*` je
Zeile, lokal gegen die Werkzeuge proben, Diagnosezeile).

---

## 1 · Was umgesetzt ist

HR fordert im Onboarding fehlende oder verlängerte Nachweise über einen persönlichen Link an:

1. Die Person lädt je Unterlage Dateien hoch und übermittelt sie.
2. HR nimmt jede Unterlage einzeln an, weist sie zurück oder markiert sie als „Entfällt“.
3. Eine angenommene Unterlage wird zum `Document` des Vorgangs.

| Bereich | Umfang |
|---|---|
| Oberfläche HR | Gelbe Karte im Reiter „Dokumente“, Dialog „Unterlagen nachfordern“ bzw. „ergänzen“, Prüf-Dialoge (Annehmen mit Datum / „Unbefristet“ / später nachtragen, Zurückweisen, Entfällt, Annahme zurücknehmen, Frist ändern, Link erneut senden, Zurückziehen), Kasten „Offene Nachweise“ mit Stand und Knöpfen, Warnbalken mit „Verlängerten Nachweis anfordern…“, Pille am Reiter, Kurzstand in der Status-Übersicht, `?tab=dokumente` |
| Öffentliche Seite | `/unterlagen/[token]`: Upload je Unterlage (PDF/JPG/PNG/WebP, Typ aus den Bytes, ≤ 9,5 MB), Entwürfe entfernen, „Gültig bis“, Teil-Übermitteln, Zurückgewiesenes mit Begründung |
| Mails | 5 Events in der Gruppe „Unterlagen“: 3 an die Person (direkt per SMTP, nie an Webhooks, sensible Unterlagen neutral), 2 an HR (anfordernde Person, HR-Postfach in Kopie) |
| Täglicher Lauf | `POST /api/cron/unterlagen-fristen[?dryRun=1]`: Erinnerung 7 Tage vorher und am Fristtag, „Frist verstrichen“ an HR, Nachholen gescheiterter Mails, Aufräumen nach 30 Tagen, Rückzug bei `EXPIRED` (Z2) |
| Bestand geändert | Download-Route `GET /api/onboarding/[id]/documents/[docId]` gehärtet (**`SERVICE` bekommt 403**), Frist-Korrektur kennt `unbefristet` (Z1), Lauf `dokument-ablauf` überspringt unbefristete Nachweise, Ablauf-Mails verweisen auf die Nachforderung (Z3), Fragebogen-Hinweis zum Nachreichen, Middleware-Ausnahme für `/api/unterlagen/` |
| Schema (additiv) | `unterlagen_nachforderungen`, `unterlagen_positionen`, `unterlagen_dateien`, `unterlagen_links`; `documents.bezeichnung`, `documents.unbefristet`; `hrMeldungStatus`/`hrMeldungDetail`; `unterlagen_links.fruehereSperren` |

### Commits (auf `main`, ab `ce1888e`)

| Commit | Inhalt |
|---|---|
| `6e358dc` | Feinplanung freigegeben (E-1…E-8), Abschnitt 18 mit Z1–Z3, N1–N4 |
| `efcd820` | Vorarbeiten (Kalendertag, Dateiwerkzeuge, Pflichtliste an einer Stelle, `robots.txt`) |
| `49ed237` | Datenmodell und reine Regeln |
| `d050a48` | Events, Vorlagen, Mail-Bausteine, Z3 |
| `a43d4c1` | Anfordern, Ergänzen, Frist, erneut senden, Zurückziehen (DB-Probe der Sperren im Commit-Text) |
| `4236544` | Prüfen, Übernahme, Härtung der Download-Route |
| `c6ee89c` | Öffentliche API, Middleware-Ausnahme |
| `0600adf` | Täglicher Lauf, CSP der Datei-Route |
| `ce68d64` | Upload-Seite |
| `da8f8ed` | HR-Karte und Prüf-Dialoge |
| `0dcceb9` | Dialog und Einbau in die Vorgangsansicht |
| `b6532e2` | Restpunkte aus Browserprobe und Prüfberichten |
| `2ef8199` | Doku: CLAUDE.md, Feinplanung, Deploy-Ablaufplan, Handbuch, Änderungsplan Fassung 7 |
| `3f42546` | Abschlussdurchsicht: 30 bestätigte Befunde behoben |
| `9cab6b4` | Übergabe und Statusangaben nach dem Merge |
| `4875fba` | Code-Review: verwaister Anspruch der HR-Meldung „vollständig“ wird nachgeholt, abgelehntes „unbefristetes“ Dokument erledigt die Art nicht mehr, zwei Wiederverwendungen (nur lokal) |
| `33e420f` | Ablaufplan: Prüfbefehle V-1, V-5, V-9 lokal geprobt (nur lokal) |
| `82b118f` | Ablaufplan: Befund V-9, Caddy im Debug-Modus (nur lokal) |
| `8d1c558` | V-9 als vertagte Entscheidung, Übergabe auf dem Stand vom 29.09. (nur lokal) |
| `d774e4c` | Datenschutzhinweise der Upload-Seite mit dem Wortlaut des DSB, V-4 erledigt (nur lokal) |
| `92e67a2` | Übergabe für die nächste Sitzung: Arbeitsliste, Stand V-1 bis V-9, Befunde und Lehren (nur lokal) |
| `6ab7f40` | V-7 vorbereitet: Prüfskript im Ablaufplan 1.7 mit Selbstprüfung, lokal geprobt; V6 der VORHER-Datei ohne Zugangsdaten aus Webhook-URLs (nur lokal) |
| `915dbbb` | V-7 erledigt: Serverergebnis in 1.7; in 1.9 die Zählung korrigiert (Journal erst ab 26.09.) und der Nachtrag zur Aufbewahrung; Anhang B nachgezogen (nur lokal) |
| `5d7371c` | V-2/V-3 vorbereitet: Ablaufplan 6.5 beschreibt die vier n8n-Import-Dateien (sie selbst liegen nur lokal in `n8n/`), 6.2 Bericht, Abschnitte 0 und 8 (nur lokal) |
| (dieser) | Import in n8n geklappt: V-3 erledigt, V-2 bis auf die Umstellung (nur lokal) |

---

## 2 · Wie geprüft wurde

- **Je Schritt:** Ein Agent setzte um. Zwei bis vier Prüfer sahen die Änderung aus verschiedenen Blickwinkeln durch (Spezifikation, Korrektheit, Sicherheit, Passung, Bedienung). Ein Nachbesserer prüfte jeden Befund nach und behob ihn. Danach liefen die Gates: `tsc`, `lint`, die volle Jest-Suite und `next build` in einer isolierten Kopie.
- **Abschlussdurchsicht (`3f42546`):** fünf Blickwinkel, nämlich Randfälle, CREDO-Standards, Sicherheit/Datenschutz, Konsistenz und Einfachheit. Jeder Blickwinkel bekam einen Skeptiker zur Gegenprüfung. Gemeldet wurden 38 Befunde, bestätigt 30, alle KLEIN; zu Sicherheit und Datenschutz wurde keiner bestätigt. Alle 30 sind behoben.
- **Letzte Gates:** `tsc` 0 Fehler, `lint` 0 Fehler (5 alte Warnungen in fremden Dateien), **168 Suiten / 4338 Tests grün**, Build ok. Nach dem Code-Review-Fix `4875fba` (26.09.): **168 Suiten / 4343 Tests grün**, Build ok.
- **DB-Probe gegen die Dev-DB (Schritt 4):** NULL-Unique für `laufendSchluessel`, „erst sperren, dann zählen“ mit zwei Verbindungen, bedingtes `updateMany` bei gleichzeitigem Annehmen. Alle drei sind belegt.
- **Browserprobe am 25.09. gegen das Dev-Portal:** Der ganze Ablauf wurde durchgespielt: Anfordern → Mail → Upload (Tarn-PDF abgewiesen) → Übermitteln → HR-Mail „eingegangen“ (After-Response) → Zurückweisen (Mail ohne Name und Begründung der vertraulichen Unterlage) → erneut einreichen → Annehmen mit Artwahl (Document mit Bezeichnung, APPROVED, Hardlink, Quelle gelöscht) → erledigt (Kasten räumt ab) → Annahme zurücknehmen (läuft wieder). Die Köpfe der Datei-Route waren korrekt: `sandbox` für Bilder, Portal-CSP für PDFs, `no-store`, CORP. Die Mails liefen dabei in eine lokale SMTP-Senke, danach wurde SMTP zurückgesetzt.
- **Nicht geprüft:**
  - das Inline-PDF in allen vier Browsern,
  - ein echtes Handy mit HEIC-Fotos,
  - `Content-Length` über Caddy/HTTP2,
  - `after()` im Standalone-Build.

  Alle vier stehen als Probe im Deploy-Ablaufplan. Der tägliche Lauf wurde nur in Tests geprüft, nicht über HTTP, weil in der Dev-Umgebung kein `CRON_SECRET` gesetzt ist.

---

## 3 · Code-Review vor dem Deploy: erledigt

Am 26.09.2026 `/code-review high` über `ce1888e..main` (öffentliche Routen, Übernahme und
Rücknahme, täglicher Lauf, Download-Route, Middleware). Sechs Befunde:

- **Behoben in `4875fba`:**
  - Die HR-Meldung „vollständig“ ging verloren, wenn der Prozess zwischen Anspruch und Versand
    starb (`after()` während eines Neustarts). Der Anspruch trägt jetzt `hrMeldungStatus =
    AUSSTEHEND`; nach einer Stunde ohne Ergebnis holt der Lauf die Mail nach
    (`vollstaendigAnspruchVerwaist`).
  - Ein abgelehntes Dokument mit „unbefristet“ erledigte die Art in der Vorgangsansicht, während
    der Lauf `dokument-ablauf` weiter mahnte. `nachweisLagen` übergeht jetzt `REJECTED`.
  - Zwei Wiederverwendungen (`nutzerName`, `alsDatum`).
- **Bewusst offen:** ein gemeinsamer Helfer für die Prüfung des `CRON_SECRET` (13 Kopien in den
  Cron-Routen) und das zweite Register `OEFFENTLICHE_MODULE` (Folgeumbau vor Stufe 2, Abschnitt 5).
- Gates danach grün (siehe Abschnitt 2), Schema-Delta unverändert (nur ein Kommentar).

---

## 4 · Voraussetzungen V-1 bis V-9 (Stand 29.09.2026)

Die Nummern sind die des Ablaufplans (Abschnitt 0 dort). Code-Review: erledigt (Abschnitt 3).

| V | Punkt | Stand | Nächster Schritt | Wer |
|---|---|---|---|---|
| V-1 | `./backups:/backups` eingehängt, Verzeichnis gehört 1001 | **erledigt 28.09.** — in beiden Diensten eingehängt, `775 1001 n8n`, Schreibtests in `app` und `db` `OK` | — | — |
| V-2 | Bestehende n8n-Läufe rufen `hr.fes-credo.de` auf | **importiert 29.09.** — Import-Dateien 1 und 2 (Ablaufplan 6.5), Credentials verknüpft, inaktiv | HR informieren, alte Workflows deaktivieren, 1 und 2 aktivieren; der erste Lauf verschickt echte Mails | Nutzer, Claude wertet den ersten Bericht aus |
| V-3 | n8n `unterlagen-fristen` und `dokument-ablauf` angelegt (inaktiv) | **erledigt 29.09.** — Import-Dateien 3 und 4 importiert, inaktiv | 3 nach 4.3, 4 nach 5.1 aktivieren | Nutzer, Claude |
| V-4 | Datenschutztext der Upload-Seite | **erledigt 29.09.** (`d774e4c`) — Wortlaut des DSB, aufklappbar in der Fußzeile; Verantwortlicher aus der Mandanten-Einstellung (Standard Christlicher Schulverein Minden e.V.) | — | — |
| V-5 | Sicherung des Volumes `uploads_data` | **Vorprüfung erledigt 28.09.** — `hr_portal_credo_uploads_data`, 94 MB, 315 Dateien, Leseprobe `tar OK`, 362 GB frei unter `/vol/container` | Die Sicherung selbst entsteht in 3.4. Das dauerhafte Backup bleibt offen (Abschnitt 8 des Ablaufplans) | IT |
| V-6 | Antwortadresse (= HR-Postfach) | offen | Einstellungen → SMTP | Nutzer |
| V-7 | `N8N_API_KEY` geprüft | **erledigt 29.09.** — Prüfskript in 1.7 (die drei Einzelbefehle von vorher hätten `NEXT_PUBLIC_APP_URL` und den öffentlichen Platzhalter übersehen). Ergebnis: `N8N_API_KEY` leer, also keine Rolle `SERVICE`; `CRON_SECRET` 32 Zeichen ohne Leerraum; `APP_URL` = `https://hr.fes-credo.de`, `NEXT_PUBLIC_APP_URL` nicht gesetzt, `NODE_ENV` production; keine Webhooks; im Journal seit 26.09. keine Anfrage mit `X-API-Key` | — | — |
| V-8 | Freigabeliste | offen (empfohlen) | Einstellungen → SMTP → Erlaubte Empfänger-Domains | Nutzer |
| V-9 | Caddy-Zugriffsprotokoll | **Entscheidung vertagt 29.09.** — Caddy läuft mit `debug` und schreibt jede Anfrage samt URI, Token und IP-Adresse ins Journal (seit 26.09.: 2204 Zeilen für `hr.fes-credo.de` — weiter reicht das Journal nicht zurück, weil der Debug-Modus es an die Grenze von 4 GB drückt; 3,9 GB, Standard-Aufbewahrung); der `header`-Block überschreibt das `no-referrer` der Upload-Seite | Fragen, Empfehlung und lokal geprobter Ablauf in 1.9; Pflicht vor dem ersten „Anfordern“ | Nutzer/IT, DSB |

- **Mit dem DSB noch klären** (blockiert den Deploy nicht): Verarbeitungsverzeichnis,
  Führungszeugnis bei Kitas (in Stufe 1 gesperrt), Aufbewahrung (E-7), ob Art. 10
  (Führungszeugnis) in die Datenschutzhinweise gehört, Aufbewahrung des Journals (V-9).
- **Nach dem Deploy:** bei `dokument-ablauf-warnung` und `dokument-abgelaufen` die Fassung
  vergleichen und „Text auf Standard zurücksetzen“ (Z3, Ablaufplan 5.1), danach die Probe mit
  einem Testvorgang (5.4).

Details, SQL-Abfragen und die Probe nach dem Deploy stehen in `docs/historie/deploy-paket4-stufe1.md`.
**Rückfall-Falle:** Ein älteres Image löscht per `db push --accept-data-loss` die neuen Tabellen. Fehler deshalb vorwärts beheben.

---

## 5 · Stufe 2 (offen)

Umfang laut Plan: die übrigen fünf Vorgangsarten (Offboarding, Verbeamtung, Vertragsverlängerung, Elternzeit, Mutterschutz) und die Listenspalte „Unterlagen“ (E-6), dazu die Pseudonymisierung nach 12 Monaten (E-7).

- **Vorher beheben** (Plan P:1475-1479, Feinplanung Abschnitt 1):
  - Elternzeit: Der endgültige Antrag löscht jede Geburtsurkunde, auch von HR hochgeladene (`src/app/api/elternzeit-antrag-endg/[token]/upload/route.ts`, Transaktion ca. Z. 77-83).
  - Verbeamtung: Hochgeladene Dokumente landen unter „Weitere Dokumente“, weil der Reiter `d.type` statt `documentType` liest.
- **Je Modul ein Baustein:** Die Checkliste der Registrierstellen steht in CLAUDE.md, Abschnitt „Unterlagen nachfordern“, letzter Punkt: FK, `BEZUG_AUSWAHL`, `KOPF_AUSWAHL`, `UNTERLAGEN_MODULE`, `VORGANGSARTEN`, `BAUSTEINE`, `OEFFENTLICHE_MODULE`, Einstieg der Übersicht, dünne HR-Routen, Karte.
- **Folgeumbau zuerst:** Den Baustein um `oeffentlichLaden(tx, id)` erweitern. Dann entfallen das zweite Register `OEFFENTLICHE_MODULE` und die doppelte Regel „EXPIRED = eingestellt“.
- **Modulbesonderheiten** (Plan-Tabelle „Was in welchem Vorgang passiert“, P:1441-1458):
  - Offboarding: private Adresse, nicht bei Austrittsart „Tod“.
  - Verbeamtung: Checklistenpunkt abhaken, Schriftform.
  - Vertragsverlängerung: erst nach Zusage, Ablage in der Karte (`neuerPfad: null`).
  - Elternzeit: Geburtsurkunde gilt als vorliegend, Frist erledigt.
  - Mutterschutz: `mitDetails = false`, keine Vorgangsnummer und keine Unterlagennamen in Mails.
- Karte 6 der Erkundung (Module, Listen, Pfadformate relativ/absolut, Mandantenprüfungen) liegt nicht im Repo. Für Stufe 2 die Module neu erkunden.
- **Listenspalte:** kollidiert mit Paket 6 (dieselben Listen-APIs und Konfigurationen). Plan-Empfehlung: Paket 6 vorher oder beides abstimmen. Im UX/UI-Plan „Klarer Weg“ (`docs/module/ux-ui/`, parallele Sitzung, nicht beauftragt) steht U5 zusammen mit Paket 4.

---

## 6 · Kleinere offene Punkte

- Das Artefakt des Änderungsplans (claude.ai) steht noch auf Fassung 6. Die Repo-Datei ist Fassung 7. Auf Wunsch neu veröffentlichen.
- Im Änderungsplan Abschnitt 9 stehen die Summe der offenen Tage und die Reihenfolge-Empfehlung noch auf dem Stand vor Paket 4.
- Große Komponenten (`upload-seite.tsx`, `nachforderung-karte.tsx`, `nachforderung-dialog.tsx`, `pruef-dialoge.tsx`, je rund 900–1200 Zeilen) sind nicht aufgeteilt. Das ist ein Kandidat für `/simpler` bei Stufe 2.
- Bekanntes Restrisiko: Scheitert nach einem SENT das Speichern **und** fehlt der Eintrag im Versandprotokoll, holt der Lauf die Mail nach. Eine doppelte Mail ist dann möglich.
- Entfernen von EXIF-Daten, Virenscan und Verschlüsselung der Dateien sind bewusst nicht in Stufe 1 (Feinplanung 16.2).
- Die Middleware leitet nicht angemeldete Nutzer auf `/login` um und verwirft dabei die Query. „Im Portal prüfen“ landet ohne Sitzung also nach dem Login nicht im Reiter „Dokumente“. Das gilt für alle Portal-Links und ist schon so.
- **Reichweite der Rolle `SERVICE`** (gefunden bei V-7 am 29.09., unabhängig von Paket 4): Mit dem
  Wert von `N8N_API_KEY` in der Kopfzeile `X-API-Key` lädt `SERVICE` Dokumente der Verbeamtung
  (`GET /api/civil-service/[id]/documents/[docId]` prüft nur, ob eine Sitzung besteht). Außerdem
  liest, ändert und löscht es den Mitarbeiterstamm und liest Auswertungen aller Mandanten. **Auf
  dem Server ist `N8N_API_KEY` leer (29.09.)**, die Rolle ist also nicht erreichbar. Wichtig wird
  das erst, wenn jemand den Schlüssel setzt; dann vorher die Download-Routen der übrigen Module
  auf Portal-Rollen beschränken wie die Onboarding-Route (Kandidat für Stufe 2). Eine Fußangel
  bleibt: `.env.example` trägt den bekannten Platzhalter `optionaler_api_key_fuer_n8n` — besser
  ein leerer Wert wie in `.env.production.example`.

---

## 7 · Dev-Umgebung nach der Sitzung

- Die Dev-DB (Port 5433) hat das neue Schema (per `db push`). **Testdaten aus der Browserprobe:**
  - Vorgang **2026-BK-002 (Maria Voth)** ist abgesendet. `submittedAt` und Status `SUBMITTED` wurden per SQL gesetzt, weil der Testfragebogen ohne RV-Nummer nicht absendbar war.
  - Der Vorgang trägt eine laufende Nachforderung (Masernschutz „zu prüfen“, unterschriebener Arbeitsvertrag angenommen) und übernommene Dokumente.
- Testkonto `claude-test-admin@beispiel.invalid`: Das Passwort wurde neu gesetzt. Bei Bedarf wieder mit `node scripts/dev-passwort-neu.js <mail>` setzen.
- `smtp_config` der Dev-DB ist auf den Stand vor der Probe zurückgesetzt (inaktiv, ohne Host). Für eine Browserprobe mit Mails hat sich bewährt:
  - eine kleine lokale SMTP-Senke (Node, `net`-Server auf 127.0.0.1, schreibt `.eml` in eine Datei),
  - SMTP per `PUT /api/settings/smtp` darauf zeigen lassen und danach per SQL zurücksetzen.
- Kein `CRON_SECRET` in `.env`/`.env.local`: Der Lauf antwortet lokal 500 („Konfigurationsfehler“).
- **Build nie im Repo**, solange ein Dev-Server läuft (OneDrive sperrt `.next`). Stattdessen in einer Kopie ohne `__tests__`, mit verlinktem `node_modules`.
- Bilder aus dem Browser-Bereich scheiterten in dieser Sitzung (Zeitüberschreitung). Seitentext und `javascript_tool` reichten zum Prüfen.
- **29.09.2026:** Für die Browserprobe der Datenschutzhinweise wurde in `unterlagen_links` ein
  Testlink zur laufenden Nachforderung von 2026-BK-002 angelegt und danach wieder gelöscht. Die
  Dev-DB ist sonst unverändert. Muster für einen neuen Testlink: Token per `uuid4`, Hash
  `encode(sha256(convert_to('<token>','UTF8')),'hex')`, `gueltigBis` = Frist + 14.
- Der Build lief am 26. und 29.09. im Repo, jeweils ohne laufenden Dev-Server, problemlos.
  Danach meldet Jest eine doppelte `package.json` aus `.next/standalone` — nur eine Warnung.
- Screenshots im Browser-Bereich kommen in Handybreite teils gekachelt oder versetzt an. Das
  ist die Vorschau, nicht die Seite. Maße und Inhalte besser per `javascript_tool` prüfen.

---

## 8 · Befunde und Lehren aus der Sitzung vom 26. bis 29.09.2026

**Serverprüfung** (nur lesend, auf `fes-vm-ubuntudocker`). Die Skripte und Ausgaben liegen dort in
`~/deploy-paket4/`: `pruefung-v1-v5-v9.sh`/`.txt` (28.09.), `pruefung-v9.sh`/`.txt` (29.09.) und
`pruefung-v7.sh`/`.txt` (29.09., V-7). Im ersten Skript ist die Zeile `CADDYFILE=$(…)` beim
Kopieren beschädigt worden; seinen V-9-Teil nicht wiederverwenden. Die geprüften Befehle stehen im
Ablaufplan 1.3, 1.4, 1.7 und 1.9.

**Produktionsserver, was dabei herauskam:**

- Docker 29.4.1. Dateisysteme: `/vol/container` 393 GB (362 GB frei), `/var/lib/docker` 30 GB
  (11 GB frei). Uploads-Volume `hr_portal_credo_uploads_data`.
- Caddy: Container `caddy_reverse_proxy` (`caddy:latest`), Caddyfile auf dem Host
  `/vol/container/caddy2/config/Caddyfile`, im Container `/etc/caddy/Caddyfile` (Einhängung der
  einzelnen Datei, dazu das Verzeichnis als `/config`). Beim Bearbeiten den Inode erhalten (nano),
  sonst sieht der Container die Änderung erst nach einem Neustart.
- Caddy schreibt über den Docker-Treiber `syslog` ins **Journal** des Hosts
  (`journalctl -t docker/caddy_reverse_proxy`), nicht nach `/var/log/syslog`. `docker logs` geht
  trotzdem (Zwischenspeicher von Docker), reicht aber nicht sicher 30 Tage zurück.
- **Globale Option `debug` (Zeile 6):** `http.handlers.reverse_proxy` schreibt jede Anfrage mit
  voller URI (auch Magic-Link-Tokens), IP-Adresse und Headern (Cookie geschwärzt). Journal 3,9 GB,
  Standard-Aufbewahrung; lesen dürfen root und die Gruppe `adm` (`syslog`, `fes-linux-adm`).
- Der `header`-Block von `hr.fes-credo.de` setzt `Referrer-Policy` und enthält `-Server`. Caddy
  wendet ihn deshalb erst beim Schreiben der Antwort an und überschreibt das `no-referrer` der
  Upload-Seite; `?Referrer-Policy` behebt das (lokal geprobt).
- Im Log viel Verkehr von Scannern (`/actuator/`, `/aws/`, `/config/` …). Das ist normal; das
  Portal antwortet mit 404.
- **Journal (29.09., V-7):** Die älteste Caddy-Zeile stammt vom 26.09. 02:16 UTC. Der Debug-Modus
  schreibt rund 2,5 Millionen Zeilen in gut drei Tagen und hält das Journal an der Grenze von
  4 GB; vermutlich reicht deshalb das ganze Journal des Hosts nur etwa dreieinhalb Tage zurück.
  Die Zählung „30 Tage“ vom Morgen umfasste also nur diese Zeit (Ablaufplan 1.9, Korrektur).
- **Umgebung und Netz (29.09., V-7):** `N8N_API_KEY` leer, `CRON_SECRET` 32 Zeichen, `APP_URL`
  richtig, `NEXT_PUBLIC_APP_URL` nicht gesetzt, keine Webhooks im Portal. Im Netz `reverse_proxy`
  hängen elf Container, darunter `n8n-n8n-1`, `n8n-sw`, `n8n-pgadmin-1` und
  `metabase-metabase-1`; `hr-portal-db` hängt nur im internen Netz.

**Lehren für die Arbeit mit dem Nutzer:**

- **Befehle aus dem Chat können beim Kopieren leiden.** In einer Zeile mit zwei Sternchen
  verschwanden beide (als Markdown-Kursivschrift gelesen). Beim Einfügen von Ausgaben in den Chat
  gingen Zeilenumbrüche und Backslashes vor Satzzeichen verloren. Deshalb: höchstens ein `*` je
  Zeile, nicht auf `\.` o. ä. angewiesen sein, in Skripten eine Diagnosezeile einbauen
  (`grep -n … | cat -A`), den Nutzer um den Kopier-Knopf am Codeblock bitten, Ausgaben tolerant
  lesen.
- **Log-Prüfungen immer über alle Logger** (`"logger"`) zählen. Die erste Fassung zählte nur
  `http.log.access`/`http.log.error` und meldete fälschlich Entwarnung, obwohl der Debug-Logger
  die URIs schrieb.
- **Server-Befehle vorher lokal proben.** Docker Desktop hat das App-Image
  (`hr_portal_credo-main-app`, `node:22-alpine` mit busybox), `postgres:16` (Debian, bringt `mawk`
  wie Ubuntu mit), `postgres:16-alpine` und `caddy:2-alpine`. Proben an Wegwerf-Volumes und
  Containern, danach abräumen. `docker run` mit einem nicht vorhandenen Image lädt es ungefragt
  herunter (so geschehen mit `alpine:3`, wieder entfernt) — vorher `docker image ls`.
- **Werkzeuge:** Edit und Write verwandeln `\u003e` in `>`. Solche Zeichenfolgen in Dateien per
  Python mit `chr(92)` erzeugen. Lange Python-Heredocs mit vielen Anführungszeichen scheiterten
  einmal in Bash; zuverlässiger ist ein Skript als Datei, das ein kurzer Befehl startet. Die
  automatische Freigabe für Shell-Befehle fiel zeitweise aus; dann erst andere Arbeit erledigen
  und später erneut versuchen.
- **Proben am 29.09. (V-7):**
  - PowerShell 5.1 setzt beim Weiterreichen einer Datei an `docker` ein BOM davor und zerlegt
    verschachtelte Anführungszeichen in `-c '…'`. Zuverlässig ist Git Bash mit `< datei` bzw.
    `-v "$(cygpath -w "$PWD"):/probe:ro"` und `MSYS_NO_PATHCONV=1`, den Probelauf selbst als Datei.
  - Das lokale App-Image `hr_portal_credo-main-app` stammt vom 25.03.2026 und hat noch kein
    `curl`. HTTP-Proben deshalb mit Node (`http.request`, dort lässt sich `Host` setzen).
  - Echte Debug-Zeilen von Caddy erzeugt ein Wegwerf-Caddy (`caddy:2-alpine`, globale Option
    `debug`, `auto_https off`) mit einer zweiten Site als Upstream. `docker logs` liefert die
    JSON-Zeilen, die auf dem Server über den Treiber `syslog` ins Journal gehen.
  - Server-Skripte bekommen eine Selbstprüfung (Zeile `SOLL=`, geprüft mit
    `grep -v '^SOLL=' "$0" | md5sum`). Ein beim Kopieren beschädigtes Skript bricht ab, bevor es
    etwas liest.
