# Server-Update 10/2026 (2) — `main` ab `ea2d41d` mit Self-Service S0 (Ablaufplan)

> **Stand:** Ablaufplan vom 17.10.2026, am 18.10.2026 auf den Code-Stand `0e1d8de` nachgeführt (Fix
> der Status-Kacheln vor dem Deploy, Abschnitt 0), **noch nicht ausgeführt**. Nach dem Deploy trägt
> Claude das Protokoll direkt unter diesem Kopf ein (Vorlage in Abschnitt 9).
> **Nachtrag 18.10.2026 (Sonntag):** kein Zugriff auf den Server, nichts ausgeführt, auch Abschnitt 1
> nicht. Entschieden: zuerst Abschnitt 1 als eigener Schritt, nur lesend (die drei Ausnahmen aus der
> Einleitung von Abschnitt 1 bleiben; Befehl A in 1.4 schreibt und läuft in diesem vorgezogenen
> Schritt nur nach Rücksprache mit Claude). Der Deploy selbst folgt an einem Werktag zwischen 10 und
> 12 Uhr mit HR, HR wird am Vortag informiert (Abschnitt 0, „Zeitfenster“). Läuft Abschnitt 1 nicht am
> Tag des Deploys, wird er am Deploy-Tag wiederholt, denn der Serverstand kann sich bis dahin ändern.
> Stand und nächste Schritte: [Übergabe S0](uebergabe-selfservice-s0-2026-10-17.md), Abschnitt
> „Stand 18.10.2026 — hier weitermachen“.
> **Prüfprotokoll dieses Plans:**
> [`codereview-deploy-selfservice-s0-2026-10.md`](codereview-deploy-selfservice-s0-2026-10.md) (zwei
> Runden, 34 Befunde, keiner offen; Nachtrag vom 18.10.2026 zur Ausnahme in 3.2).
> **Server:** `fes-vm-ubuntudocker`, `/vol/container/HR_Portal_CREDO`, `https://hr.fes-credo.de`
> **Ausgangsstand (zu prüfen):** laut [Protokoll vom 14.10.2026](deploy-main-2026-10.md) Repo
> `ea2d41d` („docs(deploy): gemeinsamer Deploy f6d3daf -> main mit Ausstattung & Zugaenge“), Code
> `0974b7f`, Image `hr_portal_credo-app:latest` = `64e1319792ff`, Container `hr-portal-app`
> angelegt am 14.10.2026 gegen 11:16 UTC (13:16 Uhr deutscher Zeit), Rückfall-Etikett bisher nur
> `hr-portal-app:b6e1c8a` (für diesen Deploy zu alt, 7.1), `system_migrations` 13, alle elf
> automatischen Läufe aus. **Ob seitdem auf dem Server gezogen, gebaut oder neu angelegt wurde, ist
> im Repo nicht belegt.** 1.1 und 1.2 prüfen es (Lehre 1 vom 24.09.: den Stand zuerst auf dem Server
> bestätigen). Steht der Server dort auf einem anderen Stand: **STOPP**.
> **Ziel:** `main` nach dem Merge des Pull Requests mit dem Fix der Status-Kacheln — Code-Stand
> `0e1d8de` („fix(verbeamtung): Status-Kacheln zählen wieder ohne den gewählten Status“, 18.10.2026)
> direkt auf `a43aa25` („Merge pull request #5 from …/feat/selfservice-s0-personalstamm“ mit S0,
> gemergt am 17.10.2026 um 22:48 Uhr deutscher Zeit, lokal aus `origin/main` festgestellt) und
> darüber nur Doku (unter anderem diese Anleitung, eine Korrektur der Anleitung S0 und
> Standnachträge in `docs/README.md`, im Einstieg Self-Service und in der Übergabe S0, dazu
> `CLAUDE.md` mit Einstieg und Hausregeln vom 18.10.2026 und `README.md` ohne das frühere
> Standardpasswort; was als Doku zählt, regelt 3.2) samt dem Merge-Commit des Pull Requests. **Gemergt wird auf GitHub mit „Create a
> merge commit“**, nie mit „Squash and merge“ oder „Rebase and merge“: Beide schreiben die Commits
> neu, `0e1d8de` stünde dann nicht auf `main`, und 3.2 hielte am Deploy-Tag an (Abschnitt 0, „Vor dem
> Termin zu entscheiden“, Punkt 5).
> Von `ea2d41d` bis `0e1d8de` sind es **20 Commits, davon 6 Merges**: das Protokoll vom 14.10. (nur
> Doku), vier Zugriffskorrekturen vom 16.10. (je Commit und Merge), der Konzeptplan Self-Service
> (fünf Doku-Commits und Merge von PR #4), S0 (drei Commits und Merge von PR #5) und der Fix der
> Status-Kacheln (ein Commit; der Merge seines Pull Requests liegt mit der Doku darüber). Übersicht in
> Abschnitt 0, Prüfung in 3.2. Der Merge `a43aa25` hat denselben Dateistand wie der Kopf des
> S0-Zweigs `00af8d6`. Von `a43aa25` nach `0e1d8de` ändern sich nur
> `src/app/api/civil-service/route.ts` und der neue Test
> `src/__tests__/api/civil-service-liste-zaehler.test.ts` — Schema und Betriebsdateien bleiben, die
> Prüfungen vom 17.10. gelten unverändert (am 18.10.2026 nachgerechnet).
> **Zwei Etappen.** Etappe 1 (Abschnitte 1–6) rollt den Code aus und lässt S0 **ruhend**: kein
> `PERSONALSTAMM_SECRET`, kein n8n-Ablauf, der Webhook antwortet mit 500. Etappe 2 (Abschnitt 8)
> nimmt S0 in Betrieb, **erst nach den Freigaben** aus 8.0 (E-S25, E-S27, Löschfrist, Verzeichnis der
> Verarbeitungstätigkeiten, Bestandsprüfung, Bereinigung in DokuBit, Aufbewahrung der Ausführungen in
> n8n).
> **Geprüft am 17.10.2026, ohne Generalprobe mit gebautem Image:** Schema-Delta mit Prisma 6.9.0 aus
> den Schemas gerechnet (`ea2d41d` → `00af8d6`; das Schema von `0974b7f`, `ea2d41d` und `ac3535a` ist
> gleich); `db push` gegen eine Wegwerf-Datenbank PostgreSQL 16 mit dem Schema `ea2d41d` (genau ein
> Warnpunkt, danach Vergleich `0`); der eindeutige Index auf Zeilen mit leeren Spalten lokal auf
> PostgreSQL 16.12 angelegt; Rückweg ebenfalls aus den Schemas gerechnet. Alle SQL-Abfragen dieser
> Anleitung liefen lesend gegen die Entwicklungsdatenbank (Stand S0); die Abfragen in 1.7 geben dort
> deshalb andere Zahlen als auf dem Server. Betriebsdateien ab `ea2d41d`: nur
> `.env.production.example`, `prisma/schema.prisma` und `src/middleware.ts`; keine neue
> Abhängigkeit, keine neue einmalige Datenmigration.
> **Nicht gemessen:** Build auf dem Server (Zwischenspeicher), das Startprotokoll mit dem echten
> Entrypoint (aus Code und Push-Probe abgeleitet), die Antwort des alten Images auf die neue Route
> (404 erwartet), `curl -H @-` im Image (die Schreibweise nur mit dem `curl` des Entwicklerrechners
> gegen einen Testdienst), die Proben zum Schreibschutz (5.3, 8.6), die Rückfallwege, die ganze
> Etappe 2 (Importvorlage gegen eine echte n8n-Instanz, erster Lauf).
> **Muster:** Gliederung, Befehle und Lehren aus [deploy-main-2026-10.md](deploy-main-2026-10.md),
> [deploy-paket4-stufe1.md](deploy-paket4-stufe1.md) und
> [deploy-onboarding-pakete-2026-09.md](deploy-onboarding-pakete-2026-09.md), nur Namen und
> Erwartungen angepasst. S0-Teile aus [`s0-personalstamm-n8n.md`](../module/selfservice/s0-personalstamm-n8n.md)
> (Abschnitte 3, 5, 6, 7) und [`uebergabe-selfservice-s0-2026-10-17.md`](uebergabe-selfservice-s0-2026-10-17.md)
> (Abschnitte 2, 5, 6, 8); die Abfragen der Anleitung stehen hier als einzeilige Befehle.

---

**Grundregel wie bisher:** Wo „STOPP“ steht, wird angehalten und die Ausgabe an Claude geschickt.
Das Portal läuft bis Schritt 4.1 unverändert weiter — Anhalten kostet bis dahin nichts.
**Zwischen dem Anhalten in 4.1 und dem Start in 4.2** heißt STOPP: erst Befehl B (startet den
angehaltenen alten Container wieder), dann an Claude. **Ab 4.2** gibt es den alten Container nicht
mehr (`up -d` legt `hr-portal-app` mit dem neuen Image neu an): bei STOPP nichts starten und nichts
anhalten, nur an Claude — außer dem, was die Tabelle in 4.4 je Fehlerbild nennt. Bei einer
Neustart-Schleife nach gescheitertem Push (4.2, 4.4) sofort Befehl D, sonst nichts, dann an Claude —
nie danach Befehl B, er startete die Schleife wieder. Ein Rückweg geht nur über Abschnitt 7 mit
Claude; dort gelten die Regeln aus 7.3.

**So wird kopiert:** Jeder Befehl steht in einem eigenen Kasten und ist genau eine Zeile. Einzeln
kopieren, ausführen, die Ausgabe mit „Erwartet“ vergleichen. Alles läuft in **einer** SSH-Sitzung
im Projektordner (1.0). Nach einer neuen Anmeldung zuerst wieder 1.0 und — ab 1.6 — die Zeile mit
`UPLOADS_VOL=` ausführen. Keine Befehlszeile enthält mehr als ein Sternchen (Lehre 5 vom 24.09.),
kein Befehl gibt ein Geheimnis aus (die `.env` wird nur gezählt, das Geheimnis in Etappe 2 nur in
seiner Länge geprüft). `git` auf dem Server immer mit `sudo` (Projektordner und `.git` gehören
`root`, Lehre 2 vom 24.09.). Lesende SQL-Befehle tragen `default_transaction_read_only`; lange
SQL-Befehle trotzdem als **eine** Zeile kopieren, nicht abschreiben. Befehle, die etwas schreiben,
sind als „schreibt“ markiert. Ausgaben mit Adressen oder Namen nur auf dem Server ansehen, nie
schicken.

**Uhrzeiten:** Das Protokoll führt Uhrzeiten in UTC (Server und Container laufen in UTC), die
deutsche Zeit in Klammern — bis zum 24.10.2026 UTC + 2 h, ab dem 25.10.2026 (Ende der Sommerzeit)
UTC + 1 h. Zeitfenster und Uhrzeiten der Läufe stehen in deutscher Zeit. Dateinamen wie
`vor-schema-abgleich-JJJJMMTT-HHMMSS.sql` und Zeitstempel aus `docker inspect` sind immer UTC.

---

## 0 · Worum es geht

Der Server läuft seit dem 14.10.2026 auf dem Code `0974b7f` (Standardkatalog „Ausstattung &
Zugänge“, Stufe 1 und 2 in Betrieb). Seitdem sind auf `main` vier Korrekturen am Zugriff
dazugekommen (Verbeamtung nur noch für HR, Datenzuschnitt der Detailrouten, Protokoll nur für die
Bearbeitungsrollen), der Konzeptplan für das Mitarbeiterportal (nur Doku) und Paket **S0
„Personalstamm aus DokuBit“**, dazu am 18.10.2026 ein kleiner Fix an den Status-Kacheln der
Verbeamtung. Dieses Update bringt alles in einem Schritt auf den Server.

An der Datenbank kommen **zwei leere Spalten und ein eindeutiger Index** an der Tabelle
`employments` dazu — nichts wird umbenannt oder gelöscht. Es gibt keine einmalige Datenmigration
und keine neue Mailvorlage. S0 bleibt nach dem Start **ruhend**: Ohne `PERSONALSTAMM_SECRET` nimmt
der neue Webhook nichts an, und ohne n8n-Ablauf liefert niemand Daten. Sofort wirksam sind nur die
neue Leseansicht „Personen“ (zeigt den vorhandenen Bestand), der Schreibschutz der Routen unter
`/api/employees` und die Zugriffskorrekturen. Für HR ändert sich sichtbar der neue Menüpunkt, und
die Status-Kacheln der Verbeamtung zählen im gewählten Filter (Einrichtung, Zeitraum, Suche) statt
wie bisher über alle Vorgänge; die Nebenwirkung von `b474d8a` an diesen Kacheln ist mit `0e1d8de`
vor dem Deploy behoben und kommt nicht auf den Server (unten). Das Portal ist nur beim Neustart einige
Minuten nicht erreichbar.

### Was ausgerollt wird

**Schon live seit dem 14.10.2026** (kommen **nicht** neu): `0974b7f` (Code) und `ea2d41d` (die
damalige Fassung von [deploy-main-2026-10.md](deploy-main-2026-10.md), nur Doku).

**Neu mit diesem Deploy** (`ea2d41d..0e1d8de`, 20 Commits):

| Commit | Was | Merkt HR davon? |
|---|---|---|
| `5595cf7` | Protokoll vom 14.10.2026 in den Deploy-Anleitungen, CLAUDE.md und zwei Feinplänen (nur Doku) | nein |
| `c8b9c6e`, Merge `e6db330` | **Zugriff:** `GET /api/contract-end/[id]` holt das Protokoll des Vorgangs (`auditLogs`) nur noch für die Bearbeitungsrollen (`HR_EDIT_ROLES`), die Schranke sitzt in der Abfrage; in der Verbeamtung sehen die Reiter „Protokoll“ und „E-Mails“ nur diese Rollen | nein — alle vergebbaren HR-Rollen gehören zu den Bearbeitungsrollen |
| `1cffbba`, Merge `457f3f6` | **Zugriff:** Detailrouten Offboarding und Onboarding schneiden je Feld zu: Protokoll nur für die Bearbeitungsrollen, die Abfindung wird nur für `FINANCIAL_ROLES` entschlüsselt, die Aufgaben-Links der Abteilungen (`token`, `departmentLinks[].url`, `abteilungen.zeilen[].link.url`) gehen nur an die Bearbeitungsrollen | nein (HR hat alle drei Rechte) |
| `b474d8a`, Merge `b12a1e9` | **Zugriff:** Verbeamtung ist reine HR-Arbeit — Liste und Detail nur noch für die Bearbeitungsrollen; vier Unterrouten (`POST …/application`, Dokumente lesen, hochladen, herunterladen, löschen) hatten keine Rollen- und keine Mandantenprüfung und sind jetzt dicht; die Status-Zähler der Liste laufen mit demselben Filter wie die Liste | **ja, an den Kacheln:** Sie zählen jetzt im gewählten Filter (Einrichtung, Zeitraum, Suche), live zählen sie über alle Vorgänge ohne jeden Filter. Die **Nebenwirkung** (ein Klick auf eine Status-Kachel setzte die übrigen Kacheln auf 0) ist **behoben mit `0e1d8de`** (letzte Zeile; „Vor dem Termin zu entscheiden“, Punkt 1) und kommt nicht auf den Server |
| `98d0697`, Merge `c82ffec` | Korrektur dazu: Der n8n-Schlüssel (Rolle `SERVICE`) darf weiter an die Verbeamtungs-Dokumente (lesen, hochladen, löschen), trägerübergreifend wie vorher; `POST …/application` bleibt für ihn gesperrt (war für ihn nie benutzbar) | nein |
| `67fdaf3`, `8fbc3fc`, `8a500cc`, `988fcc5`, `15ad5eb`, Merge `ac3535a` (PR #4) | Konzeptplan Mitarbeiterportal (Fassungen 4 bis 6, Designkonzept, Zustimmung von HR, DSB und MAV vom 17.10.2026) — nur Doku | nein |
| `24a8d11` | **S0 „Personalstamm aus DokuBit“:** Webhook `POST /api/webhooks/personalstamm` (Bearer `PERSONALSTAMM_SECRET`), Abgleich, Leseansicht „Personen“ mit „Zu prüfen“ (`/personen`, `GET /api/personalstamm/personen` und `…/pruefen`, nur SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER), Menüpunkt „Personen“, Schema-Delta, Lauf „Wartung“ löscht Protokolleinträge des Abgleichs nach 365 Tagen | **ja:** neuer Menüpunkt „Personen“; bis Etappe 2 nur mit dem vorhandenen Bestand |
| `dfa704b` | S0: Übergabe, Prüfprotokoll, Bauvorgabe (Doku; dazu eine Zeile in einem Test) | nein |
| `00af8d6` | S0: Schreibschutz der Beschäftigtenrouten — sechs Schreib-Handler unter `/api/employees` (`POST`, `PATCH`/`DELETE …/[id]`, `POST …/employments`, `PATCH`/`DELETE …/employments/[employmentId]`) nur noch für die Bearbeitungsrollen statt auch `SERVICE`; Datensätze aus DokuBit gesperrt (409), `POST` mit Quelle `DOKUBIT` 400; je Änderung ein AuditLog-Eintrag (`processType` `PERSONALSTAMM`) | nein — keine Oberfläche des Portals ruft diese Routen auf |
| Merge `a43aa25` (PR #5) | Merge von S0 nach `main` | — |
| `0e1d8de` | **Fix der Status-Kacheln der Verbeamtung** (18.10.2026, vor dem Deploy): `GET /api/civil-service` zählt die Kacheln mit dem Filter der Liste ohne den Status (Mandant, Einrichtung, Zeitraum, Suche — wie die Elternzeit), nur die Liste bekommt zusätzlich den Status; dazu der Test `src/__tests__/api/civil-service-liste-zaehler.test.ts`. Kein Schema, keine Betriebsdatei | nein — nach einem Klick auf eine Kachel behalten die übrigen ihre Zahlen, die Liste zeigt nur den gewählten Status (bei „Abgeschlossen“ erst mit „Archiv anzeigen“; 5.4 Punkt 5) |

### Was sich an Datenbank und Betrieb ändert

- **Schema, rein additiv** (Zählung in 3.4): An `employments` die Spalten `abrechnungskreis` und
  `"personalNumber"` (beide `TEXT`, leer erlaubt, ohne Standardwert) und der eindeutige Index
  `employments_dokubit_vertrag_key` über `("mandantNumber", abrechnungskreis, "personalNumber")`.
  Alle vorhandenen Zeilen bekommen in beiden Spalten `NULL`. PostgreSQL behandelt `NULL` in einem
  eindeutigen Index als verschieden; der Index kann deshalb nicht an Bestandsdaten scheitern.
  `db push` warnt trotzdem mit genau einem Punkt (4.3). Kein `DROP`, kein Typwechsel, kein Enum, kein
  Fremdschlüssel. `Employee.personalNumber` (LOGA-Nummer, Tabelle `employees`) ist eine andere
  Spalte und bleibt unberührt. Die Änderungen an `Employee.importSource` und `AuditLog.processType`
  sind nur Kommentare.
- **Keine einmalige Datenmigration:** `prisma/seed-check.js` und `prisma/seed.ts` sind seit
  `ea2d41d` unverändert, `system_migrations` bleibt bei 13. Die drei System-Vorlagen sind
  unverändert (`public/` gleich), der Start meldet sie dreimal „ist aktuell“.
- **Betriebsdateien:** `Dockerfile`, `docker-compose.yml`, `entrypoint.sh`, `package.json`,
  `package-lock.json`, `next.config.ts`, `.dockerignore`, `src/instrumentation.ts` unverändert —
  `npm ci` kommt im Build voraussichtlich aus dem Zwischenspeicher (die npm-Registry braucht der
  Build trotzdem, 3.3). Geändert:
  `.env.production.example` (+8, die neue Variable), `src/middleware.ts` (+2/−1: `/personen` gilt als
  Portalseite, ohne Sitzung geht es zum Login).
- **Neue Umgebungsvariable `PERSONALSTAMM_SECRET`, optional — mit diesem Deploy NICHT setzen.**
  Der Entrypoint prüft sie nicht; ohne sie startet das Portal normal, und nur der Webhook antwortet
  mit 500 „Konfigurationsfehler“, bevor er den Körper liest. Gesetzt wird sie erst in Etappe 2
  (8.2). Die `.env` bleibt in Etappe 1, wie sie ist.
- **Rollen und Routen:** keine neue Rolle. Für die drei HR-Rollen ändert sich nichts (sie sind
  zugleich `HR_EDIT_ROLES`, `GLOBAL_ROLES` und `FINANCIAL_ROLES`). Weniger sähen nur
  EINRICHTUNGSLEITUNG und VORGESETZTER; beide lassen sich heute nicht vergeben, und die Middleware
  sperrt sie für jeden API-Pfad außer `/api/auth` (1.7 zählt die Konten je Rolle). Den n8n-Schlüssel
  (Rolle `SERVICE`) gibt es nur mit gesetztem `N8N_API_KEY` (am 14.10.: nicht gesetzt, 1.9); er bekommt ab
  dem Deploy 403 beim Schreiben unter `/api/employees` und bei `POST /api/civil-service/[id]/application`,
  Lesen unter `/api/employees` und die Verbeamtungs-Dokumente bleiben ihm.
- **AuditLog:** Jede erfolgreiche Änderung von Hand unter `/api/employees` schreibt ab dem Deploy
  einen Eintrag `PERSONALSTAMM_PERSON_…`/`PERSONALSTAMM_ANSTELLUNG_…` (nur IDs und Feldnamen).
- **Automatische Läufe:** weiter elf, kein neuer. „Wartung“ löscht zusätzlich AuditLog-Einträge mit
  `processType` `PERSONALSTAMM`, die älter als 365 Tage sind (Probelauf zählt nur), mit neuer Zeile
  im Bericht und neuer Beschreibung im Katalog. Solange „Wartung“ aus ist, greift die Frist nicht —
  heute ohne Folgen, die ersten Einträge entstehen frühestens mit dem Deploy (6.2).
- **Mailvorlagen und Webhooks:** keine Änderung (`events.ts`, `default-email-templates.ts`,
  `mailer.ts`, `webhooks.ts`, `ereignis-liste.ts` unverändert). Kein „Text auf Standard zurücksetzen“.
- **Volume `uploads_data`:** nichts zu tun.
- **Seed:** Auf dem Server **nie** `node prisma/seed.js` ausführen (6.3).

<sub>Belege für Claude: Schema `prisma/schema.prisma` (Modell `Employment`, `@@unique … map:
"employments_dokubit_vertrag_key"`); Webhook `src/app/api/webhooks/personalstamm/route.ts`
(Konfiguration vor Anmeldung, 1 MiB, 200 Einträge); Schreibschutz
`src/lib/personalstamm/schreibschutz.ts` und die vier Routen unter `src/app/api/employees/`;
Ansicht `src/app/(portal)/personen/`, `src/components/personen/zu-pruefen.tsx`; Wartung
`src/lib/laeufe/wartung.ts`, `src/lib/zeitplaner/bericht.ts`, `src/lib/zeitplaner/katalog.ts`;
Rollen `src/lib/permissions.ts`, `src/lib/mandanten-gate.ts`; `SERVICE` nur über `N8N_API_KEY` in
`src/lib/auth.ts`; Verbeamtung `src/app/api/civil-service/route.ts` (seit `0e1d8de`:
`groupBy … where: baseWhere`, die Liste `baseWhere` plus `status`), Test
`src/__tests__/api/civil-service-liste-zaehler.test.ts`,
`src/components/process-dashboard/process-dashboard.tsx` (`params.set("status", …)`,
`handleStatusFilter`). Zählungen und Dateilisten `ea2d41d..0e1d8de` am 18.10.2026 aus dem Repo
nachgerechnet.</sub>

### Was NICHT dabei ist

- **Kein `PERSONALSTAMM_SECRET`, kein n8n-Stammablauf, kein Abgleich** — das ist Etappe 2
  (Abschnitt 8), erst nach den Freigaben.
- **Kein Lauf außer „Wartung“** (6.2, empfohlen, ohne Freigabe möglich); kein „Jetzt ausführen“
  anderer Läufe.
- **Branch `ux-umbau`** und Paket S1 (Keycloak): nicht in diesem Deploy. `ux-umbau` (Stand
  16.10.2026) enthält S0 nicht; vor seinem Deploy muss `main` hinein, und zwar erst nach dem Merge
  dieses Pull Requests (7.1, Abschnitt 10, Punkt 9).
- Keine Änderung an Mailvorlagen, Webhooks, Caddy, `docker-compose.yml` oder n8n.
- Bekannte Schwächen außerhalb von S0, die bleiben: der Vertragsende-Webhook sucht über die MANR ohne
  Abrechnungskreis (Übergabe S0, Abschnitt 6, eigene Aufgabe); keine Verknüpfung Onboarding ↔
  Personalstamm (E-S11); die Kachel „Frist!“ der Verbeamtung filtert auf einen Status `OVERDUE`, den
  es im Enum `CivilServiceStatus` nicht gibt — die Liste antwortet nach einem Klick mit 500 und
  bleibt leer, schon live auf `0974b7f` (5.4 Punkt 5, eigene Aufgabe).

### Dauer (Schätzung, nichts gemessen)

| Abschnitt | Dauer | Portal |
|---|---|---|
| 1–2 Vorher prüfen, altes Image sichern | 20–30 min | läuft |
| 3 Holen, bauen, Vorschau | 10–20 min (`npm ci` voraussichtlich aus dem Zwischenspeicher; `next build` läuft neu; die npm-Registry braucht der Build trotzdem, 3.3) | läuft |
| 4.1–4.3 Anhalten, Sicherungen, Start | etwa 5 min (14.10.: 11:13 bis 11:17 UTC) | **nicht erreichbar** |
| 5 Nachher prüfen, Probe | 20–30 min | läuft (HR wartet bis 5.5) |
| 6 Bestandsprüfung, Lauf „Wartung“ | 20–30 min | läuft |
| 8 Etappe 2 (eigener Termin) | 60–90 min, dazu ein Blick am nächsten Morgen | läuft, nur in 8.2 etwa eine Minute weg; HR speichert von 8.4 bis zum Ende von 8.6 nichts |

### Zeitfenster

- **An einem Werktag, an dem HR erreichbar ist.**
- **Nicht zwischen 07:00 und 08:45, nicht nachts.** Die Standardzeiten der Läufe liegen bei
  03:00–03:30 (Löschläufe) und 07:00–08:30 (Erinnerungen und Fristen). Am 14.10. waren alle aus;
  1.8 zeigt, ob das noch so ist.
- **Nicht montags gegen 09:00:** Dann liefert der n8n-Flow „Email-Vertragsende-Personal 3.0“ die
  Vertragsenden ins Portal (`/api/webhooks/contract-end`).
- Gut geeignet: Dienstag bis Freitag zwischen 10 und 12 Uhr.
- **HR am Vortag informieren** und bitten, ab 4.1 bis zum Bescheid in 5.5 nichts im Portal zu
  speichern. Öffentliche Links (Fragebogen, Modalitäten, Upload-Seite, Aufgabenseiten) lassen sich
  nicht anhalten — wer sie in diesen Minuten öffnet, sieht eine Fehlerseite und versucht es später.

**Textvorschlag für die Ankündigung:** „Am [Tag] zwischen [Uhrzeit] und [Uhrzeit] wird das
HR-Portal aktualisiert. Es ist dabei für einige Minuten nicht erreichbar. Bitte speichern Sie in
dieser Zeit nichts im Portal; wir geben Bescheid, sobald es wieder läuft.“

### Vor dem Termin zu entscheiden

1. **Status-Kacheln der Verbeamtung — entschieden und erledigt (18.10.2026).** Seit `b474d8a` bekam
   die Zählung der Kacheln denselben Filter wie die Liste, also auch den gewählten Status; ein Klick
   auf eine Kachel ließ die übrigen auf 0 fallen. Der Auftraggeber hat am 18.10.2026 entschieden, das
   vor dem Deploy zu beheben: `0e1d8de` zählt ohne `status`, wie die Elternzeit (Schema
   unverändert). Ziel, 3.2, 8.1 und die Protokollvorlagen stehen auf diesem Code-Stand; 5.4 Punkt 5
   erwartet Kacheln, die nach einem Klick ihre Zahlen behalten.
2. **`PERSONALSTAMM_SECRET` erst in Etappe 2.** Diese Anleitung setzt es mit dem Deploy nicht: Bis
   zum ersten Lauf bleibt ein Rückfall auf das alte Image ohne Datenverlust (7.3), und die
   organisatorische Schwelle sitzt im Datenfluss (ohne Geheimnis keine Annahme). Liegen am Tag des
   Deploys alle Freigaben aus 8.0 vor, kann Abschnitt 8 am selben Tag folgen.
3. **Lauf „Wartung“ am Tag des Deploys einschalten** (6.2) oder erst vor Etappe 2. Er ist Pflicht für
   die Löschfrist von S0 und setzt nebenbei die 90 Tage für das Versandprotokoll durch.
4. **Stand der Punkte „Offen nach dem Deploy“ vom 14.10.** beim Projektverantwortlichen abfragen
   (Abschnitt 10, Punkt 5) — das Repo belegt nur den letzten (Protokoll auf `main`, `5595cf7`) als
   erledigt; davon hängen 1.8 und 6.2 ab.
5. **Pull Request vor dem Termin mergen — auf GitHub mit „Create a merge commit“**, nicht mit
   „Squash and merge“ oder „Rebase and merge“. Beide erzeugen neue Commits: `0e1d8de` fehlte auf
   `main`, und 3.2 hielte auf dem Server an, auch wenn der Code derselbe wäre. Danach auf dem
   Entwicklerrechner (nicht auf dem Server) prüfen:
   `git fetch origin && git merge-base --is-ancestor 0e1d8de8cf0d5b714c059140b9f2f09552eb00d1 origin/main && echo "0e1d8de auf main"`.
   Fehlt die Zeile → nicht deployen, an Claude (die festen Stände dieser Anleitung sind dann
   nachzuführen).

---

## 1 · Vorher (nur lesen)

Alle Befehle dieses Abschnitts lesen nur. Drei Ausnahmen: 1.0 legt einen Arbeitsordner im
Home-Verzeichnis an (außerhalb des Repos), die Schreibtests in 1.4 legen je eine leere Datei an und
löschen sie sofort, und Befehl A in 1.4 (nur bei Bedarf) übergibt den Ordner `backups` an die
Kennung 1001.

### 1.0 Projektordner und Arbeitsordner

```bash
cd /vol/container/HR_Portal_CREDO
```

```bash
mkdir -p ~/deploy-selfservice-s0
```

**Erwartet:** keine Ausgabe. In `~/deploy-selfservice-s0/` landen die Arbeitsdateien.

### 1.1 Stand des Repos (der wichtigste Schritt)

```bash
sudo git log -1 --oneline
```

**Erwartet** (Stand laut Protokoll vom 14.10.2026):

```
ea2d41d docs(deploy): gemeinsamer Deploy f6d3daf -> main mit Ausstattung & Zugaenge
```

Etiketten wie `(HEAD -> main, origin/main, origin/HEAD)` dahinter sind in Ordnung. Ebenfalls in
Ordnung ist `5595cf7 docs(deploy): Protokoll vom 14.10.2026 - Deploy ab b6e1c8a mit Ausstattung &
Zugaenge` — dann hat jemand nur die Doku nachgezogen (im Protokoll notieren). Jeder andere Stand →
**STOPP, Ausgabe an Claude.**

```bash
sudo git reflog -3 --date=iso
```

**Erwartet:** oben eine Zeile mit `ea2d41d` (bzw. `5595cf7`) vom 14.10.2026 (oder später, falls nur
`5595cf7` gezogen wurde) und `pull: Fast-forward`. Nur notieren — die Zeilen sind der Beleg für die
Vorgeschichte im Protokoll. Steht oben ein späterer Pull mit einem anderen Commit → **STOPP,
Ausgabe an Claude.**

```bash
sudo git status --short
```

**Erwartet:** nur Zeilen `?? backups/<datei>`, darunter die Sicherungen vom 14.10.
(`vor-deploy-main-2026-10-manuell.sql`, `vor-deploy-main-2026-10-entrypoint.sql`,
`uploads-vor-deploy-main-2026-10.tar.gz`, `vor-schema-abgleich-20261014-111652.sql`). Zeilen mit `M`
oder `??` außerhalb von `backups/` → **STOPP, Ausgabe an Claude.** Nie `git add -A`, `git stash -u`
oder `git clean` — das sammelt oder löscht die Sicherungen.

```bash
ls docker-compose.override.yml 2>/dev/null || echo "kein Override"
```

**Erwartet:** `kein Override`. Weicht ab → **STOPP, Ausgabe an Claude.**

### 1.2 Laufende Container

```bash
sudo docker compose ps
```

**Erwartet:** `hr-portal-app`, `hr-portal-db` und `hr-portal-gotenberg` laufen (`Up`),
`hr-portal-app` und `hr-portal-db` mit `(healthy)`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo docker inspect --format '{{.Created}} {{.Image}}' hr-portal-app
```

**Erwartet** (laut Protokoll vom 14.10.2026; die volle ID steht nicht im Repo):

```
2026-10-14T11:1…Z sha256:64e1319792ff…
```

Maßgeblich sind der Anfang `2026-10-14T11:1` (UTC) und `sha256:64e1319792ff`. **Die volle ID
notieren** — 2.1 und 7.3 vergleichen mit ihr. Ein anderes Datum oder ein anderes Image → **STOPP,
Ausgabe an Claude** (dann wurde seit dem 14.10. neu gebaut oder neu angelegt).

### 1.3 Die Datenbank entspricht dem Schema von `0974b7f`

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

**Erwartet:** `0`. Bei `2` wurde die Datenbank außerhalb eines Deploys verändert, bei `1` gab es
einen Fehler → **STOPP, Ausgabe an Claude.** Der Vergleich nimmt die Schema-Datei des laufenden
Images, also `0974b7f`.

### 1.4 Sicherungsverzeichnis (sonst bricht der Start ab)

```bash
grep -c "backups:/backups" docker-compose.yml
```

**Erwartet:** `2` (bei `app` und bei `db`). Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo docker exec hr-portal-app sh -c 'echo "DB_BACKUP_DIR=${DB_BACKUP_DIR:-/backups (Standard)}"'
```

**Erwartet:** `DB_BACKUP_DIR=/backups (Standard)`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
stat -c '%a %u %U %n' backups
```

**Erwartet:** `775 1001 n8n backups` (am 14.10. so gesehen; maßgeblich ist der Eigentümer `1001`).

Die beiden Schreibtests darunter laufen **immer**. Befehl A nur bei Bedarf: Steht oben eine andere
Zahl als `1001`, zuerst Befehl A, dann die Schreibtests. Meldet ein Schreibtest
`Permission denied`, Befehl A ausführen und den Test wiederholen.

Befehl A (nur bei Bedarf, aus CLAUDE.md):

```bash
sudo chown 1001 backups
```

**Erwartet:** keine Ausgabe.

Schreibtest der App (Kennung `nextjs`, wie der Entrypoint):

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$PWD/backups:/backups" "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)" -c 'id; touch /backups/.schreibtest && rm /backups/.schreibtest && echo OK'
```

**Erwartet:** `uid=1001(nextjs) gid=65533(nogroup) …` und darunter `OK`. Bleibt `OK` aus → Befehl A,
wiederholen; bleibt es dann aus → **STOPP, Ausgabe an Claude.**

Schreibtest der Datenbank (für die eigene Sicherung in 4.1):

```bash
sudo docker exec hr-portal-db sh -c 'touch /backups/.schreibtest-db && rm /backups/.schreibtest-db && echo OK'
```

**Erwartet:** `OK`. Weicht ab → **STOPP, Ausgabe an Claude.**

### 1.5 Freier Platz, Images, Sicherungen

```bash
df -h . "$(sudo docker info --format '{{.DockerRootDir}}')"
```

**Erwartet:** zwei Zeilen unter der Kopfzeile, die erste für den Projektordner, die zweite für
Docker. Spalte `Avail` (deutsch `Verf.`): in der zweiten Zeile **mindestens 3 GB** (14.10. nach
der Vergrößerung: 71 G frei), in der ersten mindestens 1 GB. Weniger → **STOPP, Ausgabe an
Claude** — nicht selbst mit `docker image prune` oder `docker system prune` aufräumen (7.1).

```bash
sudo docker image ls
```

**Erwartet:** darin `hr_portal_credo-app   latest   64e1319792ff` (14.10.: 664 MB),
`hr-portal-app   b6e1c8a   5b1a01dd32ef` und — falls noch vorhanden — `hr-portal-app   6124936` und
`ae490ba` (beide `99579d69bec0`). Nur notieren; ein Etikett `hr-portal-app   0974b7f` gibt es noch
nicht (2.1). Fehlermeldung statt Liste → **STOPP, Ausgabe an Claude.**

```bash
sudo du -sh backups
```

**Erwartet:** eine Größe. Nur notieren.

```bash
sudo ls -1 backups | grep -c '^vor-schema-abgleich-'
```

**Erwartet:** eine Zahl. Nur notieren — der Entrypoint behält zehn eigene Sicherungen; ab der elften
entfernt er beim Start die älteste (Zeile `Alte Sicherung entfernt: …` in 4.3, in Ordnung). Die
Kopien unter festen Namen (4.5) fasst er nie an.

### 1.6 Uploads-Volume finden

```bash
UPLOADS_VOL=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' hr-portal-app)
```

**Erwartet:** keine Ausgabe (die Zeile merkt sich nur den Namen für 2.2 und 4.1).

```bash
echo "Volume: $UPLOADS_VOL"
```

**Erwartet:** `Volume: hr_portal_credo_uploads_data`. Steht hinter `Volume:` nichts → **STOPP,
Ausgabe an Claude.**

```bash
sudo du -sh "$(sudo docker volume inspect --format '{{.Mountpoint}}' "$UPLOADS_VOL")"
```

**Erwartet:** eine Größe (14.10.: 167 MB, eher etwas mehr). Notieren.

### 1.7 Datenbank: S0 noch nicht da, Bestand, Merker, Konten, System-Vorlagen

**Die Spalten und der Index von S0 gibt es noch nicht:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = $$public$$ AND table_name = $$employments$$ AND column_name IN ($$abrechnungskreis$$, $$personalNumber$$)) AS neue_spalten, to_regclass($$public.employments_dokubit_vertrag_key$$) AS neuer_index;'
```

**Erwartet:** `0 |` — `neue_spalten` = `0`, `neuer_index` leer. Weicht ab → **STOPP, Ausgabe an
Claude** (widerspricht 1.3).

**Bestand der Beschäftigtendaten** (zählt nur, zeigt keine Namen):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM employees) AS personen, (SELECT COUNT(1) FROM employees WHERE "importSource" = $$DOKUBIT$$) AS aus_dokubit, (SELECT COUNT(1) FROM employments) AS anstellungen, (SELECT COUNT(1) FROM audit_logs WHERE "processType" = $$PERSONALSTAMM$$) AS protokoll_personalstamm;'
```

**Erwartet:** vier Zahlen; `personen` und `anstellungen` notieren (4.1 und 5.2 vergleichen damit),
`aus_dokubit` = `0` und `protokoll_personalstamm` = `0`. Eine der beiden letzten größer 0 → **STOPP,
Ausgabe an Claude** (das alte Image kennt beides nicht).

**Merker der einmaligen Migrationen:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT COUNT(1) AS merker FROM system_migrations;'
```

**Erwartet:** `13` (seit dem 14.10.). Weicht ab → **STOPP, Ausgabe an Claude.**

**Konten je Rolle** (belegt die Aussage „für HR ändert sich nichts“; zeigt keine Namen):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT role::text AS rolle, COUNT(1) AS konten, COUNT(1) FILTER (WHERE "isActive") AS aktiv FROM users GROUP BY 1 ORDER BY 1;'
```

**Erwartet:** nur Zeilen mit `SUPER_ADMIN`, `HR_LEITUNG`, `HR_SACHBEARBEITER` und gegebenenfalls
`BEM_BEAUFTRAGTER` (14.10.: 7 Konten insgesamt). Eine Zeile `EINRICHTUNGSLEITUNG` oder
`VORGESETZTER` → kein STOPP, an Claude (diese Rollen sehen nach dem Deploy weniger; heute sperrt sie
die Middleware ohnehin von allen Schnittstellen außer der Anmeldung).

**System-Vorlagen** (sagt die drei Zeilen in 4.3 voraus):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT name, modul, "originalName", "isActive" AS aktiv, left(hash, 12) AS hash_anfang FROM document_templates WHERE "isSystem" ORDER BY modul, "originalName", "createdAt";'
```

**Erwartet:** vier Zeilen (Stand nach dem 14.10.): `Rückgabeprotokoll Ausstattung | OFFBOARDING |
Rueckgabeprotokoll-Ausstattung.docx | t`, zwei Zeilen `Aufforderung erweitertes Führungszeugnis …`
mit `Fuehrungszeugnis-Antrag.docx` und `aktiv` = `f`, `Übergabeprotokoll Ausstattung | ONBOARDING |
Uebergabeprotokoll-Ausstattung.docx | t` (seit 5.3 Schritt 5 am 14.10. eingeschaltet). Kein STOPP:
Abweichungen nur notieren — zwei eingeschaltete Zeilen mit demselben `originalName` lassen den Start
„Duplikat der System-Vorlage …“ melden (an Claude, das Portal läuft trotzdem).

### 1.8 Automatische Läufe

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT schluessel, aktiv, probelauf, uhrzeit FROM automatische_laeufe ORDER BY uhrzeit, schluessel;"
```

**Erwartet:** `(11 rows)`. Am 14.10. stand in `aktiv` überall `f`; seitdem können Läufe
eingeschaltet worden sein („Offen nach dem Deploy“ vom 14.10., Punkte 2 und 7). **Kein STOPP** —
notieren, welche Läufe `aktiv` = `t` haben und um welche Uhrzeit. Liegt einer davon innerhalb einer
halben Stunde um das geplante Zeitfenster, den Termin verschieben. Die Zeile `wartung` (`aktiv`,
`probelauf`) entscheidet über 6.2.

### 1.9 Umgebung und die neue Route (nur lesen)

**n8n-API-Schlüssel** (zählt nur, ob einer eingetragen ist):

```bash
sudo grep -c '^N8N_API_KEY=.' .env
```

**Erwartet:** `0` (am 14.10. so). Bei `1` kein STOPP, aber an Claude: Der Schlüssel (Rolle
`SERVICE`) bekommt ab dem Deploy 403 beim Schreiben unter `/api/employees` und bei
`POST /api/civil-service/[id]/application`; laut Auftraggeber schreibt kein n8n-Ablauf dorthin.
Lesen unter `/api/employees` und die Verbeamtungs-Dokumente bleiben ihm.

**Das Geheimnis von S0 ist noch nicht eingetragen:**

```bash
sudo grep -c '^PERSONALSTAMM_SECRET=' .env
```

**Erwartet:** `0`. Bei `1` → **STOPP, Ausgabe an Claude** (dann wäre der Webhook womöglich ab dem
Start offen, gegen die Annahme dieser Anleitung).

**Die neue Route gibt es noch nicht** (von außen, schreibt nichts):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://hr.fes-credo.de/api/webhooks/personalstamm
```

**Erwartet:** voraussichtlich `404` (nicht gemessen). Nur notieren — 5.3 vergleicht damit.

---

## 2 · Sichern, Teil 1 (Portal läuft)

### 2.1 Altes Image etikettieren (für den Rückfall)

Das laufende Image ist das vom 14.10. mit `0974b7f`; 1.2 hat seine ID bestätigt. Das Etikett geht
auf genau diese ID, nicht auf „das, was gerade läuft“ — so lässt sich die Zeile gefahrlos
wiederholen, auch nach dem Start in 4.2. Docker nimmt die gekürzte ID an:

```bash
sudo docker tag 64e1319792ff hr-portal-app:0974b7f
```

**Erwartet:** keine Ausgabe. `No such image` → **STOPP, Ausgabe an Claude** (dann stimmt 1.2 nicht).

Worauf die Etiketten zeigen (nur lesend):

```bash
for t in 0974b7f b6e1c8a; do printf '%-9s %s\n' "$t" "$(sudo docker image inspect --format '{{.Id}}' hr-portal-app:$t 2>/dev/null | grep . || echo fehlt)"; done; printf '%-9s %s\n' laufend "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)"
```

**Erwartet** drei Zeilen:

```
0974b7f   sha256:64e1319792ff…
b6e1c8a   sha256:5b1a01dd32efde8c7de85f0f78204e994614fe4d1c399554c5a1b06002fa9f72
laufend   sha256:64e1319792ff…
```

Bedingung: Die Zeile `0974b7f` trägt genau die volle ID aus 1.2 und ist gleich `laufend`. Weicht
sie ab oder steht dort `fehlt` → **STOPP, Ausgabe an Claude.** (Nach 4.2 zeigt `laufend` das neue
Image; dann zählt nur die Zeile `0974b7f`.) Die Zeile `b6e1c8a` ist nur zur Information — dieses
Image taugt für keinen Rückfall mehr (7.1).

```bash
sudo docker image ls hr-portal-app
```

**Erwartet:** eine Zeile `hr-portal-app   0974b7f   64e1319792ff`, dazu `b6e1c8a` und — falls noch
vorhanden — `6124936` und `ae490ba`. Fehlt `0974b7f` → **STOPP, Ausgabe an Claude.** Ohne dieses
Etikett wäre das alte Image nach dem Build namenlos; vor `docker image prune -a` und
`docker system prune -a` schützt aber auch das Etikett nicht (7.1).

### 2.2 Leseprobe der Uploads

Liest das ganze Volume mit derselben Kennung und demselben Image wie die Sicherung in 4.1, nur
lesend und ohne ein Archiv zu schreiben. `UPLOADS_VOL` stammt aus 1.6.

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" hr-portal-app:0974b7f -c 'set -o pipefail; find /daten -type f | wc -l; tar cf - -C /daten . | wc -c && echo "tar OK"'
```

**Erwartet:** zwei Zahlen (14.10.: 535 Dateien, 181.861.888 Bytes; jetzt gleich oder mehr) und
`tar OK`. Fehlt `tar OK` → **STOPP.** Die Fehlerzeilen nur auf dem Server ansehen, nicht schicken:
Sie nennen Dateinamen, und ältere Uploads tragen den Originalnamen der Datei, oft mit dem Namen
einer Person. An Claude geht nur die Ausgabe des Prüfbefehls darunter.

Prüfbefehl (nur bei fehlendem `tar OK`; liest nur und zählt die Fehlermeldungen ohne Pfade):

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" hr-portal-app:0974b7f -c 'tar cf - -C /daten . 2>/tmp/f | wc -c >/dev/null; sed "s/.*: //" /tmp/f | sort | uniq -c'
```

**Erwartet:** je Fehlerart eine Zeile mit Anzahl, etwa `2 Permission denied` (lokal mit BusyBox-`tar`
geprobt). Diese Ausgabe an Claude.

### 2.3 Wann die übrigen Sicherungen entstehen

Die Sicherung der Datenbank und das Archiv der Uploads entstehen erst in **4.1**, bei angehaltenem
Portal, direkt vor dem Start — nur so enthalten sie den letzten Stand. Die Sicherung des
Entrypoints schreibt `pg_dump` 18 und lässt sich nicht unverändert in PostgreSQL 16 einspielen
(Lehre 3 vom 24.09.); maßgeblich für einen Rückfall ist die eigene aus 4.1.

---

## 3 · Holen, bauen und prüfen (Portal läuft)

### 3.1 Code holen

```bash
sudo git fetch origin && sudo git checkout main && sudo git pull
```

**Erwartet:** `Already on 'main'`, dann `Updating ea2d41d..…` (bzw. `5595cf7..…`, falls 1.1 das
zeigte) und `Fast-forward` mit einer Dateiliste. Hinter den zwei Punkten steht der neueste Commit auf
`main` — nur notieren, geprüft wird in 3.2. Zeilen vom Holen (`From …`, `[new branch]`,
`-> origin/…`) und `Your branch is behind 'origin/main' …` sind normal. Konflikt, `error`, `fatal`
oder eine Frage nach Zugangsdaten → **STOPP, Ausgabe an Claude.** Das Portal läuft weiter.

### 3.2 Was angekommen ist

```bash
sudo git --no-pager log --oneline -12
```

**Erwartet:** oben mit `(HEAD -> main, origin/main, origin/HEAD)` der Commit, der diese Anleitung
brachte. Nach einem Merge über GitHub mit „Create a merge commit“ (Hausverfahren, Abschnitt 0, „Vor
dem Termin zu entscheiden“, Punkt 5) ist das ein Merge-Commit `Merge pull request #… from
…/fix/verbeamtung-kacheln-deploy-s0`, darunter die Doku-Commits des Pull Requests (wie viele, hängt
davon ab, was bis zum Merge noch dazukommt), weiter unten `0e1d8de fix(verbeamtung):
Status-Kacheln zählen wieder ohne den gewählten Status` und darunter `a43aa25 Merge pull request #5
from …/feat/selfservice-s0-personalstamm`; nach einem Fast-Forward-Push ohne den
GitHub-Knopf (nicht vorgesehen) stehen die Doku-Commits oben, darunter `0e1d8de` und `a43aa25`.
Kam diese Anleitung nicht über `main`, steht `0e1d8de` selbst oben und `a43aa25` direkt darunter.
Fehlen `0e1d8de` oder `a43aa25` in den zwölf Zeilen, mit `-30` statt `-12` mehr Zeilen ansehen. Nur
zum Ansehen, keine dieser Formen ist ein STOPP — ob S0 (`a43aa25`) und der Code-Stand `0e1d8de`
enthalten sind und darüber nur Doku liegt, prüfen die nächsten Befehle gegen diese festen Stände.

```bash
sudo git merge-base --is-ancestor a43aa25 HEAD && echo "a43aa25 enthalten"
```

**Erwartet:** `a43aa25 enthalten`. Fehlt die Zeile (dann fehlt der Merge von S0) → **STOPP,
Ausgabe an Claude.**

```bash
sudo git rev-parse --verify a43aa25
```

**Erwartet:** genau `a43aa25cdb6bae53f5ddda3c9a8b303ac422d13c`. Weicht ab → **STOPP, Ausgabe an
Claude.**

Der Code-Stand dieses Deploys (Fix der Status-Kacheln) ist enthalten — mit vollem Hash, so prüft
die Zeile zugleich, dass es genau dieser Commit ist:

```bash
sudo git merge-base --is-ancestor 0e1d8de8cf0d5b714c059140b9f2f09552eb00d1 HEAD && echo "0e1d8de enthalten"
```

**Erwartet:** `0e1d8de enthalten`. Fehlt die Zeile (dann fehlt der Fix; steht dort
`fatal: Not a valid commit name …`, kennt das Repo den Commit gar nicht) → **STOPP, Ausgabe an
Claude.** Dasselbe Bild entsteht, wenn der Pull Request per „Squash and merge“ oder „Rebase and
merge“ übernommen wurde — dann kann der Code derselbe sein, aber die festen Stände dieser Anleitung
stimmen nicht mehr; auch dann STOPP, Claude führt sie nach.

```bash
sudo git rev-list --count ea2d41d..0e1d8de
```

**Erwartet:** `20`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git rev-list --count --merges ea2d41d..0e1d8de
```

**Erwartet:** `6` (`e6db330`, `457f3f6`, `b12a1e9`, `c82ffec`, `ac3535a`, `a43aa25`). Weicht ab →
**STOPP, Ausgabe an Claude.**

Nur wer die Liste sehen will (optional; die Commits stehen in Abschnitt 0):

```bash
sudo git --no-pager log --oneline --no-decorate ea2d41d..0e1d8de
```

**Erwartet:** 20 Zeilen, oben `0e1d8de`, darunter `a43aa25`, unten `5595cf7`.

Der Merge bringt genau den Stand des S0-Zweigs:

```bash
sudo git diff --quiet 00af8d6 a43aa25 && echo "Merge gleich S0-Zweig"
```

**Erwartet:** `Merge gleich S0-Zweig`. Fehlt die Zeile → **STOPP, Ausgabe an Claude.**

Nach `0e1d8de` darf nur noch Doku kommen — Dateien unter `docs/` sowie `CLAUDE.md` und `README.md`
im Projektordner (`.dockerignore` schließt `*.md` im Projektordner aus, `CLAUDE.md` und `README.md`
kommen also nie ins Image):

```bash
sudo git diff --quiet 0e1d8de HEAD -- . ':!docs' ':!CLAUDE.md' ':!README.md' && echo "nach 0e1d8de nur Doku"
```

**Erwartet:** `nach 0e1d8de nur Doku`. Fehlt die Zeile → **STOPP, Ausgabe an Claude.**

```bash
sudo git diff --name-only 0e1d8de HEAD
```

**Erwartet:** nur Zeilen, die mit `docs/` beginnen, dazu höchstens `CLAUDE.md` und `README.md` —
wie viele, hängt davon ab, welche Doku-Commits bis zum Merge noch dazukommen (unter anderem diese
Anleitung `docs/historie/deploy-selfservice-s0-2026-10.md`, die Übergabe S0, die Korrektur der
Anleitung S0 und die Nachträge vom 18.10.2026 für die Arbeit an einem anderen Rechner). Gar keine
Zeile, wenn `HEAD` gleich `0e1d8de` ist. Nur notieren; eine Zeile außerhalb davon hätte schon der
Befehl davor gemeldet.

```bash
sudo git diff --numstat ea2d41d 0e1d8de -- docker-compose.yml Dockerfile entrypoint.sh package.json package-lock.json .env.production.example .dockerignore next.config.ts prisma/schema.prisma prisma/seed-check.js prisma/seed.ts public/system-dokumente src/middleware.ts src/instrumentation.ts
```

**Erwartet:** genau diese drei Zeilen (Zahlen und Namen durch Tabulatoren getrennt; aus dem Repo
nachgerechnet):

```
8	0	.env.production.example
10	2	prisma/schema.prisma
2	1	src/middleware.ts
```

Weicht ab → **STOPP, Ausgabe an Claude.** (`--numstat` statt `--stat`, weil `--stat` je nach
Fensterbreite anders aussieht.)

```bash
sudo git diff --quiet ea2d41d 0e1d8de -- package.json package-lock.json && echo "package.json und package-lock unveraendert"
```

**Erwartet:** `package.json und package-lock unveraendert`. Weicht ab → **STOPP, Ausgabe an
Claude.**

```bash
sudo git status --short
```

**Erwartet:** wie in 1.1, nur Zeilen `?? backups/…`. Weicht ab → **STOPP, Ausgabe an Claude.**

> **Die Ausgaben von 3.2 an Claude schicken**, nicht nur „bestanden“ melden (am 14.10. kamen sie
> nicht an).

### 3.3 Image bauen (das Portal läuft weiter)

```bash
sudo docker compose build app
```

**Erwartet:** Der Build endet ohne `ERROR`. `package.json` und `package-lock.json` sind seit dem
Build vom 14.10. unverändert (3.2); ist der Zwischenspeicher noch da, steht bei
`RUN npm ci --ignore-scripts` voraussichtlich `CACHED` (nicht gemessen), sonst läuft `npm ci` neu
— beides in Ordnung. `npx prisma generate` und `npm run build` laufen in jedem Fall neu. Der alte
Container läuft dabei unverändert weiter.

**Die npm-Registry braucht der Build in jedem Fall:** Auch mit `CACHED` bei `npm ci` laufen
`npx --yes esbuild@0.24` (Builder-Stufe, hinter `COPY . .`; das Lockfile kennt nur esbuild 0.27.3,
0.24 wird jedes Mal geladen) und `npm install -g prisma@6.9.0` (Runner-Stufe, hinter dem Kopieren
des Builds, mit der Zeile `Prisma CLI: 6.9.0 (muss zum generierten Client passen)`) neu.

**Bekannt, kein Grund zum Abbruch:** Zeilen `npm warn …` (etwa `npm warn exec …`) und
`npm notice …` von diesen beiden Schritten; nur wenn `npm ci` neu läuft, zusätzlich
`npm warn deprecated …` und eine Zusammenfassung `… vulnerabilities (…)` mit dem Rat
`npm audit fix` (nicht ausführen). In jedem Fall `⚠ Compiled with warnings` mit dem Hinweis, `jose`
nutze eine Node.js-API, die die Edge Runtime nicht kennt (`CompressionStream`), danach trotzdem
`✓ Compiled successfully …`, dazu ESLint-Warnungen (`react-hooks/exhaustive-deps`).

**STOPP, Ausgabe an Claude** nur bei `ERROR` (`npm error`, `ERROR: failed to solve …`) oder einer
Netzwerk-Meldung (`ETIMEDOUT`, `ENOTFOUND`, `ECONNRESET`, ein Fehler mit `registry.npmjs.org`).
**Ausnahme ohne STOPP:** „An error occurred in `next/font`“ (Google Fonts kurz nicht erreichbar) —
den Befehl einmal wiederholen; erst beim zweiten Mal STOPP.

Am Ende das Log oder zumindest die letzten Zeilen an Claude schicken.

Das neue Image (nur lesend):

```bash
sudo docker image inspect --format '{{.Id}} {{.Created}}' hr_portal_credo-app:latest
```

**Erwartet:** eine ID, die **nicht** mit `sha256:64e1319792ff` beginnt, und eine Erstellzeit von heute
(UTC). **Die volle ID notieren** — 5.1 und in Etappe 2 der Abschnitt 8.1 vergleichen mit ihr. Steht
dort noch `sha256:64e1319792ff…` → **STOPP, Ausgabe an Claude** (der Build hat kein neues Image
erzeugt).

### 3.4 Vorschau: Was `db push` gleich tun wird (nur lesend)

Der Befehl startet das **neue** Image einmal kurz ohne Entrypoint und vergleicht seine
Schema-Datei mit der laufenden Datenbank. Er schreibt nichts in die Datenbank.

```bash
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > ~/deploy-selfservice-s0/vorschau-delta.sql
```

**Erwartet:** keine Ausgabe, oder nur harmlose Hinweise (Kasten „Update available …“ von Prisma,
Zeilen `npm notice`). Eine Fehlermeldung → **STOPP, Ausgabe an Claude.**

```bash
for m in 'ADD COLUMN' 'ADD VALUE' 'CREATE TABLE' 'INDEX' 'ADD CONSTRAINT'; do printf '%-15s %s\n' "$m" "$(grep -c "$m" ~/deploy-selfservice-s0/vorschau-delta.sql)"; done
```

**Erwartet** (aus den Schemas gerechnet und gegen eine Datenbank mit dem Schema `ea2d41d` geprobt):

```
ADD COLUMN      2
ADD VALUE       0
CREATE TABLE    0
INDEX           1
ADD CONSTRAINT  0
```

```bash
grep -nE 'DROP|RENAME|ALTER COLUMN .* TYPE|SET NOT NULL' ~/deploy-selfservice-s0/vorschau-delta.sql || echo "keine DROP/RENAME/TYPE-Zeile"
```

**Erwartet:** `keine DROP/RENAME/TYPE-Zeile`. Ein `DROP` deutete auf eine Abweichung der
Produktionsdatenbank vom Schema `0974b7f` hin → **STOPP.**

```bash
grep -v -E '^--|^$' ~/deploy-selfservice-s0/vorschau-delta.sql
```

**Erwartet:** genau diese drei Zeilen — sonst nichts (die Leerzeichen hinter `ADD COLUMN` dürfen
anders aussehen):

```
ALTER TABLE "employments" ADD COLUMN     "abrechnungskreis" TEXT,
ADD COLUMN     "personalNumber" TEXT;
CREATE UNIQUE INDEX "employments_dokubit_vertrag_key" ON "employments"("mandantNumber", "abrechnungskreis", "personalNumber");
```

Weicht eine Zahl oder Zeile in 3.4 ab → **STOPP, nicht starten, Ausgabe an Claude** (dazu die Datei
`~/deploy-selfservice-s0/vorschau-delta.sql`). Das Portal läuft noch mit dem alten Container.

---

## 4 · Anhalten, sichern, starten

Ablauf wie am 14.10. in Einzelschritten. `sudo docker compose up -d --build` würde 3.3 bis 4.2
ersetzen, ist aber **nicht zu empfehlen**: Ohne 4.1 fehlen die eigene Sicherung der Datenbank
(`pg_dump` 16) und die der Uploads.

### 4.1 Portal anhalten und sichern (Sichern, Teil 2)

```bash
sudo docker compose stop app
```

**Erwartet:** `Container hr-portal-app  Stopped`. **Ab hier ist das Portal nicht erreichbar.**

Bestand bei angehaltenem Portal (derselbe Zählbefehl wie in 1.7):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM employees) AS personen, (SELECT COUNT(1) FROM employees WHERE "importSource" = $$DOKUBIT$$) AS aus_dokubit, (SELECT COUNT(1) FROM employments) AS anstellungen, (SELECT COUNT(1) FROM audit_logs WHERE "processType" = $$PERSONALSTAMM$$) AS protokoll_personalstamm;'
```

**Erwartet:** dieselben vier Zahlen wie in 1.7. **Notieren** — 5.2 muss genau diese Zahlen zeigen.
Eine Fehlermeldung → **STOPP:** Befehl B (unten), dann Ausgabe an Claude.

Datenbank (aus dem DB-Container, `pg_dump` 16, passend zum Einspielen bei einem Rückfall):

```bash
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-deploy-selfservice-s0-manuell.sql'
```

**Erwartet:** keine Ausgabe.

```bash
sudo ls -l backups/vor-deploy-selfservice-s0-manuell.sql
```

**Erwartet:** um 2 MB oder größer (14.10.: 2.095.344 Bytes).

```bash
sudo grep -c 'PostgreSQL database dump complete' backups/vor-deploy-selfservice-s0-manuell.sql
```

**Erwartet:** `1`.

Uploads (mit dem alten Image als `nextjs`, das Volume nur lesend eingehängt). Die erste Zeile setzt
den Volume-Namen noch einmal — schadet nicht, falls er aus 1.6 noch da ist:

```bash
UPLOADS_VOL=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' hr-portal-app)
```

**Erwartet:** keine Ausgabe.

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" -v "$PWD/backups:/sicherung" hr-portal-app:0974b7f -c 'tar czf /sicherung/uploads-vor-deploy-selfservice-s0.tar.gz -C /daten . && echo "tar OK"'
```

**Erwartet:** `tar OK`.

```bash
sudo ls -l backups/uploads-vor-deploy-selfservice-s0.tar.gz
```

**Erwartet:** etwa so groß wie in 1.6, komprimiert eher etwas kleiner (14.10.: 169.813.066 Bytes).

```bash
sudo tar tzf backups/uploads-vor-deploy-selfservice-s0.tar.gz | wc -l
```

**Erwartet:** eine Zahl größer als 1 (etwa Dateien plus Ordner aus 2.2).

Das Archiv enthält Personalunterlagen aller Vorgänge — **auf dem Server lassen**, nicht
herunterladen.

**Weicht etwas ab** (Datenbank-Sicherung deutlich unter 1 MB, `grep` zeigt `0`, kein `tar OK`) →
**STOPP:** Befehl B, dann Ausgabe an Claude. Bei fehlendem `tar OK` die Fehlerzeilen nur auf dem
Server ansehen und an Claude nur die Ausgabe des Prüfbefehls aus 2.2 schicken (er liest nur und
läuft auch bei laufendem Portal).

Befehl B (startet den angehaltenen alten Container wieder; nur bei STOPP zwischen dem Anhalten oben
und 4.2 — ab 4.2 nie, in 7.3 nur, wo es dort steht):

```bash
sudo docker compose start app
```

**Erwartet:** `Container hr-portal-app  Started` (das Portal läuft wieder mit dem alten Stand).

### 4.2 Starten

```bash
sudo docker compose up -d
```

**Erwartet:** `hr-portal-app` wird neu angelegt (`Recreate`/`Recreated`, dann `Started`; am 14.10.
stand nur `Started` — auch in Ordnung), `hr-portal-db` und `hr-portal-gotenberg` laufen weiter.
Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo docker compose logs -f app
```

Zeigt das Startlog laufend an. Warten, bis `✓ Ready in …` **und** eine Zeile `[Zeitplaner] …`
erschienen sind (die zweite kann nach der ersten kommen), dann `Strg+C` — das beendet nur die
Anzeige, nicht den Container. Erscheint nach 3 Minuten kein `✓ Ready`: `Strg+C`, weiter mit 4.4.

**Nicht die 3 Minuten abwarten**, wenn nach `Sicherung abgelegt: …` und `Datenbank-Schema wird
synchronisiert...` statt `🚀  Your database is now in sync …` eine Fehlermeldung von Prisma steht oder
danach `CREDO HR-Portal startet...` ein zweites Mal erscheint (oder die Anzeige von selbst endet):
Der Push ist gescheitert, und der Container startet in Schleife neu, je Durchlauf mit neuer
Sicherung und Rotation — in drei Minuten zehnmal und öfter. Dann sofort `Strg+C` (falls die Anzeige
noch läuft) und Befehl D (4.4), dann an Claude. Steht stattdessen eine Zeile `FATAL: …` vor dem
Neustart, gilt ihre Zeile in 4.4.

**Lehre vom 14.10.:** Weiter erst, wenn das Log die Zeile `Schema-Unterschied erkannt …` und eine
`Sicherung abgelegt: …` **von heute** zeigt — nicht nur, weil der Container `healthy` ist. Steht
stattdessen `… bereits deckungsgleich …`, läuft noch das alte Image (4.4).

### 4.3 Was im Log stehen muss

In dieser Reihenfolge, `…` steht für Zahlen und Namen (aus Entrypoint, Seed-Check und der
Push-Probe gegen das Schema `ea2d41d` abgeleitet, nicht mit dem gebauten Image gemessen):

```
CREDO HR-Portal startet...
Umgebungsvariablen geprueft: OK
Schema-Unterschied erkannt — Sicherung wird angelegt...
Sicherung abgelegt: /backups/vor-schema-abgleich-JJJJMMTT-HHMMSS.sql (… Bytes)
Datenbank-Schema wird synchronisiert...
⚠️  There might be data loss when applying the changes:
  • A unique constraint covering the columns `[mandantNumber,abrechnungskreis,personalNumber]` on the table `employments` will be added. If there are existing duplicate values, this will fail.
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

- **Dazwischen dürfen stehen:** Zeilen von Prisma (`Prisma schema loaded …`, `Datasource "db" …`,
  ein Kasten „Update available …“), Leerzeilen, Zeilen von Next.js (`▲ Next.js …`, `- Local: …`,
  `- Network: …`, `✓ Starting...`) und `Alte Sicherung entfernt: …` (1.5). Die Zeitplaner-Zeile
  kann auch nach `✓ Ready` stehen.
- **Die Warnung von `--accept-data-loss` ist erwartet**, mit genau dem einen Punkt oben. Sie ist
  unkritisch: Beide neuen Spalten sind in allen Zeilen leer, und leere Werte kollidieren im
  eindeutigen Index nicht (am 14.10. genauso bei `ausgabeId`). Jeder andere Punkt (etwa
  „You are about to drop …“) → Ausgabe an Claude, den Container dabei **nicht** anhalten.
- **Keine Migrationszeile:** Eine Zeile mit `_V1`, `Migration`, `Vertragsende-Label`,
  `parallele Spuren`, `Abteilungsaufgaben`, `Masernschutz`, `Kostenstellen`, `Betriebsnummer`,
  `MINIJOB`, `currentStep` oder `Katalog` → Ausgabe an Claude (alle Merker sind seit dem 14.10.
  gesetzt).
- **System-Vorlagen:** dreimal `ist aktuell`. `aktualisiert`, `angelegt`, `Duplikat der
  System-Vorlage …`, `Asset fehlt` oder `System-Vorlage-Seed Fehler …` → Ausgabe an Claude (das
  Portal läuft trotzdem).
- **`Keine User gefunden — Seed wird ausgefuehrt...`** darf nie erscheinen → sofort an Claude,
  **aber dann `start-log.txt` weder schicken noch ins Protokoll übernehmen**: Der Seed schreibt das
  neue Admin-Passwort im Klartext ins Log. Nur diese eine Zeile melden.
- **Eine Zeile `[personalstamm] …` oder `[Personalstamm] …`** darf beim Start nicht stehen (niemand
  ruft den Webhook auf; die Route schreibt klein, der Abgleich groß) → Ausgabe an Claude.

Log sichern:

```bash
sudo docker compose logs --no-log-prefix app > ~/deploy-selfservice-s0/start-log.txt
```

**Erwartet:** keine Ausgabe.

Die Punkte unter der Warnung:

```bash
grep '•' ~/deploy-selfservice-s0/start-log.txt
```

**Erwartet:** genau eine Zeile `A unique constraint covering the columns
`[mandantNumber,abrechnungskreis,personalNumber]` on the table `employments` …`. Jede weitere Zeile →
Ausgabe an Claude (Container nicht anhalten).

Die wichtigen Zeilen herausziehen (der Filter vom 14.10., erweitert um `[Pp]ersonalstamm`; bewusst
ohne `-i`, sonst kämen Zeilen wie `Prisma schema loaded …` dazu):

```bash
sudo docker compose logs --no-log-prefix app | grep -E 'Schema|Sicherung|synchron|in sync|Seed|System-Vorlage|Zeitplaner|Ready|FATAL|Fehler|fehlgeschlagen|data loss|Migration|_V1|[Pp]ersonalstamm'
```

**Erwartet:** genau diese Zeilen (die Zeitplaner-Zeile darf auch nach `✓ Ready` stehen; eine
zusätzliche Zeile `Alte Sicherung entfernt: …` ist in Ordnung):

```
Schema-Unterschied erkannt — Sicherung wird angelegt...
Sicherung abgelegt: /backups/vor-schema-abgleich-JJJJMMTT-HHMMSS.sql (… Bytes)
Datenbank-Schema wird synchronisiert...
⚠️  There might be data loss when applying the changes:
🚀  Your database is now in sync with your Prisma schema. Done in …
Datenbank-Schema synchronisiert.
Pruefe ob Seed notwendig...
System-Vorlage (Aufforderung erweitertes Führungszeugnis) ist aktuell.
System-Vorlage (Übergabeprotokoll Ausstattung) ist aktuell.
System-Vorlage (Rückgabeprotokoll Ausstattung) ist aktuell.
Datenbank bereits geseeded (… User vorhanden). Seed uebersprungen.
[Zeitplaner] Uhr gestartet (jede Minute).
 ✓ Ready in …
```

Jede andere Zeile mit `_V1`, `FATAL`, `Fehler`, `fehlgeschlagen`, `Migration`, `personalstamm` oder
`Personalstamm` → Ausgabe an Claude.

> **`start-log.txt` an Claude schicken**, bei jedem Deploy (enthält keine Geheimnisse — einzige
> Ausnahme ist die Seed-Zeile oben).

### 4.4 Fehlschlag erkennen

| Zeichen im Log | Bedeutung | Sofort |
|---|---|---|
| `Datenbank-Schema ist bereits deckungsgleich — kein Abgleich noetig.` beim **ersten** Start | Es läuft noch das alte Image (Build gescheitert?). Datenbank unverändert | Befehl C, dann Ausgabe und `start-log.txt` an Claude |
| `FATAL: Sicherungsverzeichnis /backups fehlt.` | Einhängung fehlt. Datenbank unverändert | an Claude |
| `FATAL: Sicherung nach … fehlgeschlagen.` | Rechte auf `backups/`. Datenbank unverändert | Befehl A aus 1.4; der Container startet von selbst neu |
| Prisma-Fehlermeldung statt `Datenbank-Schema synchronisiert.` (etwa `could not create unique index`), danach `CREDO HR-Portal startet...` erneut oder `docker compose ps` zeigt `Restarting` | Push gescheitert, Neustart-Schleife | **sofort** Befehl D, dann an Claude — kein Befehl B (er startete die Schleife wieder). Jeder Neustart legt eine Sicherung an und rotiert; nach zehn weiteren wäre die erste dieses Updates weggeräumt (die eigene aus 4.1 und die Kopien unter festen Namen bleiben) |
| `Duplikat der System-Vorlage …` | mehrere eingeschaltete Zeilen derselben System-Vorlage; das Portal läuft | an Claude |
| `Seed-Check Fehler:` oder `Seed-Check fehlgeschlagen (nicht kritisch).` | das Portal startet trotzdem | an Claude mit `start-log.txt` |
| `[Zeitplaner] Uhr aus (ZEITPLANER_AKTIV).` | in der `.env` steht `ZEITPLANER_AKTIV=false` | an Claude |
| `[Zeitplaner] Takt fehlgeschlagen: …` | die Uhr erreicht das Portal nicht | an Claude |
| Kein `✓ Ready`, oder 5.1 meldet einen Fehler | die App startet nicht | an Claude mit `start-log.txt` |

Startet der Container später noch einmal (etwa nach einem Neustart des Servers), stehen im Log
`Datenbank-Schema ist bereits deckungsgleich — kein Abgleich noetig.` und dreimal
`System-Vorlage (…) ist aktuell.`, aber keine neue Sicherung.

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

Der Entrypoint behält nur seine zehn neuesten Sicherungen. Diese Zeile kopiert die eben angelegte
unter einem festen Namen (ohne Sternchen, Lehre 5):

```bash
sudo sh -c 'cd /vol/container/HR_Portal_CREDO/backups && cp -p "$(ls -1t | grep "^vor-schema-abgleich-" | head -1)" vor-deploy-selfservice-s0-entrypoint.sql'
```

**Erwartet:** keine Ausgabe.

```bash
sudo ls -l backups/vor-deploy-selfservice-s0-manuell.sql backups/vor-deploy-selfservice-s0-entrypoint.sql backups/uploads-vor-deploy-selfservice-s0.tar.gz
```

**Erwartet:** drei Dateien; die beiden `.sql` fast gleich groß (kleine Unterschiede kommen von den
`pg_dump`-Versionen 18 und 16). Weicht ab → Ausgabe an Claude (das Portal läuft weiter).

---

## 5 · Nachher prüfen

### 5.1 Health

```bash
sudo docker compose ps
```

**Erwartet:** `hr-portal-app` mit `(healthy)` — das dauert gut eine Minute (40 s Anlaufzeit, dann alle
30 s eine Prüfung). Bis dahin `(health: starting)`; nach zwei Minuten wiederholen. Danach noch nicht
`(healthy)` → **STOPP, Ausgabe an Claude.**

```bash
sudo docker exec hr-portal-app curl -s http://localhost:3000/api/health
```

**Erwartet:** `{"status":"ok","timestamp":"…","zeitplaner":{"uhrAktiv":true,"letzterTakt":…}}`.
Direkt nach dem Start kann `letzterTakt` noch `null` sein; nach einer Minute wiederholen.
`{"status":"error",…}` oder `"uhrAktiv":false` → **STOPP, Ausgabe an Claude.**

```bash
curl -s https://hr.fes-credo.de/api/health
```

**Erwartet:** dasselbe von außen über Caddy. Weicht ab → **STOPP, Ausgabe an Claude.**

Welches Image läuft (nur lesend; Lehre vom 14.10.):

```bash
sudo docker inspect --format '{{.Created}} {{.Image}}' hr-portal-app
```

**Erwartet:** ein Erstelldatum von heute (UTC, aus 4.2) und genau die volle Image-ID aus 3.3.
**Beides notieren** (Ausgangsstand für das nächste Update). Noch `sha256:64e1319792ff…` oder eine
andere ID → **STOPP, Ausgabe an Claude.**

HR bekommt noch **keinen** Bescheid — erst in 5.5.

### 5.2 Datenbank

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

**Erwartet:** `0` — Datenbank und neues Schema sind deckungsgleich. Weicht ab → Ausgabe an Claude.

**Spalten und Index von S0 sind da, die Spalten leer:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = $$public$$ AND table_name = $$employments$$ AND column_name IN ($$abrechnungskreis$$, $$personalNumber$$)) AS neue_spalten, to_regclass($$public.employments_dokubit_vertrag_key$$) AS neuer_index, (SELECT COUNT(1) FROM employments WHERE abrechnungskreis IS NOT NULL OR "personalNumber" IS NOT NULL) AS mit_schluessel;'
```

**Erwartet:**

```
 neue_spalten |           neuer_index           | mit_schluessel
--------------+---------------------------------+----------------
            2 | employments_dokubit_vertrag_key |              0
(1 row)
```

Weicht ab → Ausgabe an Claude. `mit_schluessel` bleibt `0`, bis Etappe 2 den ersten Lauf macht —
diese Zahl ist die Bedingung für Weg A (7.3).

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT indexdef FROM pg_indexes WHERE indexname = $$employments_dokubit_vertrag_key$$;'
```

**Erwartet:**

```
CREATE UNIQUE INDEX employments_dokubit_vertrag_key ON public.employments USING btree ("mandantNumber", abrechnungskreis, "personalNumber")
```

**Bestand unverändert** (derselbe Zählbefehl wie in 1.7 und 4.1):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM employees) AS personen, (SELECT COUNT(1) FROM employees WHERE "importSource" = $$DOKUBIT$$) AS aus_dokubit, (SELECT COUNT(1) FROM employments) AS anstellungen, (SELECT COUNT(1) FROM audit_logs WHERE "processType" = $$PERSONALSTAMM$$) AS protokoll_personalstamm;'
```

**Erwartet:** genau die vier Zahlen aus **4.1**. Weniger Personen oder Anstellungen → **sofort an
Claude** (das Portal läuft weiter).

**Merker und Läufe:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM system_migrations) AS merker, (SELECT COUNT(1) FROM automatische_laeufe) AS laeufe, (SELECT COUNT(1) FROM automatische_laeufe WHERE aktiv) AS aktiv;'
```

**Erwartet:** `13 | 11 | <Zahl der eingeschalteten Läufe aus 1.8>`. Weicht ab → Ausgabe an Claude.

### 5.3 Der Webhook von S0 ist da und geschlossen

Von außen, ohne Anmeldung (schreibt nichts in die Datenbank; der Webhook prüft seine Konfiguration,
bevor er den Körper liest):

```bash
curl -s -w '\nHTTP %{http_code}\n' -X POST https://hr.fes-credo.de/api/webhooks/personalstamm
```

**Erwartet:**

```
{"error":"Konfigurationsfehler"}
HTTP 500
```

Das belegt: Die Route ist im neuen Image (vorher 404, 1.9), Caddy reicht durch, und ohne Geheimnis
nimmt sie nichts an. `HTTP 401` mit `Nicht autorisiert` → an Claude (dann ist ein Geheimnis
gesetzt, widerspricht 1.9). `HTTP 404` → das alte Image läuft (Befehl C, an Claude).

Log-Befehl von S0 (zeigt nur Meldungen von Route und Abgleich — Fehlerkennungen und Zeilenindex,
keine Namen und kein Geheimnis; `-i`, weil die Route `[personalstamm]` und der Abgleich
`[Personalstamm]` schreibt):

```bash
sudo docker compose logs --no-log-prefix app | grep -i '\[personalstamm\]'
```

**Erwartet:** je Probe genau eine Zeile `[personalstamm] PERSONALSTAMM_SECRET fehlt oder ist zu
kurz` — so soll es bis Etappe 2 bleiben. Eine andere Zeile → an Claude.

**Schreibschutz für den n8n-Schlüssel** — nur, wenn 1.9 `N8N_API_KEY` = `1` zeigte (im Container,
der Schlüssel läuft über die Standardeingabe, nicht über die Befehlszeile; schreibt nichts, auch
ohne Schutz nicht: der leere Körper fiele an der Prüfung durch):

```bash
sudo docker exec hr-portal-app sh -c 'echo "x-api-key: $N8N_API_KEY" | curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST -H @- -H "Content-Type: application/json" --data "{}" http://localhost:3000/api/employees'
```

**Erwartet:** `HTTP 403` (Rolle `SERVICE` darf dort nicht mehr schreiben; die Rolle wird vor dem
Körper geprüft). `HTTP 401` → der Schlüssel ist im Container nicht gesetzt (widerspricht 1.9),
`HTTP 400` → der Schutz greift nicht: beides an Claude, das Portal läuft weiter.

### 5.4 Probe im Browser

Angemeldet mit einem Konto mit Bearbeitungsrecht (z. B. dem eigenen SUPER_ADMIN-Konto). Abweichungen
hier sind kein Grund, das Portal anzuhalten: Meldung an Claude (Bildschirmfotos nur ohne Namen und
Adressen).

1. **Anmelden.** Das Dashboard lädt wie gewohnt; in der Kopfleiste steht der neue Menüpunkt
   **„Personen“**.
2. **„Personen“ öffnen** (nur ansehen). **Erwartet:**
   - Kopfzeile „Personen und Anstellungen kommen täglich aus DokuBit. …“ (gilt erst ab Etappe 2).
   - Die neutrale Zeile „Noch kein Abgleich gelaufen.“, keine rote und keine gelbe Hinweiszeile.
   - Block „Zu prüfen“ mit „Nichts zu prüfen.“
   - Die Liste (Filter „Aktiv“) zeigt den vorhandenen Bestand mit Quelle „Bestand“, „Von Hand“ oder
     einer anderen Quelle; „DokuBit“ steht nirgends. Gibt es keinen Bestand: „Noch keine Personen“.
   - Die Liste zeigt Namen und Adressen: **nur ansehen, kein Bildschirmfoto der Liste weitergeben.**
     Eine rote oder gelbe Zeile → ihren Text (ohne Namen) an Claude.
3. **Ein Offboarding mit Abfindung öffnen** (nur ansehen). **Erwartet:** im Reiter „Übersicht“ die
   Zeile „Abfindung“ mit Betrag; im Reiter „Checkliste“ zeigt die Karte „Aufgaben für Abteilungen“
   die Links informierter Stellen wie bisher. Nicht „Abteilungen informieren…“ klicken.
4. **Ein Onboarding öffnen** (nur ansehen). **Erwartet:** Die Seite lädt wie bisher, die Karte
   „Aufgaben für Abteilungen“ zeigt die Links wie bisher.
5. **Verbeamtung:** die Liste öffnen, dann einen Vorgang. **Erwartet:** Liste und Vorgang laden; die
   Reiter „Protokoll“ und „E-Mails“ sind da; im Reiter „Dokumente“ stehen die Dateien, eine lässt
   sich öffnen. Dann zurück zur Liste und **eine Kachel eines laufenden Status** anklicken —
   „Entwurf“, „Verwaltung“, „Probezeit“ oder „Übernahme Lebenszeit“ — mit einer Zahl über 0. Vor dem
   Klick muss mindestens eine **andere** Kachel über 0 stehen; sonst zeigt die Probe nichts (im
   Protokoll „nicht prüfbar“). **Erwartet** (Fix `0e1d8de`): Die übrigen Kacheln behalten ihre
   Zahlen, die Liste zeigt nur Vorgänge mit dem gewählten Status; ein zweiter Klick auf dieselbe
   Kachel hebt den Filter auf. Fallen die übrigen Kacheln auf 0 oder ist es sonst anders → an Claude.
   **Nicht für die Probe:** „Abgeschlossen“ — die Liste blendet abgeschlossene Vorgänge aus, solange
   „Archiv anzeigen“ aus ist, und bliebe leer, obwohl Kachel und Kopfzeile eine Zahl nennen; und
   „Frist!“ — einen solchen Status gibt es nicht, die Liste bleibt nach dem Klick leer
   (Serverfehler, schon vor dem Deploy so, Abschnitt 0, „Was NICHT dabei ist“).
6. **Vertragsende:** einen Vorgang öffnen. **Erwartet:** Die Seite lädt wie bisher. **Nicht**
   „Anfrage an Vorgesetzten senden →“, „Anfrage erneut senden“ oder „Erinnerung senden“ klicken.
7. **Einstellungen → Automatische Läufe → Karte „Wartung“** (nur ansehen). **Erwartet:** Die
   Beschreibung endet mit „… sowie Protokolleinträge des Personalstamm-Abgleichs, die älter als
   365 Tage sind.“ Hier noch nichts klicken (6.2).

**Außerdem nicht klicken**, das verschickt Mails an andere: „Neuer Vorgang“,
„Vorgesetzten-Link erstellen“, „Abteilungen informieren…“, Dokumentenpaket „Versenden“,
„Unterlagen nachfordern…“, „Jetzt ausführen“ unter Automatische Läufe, „Vorgang abschließen“,
„Austritt abschließen“.

### 5.5 HR Bescheid geben

„Das Portal läuft wieder. Neu ist der Menüpunkt „Personen“: Er zeigt vorerst nur die Personen, die
schon im Portal stehen. Personen und Anstellungen aus DokuBit kommen erst, wenn der tägliche Abgleich
eingeführt ist – darüber informieren wir gesondert. Sonst ändert sich für Sie nichts.“

---

## 6 · Nach dem Deploy, ohne Freigabe (Etappe 1b)

Diese Schritte lesen nur bzw. sind von S0 unabhängig. Sie dürfen am Tag des Deploys oder später
laufen und sind Voraussetzung für Etappe 2 (8.0).

### 6.1 Bestandsprüfung der Beschäftigtendaten (Anleitung S0, Abschnitt 6)

Erst **nach** dem Deploy möglich: Abfrage 3 liest die neuen Spalten (vorher bräche sie ab). Alle
Abfragen lesen nur. Die Ergebnisse (nur Zahlen) gehören ins Protokoll.

**Abfrage 1 — Personen je Herkunft:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT COALESCE("importSource", $$(leer)$$) AS herkunft, COUNT(1) AS personen, COUNT(1) FILTER (WHERE "isActive") AS aktiv, COUNT(1) FILTER (WHERE COALESCE(btrim(email), $$$$) = $$$$) AS ohne_adresse, COUNT(1) FILTER (WHERE "personalNumber" IS NOT NULL) AS mit_loga_nummer FROM employees GROUP BY 1 ORDER BY 1;'
```

**Abfrage 2 — Dubletten der Adressen je Herkunft:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT herkunft, COUNT(1) AS adressen, SUM(personen) AS personen FROM (SELECT lower(btrim(email)) AS adresse, string_agg(DISTINCT COALESCE("importSource", $$(leer)$$), $$ + $$ ORDER BY COALESCE("importSource", $$(leer)$$)) AS herkunft, COUNT(1) AS personen FROM employees WHERE COALESCE(btrim(email), $$$$) <> $$$$ GROUP BY 1 HAVING COUNT(1) > 1) d GROUP BY herkunft ORDER BY herkunft;'
```

**Abfrage 3 — Anstellungen je Herkunft der Person:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT COALESCE(e."importSource", $$(leer)$$) AS herkunft, COUNT(m.id) AS anstellungen, COUNT(m.id) FILTER (WHERE m."isActive") AS aktiv, COUNT(m.id) FILTER (WHERE m.abrechnungskreis IS NOT NULL AND m."personalNumber" IS NOT NULL) AS vom_abgleich_verwaltet FROM employments m JOIN employees e ON e.id = m."employeeId" GROUP BY 1 ORDER BY 1;'
```

**So lesen** (Anleitung S0, Abschnitt 6):

- Vor dem ersten Lauf gibt es keine Herkunft `DOKUBIT`, und `vom_abgleich_verwaltet` ist überall `0`.
- Herkunft `(leer)` ist Altbestand. Der erste Lauf übernimmt eine solche Person, wenn ihre Adresse
  eindeutig ist und der Name passt; ihre alten Anstellungen bleiben unberührt und zählen nicht für
  „aktiv“.
- `MANUELL` und andere Quellen (z. B. `LOGA`) fasst der Abgleich nicht an; er meldet sie als
  Zweifelsfall.
- **Abfrage 2 muss vor Etappe 2 leer sein** (`(0 rows)`). Jede Adresse mit mehreren Personen führt
  sonst zu `EMAIL_MEHRDEUTIG`.

**Abfrage 4 — welche Adressen doppelt sind** (nur, wenn Abfrage 2 nicht leer ist). **Die Ausgabe
enthält dienstliche Adressen: nur auf dem Server ansehen, nicht schicken, nicht ins Protokoll.**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT lower(btrim(email)) AS adresse, COUNT(1) AS personen, string_agg(COALESCE("importSource", $$(leer)$$), $$, $$) AS herkunft FROM employees WHERE COALESCE(btrim(email), $$$$) <> $$$$ GROUP BY 1 HAVING COUNT(1) > 1 ORDER BY 1;'
```

**Bereinigen** (vor Etappe 2): bei der überzähligen Person die Adresse korrigieren oder leeren —
über `PATCH /api/employees/[id]` (Feld `email`), angemeldet mit einer HR-Rolle. Eine Oberfläche
dafür gibt es nicht, und der n8n-Schlüssel darf dort ab diesem Deploy nicht mehr schreiben; den Weg
gibt Claude im Einzelfall. **Nicht per `DELETE`:** Er löscht nichts, sondern deaktiviert die Person
nur (`isActive = false`). Ihre Adresse bleibt und mit ihr die Dublette — Abfrage 2 und der Abgleich
zählen auch inaktive Personen, `EMAIL_MEHRDEUTIG` bliebe. Bereinigt wird nur über das Feld `email`.
An Claude gehen nur die Zahlen aus Abfrage 2.

### 6.2 Lauf „Wartung“: erst Probelauf, dann einschalten (empfohlen)

**Warum:** Ohne diesen Lauf greift die Löschfrist von S0 (Protokolleinträge nach 365 Tagen) nie —
auch nicht für die Einträge aus Änderungen von Hand, die ab dem Deploy entstehen. Er setzt
außerdem die 90 Tage für das Versandprotokoll und die Protokolle der automatischen Läufe durch.
Wann er eingeschaltet wird, steht in Abschnitt 0 („Vor dem Termin zu entscheiden“, Punkt 3); vor
Etappe 2 ist er Pflicht. Was 1.8 für `wartung` zeigte, entscheidet den Weg:

- `aktiv` = `f`: Punkte 1 bis 4.
- `aktiv` = `t`, `probelauf` = `t` (Status „an · Probelauf“): Punkte 1 und 2, dann statt Punkt 3 nur
  das Kästchen **„als Probelauf“ abwählen** (der Knopf heißt hier „Ausschalten“ — nicht klicken).
  Eine Rückfrage gibt es dabei nicht; das Portal meldet „„Wartung“ gespeichert. …“. **Erwartet:**
  Status „an“ (nicht „an · Probelauf“). Dann Punkt 4.
- `aktiv` = `t`, `probelauf` = `f`: nur Punkt 4.

**Vorher HR Bescheid sagen:** Ein Probelauf schickt eine Berichtsmail an das HR-Postfach (nur Zahlen,
keine Namen). Sie gehört zu diesem Schritt und ist kein Fehler.

1. Einstellungen → **Automatische Läufe** → Karte **„Wartung“** (Kennzeichen „löscht endgültig“).
2. **„Probelauf jetzt“** klicken. Nach kurzer Zeit steht unter „Letzter Lauf“ ein Ergebnis mit
   „· Probelauf“; „Protokoll“ aufklappen. **Erwartet** (aus dem Code, nicht gemessen): „Letzter
   Lauf“ zeigt „ohne Befund“, im Protokoll drei Zeilen:
   - „Würde löschen: Versandprotokoll“ — eine Zahl (Einträge älter als 90 Tage; das ist die
     vorgesehene Frist, kein Befund);
   - „Würde löschen: Lauf-Protokolle“ — `0` (die Läufe gibt es erst seit dem 30.09.);
   - „Würde löschen: Personalstamm-Protokolle“ — `0`.

   „bitte prüfen“ (etwa „Antwort unvollständig“), „fehlgeschlagen“, „abgebrochen“ oder bei den
   beiden letzten Zeilen eine Zahl größer 0 → **STOPP, nicht einschalten, an Claude.**
3. Uhrzeit `03:30` stehen lassen. Das Kästchen **„als Probelauf“ muss leer sein**. Dann
   **„Einschalten“** und die Rückfrage („… LÖSCHT ab dann täglich endgültig.“) bestätigen. Steht in
   der Rückfrage „(als Probelauf)“, abbrechen und das Kästchen prüfen. **Erwartet:** Status „an“
   (nicht „an · Probelauf“), „Nächster Lauf“ morgen um 03:30.
4. Am nächsten Tag: „Letzter Lauf“ ohne „· Probelauf“, im Protokoll „Gelöscht:
   Personalstamm-Protokolle“ `0`. Eine Berichtsmail kommt nur bei Problemen. Das Ergebnis gehört ins
   Protokoll (Zeile „6.2 Folgetag“) und an Claude; erst damit ist belegt, dass der scharfe Lauf mit
   der neuen Zeile lief.

### 6.3 Nicht tun

Diese Liste gilt für den ganzen Ablauf; andere Stellen verweisen hierher.

- **`PERSONALSTAMM_SECRET` nicht vor Etappe 2 setzen**, auch nicht „zum Ausprobieren“.
- **Den n8n-Stammablauf nicht vor Etappe 2 importieren oder anlegen**, und nie den curl-Befehl mit
  `s0-testdaten.json` aus der Übergabe S0 (dort Abschnitt 8.3) gegen den Server richten — er legte
  im Portal erfundene Personen an.
- **Keine Person auf die Quelle `DOKUBIT` umstellen** (D1). Sonst wird „Personen“ sofort rot, und
  Adresse und Aktiv-Status dieser Person sind gesperrt; zurück geht es nicht.
- **Keine Person per `DELETE /api/employees/[id]` „löschen“**, auch nicht zum Bereinigen von
  Dubletten: Der Aufruf deaktiviert sie nur, die Adresse und damit die Dublette bleiben (6.1).
- **Keinen Stand ohne das S0-Schema ausrollen** — etwa `ux-umbau` vor dem Merge von `main` (7.1).
- Außer „Wartung“ (6.2) keine weiteren Läufe einschalten, kein „Jetzt ausführen“.
- **Nie `node prisma/seed.js`** im Container ausführen.
- Kein `docker image prune -a`, kein `docker system prune -a`, kein `down -v` (7.1).
- Keine Knöpfe, die Mails an andere schicken (Liste in 5.4).

---

## 7 · Rückfall

### 7.1 Was man NICHT tun darf

- **Das alte Image mit normalem Entrypoint starten, ohne vorher 7.3 Schritt 2 und Schritt 5
  durchzugehen.** Sein Entrypoint sähe die zwei Spalten und den Index als überzählig an und
  löschte sie per `db push --accept-data-loss` — nach dem ersten Lauf von Etappe 2 samt allen
  Vertragsschlüsseln. Beim nächsten Vorwärts-Deploy kämen die Spalten leer zurück: Alle zuvor
  verwalteten Verträge zählten als Bestandsanstellungen ohne Schreibschutz, und der nächste Lauf
  legte alle laufenden Verträge als neue Zeilen an (Dubletten). Dasselbe gilt für
  `sudo git checkout 0974b7f` mit neuem Build.
- **Einen Stand ausrollen, der `a43aa25` nicht enthält** — auch keinen neueren Zweig. Der Zweig
  `ux-umbau` (Stand 16.10.2026, gemeinsamer Stand mit `main` zuletzt `c82ffec`, also vor S0) kennt
  die beiden Spalten und den Index nicht und hat denselben Entrypoint: Ausgerollt ohne vorheriges
  Mergen von `main` löschte er sie wie das alte Image, mit denselben Folgen. Deshalb vor dem Deploy
  von `ux-umbau` `main` hineinmergen, und jeder künftige Ablaufplan prüft
  `git merge-base --is-ancestor a43aa25 HEAD` und eine Vorschau wie in 3.4 ohne `DROP`.
- **Ein Image älter als `0974b7f` starten** — etwa `hr-portal-app:b6e1c8a`, `6124936` oder
  `ae490ba`. Der Entrypoint von `b6e1c8a` löschte zusätzlich die sieben Tabellen der Ausstattung samt
  Standardkatalog, Ausgaben und Rückgabe-Zuständen (7 × `DROP TABLE`, 20 × `DROP CONSTRAINT`,
  19 × `DROP COLUMN`, 7 × `DROP INDEX`, Neubau des Enums `DocumentType`). Zurück geht es nur auf
  `hr-portal-app:0974b7f` (2.1).
- `sudo docker compose down -v` — löscht Datenbank und Uploads.
- **Kein `docker image prune -a` und kein `docker system prune -a`**, solange ein Rückweg offen sein
  soll. Beide löschen jedes Image, das kein Container nutzt — auch das etikettierte
  `hr-portal-app:0974b7f`. Fehlt Platz, an Claude.
- `node prisma/seed.js` (6.3).
- `git clean`, `git add -A`, `git stash -u` im Projektordner — sammelt oder löscht die Sicherungen.
- Eine Entrypoint-Sicherung (`vor-schema-abgleich-…`, `pg_dump` 18) einspielen — sie scheitert an
  PostgreSQL 16 (`SET transaction_timeout`, `\restrict`; Lehre 3 vom 24.09.). Eingespielt werden nur
  die eigenen Sicherungen aus 4.1 bzw. 8.4 (Weg B, 7.4).

### 7.2 Erst entscheiden: vorwärts oder zurück

**Vorwärts reparieren ist fast immer besser:** Ein Fehler im Code wird mit einem neuen Commit
behoben und neu ausgerollt. Ändert sich das Schema dabei nicht, meldet der Entrypoint „bereits
deckungsgleich“ und macht weder Sicherung noch Push. Ein Rückfall nimmt auch die vier
Zugriffskorrekturen zurück: Die Unterrouten der Verbeamtung (Dokumente, Antrags-Link) stünden dann
wieder ohne Rollen- und Mandantenprüfung offen — praktisch ausnutzbar nur mit gesetztem
`N8N_API_KEY` oder einer nicht vergebbaren Rolle, aber offen. **Zurück nur nach Rücksprache mit
Claude.**

Ein Fehler **nur in S0** ist kein Grund für einen Rückfall: Die Ansicht liest nur, der Webhook ist
ohne Geheimnis zu, und der Schreibschutz trifft vor Etappe 2 keinen Datensatz.

### 7.3 Weg A: altes Image, solange S0 nie geschrieben hat

**Was der Rückweg tut.** Das alte Image ist das vom 14.10. mit `0974b7f` (Etikett aus 2.1). Sein
Entrypoint löscht (aus den Schemas gerechnet, nicht ausgeführt) genau den Index
`employments_dokubit_vertrag_key` und die Spalten `abrechnungskreis` und `"personalNumber"` an
`employments` — sonst nichts. Solange kein Lauf von Etappe 2 geschrieben hat, sind beide Spalten
überall leer, und **Weg A verliert nichts**. Nach dem ersten Lauf gibt es **keinen** Weg A mehr
(7.1, erster Punkt): dann nur vorwärts, Weg C (7.5) oder — nur für einen misslungenen ersten Lauf —
Weg B mit der Sicherung aus 8.4 (7.4), beides nur mit Claude. Nach diesem Einspielen sind die
Spalten wieder leer, und Schritt 2 unten entscheidet erneut.

**Was auch nach Weg A stehen bleibt:** Personen mit Quelle `DOKUBIT` (falls jemand umgestellt hat),
AuditLog-Einträge `PERSONALSTAMM_…` aus Änderungen von Hand (das alte Image zeigt sie ohne
Beschriftung und löscht sie nie), die Einstellung des Laufs „Wartung“. Das alte Image hat keinen
Schreibschutz unter `/api/employees` und keine Route `/api/webhooks/personalstamm` (ein n8n-Ablauf
bekäme 404 — er muss vorher aus sein).

Bis zum Anhalten in Schritt 6 läuft das Portal unverändert weiter. Was bei einem STOPP zu tun ist,
hängt vom Schritt ab (die Grundregel gilt hier nicht):

- **Schritte 2 und 3:** nichts, nur Ausgabe an Claude.
- **Schritte 4 und 5** (die Override-Datei ist angelegt, das Portal läuft noch): nur Befehl E, dann
  Ausgabe an Claude.
- **Schritte 6a bis 9** (Portal angehalten, altes Image noch nicht gestartet): Befehl E, dann
  Befehl B aus 4.1 — er startet den in Schritt 6 angehaltenen Container wieder, also den mit dem
  jetzigen Stand, nicht das alte Image —, dann Ausgabe an Claude.
- **Schritte 10 und 11** (der Dienst ist mit dem alten Image angelegt): kein Befehl E und kein
  Befehl B — ohne Override-Datei legte ein späteres `up -d` den Dienst unbemerkt mit dem neuen Image
  an. Bei einer Neustart-Schleife nur Befehl D (4.4), sonst nichts, dann Ausgabe an Claude.

Befehl E (nur bei STOPP in den Schritten 4 bis 9):

```bash
sudo rm docker-compose.override.yml
```

**Erwartet:** keine Ausgabe.

**Schritt 1 — Projektordner:**

```bash
cd /vol/container/HR_Portal_CREDO
```

**Vor Schritt 2:** Ist der n8n-Stammablauf schon eingerichtet, ihn in n8n ausschalten; HR bitten, ab
jetzt nichts mehr im Portal zu speichern.

**Schritt 2 — prüfen, ob S0 je geschrieben hat** (nur lesend):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM employments WHERE abrechnungskreis IS NOT NULL OR "personalNumber" IS NOT NULL) AS s0_vertraege, (SELECT COUNT(1) FROM audit_logs WHERE action = $$PERSONALSTAMM_LAUF$$) AS s0_laeufe, (SELECT COUNT(1) FROM employees WHERE "importSource" = $$DOKUBIT$$) AS info_dokubit_personen, (SELECT COUNT(1) FROM audit_logs WHERE "processType" = $$PERSONALSTAMM$$) AS info_protokoll;'
```

**Erwartet:** `s0_vertraege` = `0` und `s0_laeufe` = `0` — das ist die Bedingung. `info_…` beliebig
(beides bleibt beim Rückfall erhalten). **Die Zahlen notieren** — Schritt 6a vergleicht mit ihnen.
Eine der ersten beiden größer 0 → **STOPP, kein Weg A, Ausgabe an Claude.**

**Schritt 3 — das alte Image ist noch da** (nur lesend):

```bash
sudo docker image inspect --format '{{.Id}}' hr-portal-app:0974b7f
```

**Erwartet:** genau die volle ID aus 1.2 und 2.1 (`sha256:64e1319792ff…`). Eine andere ID (etwa die
des neuen Images) oder eine Fehlermeldung → **STOPP, kein Weg A, Ausgabe an Claude** — ohne das
Image versuchte Docker in Schritt 5 womöglich, es aus dem neuen Code zu bauen. **Nie** ein anderes
Etikett nehmen (7.1).

**Schritt 4 — Override-Datei anlegen** (schreibt; wirkt erst beim Start in Schritt 10):

```bash
printf 'services:\n  app:\n    image: hr-portal-app:0974b7f\n' | sudo tee docker-compose.override.yml
```

**Erwartet:** genau diese drei Zeilen:

```
services:
  app:
    image: hr-portal-app:0974b7f
```

**Schritt 5 — Vorschau, was das alte Image tun wird** (nur lesend, das Portal läuft weiter):

```bash
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > ~/deploy-selfservice-s0/rueckfall-delta.sql
```

**Erwartet:** keine Ausgabe oder nur harmlose Hinweise. Eine Fehlermeldung (etwa `No such image`) →
**STOPP: Befehl E, Ausgabe an Claude.**

```bash
for m in 'DROP TABLE' 'DROP CONSTRAINT' 'DROP COLUMN' 'DROP INDEX'; do printf '%-16s %s\n' "$m" "$(grep -c "$m" ~/deploy-selfservice-s0/rueckfall-delta.sql)"; done
```

**Erwartet** (aus den Schemas gerechnet):

```
DROP TABLE       0
DROP CONSTRAINT  0
DROP COLUMN      2
DROP INDEX       1
```

```bash
grep -v -E '^--|^$' ~/deploy-selfservice-s0/rueckfall-delta.sql
```

**Erwartet:** genau diese drei Zeilen, sonst nichts:

```
DROP INDEX "employments_dokubit_vertrag_key";
ALTER TABLE "employments" DROP COLUMN "abrechnungskreis",
DROP COLUMN "personalNumber";
```

Weicht eine Zahl oder Zeile ab (vor allem ein `DROP TABLE` — dann ist das Image älter als
`0974b7f`) → **STOPP, nicht anhalten: Befehl E, Ausgabe an Claude** (dazu die Datei
`~/deploy-selfservice-s0/rueckfall-delta.sql`).

**Schritt 6 — Portal anhalten.** Ab hier ist das Portal nicht erreichbar.

```bash
sudo docker compose stop app
```

**Erwartet:** `Container hr-portal-app  Stopped`.

**Schritt 6a — Prüfung bei angehaltenem Portal wiederholen:** denselben Befehl wie in Schritt 2 noch
einmal. **Erwartet:** dieselben Zahlen. Weicht eine ab → **STOPP:** Befehl E, dann Befehl B aus
4.1 (startet den Container mit dem jetzigen Stand wieder), Ausgabe an Claude.

**Schritt 7 — Sicherung des jetzigen Stands:**

```bash
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-rueckfall-$(date +%Y%m%d-%H%M%S).sql'
```

**Erwartet:** keine Ausgabe.

**Schritt 8 — Sicherung prüfen** (sucht die neueste `vor-rueckfall-…`-Datei, ohne Sternchen):

```bash
sudo sh -c 'cd /vol/container/HR_Portal_CREDO/backups && f="$(ls -1t | grep "^vor-rueckfall-" | head -1)" && ls -l "$f" && grep -c "PostgreSQL database dump complete" "$f"'
```

**Erwartet:** zwei Zeilen — die Datei mit etwa der Größe aus 4.1, darunter `1`.

**Schritt 9 — nur bei Abweichung in Schritt 8:** **STOPP** — Befehl E, dann Befehl B aus 4.1
(startet den Container mit dem jetzigen Stand wieder), dann Ausgabe an Claude.

**Schritt 10 — altes Image starten:**

```bash
sudo docker compose up -d --no-build app
```

**Erwartet:** `hr-portal-app` wird neu angelegt (`Recreate`/`Recreated`, `Started`). Weicht ab →
**STOPP, Ausgabe an Claude.**

**Schritt 11 — Startlog ansehen:**

```bash
sudo docker compose logs -f app
```

**Erwartet** (nicht geprobt): `Schema-Unterschied erkannt — Sicherung wird angelegt...`,
`Sicherung abgelegt: …`, `Datenbank-Schema wird synchronisiert...`, keine Warnung oder nur Punkte zu
den zwei Spalten an `employments`, `Datenbank-Schema synchronisiert.`, dreimal
`System-Vorlage (…) ist aktuell.`, `Datenbank bereits geseeded …`,
`[Zeitplaner] Uhr gestartet (jede Minute).`, `✓ Ready in …`. Dann `Strg+C`. Jede andere Warnung,
`FATAL` oder nach 3 Minuten kein `✓ Ready` → `Strg+C`, **STOPP, Ausgabe an Claude** (Fehlerbilder
in 4.4; kein Befehl E). Zeigt sich eine Neustart-Schleife (Zeichen wie in 4.2), nicht abwarten:
sofort `Strg+C` und Befehl D, dann an Claude. Sonst danach 5.1 wiederholen; die Zeile zum Image
zeigt dann die volle ID aus 1.2 (das alte Image), nicht die aus 3.3.

**Nach Weg A:** Die Override-Datei bleibt, solange das alte Image laufen soll; solange sie existiert,
**nie** `sudo docker compose up -d --build` (der Build bekäme das Etikett `hr-portal-app:0974b7f` und
überschriebe das alte Image). Vor dem nächsten Vorwärts-Deploy löscht Befehl E sie. Der Repo-Stand
bleibt `main`; die Reparatur kommt als neuer Commit. Sicherungen `vor-deploy-selfservice-s0-…` und
`vor-rueckfall-…` aufheben.

### 7.4 Weg B: eine eigene Sicherung einspielen (nur mit Claude, nicht geprobt)

Weg B verwirft **alles**, was seit der Sicherung geschrieben wurde, in allen Tabellen; was außerhalb
der Datenbank geschah (versendete Mails, abgelegte Dateien, Links in Mails auf Tokens, die es danach
nicht mehr gibt), holt er nicht zurück. Er kommt deshalb nur kurz nach der Sicherung in Frage, und
es gibt ihn in zwei Fällen:

- **Misslungener erster Lauf von Etappe 2:** den n8n-Ablauf aus (8.8, Stufe 1), dann
  `backups/vor-s0-erster-lauf-manuell.sql` aus 8.4 einspielen, mit dem **neuen** Image (keine
  Override-Datei; die Sicherung trägt das S0-Schema mit leeren Spalten). Danach muss die Zählung
  aus 8.4 genau wieder stehen, und 7.3 Schritt 2 gilt wieder — erst dann wäre auch Weg A wieder
  möglich. Nur, solange HR seit 8.4 nichts gespeichert hat (Schreibpause bis zum Ende von 8.6).
- **Direkt nach Etappe 1**, wenn Weg A nicht geht oder die Datenbank selbst beschädigt ist:
  `backups/vor-deploy-selfservice-s0-manuell.sql` aus 4.1 einspielen, mit Override-Datei
  `image: hr-portal-app:0974b7f`. Liegt Etappe 1 Tage zurück, verwürfe das alle Arbeitstage
  seitdem — dann nicht.

Ablauf grundsätzlich wie in [deploy-main-2026-10.md](deploy-main-2026-10.md), 7.4: Prüfung, Portal
anhalten und den jetzigen Stand sichern (7.3 Schritte 6 bis 8), die Sicherung einspielen,
Schema-Vergleich muss `0` zeigen, erst dann starten. **Nie** eine ältere Sicherung
(`vor-deploy-main-2026-10-manuell.sql`, `vor-deploy-paket4-manuell.sql`) und nie ein älteres
Etikett nehmen. Die genauen Befehle gibt Claude im Ernstfall, je Kasten eine Zeile.

### 7.5 Weg C: altes Image ohne Entrypoint (nur mit Claude, nicht geprobt)

**Der einzige Weg zurück auf das alte Image nach dem ersten Lauf von Etappe 2** (Weg B mit der
Sicherung aus 8.4 bleibt beim neuen Image und taugt nur kurz nach dem Lauf). Das alte Image über
eine Override-Datei mit `image: hr-portal-app:0974b7f` **und** `entrypoint: ["node", "server.js"]`
starten — vorher 7.3
Schritt 3, den n8n-Stammablauf aus, das Geheimnis entfernen (8.8). Ohne Entrypoint gibt es weder
Sicherung noch Push noch Seed-Check: Spalten und Index bleiben samt Inhalt stehen, der alte
Prisma-Client kennt sie nicht und schreibt in neue Anstellungen dort nichts (leere Werte verletzen
den Index nie). Beim nächsten Vorwärts-Deploy findet der neue Entrypoint alles vor; nichts geht
verloren. Der Entrypoint muss bei **jedem** Start umgangen sein (die Override-Datei bleibt so lange
stehen), sonst tritt 7.1 ein. Die genauen Befehle gibt Claude im Ernstfall.

---

## 8 · Inbetriebnahme S0 (Etappe 2, erst nach den Freigaben)

Ein eigener Termin, an einem Werktag tagsüber mit erreichbarer Personalabteilung — nicht während des
nächtlichen Laufs (02:30) und nicht montags gegen 09:00. Grundlage ist die Betriebsanleitung
[`s0-personalstamm-n8n.md`](../module/selfservice/s0-personalstamm-n8n.md); die Schritte hier
ordnen sie und ergänzen Prüfungen. **Ab dem ersten Lauf (8.5) gibt es keinen Rückfall auf das alte
Image mit Entrypoint mehr** (7.1), und einen Probelauf gibt es nicht: Schon der erste Aufruf
schreibt.

### 8.0 Freigaben — ohne sie kein Schritt aus Abschnitt 8

Jeder Punkt braucht einen Nachweis (wer, wann). Ist einer offen → **STOPP**, Etappe 2 wartet.

| Nr. | Freigabe / Vorbedingung | Wer bestätigt | Quelle |
|---|---|---|---|
| F1 | **E-S25** geklärt: welches Gremium für die drei GmbHs zustimmt (MAV oder Betriebsrat), Zustimmung liegt vor | DSB, Projektverantwortlicher | Übergabe S0, Abschnitt 5 |
| F2 | **E-S27** geklärt: DSG-EKD oder BDSG je juristische Person | DSB | Übergabe S0, Abschnitt 5 |
| F3 | **Löschfrist von 1 Jahr** (`PERSONALSTAMM_AUFBEWAHRUNG_TAGE` = 365) bestätigt. Andere Frist → erst Code ändern und deployen | DSB | Anleitung S0, Abschnitt 7 |
| F4 | **Verzeichnis der Verarbeitungstätigkeiten** nachgetragen: Betreiber und Standort von n8n, Aufbewahrung der Ausführungen, feste Spaltenliste; bei fremdem Betreiber Vertrag nach Art. 28 DSGVO | DSB, Projektverantwortlicher | Anleitung S0, Abschnitte 2, 3.3, 7 |
| F5 | **Bestandsprüfung** (6.1) gelaufen, Abfrage 2 leer | Projektverantwortlicher | 6.1 |
| F6 | **In DokuBit bereinigt:** die 5 Adressen mit fremder Domäne (vermutlich privat — der Abgleich prüft die Domäne nicht; sie würden sonst dienstliche Adresse und später Anmeldeidentität) und die 1 Adresse mit zwei Namen | Personalabteilung | Übergabe S0, Abschnitt 5 |
| F7 | **Lauf „Wartung“ an** (6.2) | Projektverantwortlicher | 6.2 |
| F8 | **n8n-Instanz festgelegt** (welche der Instanzen auf dem Server den Stammablauf trägt) und belegt, dass sie das Portal erreicht: Die URL im HTTP-Knoten des Flows „Email-Vertragsende-Personal 3.0“ ansehen — geht er über `https://hr.fes-credo.de`, nimmt der Stammablauf dieselbe Adresse | Projektverantwortlicher | Anleitung S0, Abschnitt 3.2 |
| F9 | **Caddy schreibt keinen `Authorization`-Kopf ins Log:** in der Caddy-Konfiguration des Servers nachsehen, dass `log_credentials` nicht gesetzt ist und `debug` weiter aus ist (seit 29.09.; das Caddyfile im Repo ist veraltet und belegt den Stand nicht) | IT bzw. Projektverantwortlicher | — |
| F10 | Wer den ersten Lauf ausführt, darf DokuBit-Daten sehen (der n8n-Editor zeigt Namen und Adressen) | Personalabteilung | Anleitung S0, Abschnitt 3.3 |
| F11 | **Aufbewahrung gescheiterter Ausführungen in n8n festgelegt** und in F4 eingetragen. Erfolgreiche und manuelle Ausführungen speichert der Ablauf nicht (Importvorlage), gescheiterte aber schon — mit Namen und Adressen aus DokuBit. Zwei Wege: (a) nur dieser Ablauf: Settings → „Save failed production executions“ auf „Do not save“ (wirkt nur hier; ein Fehlschlag ist dann in n8n nicht mehr nachzusehen); (b) instanzweit über Umgebungsvariablen der n8n-Instanz, etwa `EXECUTIONS_DATA_PRUNE=true` und `EXECUTIONS_DATA_MAX_AGE` (Stunden, z. B. `168` = 7 Tage; Namen laut n8n-Dokumentation, gegen die Version der Instanz prüfen), mit Neustart von n8n — wirkt auf **alle** Abläufe der Instanz, auch „Email-Vertragsende-Personal 3.0“. Festzuhalten: Weg, Frist, wer eingestellt hat | Projektverantwortlicher, DSB | Anleitung S0, Abschnitt 3.3 |

### 8.1 Vorher (nur lesen)

```bash
cd /vol/container/HR_Portal_CREDO
```

**Was ein Neuanlegen des Containers starten würde.** 8.2 und 8.8 legen `hr-portal-app` mit
`--force-recreate` neu an, und zwar mit dem Image, das dann `hr_portal_credo-app:latest` heißt, und
nach der `docker-compose.yml` im Projektordner. Hat seit Etappe 1 jemand gebaut, ohne zu starten
(am 14.10. vorgekommen), rollte das ungeprüften Code aus — samt `db push --accept-data-loss` im
Entrypoint. Deshalb vorher:

```bash
sudo git diff --quiet 0e1d8de HEAD -- . ':!docs' ':!CLAUDE.md' ':!README.md' && echo "Code-Stand 0e1d8de"
```

**Erwartet:** `Code-Stand 0e1d8de` (seit Etappe 1 höchstens Doku dazu — dieselbe Ausnahme wie in
3.2: Dateien unter `docs/`, `CLAUDE.md` und `README.md`; Abschnitt 9 führt die `CLAUDE.md` schon
mit Etappe 1 nach, beide liegen nicht im Image — `.dockerignore` schließt `*.md` im Projektordner
aus — und liest zur Laufzeit niemand). Kam nach Etappe 1 ein
weiterer Deploy, setzt Claude hier dessen Code-Stand ein. Fehlt die Zeile → **STOPP, Ausgabe an
Claude.**

```bash
ls docker-compose.override.yml 2>/dev/null || echo "kein Override"
```

**Erwartet:** `kein Override`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
printf 'laufend %s\nlatest  %s\n' "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)" "$(sudo docker image inspect --format '{{.Id}}' hr_portal_credo-app:latest)"
```

**Erwartet:** zwei Zeilen mit derselben vollen ID, und zwar der aus 3.3 bzw. 5.1 des Protokolls von
Etappe 1 (nach einem weiteren Deploy: der aus dessen Protokoll). Zwei verschiedene IDs oder eine
fremde → **STOPP, nichts neu anlegen, Ausgabe an Claude.**

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

**Erwartet:** `0` — das Neuanlegen findet ein deckungsgleiches Schema vor und pusht nichts. Weicht ab
→ **STOPP, Ausgabe an Claude.**

Die Abfragen 1 bis 3 aus 6.1 noch einmal. **Erwartet:** keine Herkunft `DOKUBIT`,
`vom_abgleich_verwaltet` überall `0`, Abfrage 2 `(0 rows)`. Weicht ab → **STOPP, Ausgabe an
Claude** (Abfrage 4 nur auf dem Server ansehen).

```bash
sudo grep -c '^PERSONALSTAMM_SECRET=' .env
```

**Erwartet:** `0`. Bei `1` → **STOPP, Ausgabe an Claude** (sonst entstünde ein doppelter Eintrag).

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT schluessel, aktiv, probelauf, uhrzeit FROM automatische_laeufe WHERE schluessel = $$wartung$$;'
```

**Erwartet:** `wartung | t | f | 03:30` (6.2). Sonst → **STOPP**, erst 6.2.

Optional, für den Vergleich mit DokuBit (zeigt nur Nummern und Namen der Einrichtungen, keine
Personen):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT "mandantNumber", "isActive" AS aktiv FROM organizations ORDER BY 1;'
```

**Erwartet:** die Mandantennummern des Portals. Jede `MANDANTENNUMMER`, die DokuBit liefert (ohne
führende Nullen), sollte darin stehen — sonst meldet der Abgleich `MANDANT_UNBEKANNT`. Den Abgleich
mit DokuBit macht, wer DokuBit lesen darf.

### 8.2 Geheimnis setzen

**Den Wert erzeugt der Projektverantwortliche in seinem Passwortmanager** (mindestens 32 Zeichen, nur
Buchstaben und Ziffern) und legt ihn dort ab — er wird in 8.3 für n8n noch einmal gebraucht. Er ist
**nicht** `CRON_SECRET`. Er erscheint nie in einer Befehlszeile, im Chat, in der Doku oder in einem
Protokoll.

Eintragen (**schreibt** in die `.env`; die Eingabe bleibt unsichtbar, der Befehl zeigt nur die Länge;
nicht geprobt):

```bash
sudo sh -c 'stty -echo; printf "Geheimnis einfuegen, dann Enter: "; read -r v; stty echo; echo; printf "\nPERSONALSTAMM_SECRET=%s\n" "$v" >> /vol/container/HR_Portal_CREDO/.env; echo "eingetragen, Zeichen: ${#v}"'
```

**Erwartet:** `eingetragen, Zeichen: <Länge aus dem Passwortmanager>`, mindestens `24`. Eine falsche
Länge → **STOPP, Ausgabe an Claude** (die Zeile wird dann mit Claude entfernt).

Nur falls die Eingabe im Terminal danach unsichtbar bleibt (etwa nach `Strg+C` mitten im Befehl):

```bash
stty echo
```

**Erwartet:** keine Ausgabe; danach erscheint Getipptes wieder.

```bash
sudo grep -c '^PERSONALSTAMM_SECRET=.' .env
```

**Erwartet:** `1`.

Den Container neu anlegen, damit er die `.env` liest (`restart` liest sie nicht neu). **Das Portal
ist dabei etwa eine Minute nicht erreichbar** — HR vorher Bescheid geben:

```bash
sudo docker compose up -d --no-build --force-recreate app
```

**Erwartet:** `hr-portal-app` wird neu angelegt (`Recreate`/`Recreated`, `Started`).

```bash
sudo docker compose logs --no-log-prefix app | grep -E 'Schema|Sicherung|synchron|Seed|System-Vorlage|Zeitplaner|Ready|FATAL|Fehler|[Pp]ersonalstamm'
```

**Erwartet** (nach etwa einer Minute): `Datenbank-Schema ist bereits deckungsgleich — kein Abgleich
noetig.`, `Pruefe ob Seed notwendig...`, dreimal `System-Vorlage (…) ist aktuell.`,
`Datenbank bereits geseeded (… User vorhanden). Seed uebersprungen.`,
`[Zeitplaner] Uhr gestartet (jede Minute).`, ` ✓ Ready in …` — keine Sicherung, keine Zeile
`[personalstamm] …` oder `[Personalstamm] …`. Weicht ab → **STOPP, Ausgabe an Claude** (nichts
starten, nichts anhalten). Danach 5.1 wiederholen; die Zeile zum Image zeigt dieselbe ID wie in 8.1.

Länge im Container prüfen, ohne den Wert zu zeigen (Befehl aus der Anleitung S0, Abschnitt 7):

```bash
sudo docker exec hr-portal-app sh -c 'test ${#PERSONALSTAMM_SECRET} -ge 24 && echo gesetzt || echo FEHLT'
```

**Erwartet:** `gesetzt`. `FEHLT` → **STOPP, Ausgabe an Claude.**

Von außen mit falschem Schlüssel (schreibt nichts):

```bash
curl -s -w '\nHTTP %{http_code}\n' -X POST -H 'Authorization: Bearer falsch' https://hr.fes-credo.de/api/webhooks/personalstamm
```

**Erwartet:** `{"error":"Nicht autorisiert"}` und `HTTP 401` — das Geheimnis ist gesetzt, lang genug
und verschieden von `CRON_SECRET`. `HTTP 500` mit `Konfigurationsfehler` → **STOPP**; welcher Fall
vorliegt, zeigt der Befehl darunter, dann Ausgabe an Claude.

Nur bei `HTTP 500` (der Log-Befehl aus 5.3; zeigt nur Meldungen von Route und Abgleich, kein
Geheimnis):

```bash
sudo docker compose logs --no-log-prefix app | grep -i '\[personalstamm\]'
```

**Erwartet:** `[personalstamm] PERSONALSTAMM_SECRET fehlt oder ist zu kurz` bzw.
`[personalstamm] PERSONALSTAMM_SECRET ist gleich CRON_SECRET`.

Optional, im Container mit dem echten Wert und leerem Stapel (schreibt nichts; der Wert läuft über
die Standardeingabe, nicht über die Befehlszeile; mit dem `curl` im Image nicht geprobt):

```bash
sudo docker exec hr-portal-app sh -c 'echo "Authorization: Bearer $PERSONALSTAMM_SECRET" | curl -s -w "\nHTTP %{http_code}\n" -X POST -H @- -H "Content-Type: application/json" --data "[]" http://localhost:3000/api/webhooks/personalstamm'
```

**Erwartet:** `{"error":"Leerer Stapel"}` und `HTTP 400` — die Anmeldung gelang, nichts geschrieben.

### 8.3 n8n einrichten (in der n8n-Oberfläche, der Ablauf bleibt inaktiv)

In der in 8.0 (F8) festgelegten Instanz, nach der Anleitung S0, Abschnitt 3. Die Reihenfolge ist
Absicht: Die Probe in Nr. 4 läuft, solange der Knoten „An Portal senden“ noch die Platzhalter-URL
`https://HR-PORTAL/…` und kein Credential hat — ein Fehlklick auf „Execute workflow“ scheitert dann
an diesem Knoten und erreicht das Portal nicht.

1. `docs/module/selfservice/s0-personalstamm-n8n.json` importieren (Workflows → Import from File).
   Der Ablauf kommt inaktiv an (`active: false`) — so lassen bis 8.7.
2. **Settings des Ablaufs** (Anleitung 3.3) prüfen, bevor irgendetwas ausgeführt wird — sie kommen mit
   der Importvorlage: Timezone Europe/Berlin; „Save successful production executions“ und „Save
   manual executions“ auf „Do not save“. Gescheiterte Ausführungen nach F11 (8.0) einstellen.
3. **Credential Microsoft SQL** für DokuBit, möglichst ein Benutzer nur mit `SELECT` auf
   `dbo.dokubitmitarbeiter`.
4. Optional: nur „Stapel bilden“ ausführen (führt die Knoten davor mit aus, nicht das Portal).
   Prüft SQL-Credential, Zeilen- und Stapelzahl und die Grenze von 200. **Der Editor zeigt dabei
   Namen und Adressen** — nur F10.
5. **Credential Header Auth** „HR-Portal Personalstamm“: Name `Authorization`, Value
   `Bearer <Wert aus dem Passwortmanager>` — genau ein Leerzeichen nach `Bearer`. Nur in diesem
   Ablauf verwenden, nie `CRON_SECRET`.
6. **HTTP Request „An Portal senden“:** URL `https://hr.fes-credo.de/api/webhooks/personalstamm`
   (bzw. die Adresse aus F8), Header Auth aus Nr. 5, Body JSON `{{ JSON.stringify($json.eintraege) }}`,
   Timeout `120000` ms, **nicht** die Option „Batching“. Ab hier würde „Execute workflow“ schreiben —
   nicht mehr ausführen bis 8.5.
7. **Verdrahtung „Je Stapel“** (Loop Over Items, Batch Size `1`) prüfen — gegen eine echte Instanz
   nie getestet: Ausgang „loop“ → „An Portal senden“ → zurück auf „Je Stapel“; Ausgang „done“ frei.

### 8.4 Sicherung direkt vor dem ersten Lauf

Erst jetzt, wenn n8n eingerichtet ist und 8.5 unmittelbar folgt. Für einen Fehlschlag des ersten
Laufs gibt es keinen Rücknahmeweg im Portal; diese Sicherung ist das Netz (Weg B, 7.4), eingespielt
nur mit Claude. Ein Einspielen verwirft alles, was danach geschrieben wurde — deshalb **HR vorher
bitten, ab dieser Sicherung bis zum Ende von 8.6 nichts im Portal zu speichern** (Ankündigung
sinngemäß wie in Abschnitt 0; öffentliche Links lassen sich nicht anhalten). Das Portal läuft
dabei weiter (`pg_dump` liest einen festen Stand).

```bash
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-s0-erster-lauf-manuell.sql'
```

**Erwartet:** keine Ausgabe.

```bash
sudo ls -l backups/vor-s0-erster-lauf-manuell.sql
```

**Erwartet:** etwa so groß wie in 4.1 oder größer.

```bash
sudo grep -c 'PostgreSQL database dump complete' backups/vor-s0-erster-lauf-manuell.sql
```

**Erwartet:** `1`. Weicht ab → **STOPP, Ausgabe an Claude.**

Bestand zum Zeitpunkt der Sicherung (derselbe Zählbefehl wie in 1.7):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM employees) AS personen, (SELECT COUNT(1) FROM employees WHERE "importSource" = $$DOKUBIT$$) AS aus_dokubit, (SELECT COUNT(1) FROM employments) AS anstellungen, (SELECT COUNT(1) FROM audit_logs WHERE "processType" = $$PERSONALSTAMM$$) AS protokoll_personalstamm;'
```

**Erwartet:** vier Zahlen, `aus_dokubit` = `0` (`protokoll_personalstamm` kann seit Etappe 1 durch
Änderungen von Hand größer 0 sein). **Notieren** — nach einem Einspielen dieser Sicherung muss die
Datenbank genau diese Zahlen zeigen. `aus_dokubit` größer 0 → **STOPP, Ausgabe an Claude.**

### 8.5 Erster Lauf von Hand

Direkt nach 8.4: den Ablauf einmal ausführen („Execute workflow“), nicht während des nächtlichen
Laufs. Weil manuelle Ausführungen nicht gespeichert werden, je Stapel **sofort notieren**:
HTTP-Status, die Zahlen aus `summary` und ob in `results` ein `code` `INTERNER_FEHLER` steht (die
Antwort enthält keine Namen und Adressen, nur Vertragsschlüssel aus Mandant, Abrechnungskreis und
MANR).

**Erwartet:** jeder Stapel `HTTP 200`. `success: false` bei Zeilen mit `fehler` ist normal
(`FORMATFEHLER`, `MANDANT_UNBEKANNT`); die Meldungen stehen danach unter „Personen“ → „Zu prüfen“.
**Ausnahme `INTERNER_FEHLER`:** eine Ausnahme im Portal, die mit `HTTP 200` zurückkommt → **STOPP,
Ablauf nicht aktiv schalten**, an Claude die Ausgabe des Log-Befehls aus 5.3 (nur Zeilenindex und
Fehlerkennung). Ein Stapel nicht 200 → **STOPP, Ablauf nicht aktiv schalten, Ausgabe an Claude**:

| Antwort | Bedeutung |
|---|---|
| `401` „Nicht autorisiert“ | Credential in n8n passt nicht zum Geheimnis (Tippfehler, fehlendes `Bearer `) |
| `500` „Konfigurationsfehler“ | Geheimnis im Portal fehlt, ist zu kurz oder gleich `CRON_SECRET` (Log wie in 8.2) |
| `400` „Ungültiger Request-Body“ / „Leerer Stapel“ / „Maximal 200 Einträge pro Aufruf“ | Körper falsch gebaut (Verdrahtung, JSON-Ausdruck, Stapelbildung) |
| `413` | Körper über 1 MiB |
| `500` „Interner Serverfehler“ | Ausnahme im Portal: die Ausgabe des Log-Befehls aus 5.3 an Claude (enthält nur Fehlerkennungen, keine Namen) |
| Zeitüberschreitung | Timeout zu kurz oder „Batching“ statt Schleife |

### 8.6 Kontrollen nach dem ersten Lauf

**Abfrage 5 — Zahlen der Läufe:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT "createdAt", details->$$zahlen$$ AS zahlen FROM audit_logs WHERE action = $$PERSONALSTAMM_LAUF$$ ORDER BY "createdAt" DESC LIMIT 10;'
```

**Erwartet:** je Stapel eine Zeile mit `zahlen`, passend zu den in 8.5 notierten.

Dann **Abfrage 1 und Abfrage 3** aus 6.1. **Erwartet** (Stand DokuBit 17.10.2026): unter `DOKUBIT`
rund **343** Personen und rund **362** aktive, vom Abgleich verwaltete Anstellungen, abzüglich der
Zweifelsfälle. Weicht es stark ab (etwa unter 300 Personen) → **STOPP, nicht aktiv schalten, Ausgabe
an Claude.**

**„Personen“ im Portal:** „Letzter Abgleich: <Zeitpunkt>“, **keine rote Zeile** (der Abgleich setzt
den Liefer-Zeitpunkt jeder gelieferten Person). Eine gelbe Zeile mit Anzahl ist zu erwarten
(`MANUELLER_DATENSATZ`, `FREMDE_QUELLE`, `EMAIL_ANDERER_NAME`, `MAIL_FEHLT`, `MANDANT_UNBEKANNT` …);
den Block „Zu prüfen“ mit der Personalabteilung durchgehen, Abhilfe je Grundcode in der Anleitung
S0, Abschnitt 4 — behoben wird an der Quelle, meist in DokuBit (zu `EMAIL_MEHRDEUTIG` gilt 6.1:
`DELETE` deaktiviert nur). Eine rote Zeile oder viele
`FORMATFEHLER`/`MANDANT_UNBEKANNT` → vor dem Einschalten an Claude (nur Anzahlen und Grundcodes).
Steht in „Zu prüfen“ „Interner Fehler bei dieser Zeile“ (`INTERNER_FEHLER`) → **STOPP, nicht aktiv
schalten**, an Claude die Ausgabe des Log-Befehls aus 5.3.

**Schreibschutz an einer Person aus DokuBit** (erst jetzt möglich, vorher gibt es keine). Eine ID
holen — nur die ID, kein Name:

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -At -c 'SELECT id FROM employees WHERE "importSource" = $$DOKUBIT$$ AND "isActive" LIMIT 1;'
```

**Erwartet:** eine UUID. Dann im Browser, angemeldet mit dem eigenen SUPER_ADMIN-Konto, auf einer
Seite des Portals die Entwicklerwerkzeuge öffnen (F12), Reiter „Konsole“ (Chrome verlangt beim
ersten Einfügen womöglich, „allow pasting“ einzutippen), diese Zeile einfügen, `<ID>` durch die UUID
ersetzen und Enter:

```
fetch('/api/employees/<ID>', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: '{"isActive":true}'}).then(r => console.log(r.status))
```

**Erwartet:** `409` — der Aktiv-Status einer Person aus DokuBit ist gesperrt, geschrieben wird
nichts (und die Person ist schon aktiv, ein Fehlschlag ließe den Wert also unverändert). Eine andere
Zahl → an Claude.

**Schreibpause aufheben:** Liefen alle Kontrollen ohne STOPP, HR Bescheid geben, dass wieder
gespeichert werden darf (Uhrzeit ins Protokoll). Nach einem STOPP erst nach der Antwort von Claude —
ein Einspielen der Sicherung aus 8.4 (7.4) verwürfe sonst, was HR inzwischen gespeichert hat.

### 8.7 Zeitplan einschalten, nächster Morgen

1. Erst jetzt den Ablauf in n8n auf **Active** schalten (täglich 02:30). Nie von Hand starten,
   während der nächtliche Lauf arbeitet.
2. Am nächsten Morgen: „Personen“ zeigt „Letzter Abgleich“ von etwa 02:30; Abfrage 5 hat die
   Zeilen des nächtlichen Laufs; unter Automatische Läufe ist „Wartung“ (03:30) gelaufen; in n8n
   steht unter „Executions“ des Ablaufs keine gespeicherte erfolgreiche Ausführung (Settings aus
   8.3).
3. Wer täglich nach der Hinweiszeile unter „Personen“ sieht, legt die Personalabteilung fest: Für den
   n8n-Ablauf gibt es keinen Wächter und keine Mail; rot wird die Zeile erst nach 26 Stunden ohne
   Lieferung und nur beim Öffnen der Seite.

### 8.8 Rücknahme der Etappe 2 (Anleitung S0, Abschnitt 5)

**Stufe 1:** den Ablauf in n8n ausschalten. Mehr ist nicht nötig.

**Stufe 2:** zusätzlich das Geheimnis entfernen, damit auch ein vergessener Ablauf nichts mehr
schreibt. Vorher die vier Prüfungen aus 8.1 zu Code-Stand (derselbe Befehl, also mit derselben
Ausnahme `':!docs' ':!CLAUDE.md' ':!README.md'` wie in 3.2), Override-Datei, Image und
Schema-Vergleich wiederholen — das Neuanlegen unten nimmt sonst womöglich ein anderes Image, dessen
Entrypoint nach dem ersten Lauf Daten löschen könnte (7.1). Erwartet ist dabei die Image-ID aus dem
letzten Deploy-Protokoll. Weicht etwas ab → **STOPP, nichts neu anlegen, Ausgabe an Claude**;
Stufe 1 genügt bis zur Antwort. Der erste Befehl **schreibt** in die `.env`:

```bash
sudo sed -i '/^PERSONALSTAMM_SECRET=/d' .env
```

**Erwartet:** keine Ausgabe.

```bash
sudo grep -c '^PERSONALSTAMM_SECRET=' .env
```

**Erwartet:** `0`.

```bash
sudo docker compose up -d --no-build --force-recreate app
```

**Erwartet:** `hr-portal-app` wird neu angelegt (etwa eine Minute nicht erreichbar). Danach antwortet
die Probe aus 5.3 wieder `HTTP 500` „Konfigurationsfehler“.

Was dabei gilt:

- **Kein Image-Rückfall** mit Entrypoint (7.1); im Ernstfall Weg C (7.5) oder, nur kurz nach einem
  misslungenen ersten Lauf, Weg B mit der Sicherung aus 8.4 (7.4) — beides mit Claude.
- Angelegte Personen und Verträge bleiben (`importSource` = `DOKUBIT`, Anstellungen mit
  Abrechnungskreis und MANR). **Der Stamm steht dann still:** Den Aktiv-Status einer Person aus
  DokuBit rechnet nur der Abgleich; ohne Läufe bleibt er stehen, auch wenn Vertragsenden
  verstreichen, und HR kann ihn nicht von Hand ändern (409). Für S0 allein ohne Wirkung — vor S1
  (Anmeldung) muss das entschieden sein.
- Nach 26 Stunden ohne Lieferung wird die Hinweiszeile rot — nach dem Abschalten zu erwarten. Wird
  nach mehr als 30 Tagen wieder eingeschaltet, für den ersten Lauf das Fenster der Abfrage vergrößern
  (Anleitung S0, Abschnitt 2).

---

## 9 · Protokoll

### Vorlage zum Ausfüllen — Etappe 1

Nach dem Update kommt dieser Teil, ausgefüllt, als „Protokoll vom [Datum]“ direkt unter den Kopf
dieses Dokuments (Claude trägt ihn ein). Uhrzeiten in UTC, deutsche Zeit in Klammern (bis 24.10.
UTC + 2 h, ab 25.10. UTC + 1 h).

| Schritt | Uhrzeit | Ergebnis / Ausgabe | Abweichung |
|---|---|---|---|
| 1.1 Serverstand (`git log -1`, erwartet `ea2d41d` oder `5595cf7`); `reflog` (oberste Zeile); `status`; kein Override | | | |
| 1.2 Container (`healthy`), Erstelldatum `2026-10-14T11:1…`, Image `sha256:64e1319792ff…` (volle ID) | | | |
| 1.3 Drift (erwartet `0`) | | | |
| 1.4 Sicherungsverzeichnis (`2`, Standard, `1001`), beide Schreibtests | | | |
| 1.5 Freier Platz (Docker / Projektordner), Images, Größe `backups`, Zahl der `vor-schema-abgleich-…` | | | |
| 1.6 Uploads-Volume (Name, Größe) | | | |
| 1.7 S0 noch nicht da (`neue_spalten` 0, `neuer_index` leer); Bestand (`personen` / `aus_dokubit` 0 / `anstellungen` / `protokoll` 0); Merker `13`; Konten je Rolle; System-Vorlagen (4 Zeilen?) | | | |
| 1.8 Läufe (welche `t`, um wann; `wartung`) | | | |
| 1.9 `N8N_API_KEY` (`0`/`1`); `PERSONALSTAMM_SECRET` (`0`); Webhook-Route vorher (`404`?) | | | |
| 2.1 Etikett `hr-portal-app:0974b7f` = volle ID = laufend | | | |
| 2.2 Leseprobe (Dateien, Bytes, `tar OK`; bei Fehlschlag nur die Ausgabe des Prüfbefehls) | | | |
| 3.1 `git pull` (von … nach …) | | | |
| 3.2 S0 `a43aa25` enthalten, voller Hash; Code-Stand `0e1d8de` enthalten; `20` / `6`; Merge gleich S0-Zweig; nach `0e1d8de` nur Doku (welche Dateien?); Betriebsdateien (3 Zeilen); `package*` unverändert | | | |
| 3.3 Build (Dauer; `npm ci` `CACHED` oder neu); neues Image: volle ID, Erstellzeit | | | |
| 3.4 Vorschau (`2/0/0/1/0`, kein DROP, genau drei Zeilen) | | | |
| 4.1 angehalten um; Bestand (4 Zahlen); DB-Sicherung (Bytes, `1`); Uploads (Bytes, Zeilen, `tar OK`) | | | |
| 4.2 Start (`Recreated`/`Started`) | | | |
| 4.3 Log: Entrypoint-Sicherung (Name, Bytes), Warnung (1 Punkt?), `db push` (ms), System-Vorlagen (3 × `ist aktuell`?), keine Migrationszeile, Zeitplaner, `Ready` (ms) | | | |
| 4.5 Entrypoint-Sicherung kopiert, drei Dateien | | | |
| 5.1 Health (`uhrAktiv`, `letzterTakt`), Portal wieder erreichbar ab; Container: Erstelldatum, Image = ID aus 3.3 | | | |
| 5.2 Drift `0`; Spalten / Index / mit Schlüssel (`2` / `employments_dokubit_vertrag_key` / `0`); Index-Definition; Bestand gleich 4.1; Merker / Läufe / aktiv (`13` / `11` / …) | | | |
| 5.3 Webhook `HTTP 500` „Konfigurationsfehler“; Logzeile; nur bei `N8N_API_KEY` = `1`: `POST /api/employees` mit Schlüssel `HTTP 403` | | | |
| 5.4 Probe: Personen / Offboarding (Abfindung, Links) / Onboarding / Verbeamtung (welche Kachel, vorher eine andere über 0? behalten die übrigen nach dem Klick ihre Zahlen — oder „nicht prüfbar“) / Vertragsende / Karte „Wartung“ | | | |
| 5.5 HR Bescheid gegeben um | | | |
| 6.1 Bestandsprüfung: Abfrage 1 (je Herkunft), Abfrage 2 (`(0 rows)`?), Abfrage 3; Dubletten bereinigt (Anzahl, wie) | | | |
| 6.2 Wartung: Ausgangslage aus 1.8; Probelauf (drei Zeilen); eingeschaltet bzw. „als Probelauf“ abgewählt um — oder: verschoben | | | |
| 6.2 Folgetag: „Letzter Lauf“ ohne „· Probelauf“, „Gelöscht: Personalstamm-Protokolle“ `0` | | | |

**Sicherungen auf dem Server** (Größen eintragen):

| Datei | Größe | Zweck |
|---|---|---|
| `backups/vor-deploy-selfservice-s0-manuell.sql` | | maßgeblich für Weg B direkt nach Etappe 1 (`pg_dump` 16 aus dem DB-Container); nach einem misslungenen ersten Lauf gilt die aus 8.4 |
| `backups/vor-deploy-selfservice-s0-entrypoint.sql` | | Kopie der Entrypoint-Sicherung (`pg_dump` 18), aus der Rotation genommen |
| `backups/uploads-vor-deploy-selfservice-s0.tar.gz` | | Uploads vor dem Update — enthält Personalunterlagen, bleibt auf dem Server |
| Image `hr-portal-app:0974b7f` | | altes Image (Deploy vom 14.10.) für Weg A, Weg B direkt nach Etappe 1 und Weg C |

**Log des Starts** (Auszug aus `start-log.txt`, wörtlich — nie mit einer Zeile
`INITIALES PASSWORT`, siehe 4.3): _…_

**Ausgangsstand für das nächste Update:** _Repo-Stand, Code-Stand, Image-ID (3.3/5.1),
Erstelldatum des Containers (5.1), Rückfall-Etikett, Merker, Stand von S0 (ruhend / in Betrieb
seit …)._ Dazu fest: Ab diesem Deploy nur Stände ausrollen, die `a43aa25` (S0-Schema) **und**
`0e1d8de` (Code-Stand dieses Deploys, Fix der Status-Kacheln) enthalten — künftige Ablaufpläne
prüfen beide mit `git merge-base --is-ancestor`; `ux-umbau` erst nach dem Merge von `main`, und
`main` erst nach dem Merge dieses Pull Requests hinein (7.1, Abschnitt 10, Punkt 9).

### Vorlage zum Ausfüllen — Etappe 2

| Schritt | Uhrzeit | Ergebnis / Ausgabe | Abweichung |
|---|---|---|---|
| 8.0 Freigaben F1–F11 (je Nachweis: wer, wann; F11: Weg und Frist) | | | |
| 8.1 Code-Stand `0e1d8de`; kein Override; laufend = latest = ID aus Etappe 1; Drift `0`; Abfragen 1–3 (keine `DOKUBIT`, Abfrage 2 leer); `PERSONALSTAMM_SECRET` `0`; `wartung` an, kein Probelauf | | | |
| 8.2 eingetragen (Zeichen); `grep` `1`; Neustart, Log `deckungsgleich`; `gesetzt`; Probe `401`; optional `400` | | | |
| 8.3 n8n: Instanz, Import, Settings (auch F11), Credentials, optional Probe „Stapel bilden“, URL, Verdrahtung geprüft | | | |
| 8.4 HR um Schreibpause gebeten um; Sicherung vor dem ersten Lauf (Bytes, `1`); Bestand (4 Zahlen, `aus_dokubit` 0) | | | |
| 8.5 erster Lauf: je Stapel HTTP-Status, `summary`, `INTERNER_FEHLER` ja/nein | | | |
| 8.6 Abfrage 5; Abfragen 1 und 3 (Personen `DOKUBIT`, verwaltete Anstellungen); „Personen“ (letzter Abgleich, rot/gelb, Grundcodes mit Anzahl); Schreibschutz `409`; Schreibpause aufgehoben um | | | |
| 8.7 aktiv geschaltet um; nächster Morgen (letzter Abgleich, Abfrage 5, Wartung, keine gespeicherte Ausführung in n8n) | | | |

### Was an Claude geht

| Wann | Was | Weiter erst nach Antwort? |
|---|---|---|
| 1.1–2.2 | jede Abweichung, jede STOPP-Zeile (anderer Serverstand, späterer Pull, S0-Spalten schon da, `aus_dokubit` oder `protokoll_personalstamm` > 0, Merker ≠ 13, `PERSONALSTAMM_SECRET` = 1, Etikett falsch); bei fehlendem `tar OK` nur die Ausgabe des Prüfbefehls aus 2.2, nie Dateinamen | **ja** |
| 1.7 / 1.9 | Konten mit EINRICHTUNGSLEITUNG oder VORGESETZTER; `N8N_API_KEY` = `1` | nein |
| 3.1–3.4 | **alle** Ausgaben von 3.2, Build-Log (Ende), ID des neuen Images, Abweichung der Vorschau mit `vorschau-delta.sql` | **ja** bei Abweichung (das Portal läuft weiter) |
| 4.1 | Fehler beim Zählen, Sicherung zu klein, `grep` `0`, kein `tar OK` (dann nur der Prüfbefehl aus 2.2) | **ja** (vorher Befehl B) |
| 4.3 | `start-log.txt`, **immer** (außer mit Seed-Zeile: dann nur diese Zeile) | nein, außer bei Fehlern |
| 4.4 | jeder Fehlschlag, bei einer Neustart-Schleife nach Befehl D (kein Befehl B) | **ja** |
| 5.1–5.3 | Ergebnisse und Abweichungen; Image nicht das aus 3.3; weniger Personen oder Anstellungen als in 4.1 (**sofort**); Webhook nicht `500`; Probe des n8n-Schlüssels nicht `403` | nein, außer bei Fehlern |
| 5.4 | Abweichungen der Probe (ohne Namen) | nein |
| 6.1 | Zahlen der Abfragen 1–3 (nie Abfrage 4) | nein; bei Dubletten den Weg der Bereinigung |
| 6.2 | Probelauf nicht wie erwartet; am Folgetag das Ergebnis des scharfen Laufs | **ja** beim Probelauf |
| 7 | vor **jedem** Rückfall | **ja** |
| 8.x | jede STOPP-Zeile, Abweichung in 8.1 (Code-Stand, Override, Image), Antworten ungleich 200 (Status und `summary`, nie Daten aus dem n8n-Editor), `INTERNER_FEHLER` (mit dem Log-Befehl aus 5.3), starke Abweichung der Zahlen, rote Zeile, Schreibschutz nicht `409` | **ja** |

### Nach dem Update (Claude)

Das Protokoll hier eintragen (Kopfzeile „Stand“ ergänzen) und den Stand von S0 („deployt am …,
ruhend“ bzw. „in Betrieb seit …“) überall nachführen, wo heute „nicht deployt“ steht:

- [`docs/README.md`](../README.md): bei der Historie die Zeile dieser Anleitung (steht schon da, „noch
  nicht ausgeführt“ durch das Datum des Deploys ersetzen), beim Mitarbeiterportal der Stand von S0
  (Überschrift und Satz „… noch nicht deployt“).
- [`docs/module/selfservice/README.md`](../module/selfservice/README.md): Absatz „Stand“ im Kopf und
  Zeile S0 der Tabelle „Stand je Paket“.
- [`uebergabe-selfservice-s0-2026-10-17.md`](uebergabe-selfservice-s0-2026-10-17.md): Kopf
  („Nicht deployt.“ samt Nachtrag vom 18.10.), Abschnitt 5 (Punkt „Pull Request gemergt und
  deployt“ abhaken), Abschnitt 7 (Zeile S0 der Tabelle) und Abschnitt 8 (Zeilen `main` und
  `fix/verbeamtung-kacheln-deploy-s0` der Zweig-Tabelle). Dazu den Abschnitt „Stand 18.10.2026 —
  hier weitermachen“ unter dem Kopf auf den Stand nach dem Deploy bringen (Nachtrag vom 18.10.2026)
  und in 8.6 nur den Satz „Den Stand von S0 führt sie mit Etappe 1 nach“ anpassen (der Rest des
  Absatzes zur CLAUDE.md gilt weiter).
- CLAUDE.md **schon mit Etappe 1:** Sie hat seit dem 18.10.2026 einen Einstieg, die Hausregeln und
  im Abschnitt „Docker / Deployment“ die dauerhafte Regel „Feste Anker für Deploy und Rückfall“
  (nur Stände mit `a43aa25` und `0e1d8de`, `ux-umbau` erst nach dem Merge von `main`, Rückfall nur
  nach Abschnitt 7) — die Regel bleibt dort und wird nicht mit dem Einstieg umgeschrieben. Nach dem
  Deploy wird der Abschnitt „Laufende Arbeit und Einstieg“ nachgeführt: S0 deployt und ruhend; die
  Zeile zu PR #6 entfällt, sobald er gemergt ist. Erst mit Etappe 2 kommen dazu: in der Tabelle der
  Umgebungsvariablen `PERSONALSTAMM_SECRET` (optional) und ein Abschnitt zu S0 (Webhook,
  Schreibschutz, Löschfrist, Rücknahme).

---

## 10 · Offen nach dem Deploy

Vorläufige Liste — beim Eintragen des Protokolls auf den tatsächlichen Stand bringen.

1. **Etappe 2 (Abschnitt 8):** erst nach den Freigaben F1–F11 aus 8.0. Bis dahin bleibt S0 ruhend.
2. **Status-Kacheln der Verbeamtung — erledigt vor dem Deploy** mit `0e1d8de` (Entscheidung vom
   18.10.2026, Abschnitt 0, „Vor dem Termin zu entscheiden“, Punkt 1).
3. **Lauf „Wartung“** (6.2), falls nicht am Tag des Deploys eingeschaltet — Pflicht vor Etappe 2.
4. **Dubletten der Adressen** (6.1): Weg der Bereinigung mit Claude festlegen (keine Oberfläche, der
   n8n-Schlüssel schreibt nicht mehr), nie per `DELETE` (deaktiviert nur, die Dublette bleibt).
   Die Anleitung S0 (Abschnitt 4, Zeile `EMAIL_MEHRDEUTIG`) sagt das seit dem Doku-Commit dieses
   Deploys ebenso (erledigt).
5. **Vom 14.10. weitergetragen** (Stand beim Projektverantwortlichen abfragen; das Repo belegt nur
   das Protokoll auf `main` als erledigt; Einzelheiten in [deploy-main-2026-10.md](deploy-main-2026-10.md), „Offen nach
   dem Deploy“): Mail an das Personalbüro und Infotext für Führungskräfte und Abteilungen; Lauf
   „Aufbewahrung erzeugter Dokumente“ (erst Probelauf); Adressen Verwaltung / Sekretariat in den
   Einrichtungen ohne Eintrag; Checklisten-Vorlage „Standard-Einstellung (TV-L)“; Freigabeliste
   (`allowedRecipientDomains`); Browserprobe vom 14.10.; übrige automatische Läufe; doppelte
   Führungszeugnis-Vorlage; IT über das vergrößerte Docker-Laufwerk informieren.
6. **Vertragsende-Webhook:** sucht über die MANR ohne Abrechnungskreis und vergleicht die Adresse
   ohne Maskierung (Übergabe S0, Abschnitt 6) — eigene Aufgabe.
7. **Regelmäßige Sicherung** von Datenbank und Volume `uploads_data` mit der IT klären (die
   Sicherungen dieses Ablaufs sind einmalig).
8. **Rückweg nach dem ersten Lauf** (Weg C, 7.5) ist nicht geprobt — entscheiden, ob er vor Etappe 2
   einmal gegen eine Kopie geprobt wird.
9. **Zweig `ux-umbau`** (Stand 16.10.2026) enthält S0 nicht: vor seinem Deploy `main` hineinmergen —
   erst nach dem Merge dieses Pull Requests, sonst fehlt `0e1d8de`, und sein Deploy nähme den Fix
   der Status-Kacheln still zurück; sein Ablaufplan prüft `git merge-base --is-ancestor a43aa25 HEAD`
   (S0-Schema), dasselbe mit `0e1d8de8cf0d5b714c059140b9f2f09552eb00d1` (Code-Stand dieses Deploys)
   und eine Vorschau ohne `DROP` (7.1).
10. **Claude:** Protokoll eintragen und die Dateien aus „Nach dem Update (Claude)“ nachführen — in
    der CLAUDE.md den Abschnitt „Laufende Arbeit und Einstieg“ (Einstieg, Hausregeln und die festen
    Anker unter „Docker / Deployment“ stehen dort seit dem 18.10.2026 und bleiben).
11. **Versionierte n8n-Exporte aus Git nehmen, erst nach Etappe 1** (Entscheidung vom 18.10.2026):
    `git ls-files n8n` zeigt drei Dateien (`n8n/CREDO_HR_Portal_Offboarding_Workflow.json`,
    `n8n/CREDO_Offboarding_Reminder_Workflow.json`, `n8n/CREDO_Reminder_Cron_Workflow.json`). Am
    Entwicklerrechner genau diese drei mit `git rm --cached` herausnehmen und über einen Pull Request
    auf `main` bringen. Danach greift der Eintrag `/n8n/` in `.gitignore`; die Dateien bleiben im
    Arbeitsbaum dieses Rechners, in der Historie stehen sie weiter. Zwei Folgen: Jeder andere Klon
    (der zweite Rechner, der Projektordner auf dem Server) löscht die drei Dateien beim nächsten
    `git pull` aus seinem Arbeitsbaum — wer sie dort braucht (`scripts/build-offboarding-flow.js`
    liest `CREDO_HR_Portal_Offboarding_Workflow.json`), sichert sie vorher. Und die Löschung liegt
    außerhalb von `docs/`: Wird auf dem Server vor Etappe 2 gezogen (nicht vorgesehen), meldet 8.1
    keine Zeile `Code-Stand 0e1d8de` mehr — STOPP wie dort beschrieben; Claude prüft dann, ob nur die
    drei Exporte dazukamen, und führt 8.1 nach.
12. **Früheres Standardpasswort aus der `README.md`** (Entscheidung vom 18.10.2026): Die `README.md`
    nannte bis zum 18.10.2026 ein Standardpasswort für das erste Admin-Konto. Der Wert stand
    öffentlich im Repo und bleibt in der Historie. Der Auftraggeber prüft selbst, ob ein Konto in
    Produktion dieses Passwort trägt, und ändert es dann. Den Wert nie in das Protokoll, eine Ausgabe
    an Claude oder eine Datei schreiben. **Erweitert nach der Gegenprüfung vom 18.10.2026:** Ebenso
    öffentlich in der Historie stehen das Passwort des Testzugangs aus der Workspace-Datei (bis zum
    18.10.2026 in zwei Dokumenten unter `docs/`) und ein noch älteres Seed-Standardpasswort (in den
    Skripten aus Punkt 13 und im Kommentar von `prisma/seed.ts`). Dieselbe Prüfung für beide, auf
    jedem Server und jeder Testinstanz; dazu, dass dort keiner der früheren Entwicklungswerte
    (Datenbankpasswort, `JWT_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`) gesetzt ist. Das Ergebnis nur
    als „geprüft, nichts gefunden“ bzw. „geändert“ festhalten, nie mit Werten.
13. **Altlasten außerhalb von `docs/`, erst nach Etappe 1** (gefunden bei der Gegenprüfung vom
    18.10.2026; Entscheidung beim Auftraggeber): `check-server.ps1`, `test-api.ps1`, `test-create.ps1`,
    `test-health.ps1` und `test-runner.mjs` im Projektordner (Stand 24.03.2026, gegen `localhost`)
    melden sich mit der Admin-Adresse und dem älteren Seed-Standardpasswort aus Punkt 12 an;
    `src/__tests__/lib/encryption.test.ts` nimmt als Testschlüssel genau den früheren
    Entwicklungs-`ENCRYPTION_KEY`. Vorschlag: die Skripte bereinigen oder entfernen und im Test einen
    eigenen Schlüssel nehmen, über einen Pull Request auf `main`. Wie Punkt 11 liegt das außerhalb
    von `docs/`, `CLAUDE.md` und `README.md`: vorher hielte 3.2 an, und vor Etappe 2 auf dem Server
    gezogen meldete 8.1 keine Zeile `Code-Stand 0e1d8de` mehr — dann wie dort, Claude führt 8.1 nach.
