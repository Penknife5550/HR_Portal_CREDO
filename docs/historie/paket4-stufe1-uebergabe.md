# Paket 4 „Unterlagen nachfordern“ — Übergabe nach Stufe 1

> **Stand:** 26.09.2026. Stufe 1 (Onboarding) ist umgesetzt und per Fast-Forward nach `main`
> gemergt und nach `origin/main` gepusht. **Nicht deployt.** Die Produktion läuft weiter auf
> Code `7bc91ec` (Deploy vom 24.09.2026).
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
| (dieser) | Übergabe und Statusangaben nach dem Merge |

---

## 2 · Wie geprüft wurde

- **Je Schritt:** Ein Agent setzte um. Zwei bis vier Prüfer sahen die Änderung aus verschiedenen Blickwinkeln durch (Spezifikation, Korrektheit, Sicherheit, Passung, Bedienung). Ein Nachbesserer prüfte jeden Befund nach und behob ihn. Danach liefen die Gates: `tsc`, `lint`, die volle Jest-Suite und `next build` in einer isolierten Kopie.
- **Abschlussdurchsicht (`3f42546`):** fünf Blickwinkel, nämlich Randfälle, CREDO-Standards, Sicherheit/Datenschutz, Konsistenz und Einfachheit. Jeder Blickwinkel bekam einen Skeptiker zur Gegenprüfung. Gemeldet wurden 38 Befunde, bestätigt 30, alle KLEIN; zu Sicherheit und Datenschutz wurde keiner bestätigt. Alle 30 sind behoben.
- **Letzte Gates:** `tsc` 0 Fehler, `lint` 0 Fehler (5 alte Warnungen in fremden Dateien), **168 Suiten / 4338 Tests grün**, Build ok.
- **DB-Probe gegen die Dev-DB (Schritt 4):** NULL-Unique für `laufendSchluessel`, „erst sperren, dann zählen“ mit zwei Verbindungen, bedingtes `updateMany` bei gleichzeitigem Annehmen. Alle drei sind belegt.
- **Browserprobe am 25.09. gegen das Dev-Portal:** Der ganze Ablauf wurde durchgespielt: Anfordern → Mail → Upload (Tarn-PDF abgewiesen) → Übermitteln → HR-Mail „eingegangen“ (After-Response) → Zurückweisen (Mail ohne Name und Begründung der vertraulichen Unterlage) → erneut einreichen → Annehmen mit Artwahl (Document mit Bezeichnung, APPROVED, Hardlink, Quelle gelöscht) → erledigt (Kasten räumt ab) → Annahme zurücknehmen (läuft wieder). Die Köpfe der Datei-Route waren korrekt: `sandbox` für Bilder, Portal-CSP für PDFs, `no-store`, CORP. Die Mails liefen dabei in eine lokale SMTP-Senke, danach wurde SMTP zurückgesetzt.
- **Nicht geprüft:**
  - das Inline-PDF in allen vier Browsern,
  - ein echtes Handy mit HEIC-Fotos,
  - `Content-Length` über Caddy/HTTP2,
  - `after()` im Standalone-Build.

  Alle vier stehen als Probe im Deploy-Ablaufplan. Der tägliche Lauf wurde nur in Tests geprüft, nicht über HTTP, weil in der Dev-Umgebung kein `CRON_SECRET` gesetzt ist.

---

## 3 · Code-Review vor dem Deploy: empfohlen

Vor dem **Deploy** ist eine eigenständige Code-Review des ganzen Pakets sinnvoll. Vor dem Merge war sie nicht nötig, weil `main` nicht automatisch ausgerollt wird. Gründe:

1. **Die letzte Fix-Runde (`3f42546`, rund 50 Dateien) hat kein unabhängiger Prüfer mehr gesehen.** Geprüft haben sie nur ihr eigener Nachbesserer und die Gates.
2. **Umfang und Angriffsfläche.** Rund 90 Dateien und über 40 000 Zeilen, einschließlich Tests, kommen neu hinzu. Dazu gehören eine öffentliche Upload-API außerhalb der Middleware, Token, Dateioperationen mit Hardlinks, Nachweise nach Art. 9 und 10 DSGVO und eine Verhaltensänderung an einer bestehenden Download-Route.
3. **Hausbrauch:** Vor dem Deploy vom 24.09. gab es eine eigene Review-Runde (`7bc91ec`, acht Befunde).

**Vorschlag für die nächste Sitzung:**
- `/code-review high` über `ce1888e..main`, Schwerpunkte:
  - öffentliche Routen und `unterlagen-upload.ts`,
  - Übernahme und Rücknahme in `unterlagen-dienst.ts`,
  - `unterlagen-lauf.ts`,
  - Download-Route und Middleware.
- Danach Fix-Commit, Gates, Push, dann Deploy nach Ablaufplan.

---

## 4 · Was vor dem Deploy fehlt

| # | Punkt | Wer |
|---|---|---|
| 1 | **Datenschutztext der Upload-Seite** ist ein Platzhalter (`UPLOAD_SEITE_TEXTE.DATENSCHUTZ` in `src/components/unterlagen/upload-seite.tsx`). Wortlaut nach Art. 13 mit Art. 9 vom DSB, danach Code-Änderung. Mit dem DSB außerdem klären: Verarbeitungsverzeichnis, Führungszeugnis bei Kitas (in Stufe 1 gesperrt), Aufbewahrung (E-7) | Nutzer/DSB → Claude |
| 2 | Code-Review (Abschnitt 3) | Claude |
| 3 | **n8n:** die bestehenden Läufe `reminders` und `offboarding-reminders` auf `hr.fes-credo.de` umstellen (sie zeigen auf `hr.credo-schulen.de` und kommen seit über 60 Tagen nicht an), `dokument-ablauf` einplanen, neuen Lauf `unterlagen-fristen` anlegen (täglich 07:00 Europe/Berlin, Header-Auth `Bearer <CRON_SECRET>`, Timeout 300 000 ms, Retry aus, 1–3 Tage `?dryRun=1`). Ohne ihn gibt es keine Erinnerungen und keine Löschung | IT/Nutzer |
| 4 | `SmtpConfig.replyToEmail` (= HR-Postfach, Kopie der HR-Mails, Antwortadresse) setzen; Freigabeliste pflegen (optional) | Nutzer |
| 5 | Volume `uploads_data` sichern und dauerhaft ins Backup nehmen (der Entrypoint sichert nur die Datenbank) | IT |
| 6 | Lesend prüfen, ob `N8N_API_KEY` gesetzt ist. `SERVICE` bekommt an der Download-Route jetzt 403 | IT |
| 7 | `CRON_SECRET` mit mindestens 24 Zeichen (sonst 500) | IT |
| 8 | Nach dem Deploy: bei `dokument-ablauf-warnung` und `dokument-abgelaufen` die Fassung vergleichen und „Text auf Standard zurücksetzen“ (Z3) | Nutzer |

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
