# Server-Update 10/2026 (3) — UX-Umbau: U0, U1, Pilot Vertragsende, Mailtext (Ablaufplan)

> **Stand:** Ablaufplan vom 19.10.2026, **noch nicht ausführbar** — er setzt Etappe 1 von Self-Service
> S0 voraus ([`deploy-selfservice-s0-2026-10.md`](deploy-selfservice-s0-2026-10.md), Abschnitte 1–6),
> und deren Protokoll gibt es noch nicht. Solange unten ein Platzhalter **‹E1: …›** steht, wird nichts
> ausgeführt: Claude trägt die Werte aus dem Protokoll von Etappe 1 ein, bevor ein Termin feststeht
> (Abschnitt 0, „Vor dem Termin zu entscheiden“, Punkt 1).
> **Server:** `fes-vm-ubuntudocker`, `/vol/container/HR_Portal_CREDO`, `https://hr.fes-credo.de`
> **Ausgangsstand (nach Etappe 1):** Repo `main` mit Code-Stand `0e1d8de` (darüber nur Doku), Image
> `hr_portal_credo-app:latest` = **‹E1: volle ID aus 3.3/5.1›**, Container angelegt am **‹E1: 5.1›**,
> `system_migrations` 13, S0 ruhend (oder, falls Etappe 2 vorher lief: in Betrieb bzw. zurückgenommen, Abschnitt 8),
> Rückfall-Etikett bisher nur `hr-portal-app:0974b7f` (taugt für diesen Deploy nicht, 7.1).
> **Ziel:** `main` nach dem Merge des Pull Requests `ux-umbau` → `main` (GitHub, **„Create a merge
> commit“**), Code-Stand **`7d595e5`** (`7d595e551b1edb6acbe5509165ce43ebcd4a15ae`, „fix(ux): Abnahme
> nach dem Merge von main …“, 19.10.2026), darüber nur Doku. Der Pull Request wird **erst nach Etappe 1**
> gemergt — sonst hielte der S0-Plan in 3.2 an (Entscheidung des Auftraggebers vom 19.10.2026:
> „erst S0, dann UX“).
> **Inhalt:** U0 (Bausteine), U1 (ein Kopf für alle Seiten, neue Adressen `/vorgaenge/…` und
> `/bem/…`, alte leiten dauerhaft weiter), Pilot Vertragsende (neue Ansicht hinter einem
> Vorschau-Schalter, Vorgabe bleibt die alte), Mailtext im Versandprotokoll (+1 Tabelle).
> **Geprüft am 19.10.2026:** Abnahme auf dem Entwicklerrechner (Windows) gegen eine eigene Datenbank —
> Pilot `scripts/ux-abnahme-pilot.js` 213 Prüfungen, Kopf `scripts/ux-abnahme-u1.js` 26 Prüfungen,
> `npm run pruefen` 271 Suiten / 8619 Tests, `npm run build` grün
> ([Logbuch](../module/ux-ui/projekt-ux-umbau.md), Abschnitt 7, „19.10.2026“). Dazu eine
> **Generalprobe** mit beiden Images aus dem committeten Stand (`git archive`) und dem echten
> Entrypoint gegen eine Wegwerf-Datenbank: Start `0e1d8de` → Vorschau → Start `7d595e5` → Vorschau des
> Rückfalls → Start `0e1d8de` (Weg A), dazu die Kopfzeilen der Adressen beider Images mit den
> Kopfzeilen, die Caddy weiterreicht (`Host`, `X-Forwarded-Proto`). Ergebnisse in 1.9, 3.3, 3.4, 4.3,
> 5.3 und 7.3 („gemessen“).
> **Nicht gemessen:** Build auf dem Server, was Caddy der Weiterleitung an Kopfzeilen hinzufügt (HSTS),
> das Verhalten der Browser bei der dauerhaften Weiterleitung (0, Punkt 3), die Browserprobe mit
> echten Vorgängen (5.4), Weg B und C. Die Zeile `[Zeitplaner] Uhr gestartet (jede Minute).` und
> `"uhrAktiv":true` (4.3, 5.1, 7.3) — die Generalprobe lief mit ausgeschalteter Uhr; auf dem Server am
> 14.10.2026 so gesehen. Dass S0-Daten den Rückfall unverändert überstehen, ist aus dem Delta
> abgeleitet (die Wegwerf-Datenbank hatte keine S0-Werte); 7.3 Schritt 12 prüft es.
> **Muster:** Gliederung, Befehle und Lehren aus dem S0-Plan; dort geprüfte Befehle stehen hier
> wortgleich, nur Dateinamen und Erwartungen sind angepasst.
> **Prüfprotokoll dieses Plans:** [`codereview-deploy-ux-umbau-2026-10.md`](codereview-deploy-ux-umbau-2026-10.md).

---

**Grundregel wie bisher:** Wo „STOPP“ steht, wird angehalten und die Ausgabe an Claude geschickt.
Das Portal läuft bis Schritt 4.1 unverändert weiter — Anhalten kostet bis dahin nichts.
**Ab dem Build in 3.3** heißt `hr_portal_credo-app:latest` aber schon das neue Image, während der alte
Container weiterläuft. Bis zum Start in 4.2 — und nach jedem STOPP bis zur Antwort von Claude — deshalb
**kein `docker compose up` in irgendeiner Form** (weder mit noch ohne `--build`, auch nicht das
`up -d --build` aus der CLAUDE.md, nicht mit `--force-recreate`), kein `docker compose down` und kein
`docker compose run app` ohne `--entrypoint`: Jedes davon legte `hr-portal-app` mit dem neuen Code an,
ohne die Sicherungen aus 4.1 und mit `db push --accept-data-loss`. Unbedenklich sind Befehl B
(`start`), `docker compose restart`, ein Neustart des Servers und die Neustart-Regel des Containers —
sie behalten den Container und damit das alte Image. Wird der Deploy nach 3.3 und vor 4.2 abgebrochen
oder vertagt, setzt Befehl F (3.3) das Etikett zurück — nur unter den Bedingungen dort; **ab 4.2 nie
Befehl F**.
**Zwischen dem Anhalten in 4.1 und dem Start in 4.2** heißt STOPP: erst Befehl B (startet den
angehaltenen alten Container wieder), dann an Claude. **Ab 4.2** gibt es den alten Container nicht
mehr: bei STOPP nichts starten und nichts anhalten, nur an Claude — außer dem, was die Tabelle in 4.4
je Fehlerbild nennt. Bei einer Neustart-Schleife nach gescheitertem Push sofort Befehl D, sonst
nichts, dann an Claude — nie danach Befehl B. Ein Rückweg geht nur über Abschnitt 7 mit Claude.

**So wird kopiert:** Jeder Befehl steht in einem eigenen Kasten und ist genau eine Zeile. Einzeln
kopieren, ausführen, die Ausgabe mit „Erwartet“ vergleichen. Alles läuft in **einer** SSH-Sitzung im
Projektordner (1.0). Nach einer neuen Anmeldung zuerst wieder 1.0 und — ab 1.6 — die Zeile mit
`UPLOADS_VOL=` ausführen. Keine Befehlszeile enthält mehr als ein Sternchen, kein Befehl gibt ein
Geheimnis aus (die `.env` wird nur gezählt). `git` auf dem Server immer mit `sudo`. Lesende
SQL-Befehle tragen `default_transaction_read_only`. Befehle, die etwas schreiben, sind als „schreibt“
markiert. Ausgaben mit Adressen oder Namen nur auf dem Server ansehen, nie schicken.

**Uhrzeiten:** Das Protokoll führt Uhrzeiten in UTC, die deutsche Zeit in Klammern — **ab dem
25.10.2026 (Ende der Sommerzeit) UTC + 1 h**, davor UTC + 2 h. Zeitfenster und Uhrzeiten der Läufe
stehen in deutscher Zeit; Dateinamen wie `vor-schema-abgleich-JJJJMMTT-HHMMSS.sql` und Zeitstempel
aus `docker inspect` sind immer UTC.

---

## 0 · Worum es geht

Nach Etappe 1 läuft auf dem Server `0e1d8de` (S0 ruhend, Fix der Status-Kacheln, die
Zugriffskorrekturen vom 16.10.). Dieses Update bringt den Zweig `ux-umbau` auf den Server: eine
einheitliche Oberfläche, zunächst für den Rahmen (Kopf, Adressen) und als Vorschau für das
Vertragsende, dazu den gespeicherten Text versendeter Mails. **An der Fachlogik ändert sich nichts**
(Leitplanke des Umbaus); Mailvorlagen, Läufe, Webhooks und die Schnittstellen für n8n bleiben gleich.

An der Datenbank kommt **eine leere Tabelle** dazu (`email_log_texte`, mit Fremdschlüssel auf
`email_logs`) — nichts wird umbenannt oder gelöscht. Keine einmalige Datenmigration, keine neue
Umgebungsvariable, keine Mailvorlage zum Zurücksetzen. Das Portal ist nur beim Neustart einige Minuten
nicht erreichbar.

### Was ausgerollt wird

`0e1d8de..7d595e5`: **71 Commits, davon 14 Merges** (so zählt 3.2, mit festen Ständen). Sechs davon
sind seit Etappe 1 schon auf dem Server, nämlich die Commits von `main` nach `0e1d8de`: vier
Doku-Commits (`76a5ae5`, `a4b1680`, `176773c`, `daa5d43`) und die Pull-Request-Merges `82b58ce` (#6,
Kachel-Fix) und `5fc31bd` (#7, Doku); an Code bringen sie nichts (`git diff 0e1d8de 5fc31bd` außerhalb
der Doku ist leer). Neu sind 65 Commits (`5fc31bd..7d595e5`), davon 12 Merges „Merge branch 'main' into
ux-umbau“: die ganze Geschichte von `ux-umbau` seit dem 01.10.2026, zuletzt `8f4f064` (19.10.2026,
`main` bis `5fc31bd`).
Außerhalb der Doku 219 Dateien, vor allem `src/app/(portal)`, `src/components/ui`, `src/__tests__`.

| Teil | Was | Merkt HR davon? |
|---|---|---|
| U0 | Bausteine in `src/components/ui/` (Knopf, Statuspille, Gruppe, Dialog, Toast, Seitenkopf, Segment, Skelett, Leerzustand, Prozessleiste, Reiter, Hinweis, Textfeld, Textverweis), Farb-Tokens, Musterseite `/ui-muster` (nur SUPER_ADMIN, ohne Menüpunkt) | nein (nur über U1 und den Pilot) |
| U1 | **Ein Kopf für alle Seiten** im Layout: Vorgänge · Personen · BEM · Vorlagen · Verwaltung (statt „Dashboard“ · BEM 🔒 · Personen · …), Rollennamen „Administration“, „HR-Sachbearbeitung“; Sprunglink „Zum Inhalt springen“. **Neue Adressen** `/vorgaenge/<modul>/<uuid>` und `/bem/<uuid>`; alte Adressen unter `/dashboard/…` leiten **dauerhaft** (308) weiter, ohne Anmeldung, mit allen Parametern | **ja:** neuer Kopf, neue Adressen; Lesezeichen und Links in alten Mails gehen weiter |
| Pilot | **Vertragsende, neue Detailansicht** hinter dem Schalter „Neue Ansicht ausprobieren“ (Cookie je Browser, Vorgabe alt): Prozessleiste, „Jetzt dran“, Reiter, eigene Dialoge, „Vorgang stornieren …“, „Rückmeldung geben“ (`mailto:` an `personalbuchhaltung@fes-minden.de`) | **ja**, wer den Schalter nutzt |
| Mailtext | `sendEventEmail` speichert den Text jeder versendeten Mail (SENT, FAILED; nie SKIPPED, Test, BEM), persönliche Links ersetzt; Knopf **„Text ansehen“** im Reiter „E-Mails“ (alle drei HR-Rollen) und im Versandprotokoll (Administration, HR-Leitung); Löschung mit der Protokollzeile nach 90 Tagen. DSB-Zustimmung vom 15.10.2026 ([Mitteilung](../module/betrieb/mailtext-im-protokoll-dsb-mitteilung.md)) | **ja**, nur bei Mails ab dem Deploy |
| Nebenbei | Statuslisten der Vertragsende-Routen in `src/lib/contract-end-status.ts` (inhaltlich gleich), `robots.txt` sperrt `/vorgaenge/` und `/bem/`, Links in Mails und Läufen über `vorgangPfad` | nein |

**Nicht neu** (schon mit Etappe 1 live): S0 samt Menüpunkt „Personen“, der Fix der Status-Kacheln,
die Zugriffskorrekturen vom 16.10.2026, das Feld `betriebsstaetteName` in `GET /api/contract-end/[id]`. Das Logbuch nannte die Korrekturen noch als „fährt mit“ —
das ist seit Etappe 1 überholt.

### Was sich an Datenbank und Betrieb ändert

- **Schema, rein additiv** (gemessen in der Generalprobe, 3.4): `CREATE TABLE "email_log_texte"`
  (`emailLogId` als Primärschlüssel, `bodyHtml`, `gekuerzt`, `createdAt`) und ein Fremdschlüssel auf
  `email_logs(id)` mit `ON DELETE CASCADE`. Kein `DROP`, kein Typwechsel, kein Enum, keine neue
  Spalte an einer bestehenden Tabelle, kein eindeutiger Index auf Bestandsdaten — der Push kann an
  Bestandsdaten nicht scheitern, und die Warnung „There might be data loss“ erscheint **nicht**
  (anders als bei S0). Die S0-Spalten an `employments` bleiben unberührt.
- **Keine einmalige Datenmigration:** `prisma/seed-check.js`, `prisma/seed.ts` und
  `public/system-dokumente` sind seit `0e1d8de` unverändert, `system_migrations` bleibt bei 13, der
  Start meldet die drei System-Vorlagen dreimal „ist aktuell“.
- **Betriebsdateien:** `Dockerfile`, `docker-compose.yml`, `entrypoint.sh`, `.dockerignore`,
  `next.config.ts`, `src/instrumentation.ts`, `.env.production.example` unverändert. Geändert:
  `package.json` (+1, nur die Entwicklungsabhängigkeit `jest-axe`), `package-lock.json` (+120/−3, alles
  `dev`), `prisma/schema.prisma` (+21), `src/middleware.ts` (+22/−5, die Weiterleitung), `public/robots.txt`
  (+2). **Weil sich das Lockfile ändert, läuft `npm ci` im Build neu** (nicht `CACHED`) und braucht die
  npm-Registry voll; der Build dauert länger und braucht mehr Platz (1.5).
- **Keine neue Umgebungsvariable.** `PERSONALSTAMM_SECRET` bleibt, wie Etappe 1 bzw. 2 ihn
  hinterlassen hat.
- **Wachstum:** je versendeter Mail ein Text bis 100.000 Zeichen; gelöscht wird mit der
  Protokollzeile nach 90 Tagen — über den Lauf „Wartung“ und höchstens einmal am Tag beim Öffnen des
  Versandprotokolls. Ist „Wartung“ aus oder nur als Probelauf eingeplant, hängt die 90-Tage-Zusage an
  den DSB allein am Öffnen des Versandprotokolls (0, Punkt 6; 6.2). Die Sicherungen dieses Deploys (4.1, 4.5) enthalten noch keine
  Texte, weil die Tabelle erst mit dem Push nach der Entrypoint-Sicherung entsteht. Ab der ersten
  Sicherung danach enthält jede `pg_dump`-Datei die Texte, und für sie gilt die 90-Tage-Frist nicht:
  die manuelle Sicherung in 4.1 und die Kopie aus 4.5 jedes künftigen Deploys (beide nie rotiert),
  jede Entrypoint-Sicherung `vor-schema-abgleich-…` (zehn, ohne Altersgrenze), Sicherungen vor
  besonderen Schritten wie `vor-s0-erster-lauf-manuell.sql` (S0-Plan 8.4, falls Etappe 2 nach diesem
  Deploy kommt) und im Rückfall `vor-rueckfall-…` samt der Entrypoint-Sicherung beim Start des alten
  Images (10, Punkt 4). Dasselbe gilt schon heute für alle
  übrigen Daten des Portals, etwa Betreffzeilen, individuelle E-Mails und Unterlagen.
- **Mails und Webhooks:** keine neue und keine entfallene Vorlage, kein neues Ereignis, kein neues
  Feld. Nur der **Wert** der Links ändert sich bei sieben Ereignissen von `/dashboard/…` auf
  `/vorgaenge/…` bzw. `/bem/…` (`dokument-ablauf-warnung`, `dokument-abgelaufen`,
  `psi-deadline-warning`, `contract-end-eskalation`, `contract-end-unbearbeitet`,
  `unterlagen-vollstaendig`, `unterlagen-frist-verstrichen`, dazu ohne Webhook
  `onboarding-ausstattung-offen` und `bem-frist-erinnerung`). Gespeicherte DB-Vorlagen bekommen den
  neuen Link von selbst (`{{portalLink}}`). Der n8n-Flow „Email-Vertragsende-Personal 3.0“ ruft
  `POST /api/webhooks/contract-end` — Route, Prüfung und Antwort sind unverändert (`git diff 0e1d8de
  7d595e5` ist leer für die Route, `src/lib/contract-end.ts`, `src/lib/validations/contract-end.ts` und
  `src/lib/webhooks.ts`); neu ist nur, dass die Mail `contract-end-created`, die sie über
  `triggerWebhooks` auslöst, wie jede andere ihren Text im Versandprotokoll ablegt (`src/lib/mailer.ts`).
  Am Flow ist nichts zu ändern. Alte Links in n8n-Mails gehen über die Weiterleitung.
- **Automatische Läufe:** weiter elf, nichts an Zeiten, Texten oder Antworten (die Umbenennung
  „Nur anzeigen“, E14, ist **nicht** in diesem Deploy).
- **Volume `uploads_data`:** nichts zu tun. **Seed:** auf dem Server **nie** `node prisma/seed.js` (6.3).

### Was NICHT dabei ist

- **Etappe 2 von S0** (Abschnitt 8 dieses Plans regelt nur das Zusammenspiel).
- **Weitere UX-Pakete:** U2/U4 für die übrigen Module, U3, U5, U6, U10 — laut Leitplanke erst, nachdem
  das Personalbüro zwei Wochen mit dem Pilot gearbeitet hat. Die neue Vertragsende-Ansicht wird mit
  diesem Deploy **nicht** Vorgabe.
- Keine Änderung an Mailvorlagen, Webhooks, Caddy, `docker-compose.yml` oder n8n.
- Bekannt, bleibt: Die Kachel „Frist!“ der Verbeamtung filtert auf einen Status, den es nicht gibt
  (schon live, eigene Aufgabe); die n8n-Generatoren für Elternzeit und Mutterschutz bauen weiter
  `/dashboard`-Links (gehen über die Weiterleitung, 10, Punkt 6).

### Dauer (Schätzung)

| Abschnitt | Dauer | Portal |
|---|---|---|
| 1–2 Vorher prüfen, Image etikettieren | 20–30 min | läuft |
| 3 Holen, bauen, Vorschau | 15–30 min (`npm ci` läuft neu; Generalprobe auf dem Entwicklerrechner: siehe 3.3) | läuft |
| 4.1–4.3 Anhalten, Sicherungen, Start | etwa 5 min | **nicht erreichbar** |
| 5 Nachher prüfen, Probe | 30–40 min | läuft (HR wartet bis 5.5) |

### Zeitfenster

- **An einem Werktag, an dem HR erreichbar ist**, Dienstag bis Freitag zwischen 10 und 12 Uhr.
- **Nicht zwischen 07:00 und 08:45, nicht nachts, nicht montags gegen 09:00** (n8n-Flow
  Vertragsende). Läuft Etappe 2 schon, auch nicht während des nächtlichen Stammablaufs (02:30) — und
  nicht am selben Tag wie Etappe 2.
- **HR am Vortag informieren** und bitten, ab 4.1 bis zum Bescheid in 5.5 nichts im Portal zu
  speichern.

**Textvorschlag für die Vorankündigung:** „Am [Tag] zwischen [Uhrzeit] und [Uhrzeit] wird das
HR-Portal aktualisiert. Es ist dabei für einige Minuten nicht erreichbar. Bitte speichern Sie in
dieser Zeit nichts im Portal; wir geben Bescheid, sobald es wieder läuft. Danach sieht der Kopf des
Portals etwas anders aus — Einzelheiten schicken wir mit dem Bescheid.“

### Vor dem Termin zu entscheiden

1. **Platzhalter füllen und Pull Request erst nach Etappe 1 mergen** (entschieden 19.10.2026). Nach
   dem Protokoll von Etappe 1 trägt Claude die Werte **‹E1: …›** ein (Kopf, 1.1, 1.2, 1.5, 2.1, 3.1, 4.1), prüft,
   ob seit `7d595e5` Code dazukam (dann alle festen Stände neu rechnen), und schreibt das ins
   Prüfprotokoll. Gemergt wird auf GitHub mit **„Create a merge commit“**. Meldet GitHub einen Konflikt
   (wahrscheinlich in `CLAUDE.md`, sobald die Nachführung von Etappe 1 die Zeile zum Deploy-Ablaufplan
   direkt über „UX-Umbau“ ändert), wird er **nur** durch einen Merge von `main` in `ux-umbau` gelöst
   (lokal `git merge origin/main` auf `ux-umbau`, dann pushen, oder „Resolve conflicts“ auf GitHub, das
   ebenfalls einen Merge-Commit anlegt), **nie durch Rebase**: Ein Rebase schriebe alle Commits seit
   `5fc31bd` neu, `7d595e5` wäre nicht mehr enthalten. Einfacher: Claude mergt `main` gleich mit der
   Nachführung von Etappe 1 in `ux-umbau`, dann ist der Pull Request konfliktfrei. Nach dem Merge auf
   dem Entwicklerrechner (nicht auf dem Server):
   `git fetch origin && git merge-base --is-ancestor 7d595e551b1edb6acbe5509165ce43ebcd4a15ae origin/main && git diff --quiet 7d595e551b1edb6acbe5509165ce43ebcd4a15ae origin/main -- . ':!docs' ':!CLAUDE.md' ':!README.md' && echo "7d595e5 auf main, danach nur Doku"`.
   Fehlt die Zeile → nicht deployen, an Claude. **Bis zu diesem Deploy nur Doku auf `main`:** Die
   Punkte 11 (n8n-Exporte aus Git) und 13 (Altlasten in Testskripten und Test) aus dem S0-Plan,
   Abschnitt 10, die dort „erst nach Etappe 1“ stehen, kommen erst **nach** diesem Deploy auf `main`
   — sonst hielte 3.2 an, und bei Punkt 11 löschte schon der Pull in 3.1 die n8n-Exporte aus dem
   Arbeitsbaum des Servers. Mit der Nachführung von Etappe 1 schreibt Claude das in den S0-Plan und in
   den Altlasten-Satz der CLAUDE.md.
2. **Etappe 2 vorher oder nachher?** Beides geht, aber nicht am selben Tag. Die Erwartungen dieses
   Plans hängen davon ab (1.2, 1.7, 1.9, 5.3; Abschnitt 8). Nach diesem Deploy führt Claude den
   S0-Plan in Abschnitt 7 nach (Rückfall nur stufenweise über `0e1d8de`), und läuft dieser Deploy
   **vor** Etappe 2, zusätzlich in 8.1 (er erwartet dort „Code-Stand 0e1d8de“ und hielte zu Recht an).
3. **Dauerhafte Weiterleitung und Rückfall.** Die Weiterleitung `/dashboard…` → `/vorgaenge…` ist ein
   308 ohne `Cache-Control` (gemessen, 5.3); Browser merken sich so etwas in der Regel dauerhaft
   (nicht gemessen). Gemerkt wird jede alte Adresse, die ein Browser seit dem Deploy einmal **ganz**
   geladen hat: Lesezeichen, ein Link aus einer Mail, eine eingetippte oder vom Browser vervollständigte
   Adresse `…/dashboard`. Nach einem Rückfall (7.3) führt jedes volle Laden einer solchen Adresse auf
   `/vorgaenge…` bzw. `/bem…`, und dort hat das alte Image keine Seite (404, keine Daten offen). Das gilt
   auch für „Neu laden“ direkt nach der Anmeldung (das alte Image meldet auf `/dashboard` an), für einen
   neuen Tab und für die Umleitungen des alten Images auf `/dashboard` bzw. für BEM-Beauftragte auf
   `/dashboard/bem`. Die Anmeldung selbst und Klicks im Portal sind nicht betroffen (Next.js holt
   Seitenwechsel unter einer anderen Adresse, `?_rsc=…`). Dazu alle Links aus Mails seit dem Deploy.
   **Empfehlung: hinnehmen** und im Rückfall alle Personen mit aktivem Konto (1.7, alle Rollen) bitten,
   „Bilder und Dateien im Cache“ zu löschen (7.3, „Nach Weg A“). Alternativen vor dem Deploy, je ein
   neuer Code-Stand mit neuer Abnahme: `307` statt `308` für die Pilotwochen (eine Zahl in
   `src/middleware.ts` samt `adressen.test.ts`; 307 merkt sich kein Browser ohne Cache-Kopf) oder
   `Cache-Control: no-store` an der Weiterleitung. **Entschieden am 19.10.2026 (Auftraggeber):
   hinnehmen** — die Weiterleitung bleibt dauerhaft (308), der Code-Stand `7d595e5` bleibt.
4. **Ankündigung an das Personalbüro** ([`pilot-ankuendigung.md`](../module/ux-ui/pilot-ankuendigung.md)):
   am 19.10.2026 auf den Stand gebracht (Personen im Kopf, Knopf „Text ansehen“, Versandprotokoll nur
   für Administration und HR-Leitung, Adresse mit Kennung statt Nummer, nur die Detailseite,
   Statustexte der Liste, „Vorgang stornieren …“; neutrale Wörter statt „Kolleginnen und Kollegen“
   und „Empfängerin“, damit die offene Frage zur Gendersprache sie nicht aufhält). Vor dem Versand:
   das Ende der zwei Wochen einsetzen, Checkliste am Ende der Datei. Verschickt
   wird sie erst nach der Browserprobe (5.5).
5. **Ausgangswerte des Prototyp-Tags:** Das Erfolgsmaß „Klicks je Top-Aufgabe“ braucht die Werte vom
   15.10.2026 — sie stehen nicht im Repo. Vor dem Deploy nachtragen oder das Maß fallen lassen (10,
   Punkt 2). Kein Hindernis für den Deploy.
6. **Lauf „Wartung“:** Er trägt die 90-Tage-Zusage an den DSB für die Mailtexte. Zeigt 1.8 ihn nach
   Etappe 1 nicht mit `aktiv` = `t` und `probelauf` = `f` (also aus oder nur als Probelauf), **mit
   diesem Deploy scharf einschalten** (6.2, Ablauf wie im S0-Plan 6.2).
7. **DSB-Mitteilung, Frage a** (Verzeichnis der Verarbeitungstätigkeiten, Datenschutzhinweise): Die
   Zustimmung liegt vor; ob das Verzeichnis um die Textspeicherung ergänzt wird, klärt der
   Projektverantwortliche mit dem DSB. **Geklärt (Auftraggeber, 19.10.2026): „mit dem DSB ist alles
   geklärt und freigegeben“.** Ins Protokoll übernehmen.
8. **Sicherungen und DSB-Mitteilung, Abschnitt 5** („keine Kopie an anderer Stelle“): Sicherungen
   nennt die Mitteilung nicht. Ob und wann der Projektverantwortliche dem DSB einen datierten Nachtrag
   gibt, entscheidet der Auftraggeber (Textvorschlag in 10, Punkt 4); Abschnitt 5 bleibt, wie
   abgestimmt. Dieser Deploy legt noch keine Kopie an; die erste entsteht bei einem Rückfall (7.3) oder
   mit 4.1 des nächsten Deploys. Kein Hindernis für den Deploy. **Geklärt (Auftraggeber, 19.10.2026):
   „mit dem DSB ist alles geklärt und freigegeben“** — der Nachtrag ist damit kein Hindernis mehr. Eine
   Frist für die Aufbewahrung der Sicherungen steht nicht im Repo; trägt der Auftraggeber sie nach,
   gehört sie in 10, Punkt 4, und als datierter Vermerk an die DSB-Mitteilung (9).

---

## 1 · Vorher (nur lesen)

Alle Befehle dieses Abschnitts lesen nur. Zwei Ausnahmen: 1.0 legt einen Arbeitsordner im
Home-Verzeichnis an (außerhalb des Repos), und die Schreibtests in 1.4 legen je eine leere Datei an
und löschen sie sofort (Befehl A dort nur bei Bedarf).

### 1.0 Projektordner und Arbeitsordner

```bash
cd /vol/container/HR_Portal_CREDO
```

```bash
mkdir -p ~/deploy-ux-umbau
```

**Erwartet:** keine Ausgabe.

### 1.1 Stand des Repos (der wichtigste Schritt)

```bash
sudo git log -1 --oneline
```

**Erwartet:** **‹E1: oberster Commit aus dem Protokoll von Etappe 1, 3.2›** — oder ein späterer
Commit auf `main`, der nur Doku bringt (etwa das eingetragene Protokoll). Die nächsten Befehle prüfen
das gegen feste Stände.

```bash
sudo git reflog -3 --date=iso
```

**Erwartet:** oben der Pull von Etappe 1 (`pull: Fast-forward`, Datum von Etappe 1) bzw. ein
späterer Doku-Pull. Nur notieren.

```bash
sudo git merge-base --is-ancestor 0e1d8de8cf0d5b714c059140b9f2f09552eb00d1 HEAD && echo "0e1d8de enthalten"
```

**Erwartet:** `0e1d8de enthalten`. Fehlt die Zeile → **STOPP, Ausgabe an Claude** (dann ist Etappe 1
nicht gelaufen).

```bash
sudo git diff --quiet 0e1d8de HEAD -- . ':!docs' ':!CLAUDE.md' ':!README.md' && echo "Code-Stand 0e1d8de"
```

**Erwartet:** `Code-Stand 0e1d8de`. Fehlt die Zeile → **STOPP, Ausgabe an Claude.**

```bash
sudo git status --short
```

**Erwartet:** nur Zeilen `?? backups/<datei>` — darunter die Sicherungen von Etappe 1
(`vor-deploy-selfservice-s0-manuell.sql`, `vor-deploy-selfservice-s0-entrypoint.sql`,
`uploads-vor-deploy-selfservice-s0.tar.gz`, eine `vor-schema-abgleich-…`) und älter, nach Etappe 2
zusätzlich `vor-s0-erster-lauf-manuell.sql`. Zeilen mit `M` oder `??` außerhalb von `backups/` →
**STOPP, Ausgabe an Claude.** Nie `git add -A`, `git stash -u` oder `git clean`.

```bash
ls docker-compose.override.yml 2>/dev/null || echo "kein Override"
```

**Erwartet:** `kein Override`. Steht die Datei da (dann lief nach Etappe 1 ein Rückfall) → **STOPP,
Ausgabe an Claude.**

### 1.2 Laufende Container

```bash
sudo docker compose ps
```

**Erwartet:** `hr-portal-app`, `hr-portal-db` und `hr-portal-gotenberg` laufen (`Up`),
`hr-portal-app` und `hr-portal-db` mit `(healthy)`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo docker inspect --format '{{.Created}} {{.Image}}' hr-portal-app
```

**Erwartet:** Image = **‹E1: volle ID aus 3.3/5.1›**, Erstelldatum **‹E1: 5.1›** (lief Etappe 2:
das Datum des letzten Neuanlegens, S0-Plan 8.2 bzw. nach einer Rücknahme Stufe 2 dessen 8.8, bei
derselben Image-ID). **Die volle ID notieren** — 2.1 und
7.3 vergleichen mit ihr. Andere ID → **STOPP, Ausgabe an Claude.**

```bash
printf 'laufend %s\nlatest  %s\n' "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)" "$(sudo docker image inspect --format '{{.Id}}' hr_portal_credo-app:latest)"
```

**Erwartet:** zweimal dieselbe ID. Weicht ab → **STOPP, Ausgabe an Claude.**

### 1.3 Die Datenbank entspricht dem Schema von `0e1d8de`

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

**Erwartet:** `0`. Bei `2` wurde die Datenbank außerhalb eines Deploys verändert, bei `1` gab es
einen Fehler → **STOPP, Ausgabe an Claude.**

### 1.4 Sicherungsverzeichnis (sonst bricht der Start ab)

Wie im S0-Plan 1.4, Ergebnis wie dort.

```bash
grep -c "backups:/backups" docker-compose.yml
```

**Erwartet:** `2`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo docker exec hr-portal-app sh -c 'echo "DB_BACKUP_DIR=${DB_BACKUP_DIR:-/backups (Standard)}"'
```

**Erwartet:** `DB_BACKUP_DIR=/backups (Standard)`. Weicht ab → **STOPP, Ausgabe an Claude** (sonst
legte der Entrypoint seine Sicherung nicht in `backups/` ab, und 4.5 kopierte still eine ältere).

```bash
stat -c '%a %u %U %n' backups
```

**Erwartet:** Eigentümer `1001` (Etappe 1). Andere Zahl → zuerst Befehl A, dann die Schreibtests.

Befehl A (nur bei Bedarf, schreibt):

```bash
sudo chown 1001 backups
```

**Erwartet:** keine Ausgabe.

Schreibtest der App:

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$PWD/backups:/backups" "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)" -c 'id; touch /backups/.schreibtest && rm /backups/.schreibtest && echo OK'
```

**Erwartet:** `uid=1001(nextjs) gid=65533(nogroup) …` und `OK`. Bleibt `OK` aus → Befehl A,
wiederholen; dann noch immer nicht → **STOPP, Ausgabe an Claude.**

Schreibtest der Datenbank:

```bash
sudo docker exec hr-portal-db sh -c 'touch /backups/.schreibtest-db && rm /backups/.schreibtest-db && echo OK'
```

**Erwartet:** `OK`. Weicht ab → **STOPP, Ausgabe an Claude.**

### 1.5 Freier Platz, Images, Sicherungen

```bash
df -h . "$(sudo docker info --format '{{.DockerRootDir}}')"
```

**Erwartet:** zwei Zeilen unter der Kopfzeile, die erste für den Projektordner, die zweite für
Docker (die Zeile mit `/var/lib/docker` in der Spalte `Mounted on`, deutsch `Eingehängt auf`). Spalte
`Avail` (deutsch `Verf.`): in der zweiten Zeile **mindestens 5 GB frei** — mehr als bei S0, weil
`npm ci` neu läuft und der Zwischenspeicher eine zweite Schicht anlegt (Schätzung); in der ersten
mindestens 1 GB. Weniger → **STOPP, Ausgabe an Claude** — nicht selbst aufräumen (7.1).

```bash
sudo docker image ls
```

**Erwartet:** darin `hr_portal_credo-app   latest   ‹E1: ID kurz›`, `hr-portal-app   0974b7f
64e1319792ff`, `hr-portal-app   b6e1c8a` und — falls noch da — `6124936`, `ae490ba`. Ein Etikett
`hr-portal-app   0e1d8de` gibt es noch nicht (2.1). Nur notieren.

```bash
sudo ls -1 backups | grep -c '^vor-schema-abgleich-'
```

**Erwartet:** eine Zahl. Nur notieren (der Entrypoint behält zehn eigene Sicherungen).

### 1.6 Uploads-Volume finden

```bash
UPLOADS_VOL=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' hr-portal-app)
```

**Erwartet:** keine Ausgabe.

```bash
echo "Volume: $UPLOADS_VOL"
```

**Erwartet:** `Volume: hr_portal_credo_uploads_data`. Leer → **STOPP, Ausgabe an Claude.**

```bash
sudo du -sh "$(sudo docker volume inspect --format '{{.Mountpoint}}' "$UPLOADS_VOL")"
```

**Erwartet:** eine Größe. Notieren.

### 1.7 Datenbank: Stand von S0, Mailtext noch nicht da, Bestand, Merker

**S0 ist da, die Tabelle der Mailtexte noch nicht:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = $$public$$ AND table_name = $$employments$$ AND column_name IN ($$abrechnungskreis$$, $$personalNumber$$)) AS s0_spalten, to_regclass($$public.employments_dokubit_vertrag_key$$) AS s0_index, (SELECT COUNT(1) FROM employments WHERE abrechnungskreis IS NOT NULL OR "personalNumber" IS NOT NULL) AS s0_vertraege, to_regclass($$public.email_log_texte$$) AS mailtext;'
```

**Erwartet:** `2 | employments_dokubit_vertrag_key | <Zahl> |` — `mailtext` **leer**. `s0_vertraege`
ist `0`, solange Etappe 2 nicht lief, sonst die Zahl der verwalteten Verträge (nur notieren; dieser
Plan ist von S0 unabhängig, Abschnitt 8). Steht unter `mailtext` schon `email_log_texte` oder fehlen
die S0-Spalten → **STOPP, Ausgabe an Claude.**

**Bestand** (zählt nur, zeigt keine Namen; 4.1 vergleicht damit, 5.2 mit 4.1):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM employees) AS personen, (SELECT COUNT(1) FROM employments) AS anstellungen, (SELECT COUNT(1) FROM contract_end_processes) AS vertragsende, (SELECT COUNT(1) FROM email_logs) AS versandprotokoll;'
```

**Erwartet:** vier Zahlen. Notieren.

**System-Vorlagen** (sagt die drei Zeilen in 4.3 voraus):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT name, modul, "originalName", "isActive" AS aktiv, left(hash, 12) AS hash_anfang FROM document_templates WHERE "isSystem" ORDER BY modul, "originalName", "createdAt";'
```

**Erwartet:** wie im Protokoll von Etappe 1 (1.7). Kein STOPP: Abweichungen nur notieren — zwei
eingeschaltete Zeilen mit demselben `originalName` lassen den Start „Duplikat …“ melden (4.3).

**Merker und Läufe:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM system_migrations) AS merker, (SELECT COUNT(1) FROM automatische_laeufe) AS laeufe;'
```

**Erwartet:** `13 | 11`. Weicht ab → **STOPP, Ausgabe an Claude.**

**Konten je Rolle** (zeigt keine Namen):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT role::text AS rolle, COUNT(1) AS konten, COUNT(1) FILTER (WHERE "isActive") AS aktiv FROM users GROUP BY 1 ORDER BY 1;'
```

**Erwartet:** wie im Protokoll von Etappe 1 (1.7). Notieren — 5.4 Punkt 9 braucht ein Konto der
Sachbearbeitung, falls es eins gibt.

**Mailvorlagen mit fest eingetippter alter Adresse** (nur Information; sie gehen über die
Weiterleitung, im gespeicherten Text erscheint ein solcher Link als Platzhalter):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT event, "isActive" FROM email_templates WHERE "bodyHtml" LIKE $$%/dashboard%$$ OR "bodyText" LIKE $$%/dashboard%$$ OR subject LIKE $$%/dashboard%$$;'
```

**Erwartet:** voraussichtlich `(0 rows)`. Treffer nur notieren, kein STOPP.

**Webhooks auf die Ereignisse mit geändertem Link:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT event, "isActive" FROM webhook_configs WHERE event IN ($$dokument-ablauf-warnung$$, $$dokument-abgelaufen$$, $$psi-deadline-warning$$, $$contract-end-eskalation$$, $$contract-end-unbearbeitet$$, $$unterlagen-vollstaendig$$, $$unterlagen-frist-verstrichen$$) ORDER BY event;'
```

**Erwartet:** voraussichtlich `(0 rows)`. Ein aktiver Treffer → kein STOPP, an Claude: Ein Abnehmer,
der den Link auswertet (etwa per Muster `/dashboard/contract-end/`), bekäme ab dem Deploy den neuen
Pfad.

**Für die Browserprobe (5.4 Punkt 3) — gab es schon eine Eskalationsmail?**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT status, COUNT(1) AS anzahl, MAX("createdAt") AS zuletzt FROM email_logs WHERE event = $$contract-end-eskalation$$ GROUP BY status;'
```

**Erwartet:** eine Zahl oder `(0 rows)` (die Vorlage hat keinen Standard-Empfänger). Nur notieren.

### 1.8 Automatische Läufe

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT schluessel, aktiv, probelauf, uhrzeit FROM automatische_laeufe ORDER BY uhrzeit, schluessel;"
```

**Erwartet:** `(11 rows)`. **Kein STOPP** — notieren, welche Läufe `aktiv` = `t` haben und um welche
Uhrzeit. Liegt einer davon innerhalb einer halben Stunde um das Zeitfenster, den Termin verschieben.
Die Zeile `wartung` entscheidet über 6.2 (0, Punkt 6).

### 1.9 Umgebung und Adressen vorher (nur lesen)

```bash
sudo grep -c '^N8N_API_KEY=.' .env
```

**Erwartet:** `0` oder `1`, wie im Protokoll von Etappe 1. Nur notieren.

```bash
sudo grep -c '^PERSONALSTAMM_SECRET=.' .env
```

**Erwartet:** `0` (S0 ruhend oder nach S0-Plan 8.8 Stufe 2 zurückgenommen; dann erwartet 5.3 beim
Webhook `500`) oder `1` (Etappe 2 in Betrieb oder nur Stufe 1 zurückgenommen; 5.3 erwartet `401`). Kein
STOPP.

**Wie die Adressen heute antworten** (von außen, ohne Anmeldung):

```bash
for p in /dashboard /vorgaenge /bem /bem/einwilligung/probe; do echo "== $p"; curl -s -o /dev/null -D - "https://hr.fes-credo.de$p" | grep -i -E '^(HTTP|location)' | tr -d '\r'; done
```

**Erwartet** (gemessen am Image `0e1d8de` in der Generalprobe; über Caddy steht `HTTP/2` statt
`HTTP/1.1`):

| Pfad | Antwort |
|---|---|
| `/dashboard` | `307`, `location: /login` |
| `/vorgaenge` | `404` (die Seite gibt es noch nicht) |
| `/bem` | `404` |
| `/bem/einwilligung/probe` | `200` (öffentliche Seite, ohne `location`) |

Die Ziele sind **relativ** (sie beginnen mit `/`), der Browser setzt die Adresse selbst davor. Nur
notieren; 5.3 erwartet dieselbe Form. `curl -w '%{redirect_url}'` zeigt bei relativen Zielen nichts
an — deshalb liest der Befehl die Kopfzeile selbst.

---

## 2 · Sichern, Teil 1 (Portal läuft)

### 2.1 Das laufende Image etikettieren (für den Rückfall)

Der S0-Plan etikettiert das Image von Etappe 1 nicht; ohne Etikett wäre es nach dem Build namenlos.
Das Etikett geht auf genau die ID aus 1.2, nicht auf „das, was gerade läuft“ — so lässt sich die
Zeile auch nach 4.2 gefahrlos wiederholen (schreibt):

```bash
sudo docker tag ‹E1: ID kurz, 12 Zeichen› hr-portal-app:0e1d8de
```

**Erwartet:** keine Ausgabe. `No such image` → **STOPP, Ausgabe an Claude.**

```bash
for t in 0e1d8de 0974b7f; do printf '%-9s %s\n' "$t" "$(sudo docker image inspect --format '{{.Id}}' hr-portal-app:$t 2>/dev/null | grep . || echo fehlt)"; done; printf '%-9s %s\n' laufend "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)"
```

**Erwartet** drei Zeilen: `0e1d8de` mit genau der vollen ID aus 1.2, `0974b7f` mit
`sha256:64e1319792ff…` (nur zur Information — dieses Image taugt für diesen Deploy nicht, 7.1),
`laufend` gleich der Zeile `0e1d8de`. Weicht `0e1d8de` ab oder steht dort `fehlt` → **STOPP, Ausgabe an
Claude.** (Nach 4.2 zeigt `laufend` das neue Image; dann zählt nur die Zeile `0e1d8de`.)

### 2.2 Leseprobe der Uploads

Wie im S0-Plan 2.2, nur mit dem neuen Etikett:

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" hr-portal-app:0e1d8de -c 'set -o pipefail; find /daten -type f | wc -l; tar cf - -C /daten . | wc -c && echo "tar OK"'
```

**Erwartet:** zwei Zahlen (gleich oder mehr als in Etappe 1) und `tar OK`. Fehlt `tar OK` → **STOPP.**
Die Fehlerzeilen nur auf dem Server ansehen, nicht schicken: Sie nennen Dateinamen, und ältere Uploads
tragen den Originalnamen der Datei, oft mit dem Namen einer Person. An Claude geht nur die Ausgabe des
Prüfbefehls darunter.

Prüfbefehl (nur bei fehlendem `tar OK`; liest nur und zählt die Fehlermeldungen ohne Pfade):

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" hr-portal-app:0e1d8de -c 'tar cf - -C /daten . 2>/tmp/f | wc -c >/dev/null; sed "s/.*: //" /tmp/f | sort | uniq -c'
```

**Erwartet:** je Fehlerart eine Zeile mit Anzahl, etwa `2 Permission denied`. Diese Ausgabe an Claude.

### 2.3 Wann die übrigen Sicherungen entstehen

Datenbank und Uploads werden erst in **4.1** gesichert, bei angehaltenem Portal. Die Sicherung des
Entrypoints (`pg_dump` 18) lässt sich nicht in PostgreSQL 16 einspielen; maßgeblich ist die eigene
aus 4.1.

---

## 3 · Holen, bauen und prüfen (Portal läuft)

### 3.1 Code holen

```bash
sudo git fetch origin && sudo git checkout main && sudo git pull
```

**Erwartet:** `Already on 'main'`, dann `Updating ‹E1: Stand aus 1.1›..…` und `Fast-forward` mit einer langen
Dateiliste. Konflikt, `error`, `fatal` oder eine Frage nach Zugangsdaten → **STOPP, Ausgabe an
Claude.** Das Portal läuft weiter.

### 3.2 Was angekommen ist

```bash
sudo git --no-pager log --oneline -6
```

**Erwartet:** oben mit `(HEAD -> main, origin/main, origin/HEAD)` der Merge
`Merge pull request #… from …/ux-umbau` (ggf. mit Doku-Commits darüber). Nur zum Ansehen — geprüft wird
mit den festen Ständen darunter.

```bash
sudo git merge-base --is-ancestor a43aa25cdb6bae53f5ddda3c9a8b303ac422d13c HEAD && echo "a43aa25 enthalten"
```

**Erwartet:** `a43aa25 enthalten`. Fehlt (oder `fatal: Not a valid commit name …`) → **STOPP, Ausgabe an
Claude.**

```bash
sudo git merge-base --is-ancestor 0e1d8de8cf0d5b714c059140b9f2f09552eb00d1 HEAD && echo "0e1d8de enthalten"
```

**Erwartet:** `0e1d8de enthalten`. Fehlt → **STOPP, Ausgabe an Claude.**

Der Code-Stand dieses Deploys ist enthalten — mit vollem Hash, so prüft die Zeile zugleich, dass es
genau dieser Commit ist (ein „Squash and merge“ oder „Rebase and merge“ fiele hier auf):

```bash
sudo git merge-base --is-ancestor 7d595e551b1edb6acbe5509165ce43ebcd4a15ae HEAD && echo "7d595e5 enthalten"
```

**Erwartet:** `7d595e5 enthalten`. Fehlt (oder `fatal: Not a valid commit name …`) → **STOPP,
Ausgabe an Claude.**

Nach `7d595e5` darf nur noch Doku kommen (`docs/`, `CLAUDE.md`, `README.md` — `.dockerignore`
schließt `*.md` im Projektordner aus):

```bash
sudo git diff --quiet 7d595e5 HEAD -- . ':!docs' ':!CLAUDE.md' ':!README.md' && echo "nach 7d595e5 nur Doku"
```

**Erwartet:** `nach 7d595e5 nur Doku`. Fehlt → **STOPP, Ausgabe an Claude.**

```bash
sudo git rev-list --count 0e1d8de..7d595e5
```

**Erwartet:** `71`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git rev-list --count --merges 0e1d8de..7d595e5
```

**Erwartet:** `14`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git diff --numstat 0e1d8de 7d595e5 -- docker-compose.yml Dockerfile entrypoint.sh package.json package-lock.json .env.production.example .dockerignore next.config.ts prisma/schema.prisma prisma/seed-check.js prisma/seed.ts public src/middleware.ts src/instrumentation.ts
```

**Erwartet:** genau diese fünf Zeilen (Tabulatoren; am 19.10.2026 aus dem Repo gerechnet):

```
120	3	package-lock.json
1	0	package.json
21	0	prisma/schema.prisma
2	0	public/robots.txt
22	5	src/middleware.ts
```

Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git diff -U0 0e1d8de 7d595e5 -- package.json | grep '^[-+] '
```

**Erwartet:** genau `+    "jest-axe": "^11.0.0",` (nur eine Entwicklungsabhängigkeit). Weicht ab →
**STOPP, Ausgabe an Claude.**

```bash
sudo git status --short
```

**Erwartet:** wie in 1.1, nur Zeilen `?? backups/…`. Weicht ab → **STOPP, Ausgabe an Claude.**

> **Die Ausgaben von 3.2 an Claude schicken**, nicht nur „bestanden“ melden.

### 3.3 Image bauen (das Portal läuft weiter)

```bash
sudo docker compose build app
```

**Erwartet:** Der Build endet ohne `ERROR`. **Anders als bei S0 läuft `RUN npm ci --ignore-scripts`
neu** (nicht `CACHED`), weil sich `package-lock.json` geändert hat — mit `npm warn deprecated …` und
einer Zeile `… vulnerabilities (…)` samt Rat `npm audit fix` (nicht ausführen). Dauer in der
Generalprobe (Entwicklerrechner, ohne Zwischenspeicher): `npm ci` knapp 1 Minute, der ganze Build gut
7 Minuten; das Image ist mit 909 MB 2 MB größer als `0e1d8de`. Auf dem Server nicht gemessen.
`npx --yes esbuild@0.24` und `npm install -g prisma@6.9.0` laufen wie immer neu. In
jedem Fall `⚠ Compiled with warnings` (`jose`, Edge Runtime), danach `✓ Compiled successfully …`, dazu
ESLint-Warnungen (`react-hooks/exhaustive-deps`).

**STOPP, Ausgabe an Claude** nur bei `ERROR` oder einer Netzwerk-Meldung (`ETIMEDOUT`, `ENOTFOUND`,
`ECONNRESET`, `registry.npmjs.org`). **Ausnahme ohne STOPP:** „An error occurred in `next/font`“ —
einmal wiederholen, erst beim zweiten Mal STOPP. Am Ende die letzten Zeilen an Claude.

```bash
sudo docker image inspect --format '{{.Id}} {{.Created}}' hr_portal_credo-app:latest
```

**Erwartet:** eine ID, die **nicht** die aus 1.2 ist, und eine Erstellzeit von heute (UTC). **Die
volle ID notieren** (5.1, 9). Noch die alte ID → **STOPP, Ausgabe an Claude.**

Ab hier gilt das Verbot aus der Grundregel: kein `docker compose up`, bis 4.2 an der Reihe ist.

**Wird der Deploy nach dem Build abgebrochen oder vertagt** (STOPP in 3.3 nach einem erfolgreichen
Build, in 3.4 oder in 4.1 nach Befehl B) und geht es nicht noch heute weiter: zuerst den zweiten Befehl
aus 2.1 wiederholen. Nur wenn dort `laufend` gleich der Zeile `0e1d8de` ist, das Etikett zurücksetzen.
Sonst **kein Befehl F**, nichts anhalten, sofort **STOPP, Ausgabe an Claude** — dann läuft bereits das
neue Image (ein verbotenes `up`); 4.3, 4.5 und 5.2 holt Claude mit nach.

Befehl F (schreibt; nur zwischen 3.3 und 4.2, **nie nach 4.2**):

```bash
sudo docker tag hr-portal-app:0e1d8de hr_portal_credo-app:latest
```

**Erwartet:** keine Ausgabe. Danach den `printf`-Befehl aus 1.2 wiederholen: zweimal dieselbe ID, die
aus 1.2. Weicht ab → **STOPP, Ausgabe an Claude.** Das neue Image steht dann ohne Namen da (`<none>`) —
nicht löschen. Befehl F schützt nur vor `up -d` ohne `--build`; der Projektordner steht seit 3.1 auf
dem neuen Code, deshalb gilt das Verbot aus der Grundregel weiter. Geht es später weiter, beginnt der
Deploy mit Claude neu: erst 1.2 bis 1.9 (ohne die beiden Code-Stand-Zeilen aus 1.1, die am neuen
Code-Stand anhielten, aber mit „kein Override“), dann 3.3 — Bestand, Läufe und Platz sind sonst vom
Vortag. Nach 4.2 legte ein `up` nach Befehl F das alte Image an, und dessen
Entrypoint verwürfe `email_log_texte` (7.1) — deshalb dort nie.

### 3.4 Vorschau: Was `db push` gleich tun wird (nur lesend)

Startet das **neue** Image einmal kurz ohne Entrypoint und vergleicht seine Schema-Datei mit der
laufenden Datenbank. Schreibt nichts in die Datenbank.

```bash
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > ~/deploy-ux-umbau/vorschau-delta.sql
```

**Erwartet:** keine Ausgabe oder nur harmlose Hinweise (Kasten „Update available …“, `npm notice`).
Eine Fehlermeldung → **STOPP, Ausgabe an Claude.**

```bash
for m in 'ADD COLUMN' 'ADD VALUE' 'CREATE TABLE' 'INDEX' 'ADD CONSTRAINT'; do printf '%-15s %s\n' "$m" "$(grep -c "$m" ~/deploy-ux-umbau/vorschau-delta.sql)"; done
```

**Erwartet** (gemessen in der Generalprobe):

```
ADD COLUMN      0
ADD VALUE       0
CREATE TABLE    1
INDEX           0
ADD CONSTRAINT  1
```

```bash
grep -nE 'DROP|RENAME|ALTER COLUMN .* TYPE|SET NOT NULL' ~/deploy-ux-umbau/vorschau-delta.sql || echo "keine DROP/RENAME/TYPE-Zeile"
```

**Erwartet:** `keine DROP/RENAME/TYPE-Zeile`. Ein `DROP` deutete auf eine Abweichung der
Produktionsdatenbank vom Schema `0e1d8de` hin → **STOPP.**

```bash
grep -v -E '^--|^$' ~/deploy-ux-umbau/vorschau-delta.sql
```

**Erwartet:** genau diese acht Zeilen, sonst nichts (Leerzeichen dürfen anders aussehen):

```
CREATE TABLE "email_log_texte" (
    "emailLogId" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "gekuerzt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_log_texte_pkey" PRIMARY KEY ("emailLogId")
);
ALTER TABLE "email_log_texte" ADD CONSTRAINT "email_log_texte_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "email_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Weicht eine Zahl oder Zeile in 3.4 ab → **STOPP, nicht starten, Ausgabe an Claude** (dazu die Datei
`~/deploy-ux-umbau/vorschau-delta.sql`). Das Portal läuft noch mit dem alten Container. Bis zur
Antwort kein `docker compose up` (auch nicht `up -d --build`); wird abgebrochen, Befehl F unter den
Bedingungen in 3.3.

---

## 4 · Anhalten, sichern, starten

Ablauf wie bei S0 in Einzelschritten; `sudo docker compose up -d --build` ist **nicht** zu empfehlen
(ohne 4.1 fehlten die eigenen Sicherungen).

### 4.1 Portal anhalten und sichern (Sichern, Teil 2)

```bash
sudo docker compose stop app
```

**Erwartet:** `Container hr-portal-app  Stopped`. **Ab hier ist das Portal nicht erreichbar.**

Bestand bei angehaltenem Portal (derselbe Zählbefehl wie in 1.7):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM employees) AS personen, (SELECT COUNT(1) FROM employments) AS anstellungen, (SELECT COUNT(1) FROM contract_end_processes) AS vertragsende, (SELECT COUNT(1) FROM email_logs) AS versandprotokoll;'
```

**Erwartet:** `personen`, `anstellungen`, `vertragsende` gleich oder etwas mehr als in 1.7; weniger →
**STOPP:** Befehl B, dann Ausgabe an Claude.
`versandprotokoll` darf größer sein (seit 1.7 können Mails hinausgegangen sein) und auch kleiner:
Einträge älter als 90 Tage löschen der Lauf „Wartung“ und das Öffnen des Versandprotokolls (höchstens
einmal am Tag) — kein STOPP. **Notieren** — 5.2 vergleicht mit genau diesen Zahlen. Eine Fehlermeldung
→ **STOPP:** Befehl B, dann Ausgabe an Claude.

Datenbank (aus dem DB-Container, `pg_dump` 16; schreibt):

```bash
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-deploy-ux-umbau-manuell.sql'
```

**Erwartet:** keine Ausgabe.

```bash
sudo ls -l backups/vor-deploy-ux-umbau-manuell.sql
```

**Erwartet:** etwa so groß wie `vor-deploy-selfservice-s0-manuell.sql` oder größer (Etappe 1:
‹E1: Bytes›).

```bash
sudo grep -c 'PostgreSQL database dump complete' backups/vor-deploy-ux-umbau-manuell.sql
```

**Erwartet:** `1`.

Uploads (mit dem alten Image als `nextjs`, das Volume nur lesend; die erste Zeile setzt den
Volume-Namen noch einmal):

```bash
UPLOADS_VOL=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' hr-portal-app)
```

**Erwartet:** keine Ausgabe.

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" -v "$PWD/backups:/sicherung" hr-portal-app:0e1d8de -c 'tar czf /sicherung/uploads-vor-deploy-ux-umbau.tar.gz -C /daten . && echo "tar OK"'
```

**Erwartet:** `tar OK`.

```bash
sudo ls -l backups/uploads-vor-deploy-ux-umbau.tar.gz
```

**Erwartet:** etwa so groß wie das Archiv von Etappe 1.

```bash
sudo tar tzf backups/uploads-vor-deploy-ux-umbau.tar.gz | wc -l
```

**Erwartet:** eine Zahl größer als 1 (etwa Dateien plus Ordner aus 2.2).

Das Archiv enthält Personalunterlagen — **auf dem Server lassen**, nicht herunterladen.

**Weicht etwas ab** (Datenbank-Sicherung deutlich kleiner als die von Etappe 1, `grep` zeigt `0`,
kein `tar OK`, Zeilenzahl 0 oder 1 oder eine Fehlermeldung von `tar tzf`) → **STOPP:** Befehl B, dann
Ausgabe an Claude. Bei fehlendem `tar OK` die Fehlerzeilen nur auf dem Server ansehen und an Claude nur
die Ausgabe des Prüfbefehls aus 2.2 schicken (er liest nur).

Befehl B (startet den angehaltenen alten Container wieder; nur bei STOPP zwischen dem Anhalten oben
und 4.2 — ab 4.2 nie, in 7.3 nur, wo es dort steht):

```bash
sudo docker compose start app
```

**Erwartet:** `Container hr-portal-app  Started`.

### 4.2 Starten

```bash
sudo docker compose up -d
```

**Erwartet:** `hr-portal-app` wird neu angelegt (`Recreate`/`Recreated`, dann `Started`; am 14.10.
stand nur `Started` — auch in Ordnung), `hr-portal-db` und `hr-portal-gotenberg` laufen weiter. Weicht
ab (etwa eine Fehlermeldung) → **STOPP, Ausgabe an Claude**, aber gleich mit dem nächsten Befehl das
Startlog ansehen: Maßgeblich sind das Log (unten) und die Image-ID in 5.1.

```bash
sudo docker compose logs -f app
```

Warten, bis `✓ Ready in …` **und** eine Zeile `[Zeitplaner] …` erschienen sind, dann `Strg+C` (beendet
nur die Anzeige). Erscheint nach 3 Minuten kein `✓ Ready`: `Strg+C`, weiter mit 4.4. **Nicht die 3
Minuten abwarten**, wenn nach `Datenbank-Schema wird synchronisiert...` statt `🚀  Your database is now
in sync …` eine Fehlermeldung von Prisma steht oder danach `CREDO HR-Portal startet...` ein zweites Mal
erscheint: Der Push ist gescheitert, der Container startet in Schleife neu. Dann sofort `Strg+C` und
Befehl D (4.4), dann an Claude. Steht stattdessen eine Zeile `FATAL: …` vor dem Neustart, gilt ihre
Zeile in 4.4 (kein Befehl D).

**Weiter erst, wenn das Log `Schema-Unterschied erkannt …` und eine `Sicherung abgelegt: …` von heute
zeigt** — nicht nur, weil der Container `healthy` ist. Steht `… bereits deckungsgleich …`, läuft noch
das alte Image (4.4). Steht statt `Schema-Unterschied erkannt …` die Zeile `Schema-Vergleich nicht
moeglich …`, gilt ihre Zeile in 4.4.

### 4.3 Was im Log stehen muss

In dieser Reihenfolge (gemessen in der Generalprobe — bis auf die Zeitplaner-Zeile, die dort mit
ausgeschalteter Uhr „Uhr aus“ hieß und auf dem Server am 14.10. so stand; `…` steht für Zahlen und
Namen):

```
CREDO HR-Portal startet...
Umgebungsvariablen geprueft: OK
Schema-Unterschied erkannt — Sicherung wird angelegt...
Sicherung abgelegt: /backups/vor-schema-abgleich-JJJJMMTT-HHMMSS.sql (… Bytes)
Datenbank-Schema wird synchronisiert...
🚀  Your database is now in sync with your Prisma schema. Done in …
Datenbank-Schema synchronisiert.
Pruefe ob Seed notwendig...
System-Vorlage (Aufforderung erweitertes Führungszeugnis) ist aktuell.
System-Vorlage (Übergabeprotokoll Ausstattung) ist aktuell.
System-Vorlage (Rückgabeprotokoll Ausstattung) ist aktuell.
Datenbank bereits geseeded (… User vorhanden). Seed uebersprungen.
Next.js Server startet auf Port 3000...
[Zeitplaner] Uhr gestartet (jede Minute).
 ✓ Ready in …
```

- **Dazwischen dürfen stehen:** Zeilen von Prisma (`Prisma schema loaded …`, `Datasource "db" …`, ein
  Kasten „Update available …“), Leerzeilen, Zeilen von Next.js (`▲ Next.js …`, `- Local: …`,
  `- Network: …`, `✓ Starting...`) und `Alte Sicherung entfernt: …`. Die Zeitplaner-Zeile kann auch
  nach `✓ Ready` stehen.
- **Keine Warnung von `--accept-data-loss`** (anders als bei S0): Eine Zeile `⚠️  There might be data
  loss …` oder ein Punkt `•` darunter → Ausgabe an Claude, den Container dabei **nicht** anhalten.
- **Keine Migrationszeile:** eine Zeile mit `_V1`, `Migration`, `Vertragsende-Label`,
  `parallele Spuren`, `Abteilungsaufgaben`, `Masernschutz`, `Kostenstellen`, `Betriebsnummer`,
  `MINIJOB`, `currentStep` oder `Katalog` → Ausgabe an Claude.
- **System-Vorlagen:** dreimal `ist aktuell`. Alles andere (`aktualisiert`, `angelegt`, `Duplikat …`)
  → Ausgabe an Claude (das Portal läuft trotzdem).
- **`Keine User gefunden — Seed wird ausgefuehrt...`** darf nie erscheinen → sofort an Claude, **dann
  `start-log.txt` weder schicken noch ins Protokoll übernehmen** (der Seed schreibt das neue
  Admin-Passwort ins Log).

Log sichern:

```bash
sudo docker compose logs --no-log-prefix app > ~/deploy-ux-umbau/start-log.txt
```

**Erwartet:** keine Ausgabe.

```bash
grep -c -E 'data loss|•' ~/deploy-ux-umbau/start-log.txt
```

**Erwartet:** `0`. Eine größere Zahl → Ausgabe an Claude (Container nicht anhalten).

Die wichtigen Zeilen herausziehen:

```bash
sudo docker compose logs --no-log-prefix app | grep -E 'Schema|Sicherung|synchron|in sync|Seed|System-Vorlage|Zeitplaner|Ready|FATAL|Fehler|fehlgeschlagen|data loss|Migration|_V1'
```

**Erwartet:** genau die Zeilen der Liste oben ab `Schema-Unterschied …` ohne `Next.js Server
startet …` (eine zusätzliche `Alte Sicherung entfernt: …` ist in Ordnung). Jede andere Zeile mit
`_V1`, `FATAL`, `Fehler`, `fehlgeschlagen`, `Migration` oder `data loss` → Ausgabe an Claude. Die Zeile
`Schema-Vergleich nicht moeglich …` an Stelle von `Schema-Unterschied erkannt …` → Zeile in 4.4.

> **`start-log.txt` an Claude schicken** (enthält keine Geheimnisse — einzige Ausnahme ist die
> Seed-Zeile oben).

### 4.4 Fehlschlag erkennen

| Zeichen im Log | Bedeutung | Sofort |
|---|---|---|
| `Datenbank-Schema ist bereits deckungsgleich — kein Abgleich noetig.` beim **ersten** Start | Es läuft noch das alte Image. Datenbank unverändert | Befehl C, dann Ausgabe und `start-log.txt` an Claude |
| `Schema-Vergleich nicht moeglich (Status …) — Sicherung vorsichtshalber.` statt `Schema-Unterschied erkannt …` | `prisma migrate diff` konnte beim Start nicht vergleichen; der Entrypoint sichert und pusht trotzdem — mit demselben Image gegen dieselbe Datenbank wie in 3.4 | Solange keine Neustart-Schleife entsteht, nicht eingreifen: Log sichern (4.3), 4.5 ausführen, dann an Claude; weiter mit Abschnitt 5 erst nach der Antwort. Folgt `FATAL: …` oder eine Neustart-Schleife, gilt deren Zeile (bei der Schleife sofort Befehl D) |
| `FATAL: Sicherungsverzeichnis /backups fehlt.` | Einhängung fehlt. Datenbank unverändert | an Claude |
| `FATAL: Sicherung nach … fehlgeschlagen.` | Rechte auf `backups/`. Datenbank unverändert | Befehl A aus 1.4; der Container startet von selbst neu. Wurde schon Befehl D ausgeführt: nach Befehl A nichts starten, an Claude |
| Prisma-Fehlermeldung statt `Datenbank-Schema synchronisiert.` (etwa `relation "email_log_texte" already exists`), danach `CREDO HR-Portal startet...` erneut oder `docker compose ps` zeigt `Restarting` | Push gescheitert, Neustart-Schleife | **sofort** Befehl D, dann an Claude — kein Befehl B |
| `Duplikat der System-Vorlage …` | mehrere eingeschaltete Zeilen; das Portal läuft | an Claude |
| `Seed-Check Fehler:` oder `Seed-Check fehlgeschlagen (nicht kritisch).` | das Portal startet trotzdem | an Claude mit `start-log.txt` |
| `[Zeitplaner] Uhr aus (ZEITPLANER_AKTIV).` | in der `.env` steht `ZEITPLANER_AKTIV=false` | an Claude |
| `[Zeitplaner] Takt fehlgeschlagen: …` | die Uhr erreicht das Portal nicht | an Claude |
| Kein `✓ Ready`, oder 5.1 meldet einen Fehler | die App startet nicht | an Claude mit `start-log.txt` |

Befehl C (zeigt, welches Image der Dienst nutzt):

```bash
sudo docker compose images app
```

**Erwartet:** eine Tabelle mit einer Zeile für `hr-portal-app`; die Ausgabe an Claude schicken.

Befehl D (hält die Neustart-Schleife an):

```bash
sudo docker compose stop app
```

**Erwartet:** `Container hr-portal-app  Stopped`.

### 4.5 Die Sicherung des Entrypoints aus der Rotation nehmen

```bash
sudo sh -c 'cd /vol/container/HR_Portal_CREDO/backups && cp -p "$(ls -1t | grep "^vor-schema-abgleich-" | head -1)" vor-deploy-ux-umbau-entrypoint.sql'
```

**Erwartet:** keine Ausgabe.

```bash
sudo ls -l backups/vor-deploy-ux-umbau-manuell.sql backups/vor-deploy-ux-umbau-entrypoint.sql backups/uploads-vor-deploy-ux-umbau.tar.gz
```

**Erwartet:** drei Dateien; die beiden `.sql` fast gleich groß. Weicht ab → Ausgabe an Claude (das
Portal läuft weiter).

---

## 5 · Nachher prüfen

### 5.1 Health

```bash
sudo docker compose ps
```

**Erwartet:** `hr-portal-app` mit `(healthy)` — nach gut einer Minute. Nach zwei Minuten noch nicht →
**STOPP, Ausgabe an Claude.**

```bash
sudo docker exec hr-portal-app curl -s http://localhost:3000/api/health
```

**Erwartet:** `{"status":"ok","timestamp":"…","zeitplaner":{"uhrAktiv":true,"letzterTakt":…}}`
(`letzterTakt` nach einer Minute gesetzt; `uhrAktiv` aus dem Code und vom 14.10., nicht in der
Generalprobe gemessen). `"status":"error"` oder `"uhrAktiv":false` → **STOPP, Ausgabe an Claude.**

```bash
curl -s https://hr.fes-credo.de/api/health
```

**Erwartet:** dasselbe von außen. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo docker inspect --format '{{.Created}} {{.Image}}' hr-portal-app
```

**Erwartet:** Erstelldatum von heute (UTC) und genau die volle Image-ID aus 3.3. **Beides notieren.**
Noch die ID aus 1.2 → **STOPP, Ausgabe an Claude.**

HR bekommt noch **keinen** Bescheid — erst in 5.5.

### 5.2 Datenbank

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

**Erwartet:** `0`. Weicht ab → Ausgabe an Claude.

**Die Tabelle der Mailtexte ist da, mit Löschregel Cascade; S0 unverändert:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT to_regclass($$public.email_log_texte$$) AS mailtext, (SELECT COUNT(1) FROM email_log_texte) AS texte, (SELECT confdeltype FROM pg_constraint WHERE conname = $$email_log_texte_emailLogId_fkey$$) AS loeschregel, to_regclass($$public.employments_dokubit_vertrag_key$$) AS s0_index;'
```

**Erwartet:** `email_log_texte | 0 | c | employments_dokubit_vertrag_key` (`texte` kann schon größer 0
sein, wenn seit dem Start eine Mail hinausging; `c` = Cascade). Weicht ab → Ausgabe an Claude.

**Bestand unverändert** (derselbe Zählbefehl wie in 1.7 und 4.1):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM employees) AS personen, (SELECT COUNT(1) FROM employments) AS anstellungen, (SELECT COUNT(1) FROM contract_end_processes) AS vertragsende, (SELECT COUNT(1) FROM email_logs) AS versandprotokoll;'
```

**Erwartet:** `personen`, `anstellungen`, `vertragsende` genau wie in **4.1**; weniger → **sofort an
Claude** (das Portal läuft weiter). `versandprotokoll` meist gleich oder größer; kleiner nur, wenn seit
dem Start jemand das Versandprotokoll geöffnet hat (der neue Prozess räumt beim ersten Öffnen Einträge
älter als 90 Tage ab; „Wartung“ läuft in diesem Zeitfenster nicht, 1.8). Nur notieren.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM system_migrations) AS merker, (SELECT COUNT(1) FROM automatische_laeufe) AS laeufe, (SELECT COUNT(1) FROM automatische_laeufe WHERE aktiv) AS aktiv;'
```

**Erwartet:** `13 | 11 | <Zahl aus 1.8>`. Weicht ab → Ausgabe an Claude.

### 5.3 Adressen und Weiterleitung

Von außen, ohne Anmeldung (schreibt nichts):

```bash
for p in /dashboard '/dashboard?tab=contract-end' /dashboard/bem '/dashboard/contract-end/00000000-0000-0000-0000-000000000000?tab=dokumente' /vorgaenge /bem/einwilligung/probe; do echo "== $p"; curl -s -o /dev/null -D - "https://hr.fes-credo.de$p" | grep -i -E '^(HTTP|location)' | tr -d '\r'; done
```

**Erwartet** (gemessen am Image `7d595e5` in der Generalprobe, mit den Kopfzeilen, die Caddy
weiterreicht; über Caddy steht `HTTP/2` statt `HTTP/1.1`):

| Pfad | Antwort |
|---|---|
| `/dashboard` | `308`, `location: /vorgaenge` |
| `/dashboard?tab=contract-end` | `308`, `location: /vorgaenge/vertragsende` |
| `/dashboard/bem` | `308`, `location: /bem` |
| `/dashboard/contract-end/0000…?tab=dokumente` | `308`, `location: /vorgaenge/vertragsende/0000…?tab=dokumente` |
| `/vorgaenge` | `307`, `location: /login` |
| `/bem/einwilligung/probe` | `200` (öffentliche Seite, ohne `location`) |

**Die Ziele sind relativ wie in 1.9.** Steht dort eine volle Adresse (`http://…`, ein interner Host,
`0.0.0.0`, `localhost`) oder fehlt bei den ersten vier Pfaden die `308` → an Claude (das Portal läuft
weiter).

Welche Kopfzeilen die Weiterleitung trägt (für 0, Punkt 3, und 10, Punkt 3; nur notieren):

```bash
curl -s -D - -o /dev/null https://hr.fes-credo.de/dashboard | grep -i -E '^(HTTP|location|cache-control|strict-transport-security|content-security-policy)' | cut -c1-90
```

**Erwartet:** `HTTP/2 308` und `location: /vorgaenge`. Das Portal selbst setzt an der Weiterleitung
**keine** `cache-control`, `strict-transport-security` oder `content-security-policy` (gemessen —
die Middleware leitet um, bevor sie die Sicherheitsköpfe setzt). Steht hier eine
`strict-transport-security`-Zeile, kommt sie von Caddy. Nur notieren, welche Zeilen erscheinen.

```bash
curl -s https://hr.fes-credo.de/robots.txt | grep -c -E '^Disallow: /(vorgaenge|bem)/$'
```

**Erwartet:** `2`. Weicht ab → an Claude (das Portal läuft weiter).

Die Schnittstellen für n8n werden nicht umgeleitet:

```bash
curl -s -w '\nHTTP %{http_code}\n' -X POST https://hr.fes-credo.de/api/webhooks/personalstamm
```

**Erwartet:** bei `PERSONALSTAMM_SECRET` = `0` (1.9) `{"error":"Konfigurationsfehler"}` mit
`HTTP 500`, bei `1` `{"error":"Nicht autorisiert"}` mit `HTTP 401`. `HTTP 404` oder `308` → an Claude.

### 5.4 Probe im Browser

Mit dem eigenen Konto (SUPER_ADMIN oder HR-Leitung), **keine Testdaten anlegen**. Vorab alle offenen
Portal-Tabs neu laden. Abweichungen sind kein Grund, das Portal anzuhalten: an Claude
(Bildschirmfotos nur ohne Namen und Adressen).

1. **Anmelden.** **Erwartet:** Ziel `…/vorgaenge/onboarding`; Kopf mit Vorgänge · Personen · BEM
   (Schloss-Symbol) · Vorlagen ▾ · Verwaltung ▾, nur „Vorgänge“ markiert; rechts Name und
   „Administration“ bzw. „HR-Leitung“; darunter die Modul-Reiter, „Onboarding“ markiert.
2. **Alte Lesezeichen eintippen:** `…/dashboard?tab=contract-end` und `…/dashboard/bem`.
   **Erwartet:** `…/vorgaenge/vertragsende` mit Reiter „Vertragsende“ bzw. `…/bem` mit nur „BEM“
   markiert. „Vorlagen“ öffnet per Klick, Escape schließt.
3. **Vertragsende, alte Ansicht über einen alten Link:** Gab es laut 1.7 eine Eskalationsmail, deren
   Verweis im HR-Postfach öffnen; sonst einen laufenden Vorgang öffnen und in der Adresse
   `/vorgaenge/vertragsende/` durch `/dashboard/contract-end/` ersetzen. **Erwartet:**
   `…/vorgaenge/vertragsende/<Kennung>`, derselbe Vorgang, Zeile „Für diese Seite gibt es eine neue
   Ansicht.“ mit „Neue Ansicht ausprobieren“, darunter die bisherige Ansicht wie vorher.
4. **„Neue Ansicht ausprobieren“.** **Erwartet:** die Seite lädt neu, „Neue Ansicht (Vorschau).“ mit
   „Zur bisherigen Ansicht“ und „Rückmeldung geben“; Pfad „Vorgänge › Vertragsende › …“, eine
   Statuspille, Prozessleiste, „Jetzt dran …“; Reiter Übersicht · Vertragsdaten · Dokumente · E-Mails.
   **Nicht** „Erinnerung senden“ klicken (verschickt sofort).
5. **Nebeneinander:** denselben Vorgang in einem privaten Fenster öffnen (dort neu anmelden).
   **Erwartet:** dort die alte Ansicht, dieselben Fakten (Status, Vertragsende, Führungskraft,
   „Anfrage vom“, Erinnerungen, Dokumente); die Tage bis zum Vertragsende dürfen um 1 abweichen (die
   alte Ansicht rechnet in UTC), der Text der Statuspille weicht vom Text der Liste ab (gewollt bis U3).
6. **Neue Ansicht bedienen:** Reiter wechseln — die Adresse trägt `?tab=…`. Das „…“-Menü öffnen, einen
   Punkt mit „…“ wählen (etwa „Vorgang stornieren …“ — das öffnet nur den Dialog). **Erwartet:** Dialog
   mit dem Fokus auf „Abbrechen“; „Abbrechen“ bzw. Escape schließt, der Fokus steht wieder auf „…“.
   **Nichts bestätigen, nur „Abbrechen“ oder Escape** (nicht „Stornieren“).
7. **„Zur bisherigen Ansicht“.** **Erwartet:** die alte Ansicht, auch nach erneutem Laden.
8. **Mailtext:** Reiter „E-Mails“ eines Vertragsende-Vorgangs (wie in Punkt 4; in einem Onboarding
   nichts in der Übersicht anklicken — „Vorgesetzten-Link erstellen“, „Generieren“, „Neuen Link
   erzeugen“ und „Als geprüft markieren“ handeln sofort). **Erwartet:** an keiner Zeile von vor dem
   Deploy ein Knopf „Text ansehen“; darunter steht kursiv, warum es keinen Text gibt: bei zugestellten
   Mails und bei nicht zugestellten mit Betreff „Kein Text gespeichert: Die Mail ging vor Einführung der
   Textspeicherung hinaus …“, bei übersprungenen „Kein Text: Die Mail wurde nicht erzeugt.“, bei nicht
   zugestellten ohne Betreff „Kein Text: Die Mail wurde nicht erzeugt (Fehler vor dem Versand).“ Unter
   Einstellungen → Versandprotokoll stehen dieselben Sätze, aber erst nach dem Aufklappen einer Zeile;
   dort dazu bei BEM-Mails „Aus Datenschutzgründen …“ und beim Test-Versand „Test-Versand: …“. Den
   Knopf „Text ansehen“ prüft 6.1 am Folgetag (es braucht eine Mail nach dem Deploy).
9. **Rollen:** Gibt es laut 1.7 ein aktives Konto der Sachbearbeitung, schaut die Person mit ihrem
   eigenen Konto. **Erwartet:** Vorgänge · Personen · BEM · Vorlagen (darin nur „Brief-Vorlagen“), kein
   „Verwaltung“, Rolle „HR-Sachbearbeitung“. Als SUPER_ADMIN öffnet `…/ui-muster` die Musterseite
   (kein Punkt markiert); für andere Rollen leitet sie auf `…/vorgaenge/onboarding` um.
10. **Abmelden.** **Erwartet:** Anmeldeseite ohne Kopf; „Zurück“ im Browser führt zur Anmeldung; nach
    erneutem Anmelden ist der Kopf sofort da.

**Nicht klicken — verschickt Mails oder ändert Vorgänge** (in der neuen UND in der bisherigen Ansicht).
Einen Dialog nur mit „Abbrechen“ oder Escape schließen, eine Rückfrage des Browsers nur mit
„Abbrechen“, nie mit „OK“.

*Verschickt sofort, ohne Rückfrage:*

- „Erinnerung senden“ (beide Ansichten)
- bisherige Ansicht: „Anfrage erneut senden“ (neuer Link, der bisherige wird ungültig) und „Anfrage an
  Vorgesetzten senden →“

*Ändert den Vorgang sofort, ohne Rückfrage:*

- bisherige Ansicht, Karte „Mitarbeitervertretung (MAV)“: „Nicht erforderlich“, „Angehört“,
  „Zugestimmt“, „Widerspruch“
- Reiter Dokumente, Karte „Dokumente erstellen“: „Word“ und „PDF“ (legt ein Dokument im Portal ab und
  lädt es herunter). Unbedenklich sind „Word“ und „PDF“ unter „Für diesen Vorgang bereits erstellt“
  (nur Download).

*Öffnet eine Rückfrage — öffnen darf man, bestätigen nicht:*

- neue Ansicht (Knopf → bestätigender Knopf im Dialog): „Anfrage senden …“ → „Anfrage senden“;
  „Anfrage neu senden …“ → „Anfrage neu senden“; „Offboarding anlegen …“, „Ohne Anfrage: Offboarding
  anlegen …“ und „Ohne Rückmeldung: Offboarding anlegen …“ → „Offboarding anlegen“ (legt einen
  Offboarding-Vorgang an, meldet `offboarding-created` an Mail und Webhooks); „Unterschriebenen Vertrag
  erfassen …“ → „Vertrag erfassen“; „Abschließen …“ → „Abschließen“; „Vorgang stornieren …“ →
  „Stornieren“; „Stand setzen …“ → „Stand speichern“
- bisherige Ansicht, Rückfrage des Browsers (dort führt „OK“ aus): „Offboarding anlegen →“, „Direkt
  Nicht-Übernahme (Offboarding) →“ (beide legen ein Offboarding an), „Unterschriebenen Vertrag
  erfassen“, „Vorgang abschließen“
- Reiter Dokumente (beide Ansichten): „Dokumente versenden…“ bzw. „Erneut versenden…“ → „Versenden“;
  „E-Mail schreiben…“ → „E-Mail senden“
- andere Seiten: „+ Neuer Vorgang“, „Abteilungen informieren…“, „Unterlagen nachfordern…“, „Vorgang
  abschließen“ (Onboarding), „Austritt abschließen“, „Jetzt ausführen“ (Automatische Läufe)

*Faustregel:* Unbedenklich sind nur Reiter, Verweise („Zu den Dokumenten“, „Zum Offboarding …“,
„Offboarding öffnen“), „Text ansehen“, „Aktualisieren“ und der Ansicht-Schalter. „Rückmeldung geben“
öffnet nur einen Mailentwurf — nicht absenden. Dazu, was die Punkte 1 bis 10 ausdrücklich verlangen:
Menüs öffnen („Vorlagen“, „…“), einen Punkt mit „…“ wählen (im Dialog nur „Abbrechen“), eine Zeile im
Versandprotokoll aufklappen, „Abmelden“. Alles andere nicht anklicken, insbesondere nichts mit senden,
erinnern, informieren, anlegen, erfassen, markieren, speichern, abschließen oder stornieren.

### 5.5 HR Bescheid geben

Erst den kurzen Bescheid:

„Das Portal läuft wieder. Bitte laden Sie Portal-Seiten, die bei Ihnen noch offen sind, einmal neu
(Taste F5) — sonst zeigen sie noch den alten Stand. Der Kopf sieht neu aus, und die Adressen der
Vorgänge haben sich geändert — Ihre Lesezeichen und die Links in älteren Mails funktionieren weiter.
Was sonst neu ist, steht in der Mail, die gleich folgt.“

Zeigte 1.8 `wartung` nicht mit `aktiv` = `t` und `probelauf` = `f` (6.2 folgt gleich), dazu: „Gleich kommt noch eine Berichtsmail
des Laufs „Wartung“ (nur Zahlen) — sie gehört zum Update.“

Dann die Ankündigung aus [`pilot-ankuendigung.md`](../module/ux-ui/pilot-ankuendigung.md) (Stand
19.10.2026, Datum der zwei Wochen eingesetzt, 0, Punkt 4) an das Personalbüro, mit den beiden Bildern
aus ihrer Checkliste (Kopf `u1-kopf-1440.png`, dazu ein Pilot-Bild aus `screenshots/pilot/`, auf die
Prozessleiste zugeschnitten). Das Versanddatum gehört ins Protokoll.

---

## 6 · Nach dem Deploy

### 6.1 Folgetag: Mailtext

Am Tag nach dem Deploy (es müssen Mails hinausgegangen sein; sonst später). Liest nur.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM email_log_texte) AS texte, (SELECT COUNT(1) FROM email_log_texte t JOIN email_logs l ON l.id = t."emailLogId" WHERE l.status = $$SKIPPED$$ OR l."isTest" OR l.event LIKE $$bem-%$$) AS darf_nicht;'
```

**Erwartet:** `texte` größer 0, `darf_nicht` = `0`. `darf_nicht` größer 0 → an Claude (Zusage an den
DSB).

Kein persönlicher Link im gespeicherten Text (Wächter für die Ersetzung am fertigen HTML unter den
Bedingungen der Produktion — `APP_URL`, Link-Basis der Routen, echte Vorlagen):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT COUNT(1) AS kennung_offen FROM email_log_texte WHERE "bodyHtml" ~ $$(?<!/vorgaenge/[a-z-]+/)[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$$;'
```

**Erwartet:** `kennung_offen` = `0`. Jeder persönliche Link des Portals trägt eine UUID; im gespeicherten
Text darf eine UUID nur als Vorgangs-ID in `/vorgaenge/<modul>/<id>` stehen, alles andere hat der Code
durch einen Platzhalter bzw. `[Kennung entfernt]` ersetzt. Größer → an Claude, die Texte nicht öffnen
und nicht weitergeben (Zusage an den DSB); die Mails selbst sind davon nicht betroffen.

```bash
sudo docker compose logs --no-log-prefix app | grep -c 'Mailtext konnte nicht gespeichert werden'
```

**Erwartet:** `0`. Größer → an Claude (die Mails gingen trotzdem hinaus, nur der Text fehlt).

In der Oberfläche: im Reiter „E-Mails“ eines Vorgangs mit einer Mail seit dem Deploy **„Text
ansehen“**. **Erwartet:** Dialog „E-Mail ansehen“ mit „Ansicht“ und „Nur Text“; Verweise sind nicht
klickbar, persönliche Links durch einen Platzhalter ersetzt. Notieren, ob das Logo erscheint (fehlt es,
ist das kein Fehler des Deploys).

### 6.2 Lauf „Wartung“ (falls noch aus) — am Deploytag, gleich nach 5.5

Zeigte 1.8 `wartung` mit `aktiv` = `t` und `probelauf` = `f`: nichts zu tun. Sonst wie im S0-Plan 6.2
(erst „Probelauf jetzt“, dann einschalten; vorher HR Bescheid sagen wegen der Berichtsmail). Er löscht
über die Kaskade jetzt auch die Mailtexte nach 90 Tagen — im Probelauf erscheint dafür keine eigene
Zeile (die Texte hängen an „Versandprotokoll“).

### 6.3 Nicht tun

- **Nie** `scripts/vertragsende-testdaten.js`, `scripts/ux-abnahme*.js` oder `TESTDATEN_HOST_ERLAUBT`
  gegen den Server — das Testdaten-Skript ließe mit `TESTDATEN_HOST_ERLAUBT=db` Schreibzugriffe auf die
  Produktion zu (die Skripte liegen nicht im Image, wohl aber im Projektordner).
- **Keinen Stand ohne `7d595e5` mehr ausrollen** (verwürfe `email_log_texte`), ohne `a43aa25` oder
  `0e1d8de` ohnehin nicht (CLAUDE.md, „Feste Anker“).
- `PERSONALSTAMM_SECRET` nur nach dem S0-Plan, Abschnitt 8.
- Außer „Wartung“ (6.2) keine weiteren Läufe einschalten, kein „Jetzt ausführen“.
- **Nie `node prisma/seed.js`** im Container.
- Kein `docker image prune -a`, kein `docker system prune -a`, kein `down -v` (7.1).
- Keine Knöpfe, die Mails an andere schicken (Liste in 5.4).

---

## 7 · Rückfall

### 7.1 Was man NICHT tun darf

- **Auf `hr-portal-app:0974b7f` oder ein älteres Image zurückgehen.** Es kennt das S0-Schema nicht und
  löschte beim Start zusätzlich die S0-Spalten samt Index (nach Etappe 2 mit allen
  Vertragsschlüsseln, S0-Plan 7.1). Zurück geht es von diesem Deploy aus **nur** auf
  `hr-portal-app:0e1d8de` (2.1). Soll danach auch S0 zurück, gilt der S0-Plan 7.3, solange S0 nie
  geschrieben hat, sonst 7.5 — erst nach diesem Rückfall, nie direkt von hier auf `0974b7f`. Einzige
  Ausnahme ist Weg C des S0-Plans (7.5, ohne Entrypoint, nur mit Claude): Er darf bei `7d595e5`
  beginnen, weil ohne Entrypoint nichts gelöscht wird (`email_log_texte` bleibt stehen). Grundlage bleibt die Override-Datei dieses Rückfalls.
  S0-Plan 7.3 Schritt 4 überschreibt sie mit `hr-portal-app:0974b7f`; bei einem STOPP in dessen
  Schritten 4 bis 9 wird sie deshalb **wiederhergestellt statt gelöscht** (statt des Befehls E des
  S0-Plans), sonst legte das nächste `up -d` den Dienst mit `hr_portal_credo-app:latest` an, und das
  ist `7d595e5`:

```bash
printf 'services:\n  app:\n    image: hr-portal-app:0e1d8de\n' | sudo tee docker-compose.override.yml
```

  **Erwartet:** genau die drei Zeilen wie in 7.3 Schritt 4.

- **Einen Stand ohne `7d595e5` mit normalem Entrypoint starten, ohne 7.3 Schritt 5** — er verwürfe
  `email_log_texte` (siehe 7.3, das ist dort bewusst und gemessen).
- `sudo docker compose down -v` — löscht Datenbank und Uploads.
- **Kein `docker image prune -a` und kein `docker system prune -a`**, solange ein Rückweg offen sein
  soll — beide löschen auch das etikettierte `hr-portal-app:0e1d8de`. Fehlt Platz, an Claude.
- `node prisma/seed.js`; `git clean`, `git add -A`, `git stash -u` im Projektordner.
- Eine Entrypoint-Sicherung (`pg_dump` 18) einspielen — eingespielt werden nur eigene Sicherungen
  (4.1, Weg B).

### 7.2 Erst entscheiden: vorwärts oder zurück

**Vorwärts reparieren ist fast immer besser:** Ein Fehler in der Oberfläche wird mit einem neuen
Commit behoben und neu ausgerollt; das Schema ändert sich dabei meist nicht (Entrypoint „bereits
deckungsgleich“). Ein Fehler nur in der neuen Vertragsende-Ansicht ist kein Grund für einen Rückfall:
Die alte Ansicht ist Vorgabe, HR schaltet mit „Zur bisherigen Ansicht“ zurück. **Zurück nur nach
Rücksprache mit Claude.**

**Was ein Rückfall kostet** (alle Wege auf das alte Image):

- Die **Mailtexte** seit dem Deploy (Weg A verwirft die Tabelle; Weg C behält sie).
- **Links auf `/vorgaenge/…` und `/bem/…`** in Mails seit dem Deploy führen auf 404 — das alte Image
  hat dort keine Seiten. Ebenso **gemerkte Weiterleitungen** (0, Punkt 3): Jede alte Adresse
  `/dashboard…`, die ein Browser seit dem Deploy ganz geladen hat, führt bei jedem vollen Laden weiter
  auf `/vorgaenge…` bzw. `/bem…` (404, keine Daten offen), auch beim „Neu laden“ nach der Anmeldung,
  bis der Browser-Zwischenspeicher geleert ist.

### 7.3 Weg A: altes Image `0e1d8de`

**Was der Rückweg tut** (gemessen in der Generalprobe): Sein Entrypoint löscht genau die Tabelle
`email_log_texte` samt Fremdschlüssel — sonst nichts; die Zeilen in `email_logs` bleiben, S0 bleibt
unberührt (auch nach Etappe 2 — aus dem Delta abgeleitet, Schritt 12 prüft es). Anders als beim S0-Rückfall gibt es **keine Bedingung an den Stand von
S0**.

Bei einem STOPP gilt (die Grundregel gilt hier nicht):

- **Schritte 2 und 3:** nichts, nur Ausgabe an Claude.
- **Schritte 4 und 5** (Override-Datei angelegt, Portal läuft noch): nur Befehl E, dann an Claude.
- **Schritte 6 bis 9** (Portal angehalten, altes Image noch nicht gestartet): Befehl E, dann Befehl B
  aus 4.1 (startet den angehaltenen Container mit dem jetzigen Stand wieder), dann an Claude.
- **Schritte 10 und 11** (der Dienst ist mit dem alten Image angelegt): kein Befehl E und kein Befehl
  B — ohne Override-Datei legte ein späteres `up -d` den Dienst unbemerkt mit dem neuen Image an. Bei
  einer Neustart-Schleife nur Befehl D, dann an Claude.

Befehl E (nur bei STOPP in den Schritten 4 bis 9):

```bash
sudo rm docker-compose.override.yml
```

**Erwartet:** keine Ausgabe.

**Schritt 1 — Projektordner:**

```bash
cd /vol/container/HR_Portal_CREDO
```

**Vor Schritt 2:** HR bitten, ab jetzt nichts mehr im Portal zu speichern. Läuft Etappe 2 von S0, den
n8n-Stammablauf für die Dauer ausschalten (er bekäme beim Neustart sonst Fehler).

**Schritt 2 — wie viele Texte gingen verloren, Stand von S0** (nur lesend):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM email_log_texte) AS mailtexte, (SELECT COUNT(1) FROM email_logs) AS versandprotokoll, (SELECT COUNT(1) FROM employments WHERE abrechnungskreis IS NOT NULL OR "personalNumber" IS NOT NULL) AS s0_vertraege;'
```

**Erwartet:** drei Zahlen. Notieren — Schritt 12 vergleicht.

**Schritt 3 — das alte Image ist noch da** (nur lesend):

```bash
sudo docker image inspect --format '{{.Id}}' hr-portal-app:0e1d8de
```

**Erwartet:** genau die volle ID aus 1.2 und 2.1. Andere ID oder Fehlermeldung → **STOPP, kein Weg A,
Ausgabe an Claude.** **Nie** ein anderes Etikett nehmen (7.1). Ohne das Etikett meldete Schritt 5
keinen Fehler: `docker compose run` versuchte `hr-portal-app:0e1d8de` zu laden und baute es dann aus
dem jetzigen Code (`build:` in `docker-compose.yml`) unter genau diesem Etikett — danach zeigte das
Etikett auf den neuen Stand.

**Schritt 4 — Override-Datei anlegen** (schreibt; wirkt erst in Schritt 10):

```bash
printf 'services:\n  app:\n    image: hr-portal-app:0e1d8de\n' | sudo tee docker-compose.override.yml
```

**Erwartet:** genau diese drei Zeilen:

```
services:
  app:
    image: hr-portal-app:0e1d8de
```

**Schritt 5 — Vorschau, was das alte Image tun wird** (nur lesend, das Portal läuft weiter):

```bash
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > ~/deploy-ux-umbau/rueckfall-delta.sql
```

**Erwartet:** keine Ausgabe oder nur harmlose Hinweise. Eine Fehlermeldung → **STOPP: Befehl E,
Ausgabe an Claude.**

```bash
for m in 'DROP TABLE' 'DROP CONSTRAINT' 'DROP COLUMN' 'DROP INDEX'; do printf '%-16s %s\n' "$m" "$(grep -c "$m" ~/deploy-ux-umbau/rueckfall-delta.sql)"; done
```

**Erwartet** (gemessen in der Generalprobe):

```
DROP TABLE       1
DROP CONSTRAINT  1
DROP COLUMN      0
DROP INDEX       0
```

```bash
grep -v -E '^--|^$' ~/deploy-ux-umbau/rueckfall-delta.sql
```

**Erwartet:** genau diese zwei Zeilen, sonst nichts:

```
ALTER TABLE "email_log_texte" DROP CONSTRAINT "email_log_texte_emailLogId_fkey";
DROP TABLE "email_log_texte";
```

Ein `DROP COLUMN` oder `DROP INDEX` (dann ist das Image älter als `0e1d8de`, vermutlich `0974b7f`) oder
jede andere Abweichung → **STOPP, nicht anhalten: Befehl E, Ausgabe an Claude** (dazu die Datei).

**Schritt 6 — Portal anhalten.** Ab hier ist das Portal nicht erreichbar.

```bash
sudo docker compose stop app
```

**Erwartet:** `Container hr-portal-app  Stopped`.

**Schritt 7 — Sicherung des jetzigen Stands** (schreibt; enthält die Mailtexte — Weg B könnte sie
zurückholen. Nach Weg A gilt für diese Texte keine Löschung nach 90 Tagen mehr: Aufbewahrung nach 10,
Punkt 4):

```bash
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-rueckfall-$(date +%Y%m%d-%H%M%S).sql'
```

**Erwartet:** keine Ausgabe.

**Schritt 8 — Sicherung prüfen:**

```bash
sudo sh -c 'cd /vol/container/HR_Portal_CREDO/backups && f="$(ls -1t | grep "^vor-rueckfall-" | head -1)" && ls -l "$f" && grep -c "PostgreSQL database dump complete" "$f"'
```

**Erwartet:** die Datei mit etwa der Größe aus 4.1, darunter `1`.

**Schritt 9 — nur bei Abweichung in Schritt 8:** **STOPP** — Befehl E, dann Befehl B aus 4.1, dann an
Claude.

**Schritt 10 — altes Image starten:**

```bash
sudo docker compose up -d --no-build app
```

**Erwartet:** `hr-portal-app` wird neu angelegt (`Recreate`/`Recreated`, `Started`; nur `Started` ist
auch in Ordnung). Weicht ab (etwa `No such image`) → **STOPP, Ausgabe an Claude** (kein Befehl E, kein
Befehl B); gleich danach trotzdem Schritt 11 (Startlog ansehen).

**Schritt 11 — Startlog ansehen:**

```bash
sudo docker compose logs -f app
```

**Erwartet** (gemessen in der Generalprobe, bis auf die Zeitplaner-Zeile): `Schema-Unterschied erkannt
— Sicherung wird angelegt...`, `Sicherung abgelegt: …`, `Datenbank-Schema wird synchronisiert...`, die Warnung
`⚠️  There might be data loss when applying the changes:` mit genau **einem** Punkt
`• You are about to drop the `email_log_texte` table, which is not empty (… rows).` (bei leerer Tabelle
ohne Warnung), `🚀  Your database is now in sync …`, `Datenbank-Schema synchronisiert.`, dreimal
`System-Vorlage (…) ist aktuell.`, `Datenbank bereits geseeded …`, `[Zeitplaner] Uhr gestartet (jede
Minute).`, `✓ Ready in …`. Dann `Strg+C`. Jede andere Warnung, `FATAL` oder nach 3 Minuten kein
`✓ Ready` → `Strg+C`, **STOPP, Ausgabe an Claude** (kein Befehl E). Bei einer Neustart-Schleife sofort
`Strg+C` und Befehl D. Sonst danach 5.1 wiederholen; die Zeile zum Image zeigt dann die ID aus 1.2.

**Schritt 12 — Daten nach dem Rückfall** (nur lesend):

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

**Erwartet:** `0`. Weicht ab → an Claude (Container nicht anhalten).

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT to_regclass($$public.email_log_texte$$) AS mailtext, to_regclass($$public.employments_dokubit_vertrag_key$$) AS s0_index, (SELECT COUNT(1) FROM employments WHERE abrechnungskreis IS NOT NULL OR "personalNumber" IS NOT NULL) AS s0_vertraege, (SELECT COUNT(1) FROM email_logs) AS versandprotokoll;'
```

**Erwartet:** `mailtext` leer, `employments_dokubit_vertrag_key`, `s0_vertraege` wie in Schritt 2.
Weicht ab → an Claude (Container nicht anhalten). `versandprotokoll` meist gleich oder größer; kleiner
nur nach Öffnen des Versandprotokolls oder einem Lauf „Wartung“ seit Schritt 2 — nur notieren.

**Nach Weg A:**

- **Alle** Personen mit aktivem Konto (1.7: alle Rollen, auch Einrichtungsleitung, Führungskräfte und
  BEM-Beauftragte) bitten, „Bilder und Dateien im Cache“ zu löschen (Zeitraum mindestens seit dem
  Deploy), und sagen, dass Links aus Mails seit dem Deploy nicht mehr gehen (über die Liste der Vorgänge
  öffnen).
- Die Override-Datei bleibt, solange das alte Image laufen soll. Solange sie existiert, **weder**
  `sudo docker compose build` **noch** `sudo docker compose up -d --build`: Der Build bekäme das
  Etikett `hr-portal-app:0e1d8de` und nähme es dem Rückfall-Image. Das alte Image stünde dann ohne
  Etikett da, ein späteres `up -d` legte den Dienst mit dem neuen Build an, und danach löschte schon ein
  einfaches `docker image prune` das alte Image. Vor dem nächsten Vorwärts-Deploy löscht Befehl E die
  Datei (1.1 des nächsten Plans prüft „kein Override“).
- Sicherungen `vor-deploy-ux-umbau-…` (ohne Mailtexte) und `vor-rueckfall-…` aufheben.
  `vor-rueckfall-…` und die Entrypoint-Sicherung dieses Starts (`vor-schema-abgleich-…` mit der Uhrzeit
  von Schritt 11, in der Rotation) enthalten die Mailtexte bis zum Rückfall; die Tabelle im Portal ist
  weg, eine Löschung nach 90 Tagen greift für sie nicht mehr. Dateinamen und Anlagedatum ins Protokoll.
  Gelöscht wird nach der Regel aus 10, Punkt 4 — bis es sie gibt, nicht eigenmächtig.
- Läuft Etappe 2 von S0: den n8n-Stammablauf wieder einschalten (das alte Image hat den Webhook).

### 7.4 Weg B: eine eigene Sicherung einspielen (nur mit Claude, nicht geprobt)

Verwirft **alles**, was seit der Sicherung geschrieben wurde. Nur kurz nach 4.1 sinnvoll, wenn Weg A
nicht geht oder die Datenbank beschädigt ist: `backups/vor-deploy-ux-umbau-manuell.sql` mit
Override-Datei `image: hr-portal-app:0e1d8de` einspielen. Läuft Etappe 2 von S0, vorher den
n8n-Stammablauf aus (S0-Plan 8.8, Stufe 1). Die genauen Befehle gibt Claude im Ernstfall.

### 7.5 Weg C: altes Image ohne Entrypoint (nur mit Claude, nicht geprobt)

Behält die Mailtexte: das alte Image über eine Override-Datei mit `image: hr-portal-app:0e1d8de` **und**
`entrypoint: ["node", "server.js"]` starten. Ohne Entrypoint gibt es weder Sicherung noch Push — die
Tabelle bleibt samt Inhalt, der alte Prisma-Client kennt sie nicht; beim nächsten Vorwärts-Deploy ist
alles da. Der Entrypoint muss bei **jedem** Start umgangen sein. Die genauen Befehle gibt Claude im
Ernstfall.

---

## 8 · Zusammenspiel mit Etappe 2 von S0

| | Etappe 2 lief **vor** diesem Deploy | Etappe 2 kommt **nach** diesem Deploy |
|---|---|---|
| 1.2 Erstelldatum | Datum des Neuanlegens in S0 8.2 (gleiche Image-ID) | Etappe 1, 5.1 |
| 1.7 `s0_vertraege` | größer 0 | `0` |
| 1.9 `PERSONALSTAMM_SECRET` | `1` | `0` |
| 5.3 Webhook | `401` | `500` |
| Zeitfenster | nicht während des Stammablaufs (02:30) | — |
| Rückfall 7.3 | geht unverändert; vorher den Stammablauf aus | geht unverändert; S0 selbst zurück nur danach über S0-Plan 7.3 |
| Danach | **Claude führt den S0-Plan nach:** 7.1 (Rückfall nur über `hr-portal-app:0e1d8de`, `0974b7f` nur danach), 7.3 (Kette; Schritt 5: ein zusätzliches `DROP TABLE "email_log_texte"` heißt „Weg A des UX-Plans fehlt“; Befehl E stellt die Override-Datei des UX-Rückfalls wieder her, statt sie zu löschen — 7.1 dieses Plans), 7.4 (Fall 2 entfällt), 7.5 (Ausgangspunkt `7d595e5`, `email_log_texte` bleibt ohne Entrypoint stehen), 8.1 für die Rücknahme in 8.8 (Code-Stand `7d595e5`), 9 | wie links, dazu 8.1 (Code-Stand `7d595e5` statt `0e1d8de`, Image-ID aus 3.3 dieses Plans) und 8.4 (die Sicherung vor dem ersten Lauf enthält Mailtexte, 10 Punkt 4) |

**Etappe 2 lief und wurde zurückgenommen** (S0-Plan 8.8): Stufe 1 (nur n8n aus) wie „Etappe 2 lief vor
diesem Deploy“. Stufe 2 (Geheimnis entfernt): 1.2 Erstelldatum = Neuanlegen in 8.8 (gleiche Image-ID),
1.7 `s0_vertraege` größer 0, 1.9 `PERSONALSTAMM_SECRET` `0`, 5.3 Webhook `500`; Zeitfenster ohne
Einschränkung; Rückfall 7.3 geht unverändert, S0 selbst nur über S0-Plan 7.5 (S0 hat geschrieben).

Nie Etappe 2 und diesen Deploy am selben Tag.

---

## 9 · Protokoll

### Vorlage zum Ausfüllen

Nach dem Update kommt dieser Teil, ausgefüllt, als „Protokoll vom [Datum]“ direkt unter den Kopf
dieses Dokuments (Claude trägt ihn ein). Uhrzeiten in UTC, deutsche Zeit in Klammern (ab 25.10.
UTC + 1 h).

| Schritt | Uhrzeit | Ergebnis / Ausgabe | Abweichung |
|---|---|---|---|
| 1.1 Serverstand (`git log -1`), `reflog`, `0e1d8de enthalten`, `Code-Stand 0e1d8de`, `status`, kein Override | | | |
| 1.2 Container (`healthy`), Erstelldatum, Image (volle ID), laufend = latest | | | |
| 1.3 Drift (`0`) | | | |
| 1.4 Sicherungsverzeichnis (`2`, `1001`), beide Schreibtests | | | |
| 1.5 Freier Platz (Docker ≥ 5 GB), Images, Zahl der `vor-schema-abgleich-…` | | | |
| 1.6 Uploads-Volume (Name, Größe) | | | |
| 1.7 S0 (`2` / Index / `s0_vertraege`), Mailtext-Tabelle leer; Bestand (4 Zahlen); System-Vorlagen (Zeilen, `aktiv`); Merker/Läufe `13`/`11`; Konten je Rolle; Vorlagen mit `/dashboard`; Webhooks auf die sieben Ereignisse; Eskalationsmails | | | |
| 1.8 Läufe (welche `t`, um wann; `wartung`) | | | |
| 1.9 `N8N_API_KEY`, `PERSONALSTAMM_SECRET`; vier Adressen vorher (Status, `location`) | | | |
| 2.1 Etikett `hr-portal-app:0e1d8de` = volle ID = laufend | | | |
| 2.2 Leseprobe (Dateien, Bytes, `tar OK`) | | | |
| 3.1 `git pull` (von … nach …) | | | |
| 3.2 Anker `a43aa25`, `0e1d8de`, `7d595e5` enthalten; nach `7d595e5` nur Doku; `71` / `14`; Betriebsdateien (5 Zeilen); `package.json` nur `jest-axe` | | | |
| 3.3 Build (Dauer; `npm ci` neu); neues Image: volle ID, Erstellzeit | | | |
| Nur bei Abbruch zwischen 3.3 und 4.2: Befehl F ausgeführt ja/nein; 1.2 danach laufend = latest | | | |
| 3.4 Vorschau (`0/0/1/0/1`, kein DROP, genau acht Zeilen) | | | |
| 4.1 angehalten um; Bestand (4 Zahlen); DB-Sicherung (Bytes, `1`); Uploads (Bytes, Zeilen, `tar OK`) | | | |
| 4.2 Start (`Recreated`/`Started`) | | | |
| 4.3 Log: Entrypoint-Sicherung (Name, Bytes), **keine** Warnung (`0`), `db push` (ms), 3 × `ist aktuell`, keine Migrationszeile, Zeitplaner, `Ready` (ms) | | | |
| 4.5 Entrypoint-Sicherung kopiert, drei Dateien | | | |
| 5.1 Health (`uhrAktiv`), Portal erreichbar ab; Container: Erstelldatum, Image = ID aus 3.3 | | | |
| 5.2 Drift `0`; `email_log_texte` / Texte / `c` / S0-Index; Bestand wie 4.1 (Versandprotokoll nur notiert); Merker/Läufe/aktiv | | | |
| 5.3 Weiterleitungen (6 Pfade, Ziele relativ); Kopfzeilen der Weiterleitung (welche); `robots.txt` `2`; Webhook `500`/`401` | | | |
| 5.4 Probe (Punkte 1–10, je ok / Abweichung; Punkt 9 „nicht prüfbar“, falls kein Konto der Sachbearbeitung) | | | |
| 5.5 Bescheid um; Ankündigung verschickt um (Datum der zwei Wochen) | | | |
| 6.1 Folgetag: Texte, `darf_nicht` `0`, `kennung_offen` `0`, Log `0`, „Text ansehen“ (Logo ja/nein) | | | |
| 6.2 Wartung (Ausgangslage aus 1.8; was getan) | | | |
| 6.2 Folgetag (nur wenn eingeschaltet): „Letzter Lauf“ ohne „· Probelauf“, Ergebnis | | | |
| Nur bei Rückfall, 7.3: Schritt 2 (3 Zahlen), Vorschau (Zahlen, zwei Zeilen), Log (Warnung, Zeilen), Schritt 12 (Drift, 4 Werte) | | | |

**Sicherungen auf dem Server** (Größen eintragen):

| Datei | Größe | Zweck |
|---|---|---|
| `backups/vor-deploy-ux-umbau-manuell.sql` | | Weg B (`pg_dump` 16) |
| `backups/vor-deploy-ux-umbau-entrypoint.sql` | | Kopie der Entrypoint-Sicherung (`pg_dump` 18) |
| `backups/uploads-vor-deploy-ux-umbau.tar.gz` | | Uploads vor dem Update — bleibt auf dem Server |
| Image `hr-portal-app:0e1d8de` | | Image von Etappe 1 für Weg A, B und C |
| Nur nach einem Rückfall: `backups/vor-rueckfall-…` und die Entrypoint-Sicherung von 7.3 Schritt 11 | | enthalten Mailtexte; Aufbewahrung nach 10, Punkt 4 |

**Log des Starts** (Auszug aus `start-log.txt`, wörtlich): _…_

**Ausgangsstand für das nächste Update:** _Repo-Stand, Code-Stand `7d595e5`, Image-ID (3.3/5.1),
Erstelldatum des Containers, Rückfall-Etikett `hr-portal-app:0e1d8de`, Merker 13, Stand von S0._ Dazu
fest: Ab diesem Deploy nur Stände ausrollen, die `a43aa25`, `0e1d8de` **und** `7d595e5` enthalten.

### Was an Claude geht

| Wann | Was | Weiter erst nach Antwort? |
|---|---|---|
| 1.1–2.2 | jede Abweichung, jede STOPP-Zeile (anderer Serverstand, Override, Mailtext-Tabelle schon da, S0 fehlt, Merker ≠ 13, Etikett falsch); bei fehlendem `tar OK` nur die Ausgabe des Prüfbefehls | **ja** |
| 1.7 | aktiver Webhook auf eines der sieben Ereignisse | nein |
| 3.1–3.4 | **alle** Ausgaben von 3.2, Build-Log (Ende), ID des neuen Images, Abweichung der Vorschau mit `vorschau-delta.sql` | **ja** bei Abweichung |
| 4.1 | Fehler beim Zählen, Sicherung zu klein, `grep` `0`, kein `tar OK` (dann nur der Prüfbefehl aus 2.2) | **ja** (vorher Befehl B) |
| 4.3 | `start-log.txt`, **immer** (außer mit Seed-Zeile) | nein, außer bei Fehlern |
| 4.4 | jeder Fehlschlag, bei einer Neustart-Schleife nach Befehl D | **ja** |
| 5.1–5.3 | Ergebnisse und Abweichungen; Image nicht das aus 3.3; weniger Personen, Anstellungen oder Vorgänge als in 4.1 (**sofort**); Weiterleitung mit voller Adresse statt relativem Ziel | nein, außer bei Fehlern |
| 5.4 | Abweichungen der Probe (ohne Namen) | nein |
| 6.1 | `darf_nicht` > 0, `kennung_offen` > 0, Log-Zählung > 0 | nein |
| 6.2 | Probelauf nicht wie erwartet; am Folgetag das Ergebnis des scharfen Laufs | **ja** beim Probelauf |
| 7 | vor **jedem** Rückfall | **ja** |

### Nach dem Update (Claude)

Das Protokoll hier eintragen (Kopfzeile „Stand“ ergänzen) und nachführen:

- **CLAUDE.md**, „Feste Anker für Deploy und Rückfall“: die drei Punkte **ersetzen** (nicht
  ergänzen): (1) Ausgerollt wird nur ein Stand, der `a43aa25` (S0-Schema), `0e1d8de` (Code-Stand des
  S0-Updates) und `7d595e5` (Mailtext-Schema, Code-Stand des UX-Updates) enthält, auch kein neuerer
  Zweig ohne sie — Prüfbefehle für alle drei, Vorschau wie in 3.4 ohne `DROP`; die bisherigen Folgen
  von `a43aa25`/`0e1d8de` bleiben stehen, dazu: ein Stand ohne `7d595e5` verwürfe `email_log_texte`
  samt aller gespeicherten Mailtexte. (2) Weitere Stände von `ux-umbau` nur über einen Pull Request
  nach `main` („Create a merge commit“), nach einem Merge von `main` in den Zweig (der Punkt „`ux-umbau`
  erst nach dem Merge von `main`“ ist mit diesem Deploy erledigt). (3) Rückfall nur nach den
  Ablaufplänen und nur mit Claude, Stufe für Stufe: vom Stand `7d595e5` nur auf
  `hr-portal-app:0e1d8de` (dieser Plan, 7.3; verwirft `email_log_texte`); erst danach und nur, solange
  S0 nie geschrieben hat, auf `hr-portal-app:0974b7f` (S0-Plan 7.3, sonst 7.5); nie direkt auf
  `0974b7f` mit Entrypoint (Weg C des S0-Plans ohne Entrypoint ist die einzige Ausnahme), nie ein
  älteres Image (beide Pläne, 7.1). Im Abschnitt „Laufende Arbeit und Einstieg“ den UX-Umbau („Pilot
  deployt am …, zwei Wochen Rückmeldung bis …“). Dazu im Abschnitt „Oberfläche“ „Branch `ux-umbau`“
  durch „in `main` seit …“ ersetzen und in „Ausstattung & Zugänge“, Regel 13, den Satz zu
  `ausstattungPortalLink` auf den Ist-Stand bringen (die Umstellung auf `vorgangPfad` ist erledigt).
- [`docs/README.md`](../README.md): beide Zeilen dieser Anleitung (Historie: „noch nicht ausgeführt“ →
  Datum; Abschnitt „Oberfläche (UX-Umbau)“: „noch nicht ausführbar“ → „ausgeführt am …“), die Zeile der
  Ankündigung und den Stand des Abschnitts „Oberfläche“.
- [Übergabe S0](uebergabe-selfservice-s0-2026-10-17.md): Abschnitt „Stand … — hier weitermachen“,
  Abschnitt 7 (Vorbedingungen S2/S3: `ux-umbau` in `main`) und 8.1 (Zeilen `ux-umbau` und `main`);
  dazu im Self-Service-Plan (`docs/module/selfservice/selfservice-portal-plan.html`) die Zeile
  „Zweig ux-umbau nach main zusammengeführt“.
- [`projekt-ux-umbau.md`](../module/ux-ui/projekt-ux-umbau.md): Abschnitt 0.0, Abschnitt 2 (Zeilen U0,
  U1, Pilot: „deployt am …“), Protokoll.
- [`mailtext-im-protokoll-dsb-mitteilung.md`](../module/betrieb/mailtext-im-protokoll-dsb-mitteilung.md),
  Abschnitt 8: „deployt am …“; dazu das Ergebnis zu Frage a (0, Punkt 7). Abschnitt 5 bleibt
  unverändert. Hat der DSB den Nachtrag zu den Sicherungen bekommen: ein neuer Abschnitt „Nachtrag vom
  … : Sicherungen“ samt Datum und Antwort; sonst die Entscheidung aus 0, Punkt 8, ins Protokoll.
- [`pilot-ankuendigung.md`](../module/ux-ui/pilot-ankuendigung.md): „verschickt am …“.
- [Übergabe UX-Umbau](uebergabe-ux-umbau-2026-10-20.md): Abschnitt „Stand … — hier weitermachen“
  auf den Stand nach dem Deploy (oder eine neue Übergabe, auf die CLAUDE.md dann verweist).
- Den S0-Plan nachführen (Abschnitt 8 dieses Plans, Zeile „Danach“): Abschnitt 7 und 9 immer, 8.1
  immer (der Code-Stand gilt auch für die Rücknahme in 8.8; das Image je nach Fall), 8.4 nur, wenn
  Etappe 2 noch nicht lief.

---

## 10 · Offen nach dem Deploy

Vorläufige Liste — beim Eintragen des Protokolls auf den tatsächlichen Stand bringen.

1. **Zwei Wochen Rückmeldung** des Personalbüros zum Pilot, dann die Entscheidung „neue Ansicht wird
   Vorgabe, Onboarding folgt“ (Feinplan Pilot, Abschnitt 8). Mit der Vorgabe entfallen Schalter, Cookie
   und alte Ansicht in einem Commit.
2. **Ausgangswerte des Prototyp-Tags** nachtragen (0, Punkt 5) und festlegen, wie nach zwei Wochen
   gemessen wird (Strichliste „Wo finde ich …“, kurze Wiederholung der Aufgaben).
3. **Dauerhafte Weiterleitung** (0, Punkt 3, entschieden: hinnehmen): wenn später doch gewünscht, `Cache-Control` an der Weiterleitung als
   eigener kleiner Auftrag; die 308-Antwort trägt außerdem keine Sicherheitsköpfe (CSP, HSTS) — prüfen,
   ob Caddy sie ergänzt (das `Caddyfile.hr-portal` im Repo belegt den Serverstand nicht).
4. **Sicherungen und Mailtexte:** Ab der ersten Sicherung nach diesem Deploy enthalten die
   `pg_dump`-Dateien auch die Mailtexte, und die 90-Tage-Frist gilt für sie nicht. Das betrifft die
   manuelle Sicherung in 4.1 und die Kopie aus 4.5 jedes künftigen Deploys (beide nie rotiert), die
   zehn Entrypoint-Sicherungen `vor-schema-abgleich-…` (rotiert nach Anzahl, ohne Altersgrenze),
   Sicherungen vor besonderen Schritten (`vor-s0-erster-lauf-manuell.sql`, S0-Plan 8.4) und nach einem
   Rückfall `vor-rueckfall-…` samt der Entrypoint-Sicherung beim Start des alten Images (7.3). Dieselbe Lücke
   besteht schon für alle übrigen Daten (Versandprotokoll, individuelle E-Mail, Unterlagen in den
   Uploads-Archiven). Eine Regel für die Aufbewahrung der Sicherungen legen DSB, Auftraggeber und IT
   fest (gehört zum S0-Plan, Abschnitt 10, Punkt 7; ob die IT die VM zusätzlich sichert, ist im Repo
   nicht belegt). Beschließt der Auftraggeber den Nachtrag (0, Punkt 8), wird er als NEUER Abschnitt
   „Nachtrag vom [Datum]: Sicherungen“ an die DSB-Mitteilung angehängt — Abschnitt 5 bleibt wörtlich,
   wie abgestimmt. Textvorschlag: „Vor jedem Update sichert der Betrieb die Datenbank vollständig
   (`pg_dump`, auf dem Server im Ordner `backups/`): je Update eine Sicherung von Hand und eine Kopie
   der automatischen, beide bisher ohne Frist aufgehoben, dazu eine automatische vor jedem
   Schema-Abgleich, von der die zehn jüngsten bleiben, und vor besonderen Schritten (etwa dem ersten
   Lauf des Personalstamms) eine weitere von Hand. Diese Sicherungen enthalten alle Tabellen des Portals. Ab der ersten Sicherung nach dem
   Deploy stehen darin auch die Mailtexte, und für sie gilt die Frist aus Abschnitt 5 nicht.
   Abschnitt 5 beschreibt die Ablage im Portal. Eine Regel für die Aufbewahrung von Sicherungen gibt es
   bisher nicht, für keine Daten des Portals. f) Welche Frist soll für Sicherungen gelten, und wer
   löscht sie?“
5. **Handbuch** (`docs/handbuch/handbuch.html`): Der **Text** zu Kopf, Startseite („Dashboard“),
   Rollennamen und Adressen ist ab dem Deploy falsch (U1 gilt für alle sofort) — mit oder kurz nach dem
   Deploy nachführen (nur Doku, darf auch vor dem Deploy auf `main`). Nur die Bilder der
   Vertragsende-Ansicht warten auf die Entscheidung zum Pilot.
6. **n8n-Generatoren** `scripts/n8n/generate-elternzeit-flow.js` und `generate-mutterschutz-flow.js`
   bauen weiter `/dashboard`-Links (gehen über die Weiterleitung); der Wächter `adressen.test.ts` prüft
   `scripts/n8n/` nicht — eigener kleiner Fix.
7. **E14** („Nur anzeigen“ statt „Probelauf“) mit U6; dann `automatischer-lauf-bericht` zurücksetzen.
8. Aus dem S0-Plan weitergetragen: Punkte 11 (n8n-Exporte aus Git) und 13 (Altlasten in Testskripten)
   — beide liegen außerhalb der Doku und brauchen einen neuen Code-Stand.
9. **Rollenname „BEM-Beauftragte:r“** (`ROLLEN_NAMEN` in `src/lib/navigation.ts`): Doppelpunktform aus
   dem Bestand — stand schon vor U1 im Kopf (`src/components/portal-header.tsx` auf `0e1d8de`), U1 hat
   sie nur in die gemeinsame Tabelle übernommen; dieselbe Form steht in der Benutzerverwaltung
   („🔒 BEM-Beauftragte:r“) und in der BEM-Akte (`bem-detail-content.tsx`). CLAUDE.md „Bekannt im
   Bestand“ nennt das BEM-Modul, aber weder `navigation.ts` noch die Benutzerverwaltung — beim Fix
   ergänzen. Mit der Entscheidung zur Gendersprache ein Wort festlegen — eigener kleiner Fix.
