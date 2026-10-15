# Server-Update 10/2026 — `main` ab `b6e1c8a` (Ablaufplan)

> **Stand:** Ablaufplan vom 14.10.2026, **am 14.10.2026 ausgeführt** — das Protokoll steht direkt
> unter diesem Kopf. Er ersetzt die Fassung vom 09.10.2026 (nur bis `a2e2e64`) durch **einen**
> gemeinsamen Deploy, wie beim [Deploy vom 24.09.](deploy-onboarding-pakete-2026-09.md).
> **Server:** `fes-vm-ubuntudocker`, `/vol/container/HR_Portal_CREDO`, `https://hr.fes-credo.de`
> **Ausgangsstand:** `b6e1c8a` („fix(checklisten): Reihenfolge wirkt im Vorgang; …“), deployt am
> **02.10.2026**: Container `hr-portal-app` angelegt um 07:47:30 UTC (09:47 Uhr deutscher Zeit),
> Image `sha256:5b1a01dd32ef…`. Dieser Deploy ist im Repo **nirgends protokolliert**. Belegt ist er
> vom Server (14.10.2026, nur gelesen): `sudo git reflog` zeigt die Pulls `f6d3daf` (30.09.,
> 13:38 UTC), `da5c743` (01.10., 06:30 UTC) und `b6e1c8a` (02.10., 07:44 UTC), alle
> `pull: Fast-forward`; `docker inspect` zeigt das Erstelldatum des Containers; die Tabellen
> `individuelle_mails` und `individuelle_mail_anhaenge` existieren, und der Schema-Vergleich des
> laufenden Containers gegen die Datenbank (wie 1.3) ergibt `0`. **Seit dem 02.10. live** sind
> damit Paket 3 (individuelle E-Mail mit Anhang, `da5c743`), die Reihenfolge der Checklisten-Punkte
> (`226338d`, `2fbc4e4`, `b6e1c8a`), der Prüfbefehl `npm run pruefen` samt Sperrklinke (`bfb0665`,
> nur Tests) und das Handbuch-Kapitel `1c0967b` (nur Doku). Nach dem Pull vom 01.10. wurde auch
> gebaut und gestartet (Entrypoint-Sicherung `vor-schema-abgleich-20261001-063314.sql`, 06:33 UTC —
> dabei entstanden die Tabellen der individuellen E-Mail; Vorgeschichte im Protokoll). Davor lief `f6d3daf` (Deploy
> vom 30.09.2026, Paket 4 Stufe 1 und Zeitplaner, ebenfalls nicht protokolliert — der Kopf von
> [deploy-paket4-stufe1.md](deploy-paket4-stufe1.md) sagt noch „noch nicht ausgeführt“).
> **Fund vom 14.10.2026:** Die vorige Fassung dieser Anleitung (Commit `ea2d41d`) nahm `f6d3daf`
> als Ausgangsstand an. Schritt 1.1 hat auf dem Server deshalb zu Recht angehalten (Lehre 1 vom
> 24.09.: den Stand zuerst auf dem Server bestätigen). Diese Fassung rechnet durchgehend ab
> `b6e1c8a`. Steht der Server in 1.1 **nicht** auf `b6e1c8a` (etwa wieder auf `f6d3daf` oder schon
> auf `a2e2e64`, `8c1ef05` oder `0974b7f`), gilt sie nicht: **STOPP**.
> **Etappe A vom 09.10.** (Abschnitte 1 und 2 der Fassung vom 09.10.) wurde im Chat übergeben;
> ob und wie weit sie lief, ist **nicht protokolliert** (Ausgaben kamen nie an). Nach der damaligen
> Fassung (`8c1ef05`) hätten schon 1.1 (erwartet `f6d3daf`) und 1.2 (erwartet ein Erstelldatum
> `2026-09-30T`) angehalten — das Etikettieren stand erst in 2.1. Ein Etikett
> `hr-portal-app:f6d3daf` gibt es dann nicht. Wurde trotzdem etikettiert, zeigt es auf das Image vom
> 02.10. mit `b6e1c8a`; ein Etikett mit einer **anderen** ID (etwa aus dem nicht protokollierten
> Deploy vom 02.10.) ist ebenfalls denkbar. 2.1 prüft das über die Image-ID, setzt das richtige
> Etikett `hr-portal-app:b6e1c8a` auf die in 1.2 bestätigte ID und entfernt ein falsches
> `f6d3daf`-Etikett; der Rückweg (Abschnitt 7) nennt nur noch `b6e1c8a`. Was aus Etappe A schon
> lief, wird einfach wiederholt (alle Schritte bis 2.2 lassen sich wiederholen).
> **Ziel:** `main` mit dem Code bis `0974b7f` („Standardkatalog beim Deploy anlegen“) und
> Doku-Commits darüber, die nur diese Anleitung enthalten. Bis `0974b7f` sind es **31 Commits**
> nach `b6e1c8a` (davon 4 Merges; ab `f6d3daf` wären es 37): die 12 noch nicht ausgerollten der
> Fassung vom 09.10. (bis `a2e2e64`), zwei Doku-Commits zu dieser Anleitung, das Modul „Ausstattung &
> Zugänge“ (A1–A4, 12 Commits samt Plänen und Prüfskript), zwei Fehlerbehebungen im Offboarding (je
> ein Commit und ein Merge) und der Standardkatalog `0974b7f`. DSB und MAV haben am 14.10.2026
> zugestimmt (A0 erledigt) — für Stufe 1 **und** Stufe 2. Stufe 1 geht mit dem Start in Betrieb,
> Stufe 2 schaltet 5.3 als letzten Schritt vor der Freigabe an HR ein. Übersicht in Abschnitt 0,
> Prüfung in 3.2.
> **Geprüft am 14.10.2026** mit **drei Generalproben**, alle gleich aufgebaut: Docker-Image aus
> dem Commit gebaut, echter Entrypoint gegen eine Kopie der Entwicklungsdatenbank (Mailserver aus,
> keine Webhooks, `ZEITPLANER_AKTIV=false`). Die ersten beiden gingen noch vom Schema `f6d3daf`
> aus (die erste auf `80ccfc3`, die zweite auf `0974b7f` mit dem Standardkatalog). Die **dritte**
> ging vom echten Ausgangsstand `b6e1c8a` aus, auf `0974b7f`: Die Kopie stand schon auf diesem
> Schema (leere Migration) und enthielt eine individuelle E-Mail mit einem Anhang. **Die Erwartungen
> dieser Fassung stammen aus der dritten Probe.** Durchlaufen jeweils: Vorschau wie 3.4, erster
> Start (Sicherung, Schema-Push, einmalige Datenmigrationen, drei System-Vorlagen; bis „Ready“ 8, 9
> bzw. 10 s), Prüfungen wie 5.2, zweiter Start, Vorschau des Rückwegs wie 7.3 Schritt 5.
> Schema-Zählung ab `b6e1c8a`: **19/1/7/21/20**, kein `DROP` — gegenüber `f6d3daf` (19/1/9/25/23)
> fehlen genau die zwei Tabellen der individuellen E-Mail mit ihren 4 Indizes und 3
> Fremdschlüsseln. Ohne Datenbank aus den Schemas `b6e1c8a` → `0974b7f` gerechnet, enthält das
> Delta dieselben Zeilen (nur die Reihenfolge der `ALTER TABLE`-Blöcke weicht ab). Rückweg auf das
> Image `b6e1c8a`: 7 × `DROP TABLE`, 20 × `DROP CONSTRAINT`, 19 × `DROP COLUMN`, 7 × `DROP INDEX` und
> ein Neubau des Enums `DocumentType` — die Tabellen der individuellen E-Mail bleiben stehen. Die
> dritte Probe zeigte außerdem: drei Migrationszeilen, darunter
> `… 20 Katalogpositionen angelegt, 13 eingeschaltet.`; `system_migrations` 10 → 13; genau ein neuer
> AuditLog-Eintrag (`AUSSTATTUNG_STANDARDKATALOG_ANGELEGT`, ohne Benutzer); keine Mail; die
> individuelle E-Mail samt Anhang nach beiden Starts unverändert (Prüfsumme über alle Zeilen); beim
> zweiten Start keine Migrationszeile. Betriebsdateien ab `b6e1c8a`: `prisma/seed-check.js`,
> `prisma/seed.ts`, zwei neue Word-Dateien — `package.json` und `package-lock.json` sind seit
> `b6e1c8a` unverändert; keine neue Abhängigkeit, keine neue Umgebungsvariable. Alle SQL-Abfragen
> dieser Anleitung, die nicht schon auf dem Server liefen, liefen lesend gegen die
> Entwicklungsdatenbanken (alter und neuer Stand).
> **Nicht in den Generalproben gemessen:** die Zeile `[Zeitplaner] Uhr gestartet` (dort war die Uhr
> aus), gespeicherte Mailvorlagen und Webhooks (die Kopien hatten keine), echte Rückgaben (die
> Kopien hatten 0), ein Build ganz ohne Zwischenspeicher (die dritte Probe baute ganz aus dem
> Zwischenspeicher der zweiten) und ob auf dem Server der Zwischenspeicher vom 02.10. noch da ist
> (3.3), die Handschritte im Portal ab 5.3 — darunter Stufe 2; ihre Erwartungen (Meldung, 17
> Positionen, Prüfabfrage) sind aus dem Code nachgerechnet — und die Rückfallwege selbst.
> **Muster:** Befehle aus [deploy-paket4-stufe1.md](deploy-paket4-stufe1.md) und
> [deploy-onboarding-pakete-2026-09.md](deploy-onboarding-pakete-2026-09.md) übernommen, nur
> Namen und Erwartungen angepasst.

## Protokoll vom 14.10.2026

**Ergebnis: Deploy erfolgreich.** Der Server läuft seit dem 14.10.2026, 11:16 UTC (13:16 Uhr
deutscher Zeit), auf dem Code `0974b7f` (Repo-Stand `ea2d41d`), Image `hr_portal_credo-app:latest`
= `64e1319792ff`. Das Portal war von etwa 11:13 bis 11:17 UTC nicht erreichbar. Stufe 1 **und**
Stufe 2 von „Ausstattung & Zugänge“ sind eingeschaltet. Ausgeführt hat der Projektverantwortliche
per SSH; die Befehle kamen Schritt für Schritt aus dem Chat mit Claude (auf dem Server lag bis zum
Pull die Fassung vom 09.10., danach `ea2d41d` — die Fassung ab `b6e1c8a` entstand während des
Deploys). Uhrzeiten unten in UTC (Server und Container laufen in UTC; deutsche Zeit = UTC + 2 h).

### Vorgeschichte (am 14.10. auf dem Server festgestellt, vorher nirgends protokolliert)

| Datum (UTC) | Was | Beleg |
|---|---|---|
| 30.09. 13:38 | Pull `f6d3daf` (Paket 4 Stufe 1, Zeitplaner), Start mit Schema-Abgleich | `git reflog`; Entrypoint-Sicherung `vor-schema-abgleich-20260930-134318.sql` (1.690.897 Bytes) |
| 01.10. 06:30 | Pull `da5c743` (Paket 3, individuelle E-Mail), Start mit Schema-Abgleich (die zwei Tabellen der individuellen E-Mail) | `git reflog`; `vor-schema-abgleich-20261001-063314.sql` (1.726.202 Bytes) |
| 02.10. 07:44 / 07:47 | Pull `b6e1c8a` (Reihenfolge der Checklisten-Punkte), Neubau, Container 07:47:30 (Image `sha256:5b1a01dd32ef…`); ohne Schemaänderung, daher keine Sicherung | `git reflog`, `docker inspect` |
| 09.10. | Etappe A der Fassung vom 09.10. im Chat übergeben — **lief nicht**: Es gab am 14.10. kein Etikett `hr-portal-app:f6d3daf` | `docker image ls hr-portal-app` |
| bis 14.10. | HR hat Paket 3 genutzt: 12 individuelle E-Mails mit 7 Anhängen; Vorlage `individuelle-mail` nicht gespeichert (Text aus dem Code) | 1.7 |

### Ablauf

| Schritt | Ergebnis | Abweichung |
|---|---|---|
| 1.1 | `b6e1c8a (HEAD -> main, origin/main, origin/HEAD) fix(checklisten): …` | **STOPP** — die damalige Fassung (`ea2d41d`) erwartete `f6d3daf`. Darauf wurde diese Fassung per Workflow auf den Ausgangsstand `b6e1c8a` umgestellt (dritte Generalprobe ab `b6e1c8a`, gegengeprüft) |
| 1.2 | drei Container `healthy`; `hr-portal-app` erstellt `2026-10-02T07:47:30Z`, Image `5b1a01dd…` | — |
| 1.3 | `0` | — |
| 1.4 | `2`; `775 1001 n8n backups`; App-Schreibtest `uid=1001(nextjs) gid=65533(nogroup)` + `OK`; DB-Schreibtest `OK` | — |
| 1.5 | Projektordner 360 GB frei. **Docker-Laufwerk knapp:** 30 GB, 24 GB belegt, 4,3 GB frei (85 %). `docker system df`: Images 11,55 GB (491 MB frei machbar), Container 791 MB, Volumes 1,645 GB, Build-Cache 1,005 GB. Etiketten: nur `hr-portal-app:6124936` und `:ae490ba` (dasselbe Image `99579d69bec0`, 656 MB, Deploy 08.09.) | **Docker-Laufwerk online vergrößert** (ext4): `sudo lvextend -r -L +30G /dev/data-vg/var-lib-docker-lv` — versehentlich zweimal, jetzt **90 GiB** (`df`: 89 G, 15 G belegt, 71 G frei). Die Volume-Gruppe `data-vg` hatte 170 GB frei, jetzt rund 110 GB. Die Belegung fiel dabei von 24 auf 15 GB; die Ursache ist nicht geklärt (kein Aufräumen protokolliert, die Portal-Container liefen unverändert weiter) |
| 1.6 | `hr_portal_credo_uploads_data`, 167 MB | 29.09.: 94 MB |
| 1.7 | Tabellen: die zwei von Paket 3 da, die sieben neuen nicht; individuelle E-Mails `12 | 7`; Fremdschlüssel `0 | 0`; Merker `10`; Modalitäten `41`; Sperrpunkte `11 | 0` | **System-Vorlagen: zwei Zeilen, beide ausgeschaltet** („Aufforderung erweitertes Führungszeugnis“ und „… - Lehrer“, gleicher Hash `20d18c1463f6`, Pfad `/app/public/…`, 6 Platzhalter). Laut Code (`planeSystemVorlage`: ohne eingeschaltete Zeile zählt die älteste, angelegt wird nur ohne jede Zeile, der Aktiv-Schalter wird nie geschrieben) unkritisch — im Start dann „ist aktuell“, keine dritte Zeile |
| 1.8 | 11 Läufe, alle aus | — |
| 1.9 | Mailvorlagen: `supervisor-link-created` und `supervisor-completed` gespeichert mit altem Text (→ 5.3); `onboarding-task-completed` gespeichert, **eingeschaltet, mit An-Feld**, alter Text (→ **Handgriff 0**); die übrigen fünf nicht gespeichert; kein `ENTSCHEIDUNG`. Webhooks `(0 rows)`. Antwortadresse/SMTP `t | t`. Adressen: `FACILITY` 1 zentral, `IT` 1 zentral, `VERWALTUNG` 6 je Einrichtung, keine Platzhalter. `N8N_API_KEY` `0` | — |
| 2.1 | Etikett `hr-portal-app:b6e1c8a` = `5b1a01dd…` = laufendes Image; `f6d3daf` fehlt | — |
| 2.2 | 535 Dateien, 181.861.888 Bytes, `tar OK` | — |
| 3.1 | `Updating b6e1c8a..ea2d41d`, Fast-forward | — |
| 3.2 | vom Projektverantwortlichen als bestanden gemeldet | Ausgaben nicht übermittelt |
| 3.3 | Build ohne Fehler; `hr_portal_credo-app:latest` = `64e1319792ff` (664 MB) | Build-Log nicht übermittelt |
| 3.4 | `19 / 1 / 7 / 21 / 20` — genau wie in der dritten Generalprobe | DROP- und CREATE-TABLE-Prüfung nicht übermittelt |
| Zwischenfall | Nach 3.4 kam „die App ist healthy, weiter“; die Abfragen aus 5.2 zeigten aber das **alte** Schema (`relation "ausstattungs_positionen" does not exist`). Abschnitt 4 war noch nicht gelaufen — der Container vom 02.10. lief einfach weiter, das neue Image war gebaut, aber nicht gestartet, und es gab keine Sicherung von heute. Folgen: keine. Abschnitt 4 lief danach vollständig | Lehre: nach `up -d` immer das Startprotokoll ansehen, nicht nur `healthy` |
| 4.1 | ~11:13 angehalten; individuelle E-Mails `12 | 7`; `vor-deploy-main-2026-10-manuell.sql` 2.095.344 Bytes, `1`; Uploads-Archiv 169.813.066 Bytes, `tar OK`; Handgriff 0 `UPDATE 1` | — |
| 4.2 | `up -d`: „Container hr-portal-app Started“ | Wortlaut statt „Recreated“; das neue Image läuft (Startprotokoll) |
| 4.3 | Startprotokoll genau wie erwartet (unten) | — |
| 4.5 | `vor-deploy-main-2026-10-entrypoint.sql` kopiert, drei Dateien | — |
| 5.1 | `healthy`; `{"status":"ok", … "uhrAktiv":true,"letzterTakt":"2026-10-14T11:34:57.451Z"}` (von außen) | — |
| 5.2 | `12 | 7 | 13 | 1` (Mails, Anhänge, Merker, Protokoll des Standardkatalogs); Katalog `20 | 13 | 0 | 0`; Schlüssel je Einrichtungsart überall `1` (Gymnasium 1, Gesamtschule 1, Grundschule 3, Berufskolleg 1, Kita 4, GmbH 3, Verein 3 = 16 Einrichtungen; keine mit der Art Verwaltung); System-Vorlagen vier Zeilen (Rückgabeprotokoll an, 2 × Führungszeugnis aus, Übergabeprotokoll aus); Mails seit dem Start `(0 rows)` | Schema-Vergleich, Personengruppen und Indizes nicht einzeln abgefragt |
| 5.3 Schritt 1 | drei Vorlagen zurückgesetzt, `onboarding-task-completed` wieder eingeschaltet → alle `t` und „nichts (Text aktuell)“ (Handgriff 0 abgeschlossen) | — |
| 5.3 Schritt 2 | HR nutzt Transponder → Katalogposition **„Transponder/Chip“ eingeschaltet** (14 aktiv). **Rot:** keine aktive Adresse für Verwaltung / Sekretariat in 10 Einrichtungen (Christliche Familienhilfe Minden e. V., Christlicher Schulförderverein FES Minden e.V., Christlicher Schulförderverein Minden e.V., FES Objektservice GmbH, HELEX.IT GmbH und 5 weitere — die Kitas, GmbHs und Vereine): dort fehlt im Formular das Türschild. **Gelb:** 1 ähnlicher Vorlagenpunkt | Transponder zusätzlich (Entscheidung 14.10.); rote Warnung bleibt offen (unten) |
| 5.3 Schritt 3 | Die Vorlage „Standard-Einstellung (TV-L)“ trägt andere Titel als der Seed: „Bei Bedarf Transponder für die Zeiterfassung bestellen“ (HR), „Schluessel/Ausweis bestellen“, „Schluesseluebergabe dokumentiert“, „Transponder übergeben“ (alle drei Gebäudewirtschaft). **Entfernt:** „Schluesseluebergabe dokumentiert“. Stehen geblieben: die übrigen drei | Empfehlung „Transponder übergeben“ entfernen und „Schluessel/Ausweis bestellen“ umbenennen in „Ausweis bestellen (falls nötig)“ — Entscheidung offen (unten) |
| 5.3 Schritt 4 | keine Webhooks | — |
| 5.3 Schritt 5 | Übergabeprotokoll reaktiviert („Vorlage reaktiviert.“, beide Protokoll-Vorlagen an); „Rückgabe-Vorgaben übernehmen …“: `NICHTS 3/2/0`, `RUECKGABE 11/8/11`, `SPERREN 3/2/0`, `(leer) 3/2/0` | AuditLog-Zählung nach der Übernahme nicht erneut abgefragt (die Verteilung belegt die Übernahme) |
| 5.3 Schritt 6 | Mail an das Personalbüro (Du-Form, kurz; Entwurf im Chat) | Versand durch den Projektverantwortlichen, statt des Kurztexts 8.1 |
| 5.4, 5.5, 6.1, 6.2 | noch nicht | offen (unten) |

**Startprotokoll** (gefiltert, wörtlich):

```
Schema-Unterschied erkannt — Sicherung wird angelegt...
Sicherung abgelegt: /backups/vor-schema-abgleich-20261014-111652.sql (2095372 Bytes)
Datenbank-Schema wird synchronisiert...
⚠️ There might be data loss when applying the changes:
🚀 Your database is now in sync with your Prisma schema. Done in 573ms
Datenbank-Schema synchronisiert.
Pruefe ob Seed notwendig...
System-Vorlage (Aufforderung erweitertes Führungszeugnis) ist aktuell.
System-Vorlage (Übergabeprotokoll Ausstattung) angelegt (ausgeschaltet).
System-Vorlage (Rückgabeprotokoll Ausstattung) angelegt.
Ausstattung & Zugaenge (SUPERVISOR_MIT_AUSSTATTUNG_V1): 41 Modalitaeten-Datensaetze ohne Merker auf false gesetzt.
Offboarding-Sperrpunkte (OFFBOARDING_SPERRPUNKTE_V1): 11 Vorlagenpunkte mit Hinweis versehen, 0 mit eigener Beschreibung unveraendert.
Ausstattung & Zugaenge (AUSSTATTUNG_STANDARDKATALOG_V1): 20 Katalogpositionen angelegt, 13 eingeschaltet.
Datenbank bereits geseeded (7 User vorhanden). Seed uebersprungen.
[Zeitplaner] Uhr gestartet (jede Minute).
✓ Ready in 169ms
```

Unter der Warnung genau die zwei erwarteten Punkte (eindeutige Indizes an
`offboarding_checklist_items` und `return_items` mit der neuen, leeren Spalte `ausgabeId`).

**Sicherungen auf dem Server** (`/vol/container/HR_Portal_CREDO/backups`):

| Datei | Größe | Zweck |
|---|---|---|
| `vor-deploy-main-2026-10-manuell.sql` | 2.095.344 Bytes | maßgeblich für Weg B (`pg_dump` 16 aus dem DB-Container) |
| `vor-deploy-main-2026-10-entrypoint.sql` | 2.095.372 Bytes | Kopie der Entrypoint-Sicherung (`pg_dump` 18), aus der Rotation genommen |
| `uploads-vor-deploy-main-2026-10.tar.gz` | 169.813.066 Bytes | Uploads vor dem Update — Personalunterlagen, bleibt auf dem Server |
| Image `hr-portal-app:b6e1c8a` | 662 MB (`5b1a01dd…`) | Rückweg (Abschnitt 7) |

**Ausgangsstand für das nächste Update:** Repo auf dem Server `ea2d41d` (`main`; danach bis zum
nächsten Code-Commit nur Doku — diese Anleitung, CLAUDE.md, Feinpläne), Code `0974b7f`; laufendes Image `hr_portal_credo-app:latest` = `64e1319792ff`,
Container `hr-portal-app` erstellt am 14.10.2026 gegen 11:16 UTC; Rückfall-Etikett
`hr-portal-app:b6e1c8a` (dazu die alten `6124936`/`ae490ba` vom 08.09., für einen Rückfall zu alt);
`system_migrations` 13; Standardkatalog 20 Positionen, 14 eingeschaltet, 17 mit „Beim Austritt“;
Docker-Laufwerk 90 GiB. Ein künftiger Ablaufplan prüft in 1.1 diesen Stand und in 1.2 das
Erstelldatum `2026-10-14T11:1…`.

### Offen nach dem Deploy

1. **Mail an das Personalbüro** verschicken (Freigabe; Entwurf im Chat). Der Infotext für
   Führungskräfte und Abteilungen (8.2) ist noch nicht verschickt.
2. **6.2 Lauf „Aufbewahrung erzeugter Dokumente“**: erst „Probelauf jetzt“, dann einschalten. Dringlich,
   weil seit dem 01.10. schon 12 individuelle E-Mails mit 7 Anhängen da sind — ohne den Lauf werden
   Text und Anhänge nie gelöscht, obwohl der Dialog 12 Monate zusagt; derselbe Lauf löscht künftig
   Freitexte und Ausgaben der Ausstattung.
3. **Adressen Verwaltung / Sekretariat** für die 10 Einrichtungen ohne Eintrag (Einstellungen →
   Abteilungen, je Einrichtung). Bis dahin fehlt dort das Türschild im Formular (rote Warnung im
   Katalog).
4. **Checklisten-Vorlage „Standard-Einstellung (TV-L)“**: „Transponder übergeben“ (doppelt zu
   „Transponder/Chip bereitstellen“) entfernen? „Schluessel/Ausweis bestellen“ umbenennen in
   „Ausweis bestellen (falls nötig)“ oder stehen lassen, falls Schlüssel vorab bestellt werden?
   Danach prüfen, ob die gelbe Warnung im Katalog verschwindet.
5. **6.1 Freigabeliste** (`allowedRecipientDomains`), sobald HR die dienstlichen Domains genannt hat.
6. **5.4 Probe im Browser** (Onboarding, Offboarding, Katalog ansehen; nichts klicken, was Mails an
   andere schickt).
7. **Übrige automatische Läufe** einschalten (Abschnitt 9, „Danach“), darunter
   „Onboarding-Erinnerungen“ für die Sammelmail vor Dienstbeginn.
8. **Führungszeugnis-System-Vorlage doppelt und beide aus:** mit HR klären, ob eine davon gebraucht
   wird (der Start schaltet sie nicht ein; so bleibt es ohne Folgen).
9. **IT informieren:** Docker-Laufwerk ist jetzt 90 GiB groß (`data-vg`, rund 110 GB frei); die
   Ursache des Rückgangs der Belegung von 24 auf 15 GB ist ungeklärt.
10. **Claude:** diese Fassung samt Protokoll nach `main` bringen (der Projektverantwortliche spult
    `main` vor), danach `main` in `ux-umbau` mergen. Die neue Oberfläche (Branch `ux-umbau`,
    Vertragsende-Pilot) kommt mit einem eigenen Ablaufplan.

---

**Grundregel wie bisher:** Wo „STOPP“ steht, wird angehalten und die Ausgabe an Claude geschickt.
Das Portal läuft bis Schritt 4.1 unverändert weiter — Anhalten kostet bis dahin nichts.

**So wird kopiert:** Jeder Befehl steht in einem eigenen Kasten und ist genau eine Zeile. Einzeln
kopieren, ausführen, die Ausgabe mit „Erwartet“ vergleichen. Alles läuft in **einer** SSH-Sitzung
im Projektordner (1.0). Nach einer neuen Anmeldung zuerst wieder 1.0 und — ab 1.6 — die Zeile mit
`UPLOADS_VOL=` ausführen. Keine Befehlszeile enthält mehr als ein Sternchen (Lehre 5 vom 24.09.),
kein Befehl gibt ein Geheimnis aus. `git` auf dem Server immer mit `sudo` (Projektordner und
`.git` gehören `root`, Lehre 2 vom 24.09.). Einige SQL-Befehle sind sehr lang — trotzdem als
**eine** Zeile kopieren, nicht abschreiben.

---

## 0 · Worum es geht

Der Server läuft seit dem 02.10.2026 auf `b6e1c8a` — die individuelle E-Mail mit Anhang (Paket 3)
und die Reihenfolge der Checklisten-Punkte sind also schon in Betrieb (Kopf). Seitdem sind auf
`main` mehrere Fehlerbehebungen (Vertragsende, Verbeamtung, Elternzeit, Zeitzone, Seed) und eine
Sicherheitskorrektur dazugekommen, dazu das Modul „Ausstattung & Zugänge“ (A1–A4) und zwei
Korrekturen im Offboarding (Reiter „Rückgaben“ ging nicht; Unterrouten ohne Prüfung von Rolle und
Mandant). Dieses Update bringt alles in einem Schritt auf den Server.

An der Datenbank kommen sieben neue Tabellen und 19 neue Spalten an bestehenden Tabellen dazu —
nichts wird umbenannt oder gelöscht; die beiden Tabellen der individuellen E-Mail gibt es schon.
Beim Start laufen drei einmalige Datenmigrationen, und zwei neue Brief-Vorlagen werden angelegt. Die
dritte Migration legt den **Standardkatalog „Ausstattung & Zugänge“** an: 20 Positionen (IT,
Gebäudewirtschaft, Verwaltung / Sekretariat), 13 davon eingeschaltet, ohne „Beim Austritt“. Ab dem
Start sieht deshalb jede Führungskraft, deren Vorgesetzten-Link **nach** dem Update entsteht, im
Formular den neuen Schritt „Ausstattung & Zugänge“ — für jede Position, deren Stelle am Arbeitsort
eine aktive Adresse hat. Schon verschickte Links bleiben ohne den Schritt. Als letzten Schritt vor
der Freigabe an HR schaltet 5.3 auch **Stufe 2** ein (Übergabe und Rückgabe laut Portal, A4):
„Rückgabe-Vorgaben übernehmen …“ gibt 17 der 20 Positionen ein „Beim Austritt“, und die
Brief-Vorlage „Übergabeprotokoll Ausstattung“ wird eingeschaltet — nur, wenn auf die
Offboarding-Ereignisse der Abteilungen kein Webhook aktiv ist. Nach dem Start passiert nichts von
selbst: Eine Mail geht erst hinaus, wenn jemand im Portal etwas versendet. Das Portal ist nur beim
Neustart einige Minuten nicht erreichbar.

### Was ausgerollt wird

**Schon live seit dem 02.10.2026** (`f6d3daf..b6e1c8a`, 6 Commits — kommen mit diesem Update
**nicht** neu, stehen hier nur, weil die Fassung vom 09.10. sie mitzählte):

| Commit | Was | Merkt HR davon? |
|---|---|---|
| `1c0967b` | Handbuch: Kapitel „Automatische Läufe“ und Reiter „E-Mails“ (nur die Datei im Repo, das Portal zeigt das Handbuch nicht) | nein |
| `da5c743` | **Paket 3:** Karte „Individuelle E-Mail“ im Reiter Dokumente von Onboarding, Offboarding, Verbeamtung und Vertragsverlängerung — freie Nachricht mit Betreff und bis zu 10 Anhängen (PDF/JPG/PNG/WebP, zusammen 9 MB). Tabellen `individuelle_mails`, `individuelle_mail_anhaenge`, Mailvorlage `individuelle-mail` | seit 02.10. sichtbar; ob HR damals Bescheid bekam, ist nicht bekannt (8.1) |
| `226338d`, `2fbc4e4` | Checklisten-Vorlagen: Punkte per Ziehen, Pfeilen und „+ Punkt darunter“ ordnen | seit 02.10. (wer Vorlagen bearbeitet) |
| `bfb0665` | Prüfbefehl `npm run pruefen` und Sperrklinke gegen Altmuster (nur Tests; eine Zeile in `package.json`) | nein |
| `b6e1c8a` | Reihenfolge der Vorlage gilt im Vorgang (vorher alphabetisch nach Kategorie); Nachbesserungen am Verschieben | seit 02.10. |

**Neu mit diesem Deploy** — zuerst der Rest der Fassung vom 09.10. (bis `a2e2e64`, unverändert):

| Commit | Was | Merkt HR davon? |
|---|---|---|
| `6982015`, `3f6d3b0` | **Sicherheit:** Der Link-Schlüssel der Führungskraft (Vertragsende) steht nicht mehr in den Antworten der HR-Schnittstellen | nein |
| `232579e`, `099680d`, Merge `aea163a` | Tagesabstände werden schneller berechnet, gleiches Ergebnis | nein |
| `b7c8532` | Vertragsende: Betriebsstätte im Verlängerungsschreiben (vorher „___“) und in der Ansicht (vorher „—“) | ja |
| `6e0e2ce`, Merge `4da68f1` | Vertragsende: Eine nicht zugestellte Anfrage oder Erinnerung wird gemeldet statt als „gesendet“ gezählt; nach der Antwort der Führungskraft keine neue Anfrage mehr | ja |
| `7c09755` | Seed legt nur noch an, was fehlt (läuft ohnehin nur in einer leeren Datenbank) | nein |
| `e25e071` | Datum und Uhrzeit im Server-Code in deutscher Zeit (PDFs, Briefe, Dateinamen, Exporte); Datumsformat überall TT.MM.JJJJ mit führender Null | ja (CSV-Export, Datum in fünf Mails) |
| `75d8277` | Verbeamtung: Reiter Dokumente ordnet Dateien ihrer Dokumentart zu | ja |
| `a2e2e64` | Elternzeit: Der Upload der Person ersetzt nur ihre eigene Geburtsurkunde, nicht die von HR | kaum |

Dann, ebenfalls neu mit diesem Deploy, alles nach `a2e2e64`:

| Commit | Was | Merkt HR davon? |
|---|---|---|
| `9089b69`, `8c1ef05` | Diese Anleitung (Fassung vom 09.10.) | nein |
| `6a1acc5`, `52d0b26`, `71fedf3`, `bc29b1c` | Plan, Feinpläne und Browserprobe „Ausstattung & Zugänge“ (nur Doku) | nein |
| `e5eaac4`, Merge `e81b07c` | **Offboarding, Reiter „Rückgaben“:** „Gegenstand hinzufügen“ und „Rückgabe“ scheiterten bisher mit einem Fehler (der Reiter rief eine Route, die es nie gab). Lesen dürfen alle Portalrollen, Schreiben nur die Bearbeitungsrollen; eine bestätigte Rückgabe wird nicht doppelt überschrieben; neue AuditLog-Einträge `RETURN_ITEM_*` | **ja**, Rückgaben lassen sich wieder erfassen |
| `1b4a9b1`, Merge `345c631` | **Offboarding, acht Unterrouten mit Rolle und Mandant:** Exit-Interview und Zeugnis-Bewertung nur für die Bearbeitungsrollen (Reiter nur für sie sichtbar); Dokumente lesen alle Portalrollen, hochladen nur die Bearbeitungsrollen, Download gehärtet; eine frei eingetippte Adresse der Führungskraft bei der Zeugnis-Bewertung muss auf der Freigabeliste stehen (leere Liste = keine Einschränkung); scheitert die Exit-Interview-Mail, gibt es eine Fehlermeldung und der Status bleibt; der HR-Review der Zeugnis-Bewertung geht erst nach der Einreichung | **kaum:** Alle vergebbaren HR-Rollen gehören zu den Bearbeitungsrollen, kein HR-Konto verliert Zugriff. Der n8n-API-Schlüssel (Rolle `SERVICE`) bekommt dort jetzt 403 (Prüfung in 1.9) |
| `64f7583` A1 | Katalog „Ausstattung & Zugänge“ (Einstellungen, nur Admin-Rollen; „Vorschläge übernehmen“ legt ausgeschaltet an). **Arbeitsort** am Onboarding (Dialog „Neuer Vorgang“ und Karte „Person“): Die Abteilungsaufgaben gehen dann an die Stellen des Arbeitsorts | **ja:** neuer Reiter in Einstellungen, neues Feld „Arbeitsort“ |
| `d2a32c4` A2 | Neuer Schritt „Ausstattung & Zugänge“ im Formular der Führungskraft — erscheint nur mit eingeschalteten Katalogpositionen; Migration `SUPERVISOR_MIT_AUSSTATTUNG_V1` | **ja**, mit dem Standardkatalog ab dem Start — nur bei Vorgesetzten-Links, die nach dem Update entstehen |
| `2f4b1a7` A3 | Jede Wahl wird eine Abteilungsaufgabe; HR-Karte „Ausstattung & Zugänge“ im Onboarding (Reiter Checkliste und Vorgesetzter); Sammelmail vor Dienstbeginn (nur mit eingeschaltetem Lauf „Onboarding-Erinnerungen“); Absage an die Stellen nach „abgelaufen“; Abschluss mit offener Ausstattung nur nach Rückfrage. **Webhooks auf die vier Onboarding-Abteilungsereignisse feuern nicht mehr** (die Mails gehen unverändert) | **ja:** neue Karte (mit Leersatz) und Knopf „Stellen über die Absage informieren…“ |
| `0d81b3b` A4a | Grundlagen Stufe 2: Tabelle `ausgaben`, Rückgabe-Zustand, Zuordnung und Arbeitsort am Offboarding, Dokumenttyp `UEBERGABEPROTOKOLL`; Katalogfeld „Beim Austritt“, Admin-Aktion „Rückgabe-Vorgaben übernehmen …“ (benutzt in 5.3 Schritt 5) | kaum (nur Admins im Katalog) |
| `0f3163d` A4b | „Übergabe vermerken“ im Onboarding (Link-Seite der Stelle und HR-Karte), Tausch und Rücknahme | **ja**, ab Stufe 2 (5.3 Schritt 5) an Positionen mit „Beim Austritt“ |
| `7063d94` A4c | **Offboarding:** Reiter „Rückgaben“ neu gebaut (Zustände: zurückerhalten, beschädigt, fehlt, verbleibt, entfällt); „Einstellung zuordnen …“ mit Rücknahme- und Sperraufgaben der ausgebenden Stellen; Abschluss mit offenen Rückgaben nur nach Rückfrage („Austritt abschließen?“) | **ja:** neuer Reiter und Rückfrage beim Abschluss |
| `fa16bee` A4d | System-Vorlagen „Übergabeprotokoll Ausstattung“ (Onboarding, beim Start **ausgeschaltet**, 5.3 Schritt 5 schaltet sie ein) und „Rückgabeprotokoll Ausstattung“ (Offboarding, **eingeschaltet**); Löschfristen im Lauf „Aufbewahrung erzeugter Dokumente“; Migration `OFFBOARDING_SPERRPUNKTE_V1` | **ja:** zwei neue Brief-Vorlagen und grauer Hinweis an den Sperrpunkten der Offboarding-Checklisten |
| `80ccfc3` | Prüfskript `scripts/ausstattung-probe-a4.js` und Doku (das Skript kommt nicht ins Image) | nein |
| `0974b7f` | **Standardkatalog „Ausstattung & Zugänge“** (Feinplan Abschnitt 8): Migration `AUSSTATTUNG_STANDARDKATALOG_V1` legt im leeren Katalog 20 zentrale Positionen an, 13 eingeschaltet, ohne „Beim Austritt“, dazu einen AuditLog-Eintrag. Rechner und Telefon gelten nur für Angestellte, Beamte und Kita-Personal — Minijob und Ehrenamt sehen sie nicht (Entscheidung 14.10.2026). „Vorschläge übernehmen“ legt fehlende Vorschläge jetzt mit Standardwerten an (weiter ausgeschaltet); „Rückgabe-Vorgaben übernehmen …“ kennt die vier neuen Positionen. Schema unverändert | **ja:** Führungskräfte sehen bei neuen Vorgesetzten-Links den Schritt „Ausstattung & Zugänge“, die Stellen bekommen daraus Aufgaben; Einstellungen → Ausstattung & Zugänge zeigt den Katalog |

### Was sich an Datenbank und Betrieb ändert

- **Schema, rein additiv** (Zählung in 3.4, ab `b6e1c8a` in der dritten Generalprobe gemessen):
  - sieben neue Tabellen — `ausstattungs_positionen`, `ausstattungs_ausblendungen`,
    `onboarding_ausstattung`, `onboarding_ausstattung_aufgaben`, `onboarding_stellen_hinweise`,
    `onboarding_ausstattung_aenderungen`, `ausgaben`. Die beiden Tabellen von Paket 3
    (`individuelle_mails`, `individuelle_mail_anhaenge`) gibt es seit dem 02.10.; sie bleiben, wie
    sie sind, samt ihrem Inhalt;
  - 19 neue Spalten an sieben bestehenden Tabellen (`onboarding_processes`, `supervisor_data`,
    `checklist_items`, `offboarding_processes`, `offboarding_checklist_items`, `return_items`,
    `offboarding_department_links`), alle leer bis auf `checklist_items.eilt` (Standard `false`);
  - ein neuer Wert `UEBERGABEPROTOKOLL` im Enum `DocumentType`;
  - 21 Indizes, davon zwei eindeutige an bestehenden Tabellen (`offboarding_checklist_items`,
    `return_items`). Sie enthalten eine neue, überall leere Spalte und können deshalb nicht an
    Dubletten scheitern — `db push` warnt trotzdem (4.3);
  - 20 Fremdschlüssel, davon **einer an einer schon vorhandenen Spalte**
    (`offboarding_processes."onboardingId"`). Das ist die einzige Stelle, an der der Push
    scheitern könnte; 1.7 prüft sie vorher.
  - Kein `DROP`, kein `RENAME`, kein Typwechsel.
- **Drei einmalige Datenmigrationen** (`prisma/seed-check.js`, Merker in `system_migrations`,
  10 → 13), in dieser Reihenfolge:
  - `SUPERVISOR_MIT_AUSSTATTUNG_V1` setzt bei allen Einstellungsmodalitäten den neuen Merker
    `mitAusstattung` auf `false` — schon verschickte Vorgesetzten-Links bleiben so ohne den neuen
    Schritt;
  - `OFFBOARDING_SPERRPUNKTE_V1` gibt den pauschalen Sperr- und Rückgabepunkten der
    Offboarding-Checklisten-Vorlagen (etwa „Rueckgabe aller Arbeitsmittel“) einen grauen Hinweis
    für die Stelle — nur Punkten mit unverändertem Titel und leerer Beschreibung. Titel bleiben,
    laufende Austritte bleiben unverändert. Die alten Werte stehen im Merker;
  - `AUSSTATTUNG_STANDARDKATALOG_V1` füllt den (beim Start neu angelegten, also leeren) Katalog
    mit dem Standardkatalog: 20 zentrale Positionen, 13 eingeschaltet, ohne „Beim Austritt“, dazu
    **ein** AuditLog-Eintrag `AUSSTATTUNG_STANDARDKATALOG_ANGELEGT`. Ein nicht leerer Katalog
    bliebe unberührt (nur der Merker). Läuft nur einmal: Ist der Merker gesetzt und der Katalog
    leer (etwa nach einem Rückfall), legt sie nichts neu an.
- **Zwei neue System-Vorlagen** (Brief-Vorlagen): „Übergabeprotokoll Ausstattung“
  (beim Start ausgeschaltet, 5.3 Schritt 5 schaltet sie mit Stufe 2 ein) und „Rückgabeprotokoll
  Ausstattung“ (eingeschaltet). Die Vorlage „Aufforderung erweitertes Führungszeugnis“ bleibt, wie
  sie ist; der Seed-Check findet sie jetzt über Modul und Dateiname statt über den Namen, darum
  heißt ihre Logzeile anders (4.3).
- **Stufe 2 (A4), eingeschaltet in 5.3 Schritt 5:** „Rückgabe-Vorgaben übernehmen …“ setzt an 17
  der 20 Positionen „Beim Austritt“ — 11 × Rückgabe (Geräte, Schlüssel, Transponder, Spind,
  Kopierkarte, Dienstausweis, je mit Beschriftung der Nummer), 3 × Sperren (Zugänge, schulische
  Zugänge, BYOD), 3 ×
  nichts (Parkplatz, Fach, Türschild); die drei Angaben bleiben leer —, dazu ein AuditLog-Eintrag
  `AUSSTATTUNG_RUECKGABE_VORGABEN_UEBERNOMMEN`. Ab dann bieten Link-Seite und HR-Karte „Übergabe
  vermerken“ an, und im Offboarding entstehen nach „Einstellung zuordnen …“ Rücknahme- und
  Sperraufgaben für die ausgebenden Stellen. Ein Schema- oder Datenumbau ist das nicht; es ändert
  nur diese drei Katalogfelder.
- **Brief-Vorlagen (Word):** neue Platzhalter `{ausstattung_liste}`,
  `{#ausgaben_je_stelle}…{/ausgaben_je_stelle}`, `{ausgaben_liste}`, `{ausgaben_anzahl}`
  (Onboarding) und `{#rueckgaben_je_stelle}…` (Offboarding) — nichts zu tun. Geänderte Ausgabe:
  `{rueckgaben_liste}` nennt jede Zeile mit Zustand samt Wort, `{rueckgaben_offen_liste}`/
  `{rueckgaben_offen_anzahl}` zählen nur noch Gegenstände ohne Zustand. Betroffene eigene Vorlagen
  zeigt 1.9, HR erfährt es über den Kurztext (8.1, Punkt 12).
- **Betriebsdateien** (ab `b6e1c8a`): `docker-compose.yml`, `Dockerfile`, `entrypoint.sh`,
  `package.json`, `package-lock.json`, `.env.production.example`, `.dockerignore`,
  `next.config.ts`, `src/middleware.ts` unverändert — die eine neue Zeile in `package.json`
  (`bfb0665`) kam schon am 02.10. mit. Deshalb kommt `npm ci` im Build voraussichtlich aus dem
  Zwischenspeicher vom 02.10. (3.3). Geändert: `prisma/seed-check.js` (die Migrationen samt der
  Liste des Standardkatalogs und die Vorlagen oben), `prisma/seed.ts` (läuft nur in einer
  Datenbank ohne Benutzer), dazu zwei neue Dateien unter `public/system-dokumente/`.
- **Keine neue Umgebungsvariable**, die `.env` bleibt, wie sie ist.
- **Volume `uploads_data`:** nichts zu tun. Den Ordner `uploads/individuelle-mails/` gibt es,
  sobald HR seit dem 02.10. eine individuelle E-Mail **mit Anhang** verschickt hat (angelegt erst
  beim Ablegen des ersten Anhangs, das Image legt nur `uploads/` an; 1.7 zählt die Anhänge). Er
  gehört dann `nextjs`, und 4.1 sichert ihn mit.
- **Mailvorlagen** (eine gespeicherte Zeile in der Datenbank überschreibt den Text aus dem Code
  vollständig; 1.9 zeigt je Vorlage, was zu tun ist):
  - neu, ohne gespeicherte Zeile: `onboarding-department-abgesagt`, `onboarding-ausstattung-offen`
    — **nicht vorsorglich speichern** (6.3). `individuelle-mail` ist seit dem 02.10. da und bleibt
    von diesem Update unberührt (Text von `b6e1c8a` bis `0974b7f` gleich); 1.9 fragt sie deshalb
    nicht mehr ab;
  - neuer Standardtext, gespeicherte Zeile seit dem 24.09.: `supervisor-link-created`,
    `supervisor-completed` → **direkt nach dem Start, vor der Freigabe an HR** „Text auf Standard
    zurücksetzen“ (5.3 Schritt 1; der Standardkatalog ist ab dem Start eingeschaltet);
  - neuer Standardtext, gespeicherte Zeile nur, falls HR sie seitdem angelegt hat:
    `onboarding-department-assigned` (dann ebenfalls in 5.3 Schritt 1 zurücksetzen) und
    `onboarding-task-completed`. Diese geht jetzt auch bei einem reinen Kommentar einer Stelle
    hinaus, der Empfänger-Standard ist neu das HR-Postfach. Mit gespeicherter alter Vorlage meldete
    jeder Kommentar „erledigt“ — deshalb **Handgriff 0** (4.1 und 5.3 Schritt 1), falls 1.9 eine
    eingeschaltete Zeile zeigt;
  - Variablen und Betreff-Sperre neu, Text unverändert: `onboarding-department-reminder` — nicht
    zurücksetzen, nur `betreff_gesperrt` aus 1.9 beachten. Unverändert:
    `onboarding-department-completed`.
- **Webhooks:** Die vier Onboarding-Abteilungsereignisse lösen keinen Webhook mehr aus. Eine
  ausgeschaltete Onboarding-Abteilungsvorlage gilt deshalb auch mit aktivem Webhook nicht mehr als
  zugestellt — 1.9 prüft das vorher. Offboarding-Webhooks feuern unverändert; ihre Payloads bleiben
  Byte für Byte gleich, aber `offboarding-department-assigned` und `offboarding-reminder` tragen
  den Link der Stelle, und ab Stufe 2 stehen auf dieser Link-Seite Nummern der Gegenstände, und
  Rückgabezustände lassen sich dort setzen. Deshalb schaltet 5.3 Stufe 2 nur ein, wenn auf die
  vier Offboarding-Abteilungsereignisse (`A4_WEBHOOK_EREIGNISSE`) kein Webhook aktiv ist
  (Schritt 4). `supervisor-link-created` und `supervisor-completed` feuern weiter, mit den neuen
  Feldern `ausstattung_angeboten` bzw. `ausstattung_kurz`.
- **Automatische Läufe:** keine neuen (weiter elf). „Aufbewahrung erzeugter Dokumente“ löscht
  jetzt auch Freitexte und Ausgaben der Ausstattung samt Übergabe- und Rückgabeprotokollen nach
  ihren Fristen (heute leer; eingeschaltet in 6.2), „Onboarding-Erinnerungen“ enthält die
  Sammelmail vor Dienstbeginn und das Nachholen fehlender Ausstattungsaufgaben (bleibt aus,
  Abschnitt 9 „Danach“).
- **Datumsformat in Mails** (`e25e071`) — „09.10.2026“ statt „9.10.2026“, kein Handschritt nötig:
  - drei Mails mit Vorlage: `{{vertragsende}}` in `contract-end-supervisor-reminder` und
    `contract-end-eskalation`, die Liste in `contract-end-unbearbeitet`. Nur der eingesetzte Wert
    ändert sich, die Vorlagentexte nicht;
  - zwei Mails mit festem Text im Code (ohne Vorlage): die BEM-Einladung zur Einwilligung
    (Fußnote „Dieser Link ist bis zum 09.10.2026 gültig“) und die SMTP-Testmail („Gesendet am“
    jetzt in deutscher Zeit mit Sekunden).
- **CSV-Export Onboarding:** Geburtsdatum, Vertragsbeginn, Vertragsende und voraussichtliches
  Vertragsende jetzt mit führender Null. HR prüft den LOGA-Import einmal (8.1, Punkt 4).
- **Seed:** Auf dem Server **nie** `node prisma/seed.js` ausführen (6.3).

<sub>Belege für Claude: Code-Default der Vorlage über `resolveEventTemplate` in
`src/lib/mailer.ts`; Seed nur bei `userCount === 0` (`prisma/seed-check.js`, Ende von `main`);
System-Vorlagen `SYSTEM_VORLAGEN`/`planeSystemVorlage` in `prisma/seed-check.js`; Migrationen
`migriereMitAusstattung`, `migriereOffboardingSperrpunkte` und `migriereAusstattungStandardkatalog`
(Plan `planeStandardkatalog`, Liste `STANDARDKATALOG_JS` als Kopie von `VORSCHLAEGE` in
`src/lib/ausstattung.ts`, gleich gehalten von `ausstattung-standardkatalog.test.ts`; Feinplan
`docs/module/onboarding/ausstattung-feinplan.md`, Abschnitt 8) dort; Stufe 2:
`RUECKGABE_VORGABEN`, `rueckgabeVorgabenPlan`, `A4_WEBHOOK_EREIGNISSE` und
`MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS` in `src/lib/ausgaben.ts`,
`rueckgabeVorgabenUebernehmen` in `src/lib/ausstattung-katalog.ts`, CLAUDE.md Abschnitt
„Ausstattung & Zugänge“, Regeln 20 und 29 und „Vor dem Einschalten“; Webhook-Sperre
`webhooksGesperrt` und `EVENTS_OHNE_WEBHOOK` in `src/lib/ereignis-liste.ts`, angewandt in
`src/lib/webhooks.ts`; Datumsstellen in
`src/lib/contract-end-reminder.ts`, `src/lib/laeufe/vertragsende-erinnerungen.ts`,
`src/lib/bem-einladung.ts`, `src/lib/mailer.ts` (`testSmtpConnection`),
`src/app/api/onboarding/[id]/export/route.ts`. Schema-Delta ab `b6e1c8a` (die Schema-Datei von
`b6e1c8a` ist gleich der von `a2e2e64` und `8c1ef05`, die von `0974b7f` gleich der von `80ccfc3`;
19/1/7/21/20): dieselben Spalten wie in `docs/module/onboarding/ausstattung-schema-delta.sql` (dort
zweigeteilt in A1–A3 und A4, deshalb nicht byte-gleich). Ausgangsstand: Server-Ausgaben vom
14.10.2026 (Kopf); Zählungen `b6e1c8a..0974b7f` und Mailvorlagen-Prüfsummen je Commit aus dem Repo
nachgerechnet.</sub>

### Was NICHT dabei ist

- **Branch `ux-umbau`** (neue Oberfläche, Vertragsende-Pilot mit Ansichtsschalter, Adressen
  `/vorgaenge/…`): bleibt auf seinem Branch, der Prototyp-Tag läuft lokal.
- **Keine automatischen Läufe** außer der Aufbewahrung in 6.2 (Liste „Nicht tun“ in 6.3; der Rest,
  auch „Onboarding-Erinnerungen“ mit der Sammelmail, unter „Danach“ in Abschnitt 9).
- **Keine Pflege des Katalogs am Tag des Updates** außer „Rückgabe-Vorgaben übernehmen …“ in 5.3
  (keine eigenen Positionen, nichts ein- oder ausschalten, keine Personengruppen); das beginnt im
  Betrieb (Abschnitt 9, „Danach“).
- Keine Mailvorlage per SQL ändern (einzige Ausnahme: Handgriff 0 schaltet eine Vorlage aus, falls
  1.9 das verlangt), keine Änderung an `.env`, Caddy oder n8n.

**Dabei ist dagegen Stufe 2 von „Ausstattung & Zugänge“ (A4)** — als letzter Handschritt vor der
Freigabe an HR (5.3 Schritt 5), nach den Mailvorlagen, den Adressen der Abteilungen und dem
Aufräumen der Checklisten-Vorlagen. Bedingung: Auf die vier Offboarding-Abteilungsereignisse ist
kein Webhook aktiv (5.3 Schritt 4). Ist das nicht zu klären, bleibt Stufe 2 aus, der Rest des
Updates läuft weiter, und Stufe 2 kommt unter „Danach“ (Abschnitt 9).

### Dauer (Schätzung, nur der Start gemessen)

| Abschnitt | Dauer | Portal |
|---|---|---|
| 1–2 Vorher prüfen, altes Image sichern | 30–40 min (mehr Prüfungen als am 09.10.) | läuft |
| 3 Holen, bauen, Vorschau | 15–30 min (Generalproben: Build 328 s, 256 s bzw. 19 s, je nach Zwischenspeicher; auf dem Server kommt `npm ci` voraussichtlich aus dem Zwischenspeicher vom 02.10., sonst einige Minuten länger) | läuft |
| 4.1–4.3 Anhalten, Sicherungen, Start | etwa 5 min (24.09.: 2 min; dazu die Uploads-Sicherung, am 29.09. 94 MB; Generalproben: Entrypoint bis „Ready“ 8, 9 bzw. 10 s) | **nicht erreichbar** |
| 5.1–5.3 Nachher prüfen; vor der Freigabe Mailvorlagen, Abteilungen, Vorlagenpunkte, Webhooks, Stufe 2 | 45–75 min | läuft (HR wartet bis zur Freigabe am Ende von 5.3) |
| 5.4–5.5 Probe | 20–30 min | läuft |
| 6 Handschritte | 20–40 min | läuft |

### Zeitfenster

- **An einem Werktag, an dem HR erreichbar ist** (Kurztext und Probe).
- **Nicht zwischen 07:00 und 08:45, nicht nachts.** Die Standardzeiten der Läufe liegen bei
  03:00–03:30 (Löschläufe) und 07:00–08:30 (Erinnerungen und Fristen). Sie sind zwar alle aus
  (1.8), aber ein doch eingeschalteter Lauf soll nicht mitten im Neustart stehen. Ein Update am
  Vormittag nach 08:45 berührt keine dieser Zeiten.
- **Nicht montags gegen 09:00:** Dann liefert der n8n-Flow „Email-Vertragsende-Personal 3.0“ die
  Vertragsenden ins Portal (`docs/module/vertragsende/vertragsende-phase2-plan.md`, Abschnitt 7).
- Gut geeignet: Dienstag bis Freitag zwischen 10 und 12 Uhr.
- **HR am Vortag informieren** und bitten, ab Schritt 4.1 bis zur Freigabe am Ende von 5.3 nichts
  im Portal zu speichern (vor allem keinen Vorgang anlegen und keinen Vorgesetzten-Link erzeugen —
  bis dahin sind die Mailvorlagen noch nicht zurückgesetzt, die Checklisten-Vorlagen nicht
  aufgeräumt und Stufe 2 nicht eingeschaltet). Öffentliche Links (Fragebogen,
  Modalitäten, Upload-Seite, Aufgabenseiten der Abteilungen) lassen sich nicht anhalten — wer sie
  in diesen Minuten öffnet, sieht eine Fehlerseite und versucht es später.

**Textvorschlag für die Ankündigung:** „Am [Tag] zwischen [Uhrzeit] und [Uhrzeit] wird das
HR-Portal aktualisiert. Es ist dabei für einige Minuten nicht erreichbar. Bitte speichern Sie in
dieser Zeit nichts im Portal; wir geben Bescheid, sobald es wieder läuft. Außerdem zwei Bitten bis
[Tag]: Nennen Sie uns alle dienstlichen E-Mail-Endungen (der Teil nach dem @, z. B.
@fes-minden.de), die Führungskräfte und Abteilungen der Einrichtungen benutzen – daraus entsteht
die Liste der Endungen, an die das Portal künftig auch Adressen annimmt, die nicht im Vorgang
hinterlegt sind. Und: Nutzt eine Einrichtung Transponder oder Chips (statt oder neben
Schlüsseln)? Bitte nennen Sie uns diese Einrichtungen.“

Die Endungen braucht Handschritt 6.1. Liegen sie am Tag des Updates nicht vor, bleibt 6.1 liegen,
bis sie da sind (Abschnitt 9, „Danach“) — das Update selbst hängt nicht daran. Die Antwort zu den
Transpondern braucht 5.3 Schritt 3; fehlt sie oder ist sie unklar, gilt dort die vorsichtige
Vorgabe (umbenennen statt entfernen).

### Entscheidungen vom 14.10.2026 (erledigt)

Vor dem Termin ist nichts mehr zu klären. Der Projektverantwortliche hat entschieden:

1. **DSB und MAV haben zugestimmt** (A0 erledigt) — für Stufe 1 und Stufe 2.
2. **Die Gebäudewirtschaft gibt die Schlüssel aus.** Die Schlüssel-Punkte der Verwaltung in den
   Checklisten-Vorlagen werden nach dem Start gestrichen bzw. umformuliert, sofern die Katalogseite
   für die Gebäudewirtschaft keine Adresslücke meldet (5.3 Schritte 2 und 3; Feinplan Abschnitt 8,
   „Aufräumen der Vorlagenpunkte“). Eine noch aktive Platzhalter-Adresse aus dem Erst-Seed (1.9,
   `seed_platzhalter`) zählt dabei wie eine Lücke, bis Claude sie bestätigt hat.
3. **Rechner und Telefon nicht für Minijob und Ehrenamt** — in `0974b7f` umgesetzt (Personengruppen
   der beiden Positionen), kein Handschritt; 5.2 prüft es.
4. **Stufe 2 (A4) am Tag des Updates**, als letzter Schritt vor der Freigabe an HR und nur ohne
   aktive Webhooks auf die Offboarding-Abteilungsereignisse (5.3 Schritte 4 und 5).
5. **Der graue Hinweis an den Offboarding-Sperrpunkten bleibt, wie er ist** (8.1, Punkt 14).

Offen ist nur die Antwort von HR auf die Bitten in der Ankündigung (Endungen für die Freigabeliste,
6.1; Einrichtungen mit Transpondern, 5.3 Schritt 3); das Update hängt nicht daran.

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
mkdir -p ~/deploy-main-2026-10
```

**Erwartet:** keine Ausgabe (auch nicht, wenn der Ordner schon da ist, etwa aus Etappe A). In
`~/deploy-main-2026-10/` landen die Arbeitsdateien.

### 1.1 Stand des Repos (der wichtigste Schritt)

```bash
sudo git log -1 --oneline
```

**Erwartet** (Stand `b6e1c8a` am 14.10.2026 auf dem Server per `sudo git reflog` belegt, siehe
Kopf):

```
b6e1c8a fix(checklisten): Reihenfolge wirkt im Vorgang; Verschieben, Ziehen und Fokus nachgebessert
```

Steht hinter `b6e1c8a` noch `(HEAD -> main, origin/main, origin/HEAD)`, ist das in Ordnung (Git
zeigt die Etiketten im Terminal von selbst an). Weicht sonst etwas ab → **STOPP, Ausgabe an
Claude.** Diese Anleitung gilt nur für diesen Ausgangsstand — auch dann STOPP, wenn dort
`f6d3daf …` (Annahme der vorigen Fassung) oder schon `a2e2e64 …`, `8c1ef05 …` bzw. `0974b7f …`
steht.

```bash
sudo git status --short
```

**Erwartet:** nur Zeilen `?? backups/<datei>` — die Sicherungen früherer Deploys, z. B.
`?? backups/vor-schema-abgleich-20261002-….sql` (der Schema-Abgleich für Paket 3, je nach Build
auch mit `20261001`), `?? backups/vor-schema-abgleich-20260930-….sql` oder
`?? backups/vor-deploy-paket4-manuell.sql`.
Weicht ab (Zeilen mit `M`, oder `??` außerhalb von `backups/`) → **STOPP, Ausgabe an Claude.** Nie
`git add -A`, `git stash -u` oder `git clean` — das sammelt oder löscht die Sicherungen.

```bash
ls docker-compose.override.yml 2>/dev/null || echo "kein Override"
```

**Erwartet:** `kein Override`. Weicht ab → **STOPP, Ausgabe an Claude** (eine Override-Datei
verändert den Start).

### 1.2 Laufende Container

```bash
sudo docker compose ps
```

**Erwartet:** `hr-portal-app`, `hr-portal-db` und `hr-portal-gotenberg` laufen (`Up`),
`hr-portal-app` und `hr-portal-db` mit `(healthy)`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo docker inspect --format '{{.Created}} {{.Image}}' hr-portal-app
```

**Erwartet** (am 14.10.2026 so gesehen):

```
2026-10-02T07:47:30.627061392Z sha256:5b1a01dd32efde8c7de85f0f78204e994614fe4d1c399554c5a1b06002fa9f72
```

Maßgeblich sind der Anfang `2026-10-02T07:47:30` (UTC) und `sha256:5b1a01dd32ef`. Ein anderes Datum
oder ein anderes Image → **STOPP, Ausgabe an Claude** (dann wurde seit dem 02.10. neu gebaut oder
neu angelegt). Ein Etikett (falls je eines gesetzt wurde) ändert weder Datum noch Image.
Die volle ID braucht 2.1 noch einmal; sie steht dort schon im Befehl.

### 1.3 Die Datenbank entspricht dem Schema von `b6e1c8a`

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

**Erwartet:** `0` (am 14.10.2026 auf dem Server so gemessen). Bei `2` wurde die Datenbank außerhalb
eines Deploys verändert, bei `1` gab es einen Fehler → **STOPP, Ausgabe an Claude.** Es ist derselbe
Vergleich, den der Entrypoint bei jedem Start macht; er vergleicht mit der Schema-Datei im
laufenden Image, also mit `b6e1c8a`.

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

**Erwartet:** Eigentümer `1001` mit Schreibrecht, etwa `755 1001 n8n backups` (der Name ist egal,
auf diesem Server heißt er `n8n`).

Die beiden Schreibtests darunter laufen **immer**. Befehl A nur bei Bedarf: Steht oben eine
andere Zahl als `1001`, zuerst Befehl A, dann die Schreibtests. Meldet ein Schreibtest
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

**Erwartet:** `uid=1001(nextjs) gid=65533(nogroup) …` und darunter `OK`. Steht dort
`Permission denied`: Befehl A, dann wiederholen. Bleibt `OK` aus → **STOPP, Ausgabe an Claude.**

Schreibtest der Datenbank (für die eigene Sicherung in 4.1):

```bash
sudo docker exec hr-portal-db sh -c 'touch /backups/.schreibtest-db && rm /backups/.schreibtest-db && echo OK'
```

**Erwartet:** `OK`. Weicht ab → **STOPP, Ausgabe an Claude.**

### 1.5 Freier Platz

```bash
df -h . "$(sudo docker info --format '{{.DockerRootDir}}')"
```

**Erwartet:** unter einer Kopfzeile zwei Zeilen — die **erste** gilt für den Projektordner, die
**zweite** für Docker (die letzte Spalte zeigt nur, wo das Laufwerk eingehängt ist, etwa `/`;
beide Zeilen dürfen gleich aussehen). Maßgeblich ist die Spalte `Avail` (bei deutscher Sprache
`Verf.`): in der zweiten Zeile (Docker) **mindestens 3 GB** (24.09.: 15 GB) — das neue Image wird
gut 900 MB groß (Generalproben: 907 MB), und ist der Zwischenspeicher vom 02.10. weg, entsteht auch
die Schicht mit den Abhängigkeiten neu —, in der ersten mindestens 1 GB (24.09.: 362 GB). Weniger →
**STOPP, Ausgabe an Claude** — nicht selbst mit `docker image prune` oder `docker system prune`
Platz schaffen (mit `-a` löschten beide auch das Image für den Rückweg, 7.1).

```bash
sudo docker image ls
```

**Erwartet:** eine Liste; darin die Zeile `hr_portal_credo-app   latest` (das laufende Image vom
02.10.; Größe notieren, 24.09.: 656 MB) und — falls je eines gesetzt wurde — eine Zeile
`hr-portal-app   f6d3daf` (welche IMAGE ID sie trägt, prüft 2.1; nach den Haltepunkten der
Fassung vom 09.10. fehlt sie eher). Nur notieren. Fehlermeldung statt Liste → **STOPP, Ausgabe an
Claude.**

```bash
sudo du -sh backups
```

**Erwartet:** eine Größe (24.09.: 4,9 MB, seit 30.09. und 02.10. eher mehr). Nur notieren.

### 1.6 Uploads-Volume finden

```bash
UPLOADS_VOL=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' hr-portal-app)
```

**Erwartet:** keine Ausgabe (die Zeile merkt sich nur den Namen für 2.2 und 4.1).

```bash
echo "Volume: $UPLOADS_VOL"
```

**Erwartet:** `Volume: …uploads_data`, voraussichtlich `Volume: hr_portal_credo_uploads_data`.
Steht hinter `Volume:` nichts → **STOPP, Ausgabe an Claude.**

```bash
sudo du -sh "$(sudo docker volume inspect --format '{{.Mountpoint}}' "$UPLOADS_VOL")"
```

**Erwartet:** eine Größe (29.09.: 94 MB). Notieren — die Sicherung in 4.1 wird etwa so groß.

### 1.7 Paket 3 ist da, die Tabellen der Ausstattung noch nicht; Vorab-Prüfungen für den Start

**Tabellen** (die zwei von Paket 3 und die sieben neuen):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT t AS tabelle, to_regclass(t) AS vorhanden FROM unnest(ARRAY['public.individuelle_mails', 'public.individuelle_mail_anhaenge', 'public.ausstattungs_positionen', 'public.ausstattungs_ausblendungen', 'public.onboarding_ausstattung', 'public.onboarding_ausstattung_aufgaben', 'public.onboarding_stellen_hinweise', 'public.onboarding_ausstattung_aenderungen', 'public.ausgaben']) t;"
```

**Erwartet:** `(9 rows)`. In den ersten beiden Zeilen steht in `vorhanden` der Name
(`individuelle_mails` bzw. `individuelle_mail_anhaenge` — seit dem 02.10. da, am 14.10. so
gesehen), in den übrigen **sieben** Zeilen ist `vorhanden` leer. Fehlt einer der beiden Namen oder
steht bei den sieben ein Name → **STOPP, Ausgabe an Claude** (widerspricht 1.3).

**Bestand der individuellen E-Mails** (zählt nur Zeilen, zeigt keinen Inhalt):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM individuelle_mails) AS mails, (SELECT COUNT(1) FROM individuelle_mail_anhaenge) AS anhaenge;'
```

**Erwartet:** zwei Zahlen, `0 | 0` oder mehr (seit dem 02.10. kann HR individuelle E-Mails
versenden). Nur **notieren** — kein STOPP. Der Deploy lässt diese Tabellen unverändert; 4.1 zählt
bei angehaltenem Portal noch einmal, 5.2 vergleicht damit.

**Der neue Fremdschlüssel an der bestehenden Spalte** (CLAUDE.md, „Vorab-Pruefung“). Ein Wert
ohne passendes Onboarding ließe `db push` scheitern — nach der Sicherung, aber der Container
startete nicht:

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM offboarding_processes WHERE "onboardingId" IS NOT NULL) AS mit_wert, (SELECT COUNT(1) FROM offboarding_processes o WHERE o."onboardingId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM onboarding_processes n WHERE n.id = o."onboardingId")) AS verwaist;'
```

**Erwartet:**

```
 mit_wert | verwaist
----------+----------
        0 |        0
(1 row)
```

Vor diesem Update schreibt laut Code niemand diese Spalte. Weicht eine der beiden Zahlen ab →
**STOPP, Ausgabe an Claude** (die Werte werden vor dem Deploy mit dem Projektverantwortlichen
geklärt).

**Ausgangslage der ersten beiden Migrationen** (die Zahlen sagen die Logzeilen in 4.3 voraus; die
dritte, der Standardkatalog, braucht keine Vorhersage — ihre Tabelle entsteht erst beim Start und
ist dann leer, also `20` angelegt, `13` eingeschaltet):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM system_migrations) AS merker, (SELECT COUNT(1) FROM supervisor_data) AS modalitaeten;'
```

**Erwartet:** `merker` = `10` (alle Merker seit dem 24.09.; die Deploys vom 30.09. und 02.10.
brachten keine neue Migration — `prisma/seed-check.js` ist von `f6d3daf` bis `b6e1c8a` gleich, so
auch in der dritten Generalprobe); `modalitaeten` ist eine Zahl —
**notieren**, so viele Datensätze setzt die erste Migration auf `false`. Weicht `merker` ab →
**STOPP, Ausgabe an Claude.**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT COUNT(1) FILTER (WHERE coalesce(i.description, $$$$) !~ $$\S$$) AS bekommen_hinweis, COUNT(1) FILTER (WHERE coalesce(i.description, $$$$) ~ $$\S$$) AS eigene_beschreibung FROM checklist_template_items i JOIN checklist_templates t ON t.id = i."templateId" WHERE btrim(t.name) LIKE $$Offboarding:%$$ AND i.title IN ($$Rueckgabe aller Arbeitsmittel$$, $$IT-Zugaenge zur Sperrung vorbereiten$$, $$IT-Zugaenge und E-Mail-Konto sperren$$, $$Physische Zugaenge entziehen (Schlüssel, Karten)$$, $$Rueckgabe Dienstausweis und Arbeitsmittel$$, $$IT-Zugaenge und Dienstmail sperren$$, $$Physische Zugaenge entziehen$$, $$Arbeitsmittel zurueckgeben$$, $$IT-Zugaenge sperren (falls vorhanden)$$, $$Schlüssel / Zugangskarten einziehen$$);'
```

**Erwartet:** zwei Zahlen, voraussichtlich `14 | 0` (4 Standard + 4 Bildungseinrichtung + 3 Beamte
+ 3 Minijob, so in allen drei Generalproben). **Notieren** — die zweite Migration versieht genau
`bekommen_hinweis` Punkte mit dem Hinweis und lässt `eigene_beschreibung` Punkte unverändert.
Andere Zahlen sind kein Fehler (HR hat Vorlagen geändert), nur notieren.

**System-Vorlagen** (sagt die Zeile zum Führungszeugnis in 4.3 voraus und findet Duplikate):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT name, modul, "originalName", "isActive" AS aktiv, left(hash, 12) AS hash_anfang, dateipfad, jsonb_array_length(platzhalter) AS platzhalter FROM document_templates WHERE "isSystem" ORDER BY modul, "originalName", "createdAt";'
```

**Erwartet:** genau **eine** Zeile (so schreibt sie der alte Seed-Check bei jedem Start; nicht in
den Generalproben gemessen, dort stand ein Windows-Pfad):
`Aufforderung erweitertes Führungszeugnis | ONBOARDING | Fuehrungszeugnis-Antrag.docx | t |
20d18c1463f6 | /app/public/system-dokumente/fuehrungszeugnis-antrag.docx | 6`.

- Zwei oder mehr Zeilen mit `Fuehrungszeugnis-Antrag.docx` und `aktiv` = `t` → **STOPP, Ausgabe an
  Claude.** Das sind Duplikate aus dem alten Seed; vor dem Deploy wird mit HR geklärt, mit
  welcher Zeile gearbeitet wird, die übrigen werden in Brief-Vorlagen deaktiviert (CLAUDE.md,
  „Vorlagen und Betrieb A4“).
- Keine Zeile → **STOPP, Ausgabe an Claude** (der Start legte die Vorlage sonst neu an).
- Eine Zeile mit anderem `hash_anfang`, `dateipfad` oder einer anderen Zahl als `6` → kein STOPP,
  notieren: Dann steht in 4.3 `aktualisiert` statt `ist aktuell` (geschrieben werden nur Pfad,
  Größe, Prüfsumme und Platzhalter, nie Name oder Aktiv-Schalter).

### 1.8 Automatische Läufe sind aus

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT schluessel, aktiv, probelauf, uhrzeit FROM automatische_laeufe ORDER BY uhrzeit, schluessel;"
```

**Erwartet:** `(11 rows)`, in der Spalte `aktiv` überall `f`. Steht irgendwo `t` → **STOPP, Ausgabe
an Claude** (kein Fehler, aber dann gehören Zeitfenster und Abschnitt 6 anders geplant).

### 1.9 Mailvorlagen, Webhooks, Antwortadresse, Adressen der Stellen (nur lesen)

**Mailvorlagen.** Die Abfrage vergleicht je betroffener Vorlage den gespeicherten Text mit dem
alten und dem neuen Standardtext und nennt die Handlung. Sie ist lang — als **eine** Zeile
kopieren. Dieselbe Abfrage läuft in 5.3 Schritt 1 noch einmal.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT b.event, (t.id IS NOT NULL) AS gespeichert, t."isActive" AS aktiv, (coalesce(t."recipientTo", $$$$) <> $$$$) AS an_feld, (t.subject ~ b.sperre) AS betreff_gesperrt, CASE WHEN t.id IS NULL THEN b.ohne WHEN md5(t.subject || t."bodyHtml" || coalesce(t."bodyText", $$$$)) = b.neu THEN $$nichts (Text aktuell)$$ WHEN md5(t.subject || t."bodyHtml" || coalesce(t."bodyText", $$$$)) = b.alt THEN b.bei_alt ELSE $$ENTSCHEIDUNG: eigener Text, an Claude$$ END AS handlung FROM (VALUES ($$supervisor-link-created$$, $$ce419ba932eeaa511236c0e9d204768e$$, $$d8d7073062a58e8d5afa9418379ef314$$, NULL, $$nichts$$, $$nach dem Start zuruecksetzen$$), ($$supervisor-completed$$, $$3a2a7474334636bc5c263b621068abc3$$, $$12a4257cc108b6209ba403a3163dbed7$$, NULL, $$nichts$$, $$nach dem Start zuruecksetzen$$), ($$onboarding-department-assigned$$, $$ca108648d5a35c854f19757349e35e58$$, $$7688e3c3ff89a7574efc144660193827$$, $$\{\{[#/]?(aufgabenliste|angaben|nachtrag_liste|link|magicLink)(_html)?\}\}$$, $$nichts$$, $$nach dem Start zuruecksetzen$$), ($$onboarding-department-reminder$$, $$bae87c284786e4ec9cd145755d9197c5$$, $$bae87c284786e4ec9cd145755d9197c5$$, $$\{\{[#/]?(aufgabenliste|angaben|nachtrag_liste|link|magicLink)(_html)?\}\}$$, $$nichts$$, $$nichts$$), ($$onboarding-task-completed$$, $$f0453fb4bea69031527439158521cff7$$, $$6945e306a76c318688a8d257e75e180a$$, $$\{\{[#/]?(aufgabenliste|angaben|nachtrag_liste|link|magicLink|kommentar|kommentar_text|ausgabe_vermerk)(_html)?\}\}$$, $$nichts$$, $$Handgriff 0: vor dem Start aus, nach dem Start zuruecksetzen, dann ein$$), ($$onboarding-department-completed$$, $$c0860083fa95ce9575a4d24c4078f096$$, $$c0860083fa95ce9575a4d24c4078f096$$, NULL, $$nichts$$, $$nichts$$), ($$onboarding-department-abgesagt$$, NULL, $$6e4cf12165ff37233191c2c37bbc9481$$, $$\{\{[#/]?(aufgabenliste|angaben|nachtrag_liste|link|magicLink|erledigte_liste|ausgaben_liste)(_html)?\}\}$$, $$nichts, nicht speichern$$, NULL), ($$onboarding-ausstattung-offen$$, NULL, $$09e21acf521c633696aec35189984874$$, $$\{\{[#/]?(offene_liste|offene_liste_html|portalLink)\}\}$$, $$nichts, nicht speichern$$, NULL)) b(event, alt, neu, sperre, ohne, bei_alt) LEFT JOIN email_templates t ON t.event = b.event ORDER BY b.event;'
```

**Erwartet:** `(8 rows)`. Die Vorlage `individuelle-mail` fragt die Abfrage nicht mehr ab (in der
vorigen Fassung, Commit `ea2d41d`, waren es 9 Zeilen): Sie ist seit dem 02.10. in Betrieb, ihr
Standardtext ändert sich mit diesem Update nicht, und ein seitdem gespeicherter eigener Text von HR
bleibt gültig. Voraussichtlich (nicht in den Generalproben gemessen — die Kopien hatten keine
gespeicherten Vorlagen):

- `supervisor-link-created` und `supervisor-completed`: `gespeichert` = `t`, `handlung` = `nach
  dem Start zuruecksetzen` (beide wurden am 24.09. per SQL gespeichert);
- alle übrigen: `gespeichert` = `f`, `handlung` = `nichts` bzw. `nichts, nicht speichern`;
- bei `onboarding-task-completed` ist auch `gespeichert` = `t` möglich, falls HR seit dem 24.09.
  das An-Feld eingetragen hat.

So wird gelesen:

| Spalte / Wert | Bedeutung | Was tun |
|---|---|---|
| `handlung` = `nach dem Start zuruecksetzen` | gespeicherter alter Standardtext | in 5.3 Schritt 1 (vor der Freigabe an HR) „Text auf Standard zurücksetzen“ |
| `handlung` beginnt mit `Handgriff 0` und `aktiv` = `t` | nur `onboarding-task-completed` | **Handgriff 0** in 4.1 (ausschalten), in 5.3 Schritt 1 zurücksetzen und wieder einschalten. Im Protokoll „Handgriff 0: ja“ |
| `handlung` beginnt mit `Handgriff 0` und `aktiv` = `f` | die Vorlage ist schon aus | in 5.3 Schritt 1 nur zurücksetzen, ausgeschaltet lassen |
| `handlung` = `ENTSCHEIDUNG: eigener Text, an Claude` | HR hat den Text selbst geändert | **STOPP, Ausgabe an Claude** — nicht blind zurücksetzen (Lehre 6 vom 24.09.) |
| `betreff_gesperrt` = `t` | im gespeicherten Betreff steht eine jetzt gesperrte Variable | notieren, in 5.3 Schritt 1 korrigieren (kein STOPP) |
| `an_feld` = `f` bei `onboarding-task-completed` mit `gespeichert` = `t` | die Mail geht ab dem Start an das HR-Postfach (vorher wurde sie mangels Empfänger übersprungen) | notieren |

**Webhooks** (zeigt nur den Rechnernamen des Ziels samt Port — keinen Pfad, keine Abfrageteile
hinter `?` oder `#` und keine Zugangsdaten):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT w.event, w.name, w."isActive" AS aktiv, split_part(split_part(regexp_replace(split_part(split_part(w.url, $$://$$, 2), $$/$$, 1), $$^[^?#]+@$$, $$$$), $$?$$, 1), $$#$$, 1) AS host, CASE WHEN w.event IN ($$onboarding-department-assigned$$, $$onboarding-department-reminder$$, $$onboarding-task-completed$$, $$onboarding-department-completed$$) THEN $$feuert ab dem Deploy NICHT mehr$$ WHEN w.event IN ($$offboarding-department-assigned$$, $$offboarding-department-completed$$, $$offboarding-reminder$$, $$offboarding-task-completed$$) THEN $$feuert weiter - vor dem Einschalten von A4 klaeren und loeschen$$ ELSE $$unveraendert$$ END AS folge FROM webhook_configs w ORDER BY w."isActive" DESC, w.event;'
```

**Erwartet:** `(0 rows)` (am 24.09. gab es keine Webhooks).

- Eine Zeile mit `aktiv` = `t` und `feuert ab dem Deploy NICHT mehr`, **und** die
  Mailvorlagen-Abfrage oben zeigt für dasselbe Ereignis `gespeichert` = `t` und `aktiv` = `f` →
  **STOPP, Ausgabe an Claude.** Nach dem Deploy käme bei der Stelle gar nichts mehr an, und
  „Abteilungen informieren“ antwortete mit einem Fehler; erst die Vorlage einschalten, dann
  deployen.
- Sonst ist jede Zeile nur zu notieren: `feuert ab dem Deploy NICHT mehr` → in 5.3 Schritt 4
  löschen (ab dem Start wirkungslos).
- Eine Zeile mit `aktiv` = `t` und `feuert weiter - vor dem Einschalten von A4 klaeren und
  loeschen` → kein STOPP, aber **jetzt** an Claude: Solange ein solcher Webhook aktiv ist, bleibt
  Stufe 2 aus (5.3 Schritt 4). Bis dahin klärt der Projektverantwortliche mit Claude, ob der
  Webhook gebraucht wird; nur wenn nicht, wird er in 5.3 Schritt 4 gelöscht. Zeilen mit `aktiv` = `f`
  feuern nicht und stören Stufe 2 nicht.

**Antwortadresse und Mailserver:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT ("replyToEmail" <> $$$$) AS hr_postfach_gesetzt, "isActive" AS smtp_aktiv FROM smtp_config;'
```

**Erwartet:** `t | t`. `smtp_aktiv` = `f` → **STOPP, Ausgabe an Claude** (ohne Mailserver scheitert
die Probe in 5.4). `hr_postfach_gesetzt` = `f` → kein STOPP, notieren: Dann werden die
Rückmeldung `onboarding-task-completed` (außer ihre gespeicherte Vorlage hat ein eigenes An-Feld,
`an_feld` = `t` oben), die Sammelmail und die Berichtsmails der Läufe übersprungen; im Kurztext
(8.1) fällt Punkt 10 weg, außer `onboarding-task-completed` hat ein eigenes An-Feld. Die
Antwortadresse nicht nebenbei setzen — sie gilt als Reply-To für **alle** Mails (Entscheidung mit
Claude, Abschnitt 9).

**Nur zur Information** (kein STOPP, Zahlen notieren):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT status, count(1) AS anzahl FROM email_logs WHERE event = $$onboarding-task-completed$$ GROUP BY status ORDER BY status;'
```

**Erwartet:** eine kurze Liste oder `(0 rows)`. Die Zahl bei `SKIPPED` sagt, wie viele Rückmeldungen
der Stellen bisher ins Leere gingen — künftig landen sie im HR-Postfach.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT name, modul, "isActive" AS aktiv FROM document_templates WHERE NOT "isSystem" AND platzhalter ?| ARRAY[$$rueckgaben_liste$$, $$rueckgaben_offen_liste$$, $$rueckgaben_offen_anzahl$$] ORDER BY modul, name;'
```

**Erwartet:** `(0 rows)` oder einige eigene Brief-Vorlagen. Sie nennen ab dem Deploy bei Rückgaben
mit Zustand das Wort dazu („— fehlt“), und als „offen“ zählen nur noch Gegenstände ohne Zustand;
im Kurztext (8.1) stehen dazu zwei Sätze in Punkt 12.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT count(DISTINCT r."offboardingId") AS austritte, count(1) AS gegenstaende FROM return_items r JOIN offboarding_processes o ON o.id = r."offboardingId" WHERE r."isReturned" = false AND o.status::text NOT IN ($$COMPLETED$$, $$CANCELLED$$);'
```

**Erwartet:** zwei Zahlen. So viele laufende Austritte zeigen beim Abschließen ab dem Deploy die
Rückfrage „Austritt abschließen?“ mit offenen Rückgaben.

**n8n-API-Schlüssel** (zählt nur, ob einer eingetragen ist, ohne ihn zu zeigen):

```bash
sudo grep -c '^N8N_API_KEY=.' .env
```

**Erwartet:** `0` oder `1`. Bei `1` notieren: Der Schlüssel bekommt ab dem Deploy 403 auf Notizen,
Dokumente, Exit-Interview, Zeugnis-Bewertung und Rückgaben im Offboarding. Die n8n-Workflows im
Repo rufen diese Routen nicht auf; ob ein anderer Flow es tut, klärt Claude (kein STOPP).

**Adressen der drei Stellen des Standardkatalogs** (zählt nur Einträge, zeigt keine Adressen):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT k.stelle, COUNT(d.id) FILTER (WHERE d."organizationId" IS NULL) AS zentral, COUNT(d.id) FILTER (WHERE d."organizationId" IS NOT NULL) AS je_einrichtung, COUNT(d.id) FILTER (WHERE d."isActive" AND btrim(coalesce(d.email, $$$$)) <> $$$$) AS aktiv_mit_adresse, COUNT(d.id) FILTER (WHERE d."isActive" AND lower(btrim(d.email)) IN ($$it@credo-gruppe.de$$, $$facility@credo-gruppe.de$$)) AS seed_platzhalter FROM (VALUES ($$FACILITY$$), ($$IT$$), ($$VERWALTUNG$$)) k(stelle) LEFT JOIN department_configs d ON d."departmentKey" = k.stelle GROUP BY k.stelle ORDER BY k.stelle;'
```

**Erwartet:** drei Zeilen (`FACILITY` ist die Gebäudewirtschaft, `VERWALTUNG` Verwaltung /
Sekretariat), in `aktiv_mit_adresse` je mindestens `1`, in `seed_platzhalter` überall `0`. Kein
STOPP, nur notieren:

- Eine `0` bei `aktiv_mit_adresse` heißt, dass die Führungskraft die Positionen dieser Stelle
  nirgends sieht (5.3 Schritt 2 zeigt dann eine rote Warnung), und der Kurztext (8.1, Punkt 9) und
  der Infotext (8.2) müssen angepasst werden.
- Eine `1` bei `seed_platzhalter` heißt: Bei dieser Stelle ist noch die Platzhalter-Adresse aus
  dem Erst-Seed aktiv (`it@credo-gruppe.de` bzw. `facility@credo-gruppe.de`, `prisma/seed.ts`; laut
  [deploy-onboarding-pakete-2026-09.md](deploy-onboarding-pakete-2026-09.md), Abschnitt 5.2
  „Platzhalter ersetzen“, sollte sie ersetzt werden — ob das geschah, ist nicht protokolliert).
  Die Katalogseite zählt sie als gültige Adresse und meldet
  keine Lücke — die Aufgaben gingen aber an den Platzhalter. Solange Claude nicht bestätigt hat,
  dass dort ein echtes Postfach der Stelle ankommt, gilt die Stelle in 5.3 Schritt 3 wie bei einer
  Adresslücke (ihre Punkte bleiben stehen).

Beim Deploy vom 24.09. hatten IT und Verwaltung / Sekretariat noch keine Adresse (dieselbe Datei,
„Offen nach dem Deploy“, Punkt 3); die Entwicklungsdatenbank zeigt am 14.10. lesend
`FACILITY | 1 | 0 | 1 | 1`, `IT | 1 | 0 | 1 | 1`, `VERWALTUNG | 0 | 0 | 0 | 0` — also genau die
beiden Platzhalter. Bei einer `0` in `aktiv_mit_adresse` oder einer `1` in `seed_platzhalter` an
Claude — die Adressen trägt HR ein, nicht dieser Ablauf.

---

## 2 · Sichern, Teil 1 (Portal läuft)

### 2.1 Altes Image etikettieren (für den Rückfall)

Das laufende Image ist das vom 02.10. mit `b6e1c8a`, seine ID hat 1.2 bestätigt. Genau diese ID
bekommt das Etikett `hr-portal-app:b6e1c8a` — fest eingetragen, nicht „das, was gerade läuft“:
So lässt sich die Zeile gefahrlos wiederholen, auch nach dem Start in 4.2 (dann liefe schon das
neue Image, und das Etikett wanderte sonst unbemerkt mit):

```bash
sudo docker tag sha256:5b1a01dd32efde8c7de85f0f78204e994614fe4d1c399554c5a1b06002fa9f72 hr-portal-app:b6e1c8a
```

**Erwartet:** keine Ausgabe. `No such image` → **STOPP, Ausgabe an Claude** (dann stimmt 1.2
nicht mehr).

Worauf die Etiketten zeigen — das neue und, falls es eines gibt, ein altes `f6d3daf` (nur lesend):

```bash
for t in b6e1c8a f6d3daf; do printf '%-9s %s\n' "$t" "$(sudo docker image inspect --format '{{.Id}}' hr-portal-app:$t 2>/dev/null | grep . || echo fehlt)"; done; printf '%-9s %s\n' laufend "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)"
```

**Erwartet** (nicht gemessen; die ID aus 1.2) drei Zeilen. Die erste und die dritte stehen fest,
die mittlere ist **eine** der beiden Varianten — beide gleichwertig, keine ist ein Fehler:

```
b6e1c8a   sha256:5b1a01dd32efde8c7de85f0f78204e994614fe4d1c399554c5a1b06002fa9f72
f6d3daf   fehlt
laufend   sha256:5b1a01dd32efde8c7de85f0f78204e994614fe4d1c399554c5a1b06002fa9f72
```

oder in der Mitte:

```
f6d3daf   sha256:5b1a01dd32efde8c7de85f0f78204e994614fe4d1c399554c5a1b06002fa9f72
```

- Zeile `b6e1c8a` mit genau dieser ID und gleich `laufend` — das ist die Bedingung. Weicht sie ab
  oder steht dort `fehlt` → **STOPP, Ausgabe an Claude.** (Wird die Prüfung nach 4.2 wiederholt,
  zeigt `laufend` das neue Image; dann zählt nur die Zeile `b6e1c8a` mit dieser ID.)
- Zeile `f6d3daf` mit `fehlt`: Es gibt kein solches Etikett (der wahrscheinliche Fall, siehe Kopf).
  Den Befehl darunter **überspringen**.
- Zeile `f6d3daf` mit **derselben** ID: Das Image vom 02.10. wurde schon einmal etikettiert, das
  Etikett heißt also falsch. Es wird mit dem Befehl darunter entfernt (das Image selbst bleibt, es
  trägt ja `b6e1c8a`).
- Zeile `f6d3daf` mit einer **anderen** ID → kein Befehl darunter, **STOPP, Ausgabe an Claude** (dann
  gibt es ein anderes Image unter diesem Namen, etwa aus dem Deploy vom 02.10.; es wird nicht
  angefasst). Das Portal läuft weiter.

Nur bei gleicher ID — das falsche Etikett entfernen:

```bash
sudo docker image rm hr-portal-app:f6d3daf
```

**Erwartet:** genau `Untagged: hr-portal-app:f6d3daf`, **keine** Zeile `Deleted: …`. Steht dort
doch `Deleted:` oder eine Fehlermeldung → **STOPP, Ausgabe an Claude.**

```bash
sudo docker image ls hr-portal-app
```

**Erwartet:** eine Zeile `hr-portal-app   b6e1c8a`, dazu die älteren Etiketten `7bc91ec` und
`ae490ba`, falls noch vorhanden; **keine** Zeile `f6d3daf` (außer im STOPP-Fall oben). Fehlt die
Zeile `b6e1c8a` → **STOPP, Ausgabe an Claude.** Ohne dieses Etikett wäre das alte Image nach dem
Build namenlos und könnte beim Aufräumen (`docker image prune`) verschwinden; vor
`docker image prune -a` und `docker system prune -a` schützt auch das Etikett nicht (7.1). Die
Etiketten `7bc91ec` und `ae490ba` sind **älter** als `b6e1c8a` und taugen nicht für einen
Rückfall (7.1).

### 2.2 Leseprobe der Uploads

Liest das ganze Volume mit derselben Kennung und demselben Image wie die Sicherung in 4.1 — aber
nur lesend und ohne ein Archiv zu schreiben. `UPLOADS_VOL` stammt aus 1.6.

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" hr-portal-app:b6e1c8a -c 'set -o pipefail; find /daten -type f | wc -l; tar cf - -C /daten . | wc -c && echo "tar OK"'
```

**Erwartet:** zwei Zahlen (Anzahl der Dateien, 29.09.: 315; Bytes ungefähr wie in 1.6) und
`tar OK`. Fehlt `tar OK` (etwa `Permission denied`) → **STOPP, Ausgabe an Claude** — die Sicherung
in 4.1 scheiterte genauso. Fehlerzeilen nennen Dateinamen; die Ausgabe trotzdem schicken, sie
bleibt bei Claude.

### 2.3 Wann die übrigen Sicherungen entstehen

Die Sicherung der Datenbank und das Archiv der Uploads entstehen erst in **4.1**, bei angehaltenem
Portal, direkt vor dem Start. Nur so enthalten sie den letzten Stand; was zwischen einer früheren
Sicherung und dem Neustart gespeichert würde (etwa ein Fragebogen über einen öffentlichen Link),
fehlte sonst darin. So lief es auch am 24.09. und am 30.09.

---

## 3 · Holen, bauen und prüfen (Portal läuft)

### 3.1 Code holen

```bash
sudo git fetch origin && sudo git checkout main && sudo git pull
```

**Erwartet:** `Already on 'main'`, dann `Updating b6e1c8a..…` und `Fast-forward` mit einer
Dateiliste. Hinter den zwei Punkten steht der neueste Doku-Commit auf `main` (beim Schreiben dieser
Fassung der Commit, der sie enthält; `ea2d41d` war die Fassung davor) — nur notieren, geprüft wird
in 3.2. Normal und kein Grund zum Anhalten sind davor Zeilen vom Holen (`From …`, dazu Zeilen
mit `[new branch]` oder `-> origin/…` für andere Branches) und
`Your branch is behind 'origin/main' by … commits … (use "git pull" to update your local branch)`
— das `git pull` steckt schon im selben Befehl. Weicht ab (Konflikt, `error`, `fatal`, eine Frage
nach Zugangsdaten) → **STOPP, Ausgabe an Claude.** Das Portal läuft unverändert weiter.

### 3.2 Was angekommen ist

```bash
sudo git log --oneline -4
```

**Erwartet:** vier Zeilen, oben der Commit, der diese Fassung enthält (ein `docs(deploy)`-Commit
mit den Etiketten `(HEAD -> main, origin/main, origin/HEAD)`; ebenso in Ordnung: ein späterer
Doku-Commit darüber), darunter die vorige Fassung und der Code-Stand:

```
<neuer Commit> (HEAD -> main, origin/main, origin/HEAD) docs(deploy): …
ea2d41d docs(deploy): gemeinsamer Deploy f6d3daf -> main mit Ausstattung & Zugaenge
0974b7f feat(ausstattung): Standardkatalog beim Deploy anlegen (A0 erledigt)
80ccfc3 test(ausstattung): Ablaufprobe A4 gegen die Testdatenbank
```

(Mit einem weiteren Doku-Commit rutschen die Zeilen ab `ea2d41d` um eine nach unten, `80ccfc3`
fällt dann heraus, und die Etiketten stehen am obersten; die Betreffzeile von `ea2d41d` nennt noch
den alten Ausgangsstand `f6d3daf`, der Inhalt ist überholt.) Nur zum Ansehen —
geprüft wird mit den nächsten Befehlen. Zählungen und Dateilisten zielen auf
den festen Code-Stand `0974b7f`; die Prüfung „nur Doku“ stellt sicher, dass der ausgecheckte Stand
außerhalb von `docs/` genau `0974b7f` ist.

```bash
sudo git merge-base --is-ancestor a2e2e64 HEAD && echo "a2e2e64 enthalten"
```

**Erwartet:** `a2e2e64 enthalten`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git merge-base --is-ancestor 0974b7f HEAD && echo "0974b7f enthalten"
```

**Erwartet:** `0974b7f enthalten`. Weicht ab (dann fehlt der Standardkatalog) → **STOPP, Ausgabe an
Claude**; diese Anleitung passt dann nicht.

```bash
sudo git rev-parse --verify 0974b7f
```

**Erwartet:** genau `0974b7f80267bceaa6388b714ceaf4188f0b5955`. Weicht ab → **STOPP, Ausgabe an
Claude.**

```bash
sudo git rev-list --count b6e1c8a..0974b7f
```

**Erwartet:** `31` (ab `f6d3daf` wären es 37 — die sechs bis `b6e1c8a` sind seit dem 02.10. live).
Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git rev-list --count --merges b6e1c8a..0974b7f
```

**Erwartet:** `4` (`aea163a`, `4da68f1`, `e81b07c`, `345c631`). Weicht ab → **STOPP, Ausgabe an
Claude.** Eine Liste aller 31 Commits ist nicht nötig; wer sie sehen will:
`sudo git --no-pager log --oneline --no-decorate b6e1c8a..0974b7f` (die Commits stehen in
Abschnitt 0, Tabellen „Neu mit diesem Deploy“).

Was der Standardkatalog-Commit enthält (nur zum Abgleich mit Abschnitt 0):

```bash
sudo git diff --name-only 80ccfc3 0974b7f
```

**Erwartet:** genau diese 16 Zeilen (Code, Tests, Prüfskript, `CLAUDE.md` und zwei Doku-Dateien):

```
CLAUDE.md
docs/module/onboarding/ausstattung-feinplan.md
docs/module/onboarding/ausstattung-schema-delta.sql
prisma/seed-check.js
scripts/ausstattung-probe-a4.js
src/__tests__/api/settings-ausstattung.test.ts
src/__tests__/components/ausstattung-katalog-tab.test.tsx
src/__tests__/lib/ausgaben.test.ts
src/__tests__/lib/ausstattung-standardkatalog.test.ts
src/__tests__/lib/ausstattung-validierung.test.ts
src/__tests__/lib/ausstattung.test.ts
src/app/api/settings/ausstattung/vorschlaege/route.ts
src/components/ausstattung/katalog-tab.tsx
src/lib/ausgaben.ts
src/lib/ausstattung-katalog.ts
src/lib/ausstattung.ts
```

Weicht ab → **STOPP, Ausgabe an Claude.**

Nach `0974b7f` darf nur noch Doku kommen:

```bash
sudo git diff --quiet 0974b7f HEAD -- . ':!docs' && echo "nach 0974b7f nur Doku"
```

**Erwartet:** `nach 0974b7f nur Doku`. Fehlt die Zeile (dann hat sich nach `0974b7f` außerhalb von
`docs/` etwas geändert, auch `CLAUDE.md` zählt) → **STOPP, Ausgabe an Claude.**

```bash
sudo git diff --name-only 0974b7f HEAD
```

**Erwartet:** `docs/historie/deploy-main-2026-10.md` (der Doku-Commit enthält nur diese Anleitung;
nach einem späteren Doku-Commit dürfen weitere Zeilen unter `docs/` stehen). Nur notieren.

```bash
sudo grep -c 'await migriereAusstattungStandardkatalog' prisma/seed-check.js
```

**Erwartet:** `1` (der Start ruft die Migration des Standardkatalogs auf). `0` → **STOPP, Ausgabe an
Claude.**

```bash
sudo git diff --numstat b6e1c8a 0974b7f -- docker-compose.yml Dockerfile entrypoint.sh package.json package-lock.json .env.production.example .dockerignore next.config.ts prisma/seed-check.js prisma/seed.ts public/system-dokumente src/middleware.ts src/instrumentation.ts
```

**Erwartet:** genau diese vier Zeilen (Zahlen und Namen durch Tabulatoren getrennt; bei den beiden
Word-Dateien stehen statt Zahlen zwei Striche; am 14.10. so gemessen):

```
884	48	prisma/seed-check.js
271	250	prisma/seed.ts
-	-	public/system-dokumente/rueckgabeprotokoll-ausstattung.docx
-	-	public/system-dokumente/uebergabeprotokoll-ausstattung.docx
```

Weicht ab → **STOPP, Ausgabe an Claude.** (`--numstat` statt `--stat`, weil `--stat` je nach
Fensterbreite anders aussieht. Bis `80ccfc3` waren es `461 48`; `0974b7f` fügt 423 Zeilen hinzu
und entfernt keine. Ab `f6d3daf` käme die Zeile `1 0 package.json` dazu — sie ist seit dem 02.10.
auf dem Server.)

```bash
sudo git diff --quiet b6e1c8a 0974b7f -- package.json package-lock.json && echo "package.json und package-lock unveraendert"
```

**Erwartet:** `package.json und package-lock unveraendert` (darauf beruht die Erwartung in 3.3).
Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git status --short
```

**Erwartet:** wie in 1.1, nur Zeilen `?? backups/…`. Weicht ab → **STOPP, Ausgabe an Claude.**

### 3.3 Image bauen (das Portal läuft weiter)

```bash
sudo docker compose build app
```

**Erwartet:** Der Build endet ohne `ERROR`. `package.json` und `package-lock.json` sind seit dem
letzten Server-Build (`b6e1c8a`, 02.10.) unverändert (3.2). Ist dessen Zwischenspeicher noch da,
steht beim Schritt `RUN npm ci --ignore-scripts` voraussichtlich `CACHED` (nicht gemessen); ist er
weg (etwa nach `docker builder prune`), läuft `npm ci` neu — mit demselben Ergebnis, nur einige
Minuten länger. Beides ist in Ordnung. `npx prisma generate` und `npm run build` laufen in jedem Fall
neu (Schema, `prisma/seed-check.js` und Code haben sich geändert). Der alte Container läuft dabei
unverändert weiter. In den ersten beiden Generalproben stand im Build-Log u. a.
`Prisma CLI: 6.9.0 (muss zum generierten Client passen)` und `✓ Compiled successfully …`; dazu
nur ESLint-Warnungen (`react-hooks/exhaustive-deps`), keine Fehler (die dritte kam ganz aus dem
Zwischenspeicher der zweiten, 19 s).

**Bekannt, kein Grund zum Abbruch:** nur wenn `npm ci` neu läuft, Zeilen `npm warn deprecated …`
(etwa zu `glob` mit dem Satz „… widely publicized security vulnerabilities …“, zu `inflight`,
`@types/bcryptjs`, `whatwg-encoding`), eine Zusammenfassung wie `… vulnerabilities (…)` mit dem
Rat `npm audit fix` (nicht ausführen) und `npm notice …` zu einer neuen npm-Version. In jedem Fall
(in den ersten beiden Generalproben so): `⚠ Compiled with warnings` mit dem Hinweis, `jose` nutze
eine Node.js-API, die die Edge Runtime nicht kennt (`CompressionStream`) — danach folgt trotzdem
`✓ Compiled successfully …`.

**STOPP, Ausgabe an Claude** nur bei `ERROR` (`npm error`, `ERROR: failed to solve …`) oder einer
Netzwerk-Meldung wie `ETIMEDOUT`, `ENOTFOUND`, `ECONNRESET` oder `registry.npmjs.org`. Das Portal
läuft weiter; ein zweiter Versuch später schadet nicht.

**Eine Ausnahme ohne STOPP:** Steht im Fehler „An error occurred in `next/font`“ (dazu „Failed to
fetch `Montserrat` from Google Fonts“ oder „Cannot read properties of null“), war Google Fonts
beim Bauen kurz nicht richtig erreichbar – der Build lädt die Schrift jedes Mal neu. Am 09.10.2026
lokal genau so passiert; der zweite Versuch kurz danach lief durch (in den drei Generalproben am
14.10. trat der Fehler nicht auf). Den Befehl oben also einfach noch einmal ausführen. Erst wenn
er ein zweites Mal so endet: STOPP, Ausgabe an Claude.

### 3.4 Vorschau: Was `db push` gleich tun wird (nur lesend)

Der Befehl startet das **neue** Image einmal kurz ohne Entrypoint und vergleicht seine
Schema-Datei mit der laufenden Datenbank. Er schreibt nichts in die Datenbank.

```bash
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > ~/deploy-main-2026-10/vorschau-delta.sql
```

**Erwartet:** keine Ausgabe, oder nur harmlose Hinweise: ein Kasten „Update available 6.9.0 ->
8.0.0-rc.22 … major update …“ von Prisma und fünf Zeilen `npm notice` („New major version of npm
available! 10.9.9 -> 12.2.0“ — so in allen drei Generalproben). Eine Fehlermeldung → **STOPP,
Ausgabe an Claude.**

Die folgenden Befehle lesen diese Datei über ihren vollen Pfad — sie gehen also auch nach einer
neuen Anmeldung (dann vorher nur 1.0).

```bash
for m in 'ADD COLUMN' 'ADD VALUE' 'CREATE TABLE' 'INDEX' 'ADD CONSTRAINT'; do printf '%-15s %s\n' "$m" "$(grep -c "$m" ~/deploy-main-2026-10/vorschau-delta.sql)"; done
```

**Erwartet** (in der dritten Generalprobe ab `b6e1c8a` genau so gemessen; dieselben Zahlen ergibt
die Rechnung Schema gegen Schema):

```
ADD COLUMN      19
ADD VALUE       1
CREATE TABLE    7
INDEX           21
ADD CONSTRAINT  20
```

- `ADD COLUMN`: 19 neue Spalten an sieben bestehenden Tabellen (Liste unten).
- `ADD VALUE`: der neue Enum-Wert `UEBERGABEPROTOKOLL`.
- `CREATE TABLE`: die sieben neuen Tabellen der Ausstattung.
- `INDEX`: 21 Zeilen `CREATE INDEX` und `CREATE UNIQUE INDEX` zusammen — 14 an den sieben Tabellen
  der Ausstattung, 7 an bestehenden Tabellen (davon zwei eindeutig:
  `offboarding_checklist_items_offboardingId_ausgabeId_herkunf_key` und
  `return_items_offboardingId_ausgabeId_key`).
- `ADD CONSTRAINT`: die 20 Fremdschlüssel; die Primärschlüssel stehen in den
  `CREATE TABLE`-Blöcken und zählen hier nicht mit.
- **Die vorige Fassung (`ea2d41d`) erwartete hier 9/25/23** — das war die Zählung ab `f6d3daf`,
  mit den zwei Tabellen der individuellen E-Mail (4 Indizes, 3 Fremdschlüssel). Steht auf dem
  Server 9/25/23, fehlen die Tabellen von Paket 3 in der Datenbank — dann widerspräche das 1.7:
  **STOPP**.

```bash
grep -nE 'DROP|RENAME|ALTER COLUMN .* TYPE|SET NOT NULL' ~/deploy-main-2026-10/vorschau-delta.sql || echo "keine DROP/RENAME/TYPE-Zeile"
```

**Erwartet:** `keine DROP/RENAME/TYPE-Zeile`.

```bash
grep 'CREATE TABLE' ~/deploy-main-2026-10/vorschau-delta.sql
```

**Erwartet:** genau diese sieben Zeilen (in der dritten Generalprobe in dieser Reihenfolge; eine
andere ist auch in Ordnung). `individuelle_mails` und `individuelle_mail_anhaenge` stehen **nicht**
darin — es gibt sie seit dem 02.10.:

```
CREATE TABLE "ausstattungs_positionen" (
CREATE TABLE "ausstattungs_ausblendungen" (
CREATE TABLE "onboarding_ausstattung" (
CREATE TABLE "onboarding_ausstattung_aufgaben" (
CREATE TABLE "onboarding_stellen_hinweise" (
CREATE TABLE "onboarding_ausstattung_aenderungen" (
CREATE TABLE "ausgaben" (
```

```bash
grep 'ADD COLUMN' ~/deploy-main-2026-10/vorschau-delta.sql
```

**Erwartet:** genau diese 19 Zeilen (so in der dritten Generalprobe; die Leerzeichen hinter
`ADD COLUMN` dürfen anders aussehen, und die Reihenfolge der sieben `ALTER TABLE`-Blöcke darf
abweichen — sie hängt davon ab, ob gegen die Datenbank oder Schema gegen Schema gerechnet wird). Die
einzige Spalte mit `NOT NULL` ist
`eilt`, und sie hat einen Standardwert — alle anderen sind leer erlaubt:

```
ALTER TABLE "checklist_items" ADD COLUMN     "ausgabenGeloeschtAm" TIMESTAMP(3),
ADD COLUMN     "eilt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "entfaelltAm" TIMESTAMP(3),
ADD COLUMN     "herkunft" TEXT;
ALTER TABLE "offboarding_checklist_items" ADD COLUMN     "ausgabeId" TEXT,
ADD COLUMN     "herkunft" TEXT;
ALTER TABLE "offboarding_department_links" ADD COLUMN     "abgesagtAm" TIMESTAMP(3);
ALTER TABLE "offboarding_processes" ADD COLUMN     "arbeitsortId" TEXT,
ADD COLUMN     "ausgabenGeloeschtAm" TIMESTAMP(3),
ADD COLUMN     "weitereBeschaeftigung" BOOLEAN;
ALTER TABLE "onboarding_processes" ADD COLUMN     "arbeitsortId" TEXT,
ADD COLUMN     "ausgabenGeloeschtAm" TIMESTAMP(3),
ADD COLUMN     "ausstattungSammelmailAm" TIMESTAMP(3),
ADD COLUMN     "expiredAt" TIMESTAMP(3);
ALTER TABLE "return_items" ADD COLUMN     "ausgabeId" TEXT,
ADD COLUMN     "zustand" TEXT;
ALTER TABLE "supervisor_data" ADD COLUMN     "ausgabenAngeboten" BOOLEAN,
ADD COLUMN     "ausstattungGespeichertAm" TIMESTAMP(3),
ADD COLUMN     "mitAusstattung" BOOLEAN;
```

```bash
grep -E 'ADD VALUE|offboarding_processes_onboardingId_fkey' ~/deploy-main-2026-10/vorschau-delta.sql
```

**Erwartet:** genau diese zwei Zeilen (so in der dritten Generalprobe) — der neue Enum-Wert und der
eine Fremdschlüssel an der schon vorhandenen Spalte (geprüft in 1.7):

```
ALTER TYPE "DocumentType" ADD VALUE 'UEBERGABEPROTOKOLL';
ALTER TABLE "offboarding_processes" ADD CONSTRAINT "offboarding_processes_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Weicht eine Zahl oder Zeile in 3.4 ab → **STOPP, nicht starten, Ausgabe an Claude** (dazu die Datei
`~/deploy-main-2026-10/vorschau-delta.sql`). Das Portal läuft ja noch mit dem alten Container.

---

## 4 · Anhalten, sichern, starten

Ablauf wie am 24.09. und 30.09. in Einzelschritten. `sudo docker compose up -d --build` würde 3.3
bis 4.2 ersetzen, ist aber **nicht zu empfehlen**: Ohne 4.1 fehlen die eigene Sicherung der
Datenbank und die der Uploads. Die Sicherung des Entrypoints schreibt `pg_dump` 18 und lässt sich
nicht unverändert in die PostgreSQL-16-Datenbank einspielen (Lehre 3 vom 24.09.).

### 4.1 Portal anhalten und sichern (Sichern, Teil 2)

```bash
sudo docker compose stop app
```

**Erwartet:** `Container hr-portal-app  Stopped`. **Ab hier ist das Portal nicht erreichbar.**

Stand der individuellen E-Mails bei angehaltenem Portal (derselbe Zählbefehl wie in 1.7; bis eben
konnte HR noch versenden):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM individuelle_mails) AS mails, (SELECT COUNT(1) FROM individuelle_mail_anhaenge) AS anhaenge;'
```

**Erwartet:** zwei Zahlen, gleich wie in 1.7 oder höher. **Notieren** — 5.2 muss genau diese
beiden Zahlen zeigen. Eine Fehlermeldung → **STOPP:** mit Befehl B (unten) das alte Portal wieder
starten, dann Ausgabe an Claude.

Datenbank (aus dem DB-Container, `pg_dump` 16, passend zum Einspielen bei einem Rückfall):

```bash
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-deploy-main-2026-10-manuell.sql'
```

**Erwartet:** keine Ausgabe.

```bash
sudo ls -l backups/vor-deploy-main-2026-10-manuell.sql
```

**Erwartet:** um 1,5 MB oder größer (24.09.: 1 561 038 Bytes; seitdem kamen u. a. die Tabellen von
Paket 3 dazu).

```bash
sudo grep -c 'PostgreSQL database dump complete' backups/vor-deploy-main-2026-10-manuell.sql
```

**Erwartet:** `1`.

Uploads (mit dem alten Image als `nextjs`, das Volume nur lesend eingehängt). Die erste Zeile
setzt den Volume-Namen noch einmal — schadet nicht, falls er aus 1.6 noch da ist:

```bash
UPLOADS_VOL=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' hr-portal-app)
```

**Erwartet:** keine Ausgabe.

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" -v "$PWD/backups:/sicherung" hr-portal-app:b6e1c8a -c 'tar czf /sicherung/uploads-vor-deploy-main-2026-10.tar.gz -C /daten . && echo "tar OK"'
```

**Erwartet:** `tar OK`.

```bash
sudo ls -l backups/uploads-vor-deploy-main-2026-10.tar.gz
```

**Erwartet:** etwa so groß wie in 1.6 (komprimiert eher etwas kleiner).

```bash
sudo tar tzf backups/uploads-vor-deploy-main-2026-10.tar.gz | wc -l
```

**Erwartet:** eine Zahl größer als 1 (etwa Dateien plus Ordner aus 2.2).

Das Archiv enthält Personalunterlagen aller Vorgänge — **auf dem Server lassen**, nicht
herunterladen.

**Weicht etwas ab** (Datenbank-Sicherung deutlich unter 1 MB, `grep` zeigt `0`, kein `tar OK`) →
**STOPP:** mit Befehl B das alte Portal wieder starten, dann Ausgabe an Claude.

Befehl B (startet den angehaltenen alten Container, nur bei STOPP):

```bash
sudo docker compose start app
```

**Erwartet:** `Container hr-portal-app  Started` (das Portal läuft wieder mit dem alten Stand).

**Handgriff 0 — nur wenn 1.9 für `onboarding-task-completed` `gespeichert` = `t`, `aktiv` = `t`
und eine `handlung` mit `Handgriff 0` gezeigt hat** (sonst überspringen). Der Befehl **schreibt**:
Er schaltet die gespeicherte Vorlage aus, damit sie zu keinem Zeitpunkt mit altem Text und neuem
Code läuft (sonst käme jeder Kommentar einer Stelle bei HR als „Onboarding-Aufgabe erledigt“ an).
Zurückgesetzt und wieder eingeschaltet wird sie in 5.3 Schritt 1, vor der Freigabe an HR.

```bash
sudo docker exec hr-portal-db psql -U hrportal -d hr_portal -c 'UPDATE email_templates SET "isActive" = false WHERE event = $$onboarding-task-completed$$ AND "isActive";'
```

**Erwartet:** `UPDATE 1`. `UPDATE 0` → die Vorlage war schon aus; weiter mit 4.2, im Protokoll
notieren. Eine Fehlermeldung → **STOPP:** Befehl B, Ausgabe an Claude.

### 4.2 Starten

```bash
sudo docker compose up -d
```

**Erwartet:** `hr-portal-app` wird neu angelegt (`Recreate`/`Recreated`, `Started`), `hr-portal-db`
und `hr-portal-gotenberg` laufen weiter. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo docker compose logs -f app
```

Zeigt das Startlog laufend an. Warten, bis `✓ Ready in …` **und** eine Zeile `[Zeitplaner] …`
(normal: `Uhr gestartet (jede Minute).`) erschienen sind — die zweite kann auch nach der ersten
kommen —, dann `Strg+C` drücken — das beendet nur die Anzeige, nicht den Container — und mit „Log
sichern“ in 4.3 weitermachen. Erscheint nach 3 Minuten kein `✓ Ready`: `Strg+C`, weiter mit 4.4.

### 4.3 Was im Log stehen muss

In dieser Reihenfolge, `…` steht für Zahlen und Namen. Gemessen in der dritten Generalprobe (erster
Start mit `0974b7f` ab dem Schema `b6e1c8a`; die zweite ab `f6d3daf` ergab dieselben Zeilen); zwei
Zeilen weichen auf dem Server ab, siehe darunter:

```
CREDO HR-Portal startet...
Umgebungsvariablen geprueft: OK
Schema-Unterschied erkannt — Sicherung wird angelegt...
Sicherung abgelegt: /backups/vor-schema-abgleich-JJJJMMTT-HHMMSS.sql (… Bytes)
Datenbank-Schema wird synchronisiert...
⚠️  There might be data loss when applying the changes:
  • A unique constraint covering the columns `[offboardingId,ausgabeId,herkunft]` on the table `offboarding_checklist_items` will be added. If there are existing duplicate values, this will fail.
  • A unique constraint covering the columns `[offboardingId,ausgabeId]` on the table `return_items` will be added. If there are existing duplicate values, this will fail.
🚀  Your database is now in sync with your Prisma schema. Done in …
Datenbank-Schema synchronisiert.
Pruefe ob Seed notwendig...
System-Vorlage (Aufforderung erweitertes Führungszeugnis) ist aktuell.
System-Vorlage (Übergabeprotokoll Ausstattung) angelegt (ausgeschaltet).
System-Vorlage (Rückgabeprotokoll Ausstattung) angelegt.
Ausstattung & Zugaenge (SUPERVISOR_MIT_AUSSTATTUNG_V1): … Modalitaeten-Datensaetze ohne Merker auf false gesetzt.
Offboarding-Sperrpunkte (OFFBOARDING_SPERRPUNKTE_V1): … Vorlagenpunkte mit Hinweis versehen, … mit eigener Beschreibung unveraendert.
Ausstattung & Zugaenge (AUSSTATTUNG_STANDARDKATALOG_V1): 20 Katalogpositionen angelegt, 13 eingeschaltet.
Datenbank bereits geseeded (… User vorhanden). Seed uebersprungen.
Next.js Server startet auf Port 3000...
[Zeitplaner] Uhr gestartet (jede Minute).
 ✓ Ready in …
```

- **Abweichungen zu den Generalproben:** Dort stand `[Zeitplaner] Uhr aus (ZEITPLANER_AKTIV).`,
  weil die Proben mit `ZEITPLANER_AKTIV=false` liefen; auf dem Server ist `Uhr gestartet (jede
  Minute).` zu erwarten (nicht gemessen). Beim Führungszeugnis stand dort `aktualisiert`, weil die
  Entwicklungsdatenbank einen Windows-Pfad trug (Prüfsumme gleich). Auf dem Server steht
  `ist aktuell`, wenn 1.7 genau die erwartete Zeile gezeigt hat: Der Seed-Check vergleicht
  Prüfsumme, Pfad und Platzhalter der ältesten eingeschalteten Zeile (`planeSystemVorlage` in
  `prisma/seed-check.js`), und der alte Seed-Check hat dort schon `/app/public/…` geschrieben.
- **Dazwischen dürfen stehen:** Zeilen von Prisma (`Prisma schema loaded …`, `Datasource "db" …`,
  ein Kasten „Update available …“), Leerzeilen, Zeilen von Next.js (`▲ Next.js …`, `- Local: …`,
  `- Network: …`, `✓ Starting...`) und, bei mehr als zehn alten Entrypoint-Sicherungen,
  `Alte Sicherung entfernt: …`. Die Zeitplaner-Zeile kann auch nach `✓ Ready` stehen.
- **Warnung von `--accept-data-loss`:** jetzt **erwartet**, mit genau den zwei Punkten oben. Sie
  ist unkritisch: Beide eindeutigen Indizes enthalten die neue Spalte `ausgabeId`, die in allen
  bestehenden Zeilen leer ist, und leere Werte kollidieren nicht. Jeder andere Punkt unter der
  Warnung (etwa „You are about to drop …“) → Ausgabe an Claude, den Container dabei **nicht**
  anhalten.
- **Die drei Migrationszeilen sind erwartet.** Die erste Zahl der `SUPERVISOR_…`-Zeile ist
  `modalitaeten` aus 1.7, die beiden Zahlen der `OFFBOARDING_…`-Zeile sind `bekommen_hinweis` und
  `eigene_beschreibung` aus 1.7 (Beispiel aus der Kopie der Entwicklungsdatenbank, alle drei
  Generalproben: `2` bzw. `14` und `0` — auf dem Server je nach Bestand). Die Zeile des
  Standardkatalogs heißt genau `… 20 Katalogpositionen angelegt, 13 eingeschaltet.` (in der zweiten
  und dritten Generalprobe so gemessen; diese Zahlen hängen nicht vom Bestand ab). Andere Zahlen,
  oder bei ihr stattdessen `Katalog nicht leer (… Positionen) - nichts angelegt.` bzw. `bereits
  gelaufen, Katalog leer - nichts angelegt.` → Ausgabe an Claude, Container nicht anhalten (das
  Portal läuft dann ohne Standardkatalog, wie vor dem Update). **Keine** Zeile der zehn älteren
  Migrationen: Erscheint eine Zeile mit `Vertragsende-Label`, `parallele Spuren`,
  `Abteilungsaufgaben`, `Masernschutz`, `Kostenstellen`, `Betriebsnummer`, `MINIJOB` oder
  `currentStep` → Ausgabe an Claude.
- **System-Vorlagen:** genau die drei Zeilen oben. `aktualisiert` beim Führungszeugnis ist nur in
  Ordnung, wenn 1.7 eine Abweichung bei Pfad, Prüfsumme oder Platzhaltern gezeigt hat (schreibt
  nur diese Felder). `angelegt` beim Führungszeugnis, `Duplikat der System-Vorlage …`,
  `Asset fehlt` oder `System-Vorlage-Seed Fehler …` → Ausgabe an Claude (das Portal läuft
  trotzdem).
- **`Keine User gefunden — Seed wird ausgefuehrt...`** darf nie erscheinen → sofort an Claude,
  **aber dann `start-log.txt` weder schicken noch ins Protokoll übernehmen**: Der Seed schreibt das
  neue Admin-Passwort im Klartext ins Log („INITIALES PASSWORT: …“). Nur diese eine Zeile melden.

Log sichern:

```bash
sudo docker compose logs --no-log-prefix app > ~/deploy-main-2026-10/start-log.txt
```

**Erwartet:** keine Ausgabe.

Die Punkte unter der Warnung von `--accept-data-loss`:

```bash
grep '•' ~/deploy-main-2026-10/start-log.txt
```

**Erwartet:** genau zwei Zeilen, beide mit `A unique constraint covering the columns …` — eine zu
`offboarding_checklist_items`, eine zu `return_items`. Jede weitere Zeile → Ausgabe an Claude
(Container nicht anhalten).

Die wichtigen Zeilen herausziehen (der Filter hat gegenüber früheren Deploys `_V1` dazubekommen,
damit die drei Migrationszeilen mit erscheinen):

```bash
sudo docker compose logs --no-log-prefix app | grep -E 'Schema|Sicherung|synchron|in sync|Seed|System-Vorlage|Zeitplaner|Ready|FATAL|Fehler|fehlgeschlagen|data loss|Migration|_V1'
```

**Erwartet:** genau diese Zeilen (`…` steht für Zahlen und Namen; die Zeitplaner-Zeile darf auch
nach `✓ Ready` stehen):

```
Schema-Unterschied erkannt — Sicherung wird angelegt...
Sicherung abgelegt: /backups/vor-schema-abgleich-JJJJMMTT-HHMMSS.sql (… Bytes)
Datenbank-Schema wird synchronisiert...
⚠️  There might be data loss when applying the changes:
🚀  Your database is now in sync with your Prisma schema. Done in …
Datenbank-Schema synchronisiert.
Pruefe ob Seed notwendig...
System-Vorlage (Aufforderung erweitertes Führungszeugnis) ist aktuell.
System-Vorlage (Übergabeprotokoll Ausstattung) angelegt (ausgeschaltet).
System-Vorlage (Rückgabeprotokoll Ausstattung) angelegt.
Ausstattung & Zugaenge (SUPERVISOR_MIT_AUSSTATTUNG_V1): … Modalitaeten-Datensaetze ohne Merker auf false gesetzt.
Offboarding-Sperrpunkte (OFFBOARDING_SPERRPUNKTE_V1): … Vorlagenpunkte mit Hinweis versehen, … mit eigener Beschreibung unveraendert.
Ausstattung & Zugaenge (AUSSTATTUNG_STANDARDKATALOG_V1): 20 Katalogpositionen angelegt, 13 eingeschaltet.
Datenbank bereits geseeded (… User vorhanden). Seed uebersprungen.
[Zeitplaner] Uhr gestartet (jede Minute).
 ✓ Ready in …
```

Auf das Log der dritten Generalprobe angewandt, ergab genau dieser Filter genau diese Zeilen (dort
mit `… aktualisiert.` beim Führungszeugnis und `Uhr aus`, siehe oben). Ohne `|_V1` fehlen alle
drei Migrationszeilen — keine von ihnen enthält ein anderes Wort des Filters. Die Zeile
`Next.js Server startet auf Port 3000...` fehlt hier immer (der Filter trifft sie nicht). Eine
zusätzliche Zeile `Alte Sicherung entfernt: …` ist in Ordnung. Die drei Migrationszeilen oben
sind in Ordnung; **jede andere** Zeile mit `_V1`, `FATAL`, `Fehler`, `fehlgeschlagen` oder
`Migration` (etwa `Migration OFFBOARDING_SPERRPUNKTE_V1 fehlgeschlagen: …`) → Ausgabe an Claude.

> **`start-log.txt` an Claude schicken**, bei jedem Deploy (enthält keine Geheimnisse – einzige
> Ausnahme ist die Seed-Zeile oben: Steht `Keine User gefunden …` darin, die Datei nicht schicken).

### 4.4 Fehlschlag erkennen

| Zeichen im Log | Bedeutung | Sofort |
|---|---|---|
| `Datenbank-Schema ist bereits deckungsgleich — kein Abgleich noetig.` beim **ersten** Start | Es läuft noch das alte Image (Build gescheitert?). Datenbank unverändert. | Befehl C, dann Ausgabe und `start-log.txt` an Claude |
| `FATAL: Sicherungsverzeichnis /backups fehlt.` | Einhängung fehlt. Datenbank unverändert. | an Claude |
| `FATAL: Sicherung nach … fehlgeschlagen.` | Rechte auf `backups/`. Datenbank unverändert. | Befehl A aus 1.4; der Container startet von selbst neu |
| Prisma-Fehlermeldung statt `Datenbank-Schema synchronisiert.` (etwa mit `offboarding_processes_onboardingId_fkey` oder `violates foreign key constraint`), und `docker compose ps` zeigt `Restarting` | Push gescheitert, Neustart-Schleife. Ein Teil des Schemas ist womöglich schon angelegt | **sofort** Befehl D, dann an Claude. Jeder Neustart legt eine Sicherung an; nach zehn wäre die vom Update weggeräumt. |
| `Migration … fehlgeschlagen: …` | Eine der drei Migrationen ist gescheitert, ohne etwas zu ändern (beim Standardkatalog: das Portal läuft ohne Katalog, wie vor dem Update); das Portal startet trotzdem, beim nächsten Start versucht sie es erneut | an Claude mit `start-log.txt` |
| `Duplikat der System-Vorlage …` | Mehrere eingeschaltete Zeilen derselben System-Vorlage; das Portal läuft | an Claude; in Brief-Vorlagen mit HR bereinigen (alle bis auf eine deaktivieren) |
| `Seed-Check Fehler:` oder `Seed-Check fehlgeschlagen (nicht kritisch).` | Das Portal startet trotzdem | an Claude mit `start-log.txt` |
| `[Zeitplaner] Uhr aus (ZEITPLANER_AKTIV).` | In der `.env` steht `ZEITPLANER_AKTIV=false` | an Claude |
| `[Zeitplaner] Takt fehlgeschlagen: …` | Die Uhr erreicht das Portal nicht | an Claude |
| Kein `✓ Ready`, oder 5.1 meldet einen Fehler | Die App startet nicht | an Claude mit `start-log.txt` |

Startet der Container später noch einmal (etwa nach einem Neustart des Servers), stehen im Log
`Datenbank-Schema ist bereits deckungsgleich — kein Abgleich noetig.` und dreimal
`System-Vorlage (…) ist aktuell.`, aber keine `_V1`-Zeile und keine neue Sicherung — so in allen drei
Generalproben beim zweiten Start gemessen (der Standardkatalog schreibt bei gesetztem Merker nur
dann eine Zeile, wenn der Katalog leer ist: `… bereits gelaufen, Katalog leer - nichts
angelegt.`). Daran ändert auch das in 5.3 Schritt 5 eingeschaltete Übergabeprotokoll nichts: Der
Seed-Check schreibt nie den Aktiv-Schalter (aus dem Code, `planeSystemVorlage`; nicht gemessen).

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
sudo sh -c 'cd /vol/container/HR_Portal_CREDO/backups && cp -p "$(ls -1t | grep "^vor-schema-abgleich-" | head -1)" vor-deploy-main-2026-10-entrypoint.sql'
```

**Erwartet:** keine Ausgabe.

```bash
sudo ls -l backups/vor-deploy-main-2026-10-manuell.sql backups/vor-deploy-main-2026-10-entrypoint.sql backups/uploads-vor-deploy-main-2026-10.tar.gz
```

**Erwartet:** drei Dateien; die beiden `.sql` fast gleich groß (kleine Unterschiede kommen von den
`pg_dump`-Versionen 18 und 16; Handgriff 0 ändert nur einen Wert). Weicht ab → Ausgabe an Claude
(das Portal läuft weiter).

---

## 5 · Nachher prüfen

### 5.1 Health

```bash
sudo docker compose ps
```

**Erwartet:** `hr-portal-app` mit `(healthy)` — das dauert gut eine Minute (40 s Anlaufzeit, dann
alle 30 s eine Prüfung). Bis dahin steht `(health: starting)`; nach zwei Minuten wiederholen.
Danach noch nicht `(healthy)` → **STOPP, Ausgabe an Claude.**

```bash
sudo docker exec hr-portal-app curl -s http://localhost:3000/api/health
```

**Erwartet:** `{"status":"ok","timestamp":"…","zeitplaner":{"uhrAktiv":true,"letzterTakt":…}}`.
Direkt nach dem Start kann `letzterTakt` noch `null` sein; nach einer Minute wiederholen, dann steht
dort ein Zeitpunkt. `{"status":"error",…}` oder `"uhrAktiv":false` → **STOPP, Ausgabe an Claude.**
(In den Generalproben stand wegen der ausgeschalteten Uhr `"uhrAktiv":false` — auf dem Server ist
das ein Fehler.)

```bash
curl -s https://hr.fes-credo.de/api/health
```

**Erwartet:** dasselbe von außen über Caddy. Weicht ab → **STOPP, Ausgabe an Claude.**

HR bekommt noch **keinen** Bescheid — erst am Ende von 5.3, wenn Mailvorlagen, Vorlagenpunkte und
Stufe 2 erledigt sind.

### 5.2 Datenbank

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

**Erwartet:** `0` — Datenbank und neues Schema sind deckungsgleich. Weicht ab → Ausgabe an Claude.

**Die individuellen E-Mails seit dem 02.10. sind unverändert da** (derselbe Zählbefehl wie in 1.7
und 4.1):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM individuelle_mails) AS mails, (SELECT COUNT(1) FROM individuelle_mail_anhaenge) AS anhaenge;'
```

**Erwartet:** genau die beiden Zahlen aus **4.1** (dritte Generalprobe: `1 | 1` vorher und nach
beiden Starts, Inhalt per Prüfsumme unverändert). Der Push fasst diese beiden Tabellen nicht an
(3.4: kein `CREATE TABLE` für sie). **Nicht** `0 | 0` erwarten — die vorige Fassung (`ea2d41d`) tat
das, weil sie die Tabellen erst mit diesem Update erwartete. Kleiner als in 4.1 → **sofort an
Claude** (das Portal läuft weiter). Größer ist nur in Ordnung, wenn seit dem Start schon jemand eine
individuelle E-Mail geschickt hat (bis zur Freigabe am Ende von 5.3 tut das niemand).

**Die Tabellen der Ausstattung — nur der Katalog ist gefüllt:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -x -c 'SELECT (SELECT COUNT(1) FROM ausstattungs_positionen) AS ausstattungs_positionen, (SELECT COUNT(1) FROM ausstattungs_ausblendungen) AS ausstattungs_ausblendungen, (SELECT COUNT(1) FROM onboarding_ausstattung) AS onboarding_ausstattung, (SELECT COUNT(1) FROM onboarding_ausstattung_aufgaben) AS onboarding_ausstattung_aufgaben, (SELECT COUNT(1) FROM onboarding_stellen_hinweise) AS onboarding_stellen_hinweise, (SELECT COUNT(1) FROM onboarding_ausstattung_aenderungen) AS onboarding_ausstattung_aenderungen, (SELECT COUNT(1) FROM ausgaben) AS ausgaben;'
```

**Erwartet:** sieben Zeilen untereinander: `ausstattungs_positionen | 20` (der Standardkatalog aus
4.3), alle anderen sechs mit `| 0` (so in der zweiten und dritten Generalprobe gemessen). Weicht
ab → Ausgabe an Claude.

**Der Standardkatalog:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT COUNT(1) AS positionen, COUNT(1) FILTER (WHERE "isActive") AS eingeschaltet, COUNT(1) FILTER (WHERE "organizationId" IS NOT NULL) AS einrichtung, COUNT(1) FILTER (WHERE "beiAustritt" IS NOT NULL OR "rueckgabeKategorie" IS NOT NULL OR "ausgabeKennung" IS NOT NULL) AS a4_werte FROM ausstattungs_positionen;'
```

**Erwartet:**

```
 positionen | eingeschaltet | einrichtung | a4_werte
------------+---------------+-------------+----------
         20 |            13 |           0 |        0
(1 row)
```

In der zweiten und dritten Generalprobe genau so gemessen. `a4_werte` größer 0 hieße, dass Stufe 2
(A4) schon vor 5.3 Schritt 5 an einer Position eingeschaltet wäre → Ausgabe an Claude. Jede andere
Abweichung ebenso.

**Rechner und Telefon nicht für Minijob und Ehrenamt** (Entscheidung 3 in Abschnitt 0) — nur diese
beiden Positionen haben Personengruppen:

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT "vorschlagSchluessel" AS position, personengruppen FROM ausstattungs_positionen WHERE cardinality(personengruppen) > 0 ORDER BY 1;'
```

**Erwartet** (in der zweiten Generalprobe so gemessen):

```
  position  |      personengruppen
------------+----------------------------
 IT_LAPTOP  | {STANDARD,BEAMTE,ERZIEHER}
 IT_TELEFON | {STANDARD,BEAMTE,ERZIEHER}
(2 rows)
```

(`ERZIEHER` ist das Kita-Personal.) Weicht ab → Ausgabe an Claude.

**Je Einrichtungsart genau eine Schlüssel-Position:** Die drei Schlüssel-Positionen der
Gebäudewirtschaft gelten für getrennte Einrichtungsarten (Schulen: Gymnasium, Gesamtschule,
Grundschule, Berufskolleg; Kita; Büros: Verwaltung, GmbH, Verein), sodass jeder Arbeitsort genau
eine bekommt. Die Abfrage zählt je Art der vorhandenen Einrichtungen, wie viele eingeschaltete
Schlüssel-Positionen dort gelten:

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT o.type AS art, COUNT(1) AS einrichtungen, COUNT(1) FILTER (WHERE o."isActive") AS aktiv, (SELECT COUNT(1) FROM ausstattungs_positionen p WHERE p."vorschlagSchluessel" LIKE $$FACILITY_SCHLUESSEL%$$ AND p."isActive" AND (cardinality(p.einrichtungsarten) = 0 OR o.type::text = ANY (p.einrichtungsarten))) AS schluessel_positionen FROM organizations o GROUP BY o.type ORDER BY o.type;'
```

**Erwartet:** je vorkommender Art eine Zeile, in der Spalte `schluessel_positionen` **überall `1`**
(aus dem Code: `SCHULEN`, `["KITA"]` und `BUEROS` in `VORSCHLAEGE` sind getrennt, der Test
`ausstattung-standardkatalog.test.ts` hält das; auf einer Datenbank mit Standardkatalog nicht
gemessen). `einrichtungen` und `aktiv` hängen vom Bestand ab (Entwicklungsdatenbank: sieben Zeilen,
zusammen 16 Einrichtungen, keine mit der Art `VERWALTUNG`). Die Spalte `type` ist Pflicht und kennt
nur diese acht Arten — eine Einrichtung ohne Art gibt es nicht; gäbe es sie, bekäme sie keine
Schlüssel-Position. Eine Zeile mit `0` (dort sähe die Führungskraft keinen Schlüssel) oder `2`
(die Gebäudewirtschaft bekäme zwei Schlüssel-Aufgaben) → **Hinweis an Claude**, kein STOPP; in 5.3
Schritt 3 dann die Schlüssel-Punkte der Verwaltung stehen lassen.

**Indizes der neuen Tabellen** (dazu die beiden Tabellen von Paket 3, deren Indizes seit dem 02.10.
bestehen — bei `individuelle_mails` gehört `individuelle_mails_dialogKennung_key` zu den vier;
ohne ihn ließe sich eine Mail doppelt nachweisen):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT tablename, COUNT(1) AS indizes FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('individuelle_mails', 'individuelle_mail_anhaenge', 'ausstattungs_positionen', 'ausstattungs_ausblendungen', 'onboarding_ausstattung', 'onboarding_ausstattung_aufgaben', 'onboarding_stellen_hinweise', 'onboarding_ausstattung_aenderungen', 'ausgaben') GROUP BY 1 ORDER BY 1;"
```

**Erwartet** (je Tabelle samt Primärschlüssel; zusammen 27 — 6 an den zwei Tabellen von Paket 3,
21 an den sieben der Ausstattung, also deren 14 Indizes aus 3.4 plus 7 Primärschlüssel; so in der
ersten und in der dritten Generalprobe gemessen):

```
 ausgaben                           |       7
 ausstattungs_ausblendungen         |       1
 ausstattungs_positionen            |       4
 individuelle_mail_anhaenge         |       2
 individuelle_mails                 |       4
 onboarding_ausstattung             |       3
 onboarding_ausstattung_aenderungen |       2
 onboarding_ausstattung_aufgaben    |       2
 onboarding_stellen_hinweise        |       2
(9 rows)
```

Weicht ab → Ausgabe an Claude.

**Neu an den bestehenden Tabellen** (die beiden eindeutigen Indizes und der Fremdschlüssel aus 1.7):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT conname AS name FROM pg_constraint WHERE conname = 'offboarding_processes_onboardingId_fkey' UNION ALL SELECT indexname FROM pg_indexes WHERE indexname IN ('offboarding_checklist_items_offboardingId_ausgabeId_herkunf_key', 'return_items_offboardingId_ausgabeId_key') ORDER BY 1;"
```

**Erwartet:**

```
 offboarding_checklist_items_offboardingId_ausgabeId_herkunf_key
 offboarding_processes_onboardingId_fkey
 return_items_offboardingId_ausgabeId_key
(3 rows)
```

**Merker der einmaligen Migrationen:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT COUNT(1) AS merker FROM system_migrations;"
```

**Erwartet:** `13` (10 aus 1.7 plus 3; in der zweiten und dritten Generalprobe 10 → 13). Weicht
ab → Ausgabe an Claude.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT name, details->>'aufFalseGesetzt' AS auf_false, jsonb_array_length(details->'punkte') AS mit_hinweis, details->>'mitBeschreibung' AS eigene, details->>'andereVorlage' AS andere_vorlage FROM system_migrations WHERE name IN ('SUPERVISOR_MIT_AUSSTATTUNG_V1', 'OFFBOARDING_SPERRPUNKTE_V1') ORDER BY name;"
```

**Erwartet:** zwei Zeilen (Beispiel aus der Kopie, alle drei Generalproben:
`OFFBOARDING_SPERRPUNKTE_V1 |  | 14 | 0 | 0` und `SUPERVISOR_MIT_AUSSTATTUNG_V1 | 2 |  |  |`). Auf
dem Server: `mit_hinweis` und `eigene` wie
`bekommen_hinweis` und `eigene_beschreibung` aus 1.7, `auf_false` wie `modalitaeten` aus 1.7.
Weicht ab → Ausgabe an Claude.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT details->>$$vorhanden$$ AS vorhanden, details->>$$angelegt$$ AS angelegt, details->>$$eingeschaltet$$ AS eingeschaltet, (SELECT COUNT(1) FROM audit_logs WHERE action = $$AUSSTATTUNG_STANDARDKATALOG_ANGELEGT$$) AS protokoll FROM system_migrations WHERE name = $$AUSSTATTUNG_STANDARDKATALOG_V1$$;'
```

**Erwartet:** eine Zeile `0 | 20 | 13 | 1` (vorher kein Katalog, 20 angelegt, 13 eingeschaltet,
ein AuditLog-Eintrag ohne Benutzer; in der zweiten und dritten Generalprobe so gemessen, der Eintrag
mit `processType` `SYSTEM`). Weicht ab → Ausgabe an Claude.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT "mitAusstattung" AS mit_ausstattung, COUNT(1) AS zeilen FROM supervisor_data GROUP BY 1 ORDER BY 1;'
```

**Erwartet:** eine Zeile `f | <modalitaeten aus 1.7>` — kein `t`, keine Zeile mit leerem Wert (bei
0 Datensätzen `(0 rows)`). Weicht ab → Ausgabe an Claude. (Ein `t` entsteht erst, wenn nach dem
Start ein Vorgesetzten-Link erzeugt wird — das tut bis zur Freigabe am Ende von 5.3 niemand.)

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT COUNT(1) AS mit_hinweis FROM checklist_template_items WHERE description LIKE $$Gemeint ist alles, was nicht als eigene Aufgabe%$$;'
```

**Erwartet:** dieselbe Zahl wie `bekommen_hinweis` in 1.7 (erste und zweite Generalprobe: 14; die
dritte meldete im Log dieselbe Zahl).

**System-Vorlagen:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT name, modul, "originalName", "isActive" AS aktiv, "fileSize", left(hash, 12) AS hash_anfang, jsonb_array_length(platzhalter) AS platzhalter FROM document_templates WHERE "isSystem" ORDER BY modul, "originalName", "createdAt";'
```

**Erwartet:** genau drei Zeilen (so in den ersten beiden Generalproben, in der dritten Name, Modul
und Aktiv-Schalter gleich; die Größe der Führungszeugnis-Vorlage ist unverändert):

```
 Rückgabeprotokoll Ausstattung            | OFFBOARDING | Rueckgabeprotokoll-Ausstattung.docx | t | 3318 | a8d703ff8351 | 12
 Aufforderung erweitertes Führungszeugnis | ONBOARDING  | Fuehrungszeugnis-Antrag.docx        | t | …    | 20d18c1463f6 |  6
 Übergabeprotokoll Ausstattung            | ONBOARDING  | Uebergabeprotokoll-Ausstattung.docx | f | 3307 | a55e88692097 | 11
```

Das Übergabeprotokoll ist **aus** (`f`) — bis 5.3 Schritt 5 es einschaltet —, das
Rückgabeprotokoll **an** (`t`). Weicht ab → Ausgabe an Claude.

**Läufe und Mails seit dem Start:**

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT COUNT(1) AS laeufe, COUNT(1) FILTER (WHERE aktiv) AS aktiv FROM automatische_laeufe;'
```

**Erwartet:** `11 | 0` (kein neuer Lauf, nichts eingeschaltet). Weicht ab → Ausgabe an Claude.

Die Abfrage zählt nur Mails **seit dem Start**: Untergrenze ist der Zeitpunkt der letzten
einmaligen Datenmigration (`appliedAt` in `system_migrations`, nach 4.3 der Standardkatalog — der
Seed-Check läuft vor dem Server, also vor jeder Mail des neuen Containers). Mails, die HR vor 4.1
ausgelöst hat (etwa eine individuelle E-Mail), liegen davor und zählen nicht mit. Das setzt voraus,
dass die Merker-Abfrage oben `13` gezeigt hat:

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT event, status, COUNT(1) AS mails FROM email_logs WHERE "createdAt" > (SELECT max("appliedAt") FROM system_migrations) GROUP BY 1, 2 ORDER BY 1, 2;'
```

**Erwartet:** `(0 rows)` — der Start verschickt nichts (alle drei Generalproben: Versandprotokoll
vorher und nachher 28 Zeilen). In Ordnung sind auch einzelne gewöhnliche Mails, die über
öffentliche Links ausgelöst wurden (etwa `supervisor-completed`, wenn eine Führungskraft ihr
Formular abgegeben hat). Eine Zeile `automatischer-lauf-bericht`, `onboarding-ausstattung-offen` oder
`onboarding-department-abgesagt` → Ausgabe an Claude.

### 5.3 Vor der Freigabe: Mailvorlagen, Abteilungen, Vorlagenpunkte, Stufe 2 (Pflicht, vor dem Bescheid an HR)

**Warum jetzt und nicht später:** Der Standardkatalog ist ab dem Start eingeschaltet. Der erste
Vorgesetzten-Link nach dem Update bekommt den neuen Schritt, und seine Einladung, die Abgabe der
Führungskraft und „Abteilungen informieren“ laufen über Vorlagen, die in der Datenbank noch den
alten Text tragen. Checklisten-Vorlagenpunkte werden beim Anlegen eines Vorgangs kopiert — was bis
dahin doppelt bleibt, bekommt jeder neue Vorgang doppelt. Und Stufe 2 gehört vor das erste
Formular einer Führungskraft: Beim Speichern merkt sich das Formular, ob der Katalog Übergaben
anbot (`ausgabenAngeboten`, `src/lib/ausstattung-dienst.ts`); ein vorher gespeichertes Formular
zeigt im Offboarding später „vor Einführung“. Darum laufen die sechs Schritte unten in dieser
Reihenfolge, **bevor** HR wieder arbeitet. Ein Ausschalten vor dem Start (wie Handgriff 0) braucht
es dafür nicht: Bis zum Bescheid in Schritt 6 legt niemand einen Vorgang an, und „Abteilungen
informieren“ löst nur HR selbst aus.

Einstellungen, Checklisten-Vorlagen und deaktivierte Brief-Vorlagen erreichen nur SUPER_ADMIN und
HR_LEITUNG — am einfachsten mit dem eigenen SUPER_ADMIN-Konto. Endet ein Schritt im STOPP, geht es
nur so weiter, wie es dort steht.

#### Schritt 1 — Mailvorlagen zurücksetzen

Gespeicherte Vorlagen überschreiben den Text aus dem Code vollständig. „Text auf Standard
zurücksetzen“ ersetzt Betreff, HTML-Text, Textteil und Variablen; An, CC, BCC, Antwortadresse und
der Aktiv-Schalter bleiben.

1. Die Mailvorlagen-Abfrage aus 1.9 noch einmal ausführen (derselbe Befehl).
2. Für **jede** Zeile mit `handlung` = `nach dem Start zuruecksetzen` (erwartet:
   `supervisor-link-created`, `supervisor-completed`; dazu `onboarding-department-assigned`, falls
   dort so angezeigt): Einstellungen → **E-Mail-Vorlagen** → Vorlage öffnen → **„Text auf Standard
   zurücksetzen“** → bestätigen.
3. **Handgriff 0 abschließen** (nur wenn er in 4.1 lief): Vorlage `onboarding-task-completed`
   öffnen → „Text auf Standard zurücksetzen“ → **danach** wieder einschalten. War sie schon vor
   dem Deploy aus (1.9: `aktiv` = `f`), nur zurücksetzen und ausgeschaltet lassen.
4. Zeigt eine Zeile `betreff_gesperrt` = `t`, in dieser Vorlage den Betreff in der Oberfläche
   korrigieren (die gesperrte Variable herausnehmen; das Portal lässt solche Betreffzeilen beim
   Speichern ohnehin nicht mehr zu). Eine zurückgesetzte Vorlage hat schon den Standardbetreff.
5. Die Abfrage aus 1.9 ein drittes Mal ausführen.

**Erwartet:** Jede Zeile mit `gespeichert` = `t` zeigt jetzt `nichts (Text aktuell)`; `aktiv` steht
wie in 1.9 (bei Handgriff 0 wieder `t`); `betreff_gesperrt` ist nirgends `t`. Eine andere
`handlung` → **STOPP, Ausgabe an Claude**, HR noch keinen Bescheid geben (das Portal läuft).

Zeigte 1.9 `hr_postfach_gesetzt` = `f`: jetzt nichts ändern, aber an Claude melden (die
Antwortadresse gilt für alle Mails, siehe Abschnitt 9). Die beiden neuen Vorlagen
(`onboarding-department-abgesagt`, `onboarding-ausstattung-offen`) bleiben **ungespeichert** (6.3);
„Test senden“ an die eigene Adresse ist erlaubt. `individuelle-mail` (seit dem 02.10. da) bleibt,
wie sie ist — gespeichert oder nicht.

#### Schritt 2 — Adressen der Abteilungen und Adresslücken

Eine eingeschaltete Position sieht die Führungskraft nur, wenn ihre Stelle am Arbeitsort eine
aktive Adresse hat. Danach richtet sich Schritt 3.

Das Wort „Gebäudewirtschaft“ zeigt das Portal hier nirgends: Seite und Warnungen nennen jede Stelle
mit dem Namen ihres Eintrags unter „Abteilungen“ (ohne Eintrag mit dem Standardnamen). Nach dem
Erst-Seed heißt die Gebäudewirtschaft (Schlüssel `FACILITY`) „Facility Management“ und die IT
(`IT`) „IT-Abteilung“; Verwaltung / Sekretariat (`VERWALTUNG`) trägt den Namen, den HR je
Einrichtung vergeben hat.

1. Einstellungen → Reiter **„Ausstattung & Zugänge“** (nur lesen). Oben stehen die Warnungen der
   Seite: rot je Stelle „Keine aktive Adresse für … in …: … fehlen dort im Formular. Bitte unter
   „Abteilungen“ eine Adresse eintragen oder aktivieren.“ (**Adresslücke**; für die
   Gebäudewirtschaft mit deren Namen aus „Abteilungen“, etwa „Facility Management“), gelb „… Punkte
   von Checklisten-Vorlagen klingen nach einer Position dieses Katalogs …“ (**ähnliche
   Vorlagenpunkte**; die Zeilen der Liste nennen Vorlage und Punkt) und gelb „… steht nicht auf der
   Freigabeliste …“.
2. Einstellungen → Reiter **„Abteilungen“** (nur lesen): Für **IT**, **Verwaltung / Sekretariat**
   und **Gebäudewirtschaft** (Schlüssel `FACILITY`; die Liste nennt sie mit dem Namen aus
   „Abteilungen“, nach dem Erst-Seed „Facility Management“) steht je ein aktiver Eintrag mit
   Adresse — zentral oder je Einrichtung. Die Liste zeigt Name und Schlüssel je Zeile.

**Erwartet:** In der Liste 20 Positionen, 13 davon eingeschaltet; keine rote Warnung für IT,
Verwaltung / Sekretariat oder Gebäudewirtschaft (passend zur Adressabfrage in 1.9). Ein
Bildschirmfoto der Warnungen an Claude (für das Protokoll). Eine andere Zahl von Positionen →
**STOPP, Ausgabe an Claude** (widerspricht 5.2). Eine rote Warnung ist kein STOPP: notieren, für
welche Stelle und welche Einrichtungen — sie entscheidet in Schritt 3, was stehen bleibt, und Claude
passt danach den Kurztext (8.1, Punkt 9) und den Infotext (8.2) an (die Positionen dieser Stelle
erscheinen dort nicht im Formular). Adressen **nicht** nebenbei nachtragen (sie kennt HR; das kommt
unter „Danach“ in Abschnitt 9). Ob eine eingetragene Adresse ein echtes Postfach der Stelle ist,
sieht die Seite nicht; die Platzhalter aus dem Erst-Seed zeigt 1.9 (`seed_platzhalter`), sonst bei
Zweifel an Claude.

#### Schritt 3 — Checklisten-Vorlagenpunkte aufräumen (Entscheidung 2)

Maßgeblich ist der Feinplan `docs/module/onboarding/ausstattung-feinplan.md`, Abschnitt 8, Tabelle
„Aufräumen der Vorlagenpunkte“. Laufende Vorgänge behalten ihre Punkte (sie sind Kopien); die
Offboarding-Vorlagen werden nicht angefasst.

Erst lesen, welche Punkte es auf dem Server gibt (nur lesend):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT t.name AS vorlage, t."isActive" AS aktiv, i.title AS punkt, i."defaultAssignee" AS stelle FROM checklist_template_items i JOIN checklist_templates t ON t.id = i."templateId" WHERE btrim(t.name) NOT LIKE $$Offboarding:%$$ AND (i.title ILIKE $$%schlüssel%$$ OR i.title ILIKE $$%schluessel%$$ OR i.title ILIKE $$%transponder%$$ OR i.title ILIKE $$%benutzerkonto%$$ OR i.title ILIKE $$%endgerät%$$) ORDER BY 1, 3;'
```

**Erwartet** (Stand `prisma/seed.ts`; so auf einer Entwicklungsdatenbank mit aktuellem Seed
gemessen; die Reihenfolge der Zeilen darf abweichen):

```
           vorlage           | aktiv |                          punkt                           |   stelle
-----------------------------+-------+----------------------------------------------------------+------------
 Minijob-Einstellung         | t     | Schlüssel/Transponder bestellen (falls nötig)            | VERWALTUNG
 Standard-Einstellung (TV-L) | t     | Arbeitsplatz/Endgerät einrichten, Zugangsdaten übergeben | IT
 Standard-Einstellung (TV-L) | t     | Benutzerkonto und dienstliche E-Mail-Adresse anlegen     | IT
 Standard-Einstellung (TV-L) | t     | Schlüssel/Transponder bestellen                          | VERWALTUNG
 Standard-Einstellung (TV-L) | t     | Schlüsselübergabe dokumentieren                          | VERWALTUNG
(5 rows)
```

Die Datenbank des Servers kann einen älteren Stand der Vorlagen tragen — eine ältere
Entwicklungsdatenbank zeigt hier etwa nur „Schlüssel/Ausweis bestellt“ und „Schluesseluebergabe
dokumentiert“ —, und HR kann Vorlagen umbenannt haben. Die Ausgabe **notieren** und an Claude
schicken.

Dann je Zeile: Vorlagen → **Checklisten** → Vorlage → „Bearbeiten“ → am Punkt „Entfernen“ bzw. den
Titel ändern → „Aktualisieren“.

| Punkt (Vorlage) | Was tun | Nur wenn |
|---|---|---|
| „Schlüsselübergabe dokumentieren“ (Standard-Einstellung (TV-L)) | **entfernen** | Schritt 2 zeigte keine rote Warnung für die Gebäudewirtschaft, 1.9 zeigte bei `FACILITY` `seed_platzhalter` = `0` (oder Claude hat die Adresse bestätigt), und 5.2 zeigte überall `schluessel_positionen` = `1` |
| „Schlüssel/Transponder bestellen“ (Standard-Einstellung (TV-L)) und „Schlüssel/Transponder bestellen (falls nötig)“ (Minijob-Einstellung) | **entfernen** — oder, wenn laut Antwort von HR (Ankündigung, Abschnitt 0) eine Einrichtung Transponder oder Chips nutzt, den Titel ändern zu „Transponder bestellen (falls nötig)“. Liegt die Antwort von HR am Tag des Updates nicht vor oder ist sie unklar: umbenennen zu „Transponder bestellen (falls nötig)“, nicht entfernen (die Katalogposition „Transponder“ ist im Standard aus) | wie oben |
| „Benutzerkonto und dienstliche E-Mail-Adresse anlegen“ (Standard-Einstellung (TV-L)) | **entfernen** — vorher den Text im Feld „Hinweis für die zuständige Stelle (optional)“ dieses Punkts (im Seed: „Konto in der Schulverwaltung und im Microsoft-365-Mandanten der Einrichtung; Zugangsdaten an die Führungskraft.“) wörtlich ins Protokoll übernehmen; der Text kommt später an die Position „Zugänge“ (Abschnitt 9, „Danach“, 5.2) | keine rote Warnung für IT, und 1.9 zeigte bei `IT` `seed_platzhalter` = `0` (oder Claude hat die Adresse bestätigt) |
| „Arbeitsplatz/Endgerät einrichten, Zugangsdaten übergeben“ (Standard-Einstellung (TV-L)) | Titel ändern zu „Zugangsdaten übergeben“ | wie beim Punkt darüber |
| jede andere Zeile (anderer Titel, andere Vorlage, andere Stelle) | **stehen lassen** | — |

Trifft eine Bedingung nicht zu, den Punkt stehen lassen: Doppelte Aufgaben sind lästig, ein
gestrichener Punkt, den der Katalog an einem Arbeitsort nicht abdeckt, fehlte dagegen ganz.
„Zugänge zu Fachanwendungen einrichten“ und „Postfach, Namensschild und Telefonliste vorbereiten“
bleiben ohnehin (Feinplan, dieselbe Tabelle). Danach die Abfrage oben noch einmal ausführen.

**Erwartet:** Es fehlen genau die entfernten bzw. umbenannten Zeilen („Zugangsdaten übergeben“
trifft der Filter nicht mehr, „Transponder bestellen (falls nötig)“ schon). Wurde alles nach der
Tabelle erledigt: `(0 rows)` bzw. nur Zeilen „Transponder bestellen (falls nötig)“. Im Protokoll je
Zeile notieren: entfernt, umbenannt oder stehen gelassen (mit Grund), dazu die Antwort von HR zu
den Transpondern (ja/nein/offen). Zeilen mit anderem Titel → kein STOPP, stehen lassen, Ausgabe an
Claude und weiter mit Schritt 4; Claude sagt, ob sie noch vor dem Bescheid oder später aufgeräumt
werden — diese Antwort wird **vor Schritt 6** abgewartet. Meldet die Oberfläche beim Speichern einen
Fehler → **STOPP für diesen Schritt**, Ausgabe an Claude, weiter mit Schritt 4 (Antwort ebenfalls
vor Schritt 6 abwarten).

#### Schritt 4 — Webhooks (Bedingung für Stufe 2)

1. Hat 1.9 Zeilen mit `feuert ab dem Deploy NICHT mehr` gezeigt: unter Einstellungen →
   **Webhooks** jede dieser Zeilen „Löschen“ → bestätigen (sie ist seit dem Start wirkungslos).
   Bei `(0 rows)` in 1.9 ist hier nichts zu tun.
2. Webhooks auf die vier Offboarding-Ereignisse der Abteilungen lesen (nur lesend; dieselben vier
   Ereignisse zählt das Portal selbst, `A4_WEBHOOK_EREIGNISSE` in `src/lib/ausgaben.ts`):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT w.event, w.name, w."isActive" AS aktiv FROM webhook_configs w WHERE w.event IN ($$offboarding-department-assigned$$, $$offboarding-department-completed$$, $$offboarding-reminder$$, $$offboarding-task-completed$$) ORDER BY w."isActive" DESC, w.event;'
```

**Erwartet:** `(0 rows)` (am 24.09. gab es keine Webhooks) oder nur Zeilen mit `aktiv` = `f` (ein
ausgeschalteter Webhook feuert nicht). Dann weiter mit Schritt 5.

- Eine Zeile mit `aktiv` = `t`, deren Löschung seit 1.9 mit dem Projektverantwortlichen geklärt ist:
  unter Einstellungen → Webhooks „Löschen“ → bestätigen, dann die Abfrage wiederholen — erst wenn
  keine Zeile mit `t` mehr steht, weiter mit Schritt 5.
- Eine Zeile mit `aktiv` = `t`, die nicht geklärt ist → **STOPP für Stufe 2:** Schritt 5 auslassen,
  weiter mit Schritt 6, Ausgabe an Claude. Stufe 2 kommt dann unter „Danach“ (Abschnitt 9); in
  Abschnitt 8 gelten die Klammern für „ohne Stufe 2“.

#### Schritt 5 — Stufe 2 einschalten (Entscheidung 4)

Nur, wenn Schritt 4 keine aktive Zeile mehr zeigt. Reihenfolge wie in CLAUDE.md, „Vor dem
Einschalten“, Punkte 3 und 4: erst die Brief-Vorlage, dann die Vorgaben — sonst meldete die Karte
„Unterschriebenes Übergabeprotokoll: fehlt“, ohne dass HR das Protokoll erzeugen könnte. Den Lauf
„Aufbewahrung erzeugter Dokumente“ (dort Punkt 2) schaltet 6.2 am selben Tag ein: Die erste
Löschfrist einer Ausgabe endet frühestens sechs Monate, nachdem sie einen Zustand bekommt (zurück,
beschädigt, entfällt oder beim Tausch ersetzt; `ausgabeLoeschenAb` in `src/lib/ausgaben.ts`), der
Lauf muss also nicht vorher laufen.

**Die grünen Erfolgsmeldungen der Punkte 1 und 2 verschwinden nach wenigen Sekunden** (Brief-Vorlagen
nach 4 s, Katalog nach 5 s) — sofort lesen bzw. ein Bildschirmfoto machen. Verpasst ist kein STOPP:
Maßgeblich sind dann die nicht mehr blasse Zeile „Übergabeprotokoll Ausstattung“ bzw. die beiden
Prüfabfragen unter Punkt 3. Ein Webhook-Hinweis unter der Katalog-Meldung bleibt dagegen stehen.

1. **„Übergabeprotokoll Ausstattung“ einschalten:** Vorlagen → **Brief-Vorlagen** → Häkchen
   „Deaktivierte Vorlagen anzeigen“ setzen → in der (blassen) Zeile „Übergabeprotokoll Ausstattung“
   **„Reaktivieren“**.
   **Erwartet:** die Meldung „Vorlage reaktiviert.“ (verschwindet nach 4 s, siehe oben); die Zeile
   ist nicht mehr blass, „Erzeugen“ ist anklickbar (nicht klicken). Eine Fehlermeldung → **STOPP für
   Stufe 2**, Ausgabe an Claude, weiter mit Schritt 6.
2. **Rückgabe-Vorgaben übernehmen:** Einstellungen → Reiter **„Ausstattung & Zugänge“** →
   **„Rückgabe-Vorgaben übernehmen …“**. Der Dialog „Rückgabe-Vorgaben übernehmen?“ listet 17
   Positionen, je mit „– beim Austritt: …“, und zeigt gelb „Danach bieten Link-Seite und Karte
   Übergaben an. Erst nach der Beteiligung der MAV und der Bestätigung der Löschfristen durch den
   DSB.“ (beides liegt seit dem 14.10.2026 vor) → **„Vorgaben übernehmen“**.
   **Erwartet:** genau die Meldung „Rückgabe-Vorgaben an 17 Positionen übernommen. Link-Seite und
   Karte bieten dort ab jetzt Übergaben an.“ (verschwindet nach 5 s, siehe oben; aus dem Code
   nachgerechnet:
   `MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS` über die 20 Standardpositionen; die drei Angaben
   haben keine Vorgabe und kommen nicht vor). Darunter steht **kein** Hinweis „Auf die
   Offboarding-Ereignisse der Abteilungen … Webhook … aktiv …“.
   - Steht der Webhook-Hinweis da → **STOPP, Ausgabe an Claude**, HR noch keinen Bescheid geben (die
     Vorgaben sind dann schon gesetzt; das widerspricht Schritt 4).
   - Eine andere Zahl, „… schon einen Wert …“ oder eine Fehlermeldung → **STOPP, Ausgabe an
     Claude**, HR noch keinen Bescheid geben.
   - Ein zweiter Versuch ändert nichts: Der Knopf im Dialog ist dann gesperrt mit „Keine Position
     aus den Vorschlägen wartet noch auf eine Vorgabe für „Beim Austritt“ – es gibt nichts zu
     übernehmen.“
3. **Prüfabfrage** (nur lesend) — wie viele Positionen welchen Wert für „Beim Austritt“ haben:

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT coalesce("beiAustritt", $$(leer)$$) AS bei_austritt, COUNT(1) AS positionen, COUNT(1) FILTER (WHERE "isActive") AS eingeschaltet, COUNT(1) FILTER (WHERE "ausgabeKennung" IS NOT NULL) AS mit_kennung FROM ausstattungs_positionen GROUP BY "beiAustritt" ORDER BY "beiAustritt" NULLS LAST;'
```

**Erwartet** (aus `RUECKGABE_VORGABEN` und `VORSCHLAEGE` nachgerechnet, nicht gemessen):

```
 bei_austritt | positionen | eingeschaltet | mit_kennung
--------------+------------+---------------+-------------
 NICHTS       |          3 |             2 |           0
 RUECKGABE    |         11 |             7 |          11
 SPERREN      |          3 |             2 |           0
 (leer)       |          3 |             2 |           0
(4 rows)
```

`NICHTS`: Parkplatz, Fach im Lehrerzimmer, Türschild. `RUECKGABE`: Rechner, Telefon, iPad,
Diensthandy, drei Schlüssel-Positionen, Transponder, Spind, Kopierkarte, Dienstausweis — jede mit
Beschriftung der Nummer (Inventar-, Schlüssel-, Chip-, Karten- oder Ausweisnummer). `SPERREN`:
Zugänge, schulische Zugänge, BYOD. `(leer)`: die drei Angaben. Weicht ab → **STOPP, Ausgabe an
Claude**, HR noch keinen Bescheid geben.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT (SELECT COUNT(1) FROM audit_logs WHERE action = $$AUSSTATTUNG_RUECKGABE_VORGABEN_UEBERNOMMEN$$) AS vorgaben_protokoll, (SELECT COUNT(1) FROM document_templates WHERE "isSystem" AND "isActive" AND "originalName" IN ($$Uebergabeprotokoll-Ausstattung.docx$$, $$Rueckgabeprotokoll-Ausstattung.docx$$)) AS protokoll_vorlagen_an;'
```

**Erwartet:** `1 | 2` — ein AuditLog-Eintrag der Übernahme, beide Protokoll-Vorlagen eingeschaltet.
Weicht ab → Ausgabe an Claude.

Stufe 2 ist damit an. Für bestehende Vorgänge ändert sich dadurch nichts: Übergaben gibt es nur an
Ausstattungsaufgaben, und die entstehen erst mit Formularen nach dem Update oder über die Karte
„Ausstattung & Zugänge“.

#### Schritt 6 — Jetzt HR Bescheid geben (erst jetzt)

Steht aus Schritt 3 noch Claudes Antwort aus (Zeilen mit anderem Titel, Fehler beim Speichern),
diese vor dem Bescheid abwarten — das Portal läuft dabei weiter. Neue Vorgänge kopieren die
Vorlagenpunkte; was bis zum Bescheid nicht aufgeräumt ist, bekommt jeder neue Vorgang mit.

„Das Portal läuft wieder. Bis zu unserer Mail mit allen Neuerungen (heute, in etwa einer Stunde)
bitte in den neuen Teilen noch nichts eintragen: im Onboarding die Karte „Ausstattung & Zugänge“
(auch „Übergabe vermerken …“), beim Anlegen das Feld „Arbeitsort“ (auf „Wie Einrichtung“ lassen),
unter Einstellungen den Reiter „Ausstattung & Zugänge“, „Stellen über die Absage informieren…“ sowie
im Offboarding „Zustand…“ im Reiter Rückgaben und „Einstellung zuordnen …“. Bitte bis dahin auch
noch keinen Link an eine Führungskraft erzeugen – weder über „Vorgesetzten-Link erstellen“ noch beim
Anlegen eines Onboardings mit E-Mail der Führungskraft (ein Onboarding ohne diese Angabe anzulegen
geht). Alles andere geht wie gewohnt.“

Diese Bitte hält den Rückweg aus 7.3 (Weg A) offen, solange 5.4 bis 6.2 noch etwas finden können —
der Satz zu den Links an Führungskräfte gehört dazu: Ein Link an eine Führungskraft, der nach dem
Update entsteht, bekommt mit dem Standardkatalog in der Regel den neuen Schritt
(`supervisor_data.mitAusstattung` = `t`, `vorgesetztenLinkSetzen` in
`src/lib/onboarding-einladung.ts`, beim Anlegen mit Führungskraft dieselbe Funktion). Dann zeigt
7.3 Schritt 2 `g1_modalitaeten` größer 0, und Weg A entfällt. Erzeugt HR trotzdem einen Link, ist
das kein STOPP — im Ernstfall bleiben dann nur vorwärts reparieren, Weg C (7.5) oder Weg B (7.4).
Die Mail aus 8.1 hebt die Bitte auf.

### 5.4 Probe im Browser

Angemeldet mit einem Konto mit Bearbeitungsrecht (z. B. dem eigenen SUPER_ADMIN-Konto).
Abweichungen hier sind kein Grund, das Portal anzuhalten: Bildschirmfoto oder Meldung an Claude.
Der Schwerpunkt liegt auf dem, was **neu** ist (Punkte 3, 4 und 6 bis 9, vor allem „Ausstattung &
Zugänge“). Die Punkte 2 und 5 sind seit dem 02.10. in Betrieb und nur noch **optional** — sie
zeigen, dass das neue Image sie nicht beschädigt hat.

1. **Anmelden.** Das Dashboard lädt wie gewohnt.
2. **Optional (seit 02.10. in Betrieb): Individuelle E-Mail an die eigene Adresse — nur in einem
   Testvorgang.** Wer sie auslässt, lässt auch 5.5 aus. Der Nutzen ist klein: Dienst, Routen,
   Karte und Standardvorlage der individuellen E-Mail sind von `b6e1c8a` bis `0974b7f`
   unverändert; von den gemeinsam genutzten Teilen änderten sich nur Kleinigkeiten (in `mailer.ts`
   neue Freitext-Variablen anderer Mails, in `dokumentenpaket.ts` eine exportierte Lesefunktion).
   - Vorgang: **nur** ein Testvorgang, dessen hinterlegte Adresse Ihre eigene ist (etwa aus der
     Probe vom 30.09., falls angelegt). Gibt es keinen, Punkt 2 **und 5.5 auslassen** — nicht in
     einen echten Vorgang ausweichen: Dort ist unter „An“ die Adresse der Person vorausgewählt, vor
     dem Senden gibt es keine Rückfrage, und die Testmail stünde samt Anhang 12 Monate in dieser
     Personalakte (Reiter „E-Mails“, „Bisher gesendete E-Mails“).
   - Reiter „Dokumente“ → Karte **„Individuelle E-Mail“** → „E-Mail schreiben…“.
   - Betreff „Test HR-Portal – bitte ignorieren“ (genau so — 5.5 sucht danach), ein Satz als
     Nachricht, als Anhang eine kleine PDF-Datei **ohne Personendaten** (z. B. eine leere Seite).
   - **Vor „E-Mail senden“ prüfen:** Unter „An“ steht Ihre eigene Adresse. Erst dann senden. Die
     Testmail bleibt 12 Monate in diesem Testvorgang sichtbar.
   - **Erwartet:** Im Dialog die grüne Meldung „✓ E-Mail „…“ an … versendet.“, darunter der
     Anhang — dort „Öffnen“ klicken, der Browser lädt die PDF herunter (immer als Download, so
     gewollt). Die Mail kommt mit Betreff, Text und Anhang an. Nach „Schließen“ zeigt die Karte
     neben „E-Mail schreiben…“ die Zeile „Zuletzt am …
     an … – „Test HR-Portal – bitte ignorieren“ · 1 Anhang“ (einen Öffnen-Verweis hat die Karte
     nicht; später geht das über „E-Mail schreiben…“ → „Bisher gesendete E-Mails (…)“, mit allen
     E-Mails dieses Vorgangs seit dem 02.10.). Im Reiter „E-Mails“ des Vorgangs steht die Mail.
     Auf die Probe-Mail **nicht antworten** — die Antwort ginge an das HR-Postfach.
   - Rote Meldung (etwa „SMTP …“, „Adresse nicht freigegeben“) → Meldung an Claude.
3. **Verbeamtung:** einen Vorgang mit hochgeladenen Unterlagen öffnen, Reiter „Dokumente“.
   **Erwartet:** Jede hochgeladene Datei steht bei ihrer Dokumentart; Arten mit Datei stehen nicht
   mehr auf „Ausstehend“, und nicht mehr alles liegt unter „Weitere Dokumente“.
4. **Vertragsende:** im Dashboard den Bereich Vertragsende öffnen und einen Vorgang ansehen.
   **Erwartet:** Die Seite lädt wie bisher. Hat die Führungskraft schon geantwortet und eine
   Betriebsstätte gewählt, steht bei „Betriebsstätte“ ein Name statt „—“. **Nicht** „Anfrage an
   Vorgesetzten senden →“, „Anfrage erneut senden“ oder „Erinnerung senden“ klicken — das schickt
   echte Mails an Führungskräfte.
5. **Optional (seit 02.10. in Betrieb), Checklisten-Vorlagen:** eine Vorlage zum Bearbeiten
   öffnen. **Erwartet:** je Punkt ein Griff zum Ziehen, zwei Pfeile und „+ Punkt darunter“. Ohne
   Speichern schließen.
6. **Einstellungen → Reiter „Ausstattung & Zugänge“** (nur ansehen, schon in 5.3 Schritt 2
   gelesen). **Erwartet:** die Liste mit 20 Positionen, davon 13 eingeschaltet, darüber die
   Warnungen aus 5.3 Schritt 2; nach Stufe 2 (5.3 Schritt 5) nennen 17 Zeilen „beim Austritt: …“.
   Dazu die Knöpfe „Vorschläge übernehmen…“, „Rückgabe-Vorgaben übernehmen …“ und „+ Position“.
   **Nichts anlegen, nichts ändern, nichts übernehmen** (6.3).
7. **Ein Onboarding öffnen** (am besten eines mit eingereichten Einstellungsmodalitäten; nur
   ansehen). **Erwartet:**
   - Die Seite lädt wie bisher. In der Übersicht steht in der Karte „Person“ die Zeile
     „Arbeitsort“ mit „Wie Einrichtung“ (bei Vorgängen ohne Modalitäten-Link dazu „Ändern…“ —
     nicht klicken).
   - Im Reiter „Checkliste“ steht die Karte „Ausstattung & Zugänge“ mit einem Satz wie „Das
     Formular der Führungskraft enthält diesen Schritt nicht. …“ (so bei jedem Vorgang, dessen
     Vorgesetzten-Link vor dem Update entstand), „Keine Positionen und keine Hinweise an Stellen.“
     oder, bei abgeschlossenen Vorgängen, „… nur noch lesbar.“ Ihre Knöpfe „Position hinzufügen…“
     und „Hinweis an eine Stelle…“ **nicht** klicken (ebenso „Übergabe vermerken …“, falls er
     irgendwo steht — bei Vorgängen von vor dem Update gibt es keine Ausstattungsaufgaben).
8. **Ein laufendes Offboarding öffnen** (nur ansehen). **Erwartet:**
   - Die Seite lädt wie bisher; die Reiter „Exit-Interview“ und „Zeugnis“ sind für Ihr Konto da
     und laden.
   - Der Reiter „Rückgaben“ lädt ohne Fehlermeldung, mit der Kopfzeile „Keine Einstellung
     zugeordnet. …“ und — falls erfasst — den Gegenständen. „Gegenstand hinzufügen …“, „Zustand…“
     und „Einstellung zuordnen …“ **nicht** klicken.
9. **Brief-Vorlagen** (nur ansehen). **Erwartet:** „Rückgabeprotokoll Ausstattung“ steht in der
   Liste, nach 5.3 Schritt 5 auch „Übergabeprotokoll Ausstattung“ (ohne Stufe 2 erscheint es nur
   unter „Deaktivierte Vorlagen anzeigen“ und bleibt dort). „Erzeugen“ nicht klicken.

**Außerdem nicht klicken, das verschickt Mails an andere oder legt Ausstattung oder Ausgaben an**
(zusätzlich zu den Knöpfen in den Punkten 4 und 6 bis 9):

- „Neuer Vorgang“, „Vorgesetzten-Link erstellen“, „Abteilungen informieren…“, Dokumentenpaket
  „Versenden“, „Unterlagen nachfordern…“, unter Einstellungen → Automatische Läufe „Jetzt
  ausführen“;
- „Stellen über die Absage informieren…“ (Onboarding, Karte „Aufgaben für Abteilungen“, bei
  abgelaufenen Vorgängen);
- „Vorgang abschließen“, „Austritt abschließen“, „Trotzdem abschließen“.

### 5.5 Versandprotokoll nach der Probe (nur wenn 5.4 Punkt 2 lief)

Seit dem 02.10. stehen auch echte individuelle E-Mails im Versandprotokoll, und nach dem Bescheid in
5.3 Schritt 6 darf HR wieder welche schicken. Beide Abfragen zählen deshalb nur die Probe: Betreff
wie in 5.4 Punkt 2 **und** seit dem Start (Untergrenze wie in 5.2, `appliedAt` der letzten
Datenmigration). Sie zeigen nur Zahlen, keine Adressen und keinen Text:

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT status, COUNT(1) AS anzahl FROM email_logs WHERE event = $$individuelle-mail$$ AND subject ILIKE $$%Test HR-Portal%bitte ignorieren%$$ AND "createdAt" > (SELECT max("appliedAt") FROM system_migrations) GROUP BY status;'
```

**Erwartet:** eine Zeile `SENT | 1` (je Probe-Mail eine mehr). `FAILED` oder `SKIPPED` → Ausgabe an
Claude. `(0 rows)`, obwohl die Mail ankam → Ausgabe an Claude (dann trägt eine gespeicherte
Vorlage `individuelle-mail` einen eigenen Betreff ohne `{{betreff}}`).

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT COUNT(DISTINCT m.id) AS mails, COUNT(a.id) AS anhaenge FROM individuelle_mails m LEFT JOIN individuelle_mail_anhaenge a ON a."mailId" = m.id WHERE m.betreff ILIKE $$%Test HR-Portal%bitte ignorieren%$$ AND m."createdAt" > (SELECT max("appliedAt") FROM system_migrations);'
```

**Erwartet:** `1 | 1` nach einer Probe-Mail mit einem Anhang (je weitere Probe-Mail mit einem
Anhang beide Zahlen eins höher). Weicht ab → Ausgabe an Claude. Die Gesamtzahl aus 5.2 taugt hier
nicht mehr zum Vergleich, weil HR seit 5.3 Schritt 6 selbst individuelle E-Mails senden darf.

Im Portal zeigt Einstellungen → **Versandprotokoll** dieselbe Mail als „versendet“.

---

## 6 · Handschritte im Portal

Die Einstellungen erreichen nur SUPER_ADMIN und HR_LEITUNG. Mailvorlagen, Webhooks,
Checklisten-Vorlagenpunkte und Stufe 2 sind schon in 5.3 erledigt (früher 6.0).

### 6.1 Freigabeliste pflegen (empfohlen, sobald die Liste von HR vorliegt)

Voraussetzung ist die Antwort von HR auf die erste Bitte der Ankündigung (E-Mail-Endungen;
Abschnitt 0, „Zeitfenster“).
Fehlt sie noch, diesen Schritt verschieben, bis sie da ist — eine unvollständige Liste sperrt neu
eingetippte Adressen von Führungskräften.

Einstellungen → **SMTP** → Feld **„Erlaubte Domains für abweichende Empfänger“**.

- **Wofür sie gilt:** für jede Adresse, die **nicht** im Vorgang hinterlegt ist — im
  Dokumentenpaket, in der individuellen E-Mail, bei „Unterlagen nachfordern“ und bei frei
  eingetippten Adressen von Führungskräften (Vorgesetzten-Link im Onboarding, Führungskraft im
  Offboarding, neu auch bei der Zeugnis-Bewertung im Offboarding). Der Hilfetext unter dem Feld
  nennt nur das Dokumentenpaket; er ist veraltet.
- **Leer heißt: keine Einschränkung** (heutiger Stand). Die im Vorgang hinterlegte Adresse der
  Person geht immer durch, auch an private Postfächer.
- **Eintragen:** die dienstlichen Domains der Einrichtungen, mit Komma getrennt, z. B.
  `fes-minden.de, credo-gruppe.de` — die vollständige Liste von HR. **Keine
  Freemail-Domains** (`gmail.com`, `web.de`, `gmx.de`, `t-online.de` …). Verglichen wird die Domain
  exakt; Unterdomains einzeln eintragen.
- **Folge:** Ab dann lehnt das Portal eine neu eingetippte Führungskraft- oder Empfängeradresse
  mit einer anderen Domain ab. Darum alle Domains aufnehmen, die Führungskräfte und Abteilungen
  benutzen. Einstellungen → **Abteilungen** markiert seit diesem Update Adressen, deren Domain
  nicht auf der Liste steht („Außerhalb der Freigabeliste – Aufgaben gehen trotzdem an diese
  Adresse.“) — ein Hinweis, welche Domain noch fehlt.

Optional, nur lesend und **nicht geprobt**: Welche Domains Führungskräfte und Abteilungen heute
benutzen (nur Domains und Zahlen, keine Namen):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT lower(split_part(adresse, $$@$$, 2)) AS domain, COUNT(1) AS anzahl FROM (SELECT "supervisorEmail" AS adresse FROM onboarding_processes UNION ALL SELECT "supervisorEmail" FROM offboarding_processes UNION ALL SELECT "supervisorEmail" FROM contract_end_processes UNION ALL SELECT email FROM department_configs) x WHERE adresse LIKE $$%@%$$ GROUP BY 1 ORDER BY 2 DESC;'
```

**Erwartet:** eine Liste `domain | anzahl`. Eine Fehlermeldung → nur an Claude melden, für den
Deploy ohne Belang.

Nach dem Speichern: Einstellungen → SMTP zeigt die Liste. Kurz gegenprobieren: Die Seite eines
Vorgangs **neu laden** (`F5` — die Karte liest die Liste nur beim Laden der Seite; ist die Seite aus
5.4 noch offen, kennt sie die neue Liste nicht), dann in der Karte „Individuelle E-Mail“ →
„E-Mail schreiben…“ unter „An“ „Andere Adresse…“ wählen und eine Adresse mit einer **nicht**
eingetragenen Domain eintippen (nicht senden). **Erwartet:** darunter die rote Meldung „An diese
Adresse darf nicht versendet werden: … ihre Domain ist nicht freigegeben.“, „E-Mail senden“ bleibt
gesperrt. Dialog schließen.

### 6.2 Lauf „Aufbewahrung erzeugter Dokumente“: erst Probelauf, dann einschalten

**Warum jetzt:** Der Dialog der individuellen E-Mail sagt seit dem 02.10. zu, dass Text und
Anhänge nach 12 Monaten gelöscht werden. Das tut nur dieser Lauf; ohne ihn geschieht es nie (die
ersten Fristen enden im Oktober 2027). Derselbe Lauf löscht
auch erzeugte Briefe aus Vorlagen nach 12 Monaten (die führende Ablage ist das DMS) und seit diesem
Update die Freitexte und Ausgaben der Ausstattung nach ihren Fristen (heute alles leer). Erzeugte
Briefe gibt es erst seit Juni 2026 — gelöscht wird also frühestens im Juni 2027. Seit Stufe 2
(5.3 Schritt 5) hängen an ihm auch die Nummern der ausgegebenen Stücke, die Kommentare der Stellen
zu Rücknahmen sowie Übergabe- und Rückgabeprotokolle (CLAUDE.md, „Vor dem Einschalten“, Punkt 2):
Ohne ihn liefen die vom DSB bestätigten Fristen ins Leere. Die erste dieser Fristen endet
frühestens sechs Monate nach der ersten Rückgabe bzw. dem ersten Tausch eines Stücks (jeder Zustand
zurück, beschädigt, entfällt oder ersetzt, `ausgabeLoeschenAb`); endet 6.2 im STOPP, bleibt Stufe 2
deshalb an, und Claude klärt den Lauf vorher.

**Vorher HR Bescheid sagen:** Jeder Probelauf schickt eine Berichtsmail an das HR-Postfach (nur
Zahlen, keine Namen). Sie gehört zu diesem Schritt und ist kein Fehler (ohne Antwortadresse, 1.9,
wird sie übersprungen).

1. Einstellungen → **Automatische Läufe** → Karte **„Aufbewahrung erzeugter Dokumente“**
   (Kennzeichen „löscht endgültig“, Status „aus“; die Beschreibung der Karte nennt jetzt auch
   Ausstattung und Ausgaben).
2. **„Probelauf jetzt“** klicken. Nach kurzer Zeit steht unter „Letzter Lauf“ ein Ergebnis mit
   „· Probelauf“; „Protokoll (1)“ aufklappen.
   **Erwartet:** „Letzter Lauf“ zeigt **„ohne Befund“**; im Protokoll fünf Zeilen, alle `0`:
   - „Würde löschen (Dokumente)“
   - „Würde leeren (individuelle E-Mails)“ (alle individuellen E-Mails sind seit dem 02.10.
     entstanden, also jünger als 12 Monate)
   - „Würde leeren (Ausstattung: Bemerkungen, Angaben, Hinweise)“
   - „Würde löschen (Ausgaben nach Ablauf der Frist)“
   - „Ausgaben ohne Löschfrist, älter als drei Jahre“

   „bitte prüfen“ (etwa mit „Antwort unvollständig“), „fehlgeschlagen“, „abgebrochen“ oder eine
   Zahl größer 0 → **STOPP, nicht einschalten, an Claude.** (Nicht in den Generalproben gemessen;
   die Zeilen stehen so im Code.)
3. Uhrzeit `03:15` stehen lassen. Das Kästchen **„als Probelauf“ muss leer sein** — ist der Haken
   gesetzt (der gespeicherte Wert, in 1.8 Spalte `probelauf` = `t`), ihn entfernen. Dann
   **„Einschalten“**. Die Rückfrage „… Er LÖSCHT ab dann täglich endgültig.“ bestätigen. Steht in
   der Rückfrage stattdessen „(als Probelauf)“, abbrechen und das Kästchen prüfen.
   **Erwartet:** Status „an“ (nicht „an · Probelauf“), „Nächster Lauf“ morgen um 03:15.
4. Am nächsten Tag: „Letzter Lauf“ zeigt „ohne Befund“ (ohne „· Probelauf“), im Protokoll alles
   `0`: „Gelöscht: Dokumente / Dateien / Ordner“ `0 / 0 / 0`, „Geleert: individuelle E-Mails /
   Anhänge“ `0 / 0`, „Geleert: Ausstattung – Positionen / Hinweise“ `0 / 0`, „Gelöscht: Ausgaben /
   Rückgaben geleert“ `0 / 0`, „Gelöscht: Übergabe- und Rückgabeprotokolle – hochgeladen /
   erzeugt“ `0 / 0`, „Ausgaben ohne Löschfrist, älter als drei Jahre“ `0`. Eine Berichtsmail kommt
   nur bei Problemen.

### 6.3 Nicht tun

Diese Liste gilt für den ganzen Ablauf; andere Stellen verweisen hierher.

- Die neuen Vorlagen `onboarding-department-abgesagt` und `onboarding-ausstattung-offen` unter
  E-Mail-Vorlagen **nicht speichern** (ansehen und „Test senden“ an die eigene Adresse sind in
  Ordnung). Die Vorlage „Individuelle E-Mail aus einem Vorgang“ (`individuelle-mail`) ist seit dem
  02.10. in Betrieb; was HR dort seitdem gespeichert hat, bleibt, wie es ist.
- Außer der Aufbewahrung aus 6.2 **keine weiteren Läufe einschalten**, kein „Jetzt ausführen“
  (die übrigen zehn bleiben aus, auch „Onboarding-Erinnerungen“; siehe „Danach“ in Abschnitt 9).
- **Stufe 2 nur über 5.3 Schritt 5**, genau einmal:
  - „Beim Austritt“, „Rückgabekategorie“ und die Beschriftung der Nummer **nicht von Hand** im
    Positionsdialog setzen oder ändern. Die Vorgaben decken alle 17 Positionen ab, die eine
    brauchen; jede Änderung von Hand ist eine Katalogänderung (Protokoll
    `AUSSTATTUNG_POSITION_GEAENDERT`) und schließt den Rückweg aus 7.3 (Weg A).
  - Ein zweites „Rückgabe-Vorgaben übernehmen …“ ist unnötig, aber harmlos: Der Knopf im Dialog
    ist gesperrt, und der Server setzt nur an Positionen mit leerem „Beim Austritt“ und schreibt
    ohne Änderung kein Protokoll (`rueckgabeVorgabenUebernehmen`).
  - Endete 5.3 Schritt 4 im STOPP (aktiver Offboarding-Webhook): weder „Rückgabe-Vorgaben
    übernehmen …“ noch „Übergabeprotokoll Ausstattung“ reaktivieren — erst nach der Klärung
    (Abschnitt 9, „Danach“). Ab „Beim Austritt“ stehen auf der Link-Seite der Offboarding-Stelle
    Nummern der Gegenstände, und der Webhook bekommt deren Link (Regel 29 in CLAUDE.md).
  - „Vorschläge übernehmen…“ schaltet Stufe 2 nie ein (`VORSCHLAEGE` trägt keine A4-Werte). Mit dem
    vollständigen Standardkatalog legt es nichts an und schreibt kein Protokoll (Meldung „Alle
    Vorschläge stehen schon im Katalog. Es wurde nichts angelegt.“) — harmlos, aber zwecklos.
- **Am Tag des Updates den Katalog sonst nicht ändern** (kein „+ Position“, nichts ein- oder
  ausschalten, nichts ausblenden, keine Personengruppen) und in der Probe weder in der
  Onboarding-Karte „Ausstattung & Zugänge“ „Position hinzufügen…“, „Hinweis an eine Stelle…“ oder
  „Übergabe vermerken …“ klicken (legt sofort Aufgaben bzw. Ausgaben an) noch im Offboarding
  „Einstellung zuordnen …“ (schreibt die Zuordnung, mit Ausgaben auch Rücknahme- und
  Sperraufgaben). Jede solche Änderung schließt den Rückweg aus 7.3 (Weg A). Die Pflege des
  Katalogs beginnt danach im Betrieb (Abschnitt 9, „Danach“); „Einstellung zuordnen …“ benutzt HR
  nach dem Kurztext (8.1, Punkt 13).
- **Nie `node prisma/seed.js`** im Container ausführen — ältere Anleitungen nennen den Befehl noch.
- Keine Knöpfe, die Mails an andere schicken (Liste in 5.4).

---

## 7 · Rückfall

### 7.1 Was man NICHT tun darf

- **Das alte Image mit normalem Entrypoint starten, ohne vorher 7.3 Schritt 2 und Schritt 5
  durchzugehen.** Sein Entrypoint sähe die sieben neuen Tabellen und die 19 neuen Spalten an
  sieben bestehenden Tabellen als überzählig an und löschte sie mit `db push --accept-data-loss`
  ohne Rückfrage — samt allem, was darin steht: den Katalog „Ausstattung & Zugänge“ samt „Beim
  Austritt“, Ausgaben mit ihren Nummern, Arbeitsort, Rückgabe-Zustände, Absagen, gestrichene
  Ausstattungsaufgaben. Gibt es ein hochgeladenes Übergabeprotokoll, scheiterte sein Push am Enum
  `DocumentType`, und der alte Container hinge in einer Neustart-Schleife. Dasselbe gilt für
  `sudo git checkout b6e1c8a` mit neuem Build. (Ohne Entrypoint: Weg C, 7.5.) Die Tabellen der
  individuellen E-Mail bleiben beim Rückfall auf `b6e1c8a` stehen — das Image kennt sie.
- **Ein Image älter als `b6e1c8a` starten** — etwa ein Etikett `7bc91ec` oder `ae490ba` aus
  früheren Deploys, ein echtes `f6d3daf`-Image oder ein Build aus `sudo git checkout f6d3daf`. Dessen
  Entrypoint löschte **zusätzlich** `individuelle_mails` und `individuelle_mail_anhaenge` — also die
  Nachweise aller individuellen E-Mails seit dem 02.10.; ihre Dateien unter
  `uploads/individuelle-mails/` blieben verwaist liegen. Zurück geht es nur auf
  `hr-portal-app:b6e1c8a` (2.1).
- `sudo docker compose down -v` — löscht Datenbank und Uploads.
- **Kein `docker image prune -a` und kein `docker system prune -a`**, solange ein Rückweg offen
  sein soll. Beide löschen jedes Image, das kein Container nutzt — auch das etikettierte
  `hr-portal-app:b6e1c8a`, denn nach 4.2 läuft kein Container mehr damit. Danach gäbe es weder
  Weg A noch Weg B noch Weg C, und Weg A baute ohne Image womöglich aus dem neuen Code. Fehlt
  Platz, an Claude (1.5).
- `node prisma/seed.js` (6.3) — im alten Image steckt zudem noch der alte Seed, der gepflegte
  Mandantennamen, Fragebogen- und Checklisten-Vorlagen überschreibt.
- `git clean`, `git add -A`, `git stash -u` im Projektordner — sammelt oder löscht die Sicherungen.
- Eine Entrypoint-Sicherung (`vor-schema-abgleich-…`, `pg_dump` 18) in die Datenbank einspielen —
  sie scheitert an PostgreSQL 16 und hinterließe ein leeres Schema (Lehre 3 vom 24.09.). Die erste
  Generalprobe zeigte dazu: Die Datei enthält `\restrict` und `SET transaction_timeout`; ein psql
  vor 16.10 kennt `\restrict` nicht, und auch mit psql 16.12 lief das Einspielen nur mit zwei
  Fehlermeldungen durch. Eingespielt wird nur die Sicherung aus 4.1 (Weg B).

### 7.2 Erst entscheiden: vorwärts oder zurück

**Vorwärts reparieren ist fast immer besser:** Ein Fehler im Code wird mit einem neuen Commit
behoben und neu ausgerollt. Ändert sich das Schema dabei nicht, meldet der Entrypoint „bereits
deckungsgleich“ und macht weder Sicherung noch Push. **Zurück nur nach Rücksprache mit Claude.**

### 7.3 Weg A: altes Image, solange in den neuen Teilen nichts gearbeitet wurde

**Was der Rückweg tut.** Das alte Image ist das vom 02.10. mit `b6e1c8a` (Etikett aus 2.1). Es
kennt Paket 3: Die Tabellen der individuellen E-Mail, ihre Zeilen und die Dateien unter
`uploads/individuelle-mails/` bleiben stehen, und die Karte „Individuelle E-Mail“ geht weiter.
Sein Entrypoint löscht (in der dritten Generalprobe vorab gerechnet, nicht ausgeführt) sieben
Tabellen, 20 Fremdschlüssel, 19 Spalten an sieben **bestehenden** Tabellen und sieben Indizes und
baut das Enum `DocumentType` ohne `UEBERGABEPROTOKOLL` neu. Spalten an Bestandstabellen zu löschen
ist genau das, was die früheren Anleitungen verboten haben
([deploy-paket4-stufe1.md](deploy-paket4-stufe1.md), 7.1). Die vorige Fassung (`ea2d41d`) rechnete
mit dem Image `f6d3daf` und deshalb mit neun Tabellen und 23 Fremdschlüsseln — samt den Tabellen
der individuellen E-Mail; das gilt nicht mehr (7.1, zweiter Punkt).

**Warum Weg A trotzdem bleibt — unter einer harten Bedingung.** Solange niemand in den neuen
Teilen gearbeitet hat, steht in diesen Spalten nichts von Wert: `checklist_items.eilt` ist überall
`false` (der Standard), `supervisor_data.mitAusstattung` überall `false` (von der Migration
gesetzt, ableitbar), und `onboarding_processes.expiredAt` ist nur der Anker einer Löschfrist für
Ausstattungsdaten, die es nicht gibt. Verloren ginge dann nur der **Standardkatalog** (20
Positionen) samt den „Beim Austritt“-Werten aus 5.3 Schritt 5 — beides lässt sich bei einem
späteren Deploy genauso neu anlegen (unten). **Stufe 2 ändert daran nichts, solange es keine
Ausgaben gibt:** Sie setzt nur drei Katalogfelder an 17 Positionen und schreibt einen
AuditLog-Eintrag; Ausgaben (`g1_ausgaben`), Übergabeprotokolle (`g1_uebergabeprotokolle`),
Rücknahme- und Sperraufgaben (`g1_off_aufgaben`) und Rückgaben aus Ausgaben
(`g1_rueckgaben_aus_ausgabe`) entstehen erst, wenn jemand eine Übergabe vermerkt oder einen Austritt
einer Einstellung zuordnet — und eine Übergabe setzt eine Ausstattungsaufgabe voraus, also einen
Vorgesetzten-Link nach dem Update (`g1_modalitaeten`) oder die Karte (`g1_ausstattung`). Schritt 2
prüft das **lesend und vollständig**, bevor das Portal angehalten wird, Schritt 6a noch einmal
danach. Ist auch nur ein Wert der Gruppen `g1_` oder `g2_` größer 0, ist `std_katalog` nicht `20`
oder passt das Paar `std_stufe2_…` nicht zu 5.3 Schritt 5, gibt es **keinen** Weg A — dann
vorwärts reparieren, Weg C (7.5) oder Weg B (7.4), nur mit Claude. Das tritt schon ein, sobald nach
dem Start ein Link an eine Führungskraft mit dem neuen Schritt erzeugt wurde (`g1_modalitaeten`;
„Vorgesetzten-Link erstellen“ oder Anlegen eines Onboardings mit E-Mail der Führungskraft). Bis zur
Mail aus 8.1 bittet 5.3 Schritt 6 HR, keinen solchen Link zu erzeugen — Weg A ist also ein Rückweg
für die ersten Stunden.

**Was auch nach Weg A stehen bleibt** (der Rückweg fasst es nicht an):

- die drei neuen Merker in `system_migrations` — vor einem späteren erneuten Deploy entfernt Claude
  den Merker `SUPERVISOR_MIT_AUSSTATTUNG_V1` (sonst bliebe die neu angelegte Spalte leer) und den
  Merker `AUSSTATTUNG_STANDARDKATALOG_V1` (sonst bliebe der Katalog leer, der Start meldete dann
  `… bereits gelaufen, Katalog leer - nichts angelegt.`); die AuditLog-Einträge
  `AUSSTATTUNG_STANDARDKATALOG_ANGELEGT` und `AUSSTATTUNG_RUECKGABE_VORGABEN_UEBERNOMMEN` bleiben
  als Nachweis. Der neu angelegte Katalog trägt wieder kein „Beim Austritt“: Nach diesem späteren
  Deploy unter Brief-Vorlagen zuerst „Rückgabeprotokoll Ausstattung“ reaktivieren (es gehört zu
  Stufe 1, ist nach Weg A deaktiviert, siehe unten, und der Seed-Check schaltet es nicht wieder
  ein — auch ohne Stufe 2), dann in 5.3 die Schritte 4 und 5 wiederholen (Webhooks,
  Übergabeprotokoll, Rückgabe-Vorgaben). Weil die AuditLog-Einträge vom ersten Mal bleiben,
  stehen die Zählungen dann je um 1 höher: die Prüfabfrage zum Standardkatalog in 5.2 zeigt
  `0 | 20 | 13 | 2`, die zweite Prüfabfrage in 5.3 Schritt 5 `2 | 2` — beides ist dann richtig;
- die zwei neuen System-Vorlagen. „Rückgabeprotokoll Ausstattung“ und — nach 5.3 Schritt 5 —
  „Übergabeprotokoll Ausstattung“ sind eingeschaltet, ihre Dateien fehlen im alten Image: nach
  Weg A unter Brief-Vorlagen beide deaktivieren (der Seed-Check eines späteren Deploys schaltet
  sie nicht wieder ein, `planeSystemVorlage` — nach einem späteren Deploy also von Hand wieder
  einschalten, siehe oben);
- die Hinweise an den Sperrpunkten der Offboarding-Checklisten-Vorlagen (das alte Image zeigt sie
  bei neuen Austritten an; nur kosmetisch, die alten Werte stehen im Merker), ebenso die in 5.3
  Schritt 3 aufgeräumten Checklisten-Vorlagenpunkte (im alten Image fehlt dafür der Katalog — vor
  dem Rückfall mit Claude klären, ob sie wieder eingetragen werden);
- die in 5.3 Schritt 1 zurückgesetzten Mailvorlagen mit neuem Text und die in Schritt 4 gelöschten
  Webhooks. Für `supervisor-link-created`/`supervisor-completed` ist das unkritisch (die neuen
  Blöcke bleiben leer). Wurden `onboarding-department-assigned` oder `onboarding-task-completed`
  zurückgesetzt, **vor Schritt 10** mit Claude auf den alten Text zurückstellen (Quelle
  `vor-deploy-main-2026-10-manuell.sql`): Das alte Image liefert `hat_offene_aufgaben`,
  `meldung_kurz`, `ist_erledigt` und `nur_kommentar` nicht — die Stellen bekämen ihre Zuweisung
  ohne Aufgabenliste, HR bekäme „Onboarding-Aufgabe : …“ ohne Text;
- ein in 4.1 per Handgriff 0 ausgeschaltetes `onboarding-task-completed` bleibt aus — nur, wenn
  5.3 Schritt 1 noch nicht lief; danach ist es wieder an (siehe oben).

Bis zum Anhalten in Schritt 6 läuft das Portal unverändert weiter. Bei jedem STOPP ab Schritt 4
(die Override-Datei ist dann angelegt) nur Befehl E ausführen, dann Ausgabe an Claude. Bei einem
STOPP in Schritt 2 oder 3 ist nichts aufzuräumen.

Befehl E (nur bei STOPP):

```bash
sudo rm docker-compose.override.yml
```

**Erwartet:** keine Ausgabe.

**Schritt 1 — Projektordner:**

```bash
cd /vol/container/HR_Portal_CREDO
```

**Vor Schritt 2: HR bitten, ab jetzt nichts mehr im Portal zu speichern** (Zeitraum wie in
4.1). Was danach noch geschrieben würde, löschte Schritt 10 ohne Hinweis.

**Schritt 2 — prüfen, was verloren ginge** (nur lesend; eine lange Zeile, die Ausgabe steht
untereinander):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -x -c 'SELECT (SELECT COUNT(1) FROM individuelle_mails) AS info_ind_mails, (SELECT COUNT(1) FROM individuelle_mail_anhaenge) AS info_ind_anhaenge, (SELECT COUNT(1) FROM ausstattungs_positionen) AS std_katalog, (SELECT COUNT(1) FROM ausstattungs_positionen WHERE "beiAustritt" IS NOT NULL OR "rueckgabeKategorie" IS NOT NULL OR "ausgabeKennung" IS NOT NULL) AS std_stufe2_positionen, (SELECT COUNT(1) FROM audit_logs WHERE action = $$AUSSTATTUNG_RUECKGABE_VORGABEN_UEBERNOMMEN$$) AS std_stufe2_protokoll, (SELECT COUNT(1) FROM audit_logs WHERE action IN ($$AUSSTATTUNG_POSITION_ANGELEGT$$, $$AUSSTATTUNG_POSITION_GEAENDERT$$, $$AUSSTATTUNG_POSITION_GELOESCHT$$, $$AUSSTATTUNG_AUSBLENDUNG_GEAENDERT$$, $$AUSSTATTUNG_VORSCHLAEGE_UEBERNOMMEN$$)) AS g1_katalog_geaendert, (SELECT COUNT(1) FROM ausstattungs_ausblendungen) AS g1_ausblendungen, (SELECT COUNT(1) FROM onboarding_ausstattung) AS g1_ausstattung, (SELECT COUNT(1) FROM onboarding_ausstattung_aufgaben) AS g1_ausst_aufgaben, (SELECT COUNT(1) FROM onboarding_stellen_hinweise) AS g1_stellen_hinweise, (SELECT COUNT(1) FROM onboarding_ausstattung_aenderungen) AS g1_ausst_aenderungen, (SELECT COUNT(1) FROM ausgaben) AS g1_ausgaben, (SELECT COUNT(1) FROM documents WHERE type::text = $$UEBERGABEPROTOKOLL$$) AS g1_uebergabeprotokolle, (SELECT COUNT(1) FROM checklist_items WHERE herkunft IS NOT NULL OR eilt OR "entfaelltAm" IS NOT NULL OR "ausgabenGeloeschtAm" IS NOT NULL) AS g1_ob_aufgaben, (SELECT COUNT(1) FROM supervisor_data WHERE "mitAusstattung" IS TRUE OR "ausgabenAngeboten" IS NOT NULL OR "ausstattungGespeichertAm" IS NOT NULL) AS g1_modalitaeten, (SELECT COUNT(1) FROM onboarding_processes WHERE "ausgabenGeloeschtAm" IS NOT NULL OR "ausstattungSammelmailAm" IS NOT NULL) AS g1_ob_merker, (SELECT COUNT(1) FROM offboarding_checklist_items WHERE herkunft IS NOT NULL OR "ausgabeId" IS NOT NULL) AS g1_off_aufgaben, (SELECT COUNT(1) FROM return_items WHERE "ausgabeId" IS NOT NULL) AS g1_rueckgaben_aus_ausgabe, (SELECT COUNT(1) FROM offboarding_processes WHERE "ausgabenGeloeschtAm" IS NOT NULL) AS g1_off_merker, (SELECT COUNT(1) FROM onboarding_processes WHERE "arbeitsortId" IS NOT NULL) AS g2_ob_arbeitsort, (SELECT COUNT(1) FROM return_items WHERE zustand IS NOT NULL) AS g2_rueckgabe_zustand, (SELECT COUNT(1) FROM offboarding_processes WHERE "weitereBeschaeftigung" IS NOT NULL OR "arbeitsortId" IS NOT NULL) AS g2_off_zuordnung, (SELECT COUNT(1) FROM offboarding_department_links WHERE "abgesagtAm" IS NOT NULL) AS g2_absagen, (SELECT COUNT(1) FROM onboarding_processes WHERE "expiredAt" IS NOT NULL) AS info_ob_expired_at, (SELECT COUNT(1) FROM offboarding_processes WHERE "onboardingId" IS NOT NULL) AS info_off_zugeordnet;'
```

**Erwartet:**

- `info_ind_mails` und `info_ind_anhaenge` beliebig: Die individuellen E-Mails bleiben beim
  Rückfall auf `b6e1c8a` erhalten (das Image kennt sie, Schritt 5 zeigt kein `DROP` dafür). Die
  vorige Fassung (`ea2d41d`) machte daraus eine Bedingung für Weg A, weil sie mit dem Image
  `f6d3daf` rechnete — sie entfällt;
- `std_katalog` = `20` (der Standardkatalog aus 4.3; er geht verloren und wird bei einem späteren
  Deploy neu angelegt, siehe oben);
- `std_stufe2_positionen` = `17` und `std_stufe2_protokoll` = `1`, wenn 5.3 Schritt 5 lief (Stufe
  2 an); `0` und `0`, wenn Stufe 2 ausgelassen wurde. Jedes andere Paar heißt, dass „Beim Austritt“
  von Hand geändert wurde;
- **alle** Zeilen mit `g1_` und `g2_` = `0`;
- `info_ob_expired_at` und `info_off_zugeordnet` beliebig (die erste geht verloren und ist
  hinnehmbar, die zweite bleibt erhalten).

**Die Zahlen notieren** — Schritt 6a vergleicht mit ihnen.

Weicht etwas ab → **STOPP, kein Weg A, Ausgabe an Claude.** Ebenso, wenn in 5.3 Schritt 1
`onboarding-department-assigned` oder `onboarding-task-completed` zurückgesetzt wurden (siehe
„Was auch nach Weg A stehen bleibt“) — dann zuerst Claude, die alten Texte kommen aus der
Sicherung. Was die Zeilen bedeuten: `g1_katalog_geaendert` sind Änderungen am Katalog seit dem
Update, ohne „Rückgabe-Vorgaben übernehmen …“ (das zählt `std_stufe2_protokoll`; gingen
verloren); `g1_ausgaben` sind vermerkte Übergaben samt Nummern (Stufe 2); `g1_modalitaeten` sind
Vorgesetzten-Links mit dem neuen Schritt; `g1_uebergabeprotokolle` größer 0 ließe den alten
Container gar nicht erst starten (Enum); `g2_ob_arbeitsort` sind Arbeitsorte, die die Empfänger
der Abteilungsaufgaben bestimmen; `g2_rueckgabe_zustand` sind Rückgaben mit Zustand (im alten
Image wieder „offen“); `g2_off_zuordnung` sind Angaben zur Zuordnung eines Austritts (weitere
Beschäftigung, Arbeitsort); `g2_absagen`
sind verschickte Absagen (nach einem späteren Deploy würde die Absage erneut angeboten);
`g1_ob_aufgaben` enthält gestrichene Ausstattungsaufgaben, die im alten Image wieder als offen
gälten.

**Schritt 3 — das alte Image ist noch da** (nur lesend):

```bash
sudo docker image ls hr-portal-app
```

**Erwartet:** eine Zeile `hr-portal-app   b6e1c8a` (aus 2.1). Fehlt sie → **STOPP, kein Weg A,
Ausgabe an Claude** — ohne das Image versuchte Docker in Schritt 5 womöglich, es neu zu bauen, und
zwar aus dem neuen Code. **Nie** ein anderes Etikett nehmen: `7bc91ec` und `ae490ba` sind älter
als `b6e1c8a`, und ein Etikett `f6d3daf` gab es entweder nie, ist nach 2.1 entfernt oder zeigt auf
ein anderes Image (7.1).

Worauf das Etikett zeigt (nur lesend; dieselbe Prüfung gilt als Voraussetzung für Weg B und
Weg C):

```bash
sudo docker image inspect --format '{{.Id}}' hr-portal-app:b6e1c8a
```

**Erwartet:** genau `sha256:5b1a01dd32efde8c7de85f0f78204e994614fe4d1c399554c5a1b06002fa9f72`
(die ID aus 1.2 und 2.1). Eine andere ID — etwa die des neuen Images, wenn das Etikett nach dem
Build verrutscht ist — oder eine Fehlermeldung → **STOPP, kein Weg A, Ausgabe an Claude.**

**Schritt 4 — Override-Datei anlegen** (wirkt erst beim Start in Schritt 10):

```bash
printf 'services:\n  app:\n    image: hr-portal-app:b6e1c8a\n' | sudo tee docker-compose.override.yml
```

**Erwartet:** genau diese drei Zeilen:

```
services:
  app:
    image: hr-portal-app:b6e1c8a
```

**Schritt 5 — Vorschau, was das alte Image tun wird** (nur lesend, das Portal läuft weiter):

```bash
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** keine Ausgabe oder nur harmlose Hinweise (Kasten „Update available …“ von Prisma,
Zeilen `npm notice`). Eine Fehlermeldung (etwa `No such image` oder `Error`) → **STOPP: Befehl E,
Ausgabe an Claude.**

Die Zahlen unten wurden in der dritten Generalprobe genau so gemessen (nach dem Start von
`0974b7f` gegen die Schema-Datei von `b6e1c8a` gerechnet, 147 Zeilen; dieselben Zeilen ergibt die
Rechnung Schema gegen Schema). Die vorige Fassung (`ea2d41d`) erwartete 9/23 — das war der Rückweg
auf `f6d3daf`.

```bash
grep -c 'DROP TABLE' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** `7`.

```bash
grep -c 'DROP CONSTRAINT' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** `20` (alle neuen Fremdschlüssel; beim Fremdschlüssel an
`offboarding_processes."onboardingId"` fällt nur die Einschränkung weg, Spalte und Werte bleiben).

```bash
grep -c 'DROP COLUMN' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** `19` (genau die 19 Spalten aus 3.4).

```bash
grep -c 'DROP INDEX' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** `7` (die Indizes an bestehenden Tabellen; die der neuen Tabellen fallen mit ihnen).

```bash
grep 'DROP TABLE' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** genau diese sieben Zeilen, **Reihenfolge egal** (in der dritten Generalprobe
alphabetisch) — **keine** Zeile mit `individuelle`:

```
DROP TABLE "ausgaben";
DROP TABLE "ausstattungs_ausblendungen";
DROP TABLE "ausstattungs_positionen";
DROP TABLE "onboarding_ausstattung";
DROP TABLE "onboarding_ausstattung_aenderungen";
DROP TABLE "onboarding_ausstattung_aufgaben";
DROP TABLE "onboarding_stellen_hinweise";
```

Gegenprobe, dass das alte Image die individuellen E-Mails kennt:

```bash
grep -c individuelle ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** `0` (so in der dritten Generalprobe). Eine Zahl größer 0 heißt, dass das Image
älter als `b6e1c8a` ist und die individuellen E-Mails löschte → **STOPP: Befehl E, Ausgabe an
Claude.**

```bash
grep -c -v -E '^--|^$|DROP' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** `8` — der Neubau des Enums, sonst nichts.

```bash
grep -n -v -E '^--|^$|DROP' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** genau diese acht Zeilen (die Zeilennummern vorn dürfen abweichen; die
`CREATE TYPE`-Zeile ist lang und nennt alle alten Dokumenttypen, **ohne** `UEBERGABEPROTOKOLL`):

```
2:BEGIN;
3:CREATE TYPE "DocumentType_new" AS ENUM ('ARBEITSVERTRAG', 'FUEHRUNGSZEUGNIS', …);
5:ALTER TABLE "documents" ALTER COLUMN "type" TYPE "DocumentType_new" USING ("type"::text::"DocumentType_new");
6:ALTER TABLE "form_templates" ALTER COLUMN "requiredDocuments" TYPE "DocumentType_new"[] USING ("requiredDocuments"::text::"DocumentType_new"[]);
7:ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";
8:ALTER TYPE "DocumentType_new" RENAME TO "DocumentType";
10:ALTER TABLE "form_templates" ALTER COLUMN "requiredDocuments" SET DEFAULT ARRAY['GEBURTSURKUNDE_EIGEN', 'GEBURTSURKUNDE_KIND']::"DocumentType"[];
11:COMMIT;
```

Weicht in Schritt 5 eine Zahl oder Zeile ab → **STOPP, nicht anhalten: Befehl E, Ausgabe an Claude**
(dazu die Datei `~/deploy-main-2026-10/rueckfall-delta.sql`). Das Portal läuft unverändert weiter.

**Schritt 6 — Portal anhalten.** Ab hier ist das Portal nicht erreichbar.

```bash
sudo docker compose stop app
```

**Erwartet:** `Container hr-portal-app  Stopped`.

**Schritt 6a — Prüfung bei angehaltenem Portal wiederholen:** denselben Befehl wie in Schritt 2
noch einmal ausführen (öffentliche Links ließen sich bis zum Anhalten nicht sperren).

**Erwartet:** genau dieselben Zahlen wie in Schritt 2. Weicht eine Zahl ab (zwischen Schritt 2
und dem Anhalten wurde gearbeitet) → **STOPP:** Befehl E, dann Befehl B aus 4.1
(`sudo docker compose start app`, startet den angehaltenen neuen Container wieder), Ausgabe an
Claude.

**Schritt 7 — Sicherung des jetzigen Stands** (falls der Rückfall selbst scheitert):

```bash
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-rueckfall-$(date +%Y%m%d-%H%M%S).sql'
```

**Erwartet:** keine Ausgabe.

**Schritt 8 — Sicherung prüfen** (sucht die neueste `vor-rueckfall-…`-Datei, ohne Sternchen):

```bash
sudo sh -c 'cd /vol/container/HR_Portal_CREDO/backups && f="$(ls -1t | grep "^vor-rueckfall-" | head -1)" && ls -l "$f" && grep -c "PostgreSQL database dump complete" "$f"'
```

**Erwartet:** zwei Zeilen — die Datei `vor-rueckfall-JJJJMMTT-HHMMSS.sql` mit um 1,5 MB oder mehr
(etwa so groß wie `vor-deploy-main-2026-10-manuell.sql` aus 4.1), darunter `1`.

**Schritt 9 — nur bei Abweichung in Schritt 8** (Datei fehlt, deutlich unter 1 MB, oder `0`):
**STOPP** — erst Befehl E, dann Befehl B aus 4.1 (`sudo docker compose start app`, startet den
angehaltenen neuen Container wieder), dann Ausgabe an Claude.

**Schritt 10 — altes Image starten:**

```bash
sudo docker compose up -d --no-build app
```

**Erwartet:** `hr-portal-app` wird neu angelegt (`Recreate`/`Recreated`, dann `Started`); eine
Zeile `hr-portal-db  Running` oder `Healthy` ist in Ordnung. Weicht ab → **STOPP, Ausgabe an
Claude.**

**Schritt 11 — Startlog ansehen:**

```bash
sudo docker compose logs -f app
```

**Erwartet** (nicht geprobt): `Schema-Unterschied erkannt — Sicherung wird angelegt...`,
`Sicherung abgelegt: …`, `Datenbank-Schema wird synchronisiert...`, eine Warnung
`⚠️  There might be data loss …` — hier **erwartet**, solange ihre Punkte nur die sieben Tabellen,
die 19 Spalten aus Schritt 5 oder den Enum-Wert `UEBERGABEPROTOKOLL` nennen —,
`Datenbank-Schema synchronisiert.`, voraussichtlich `System-Vorlage (Fuehrungszeugnis) ist
aktuell.` (alte Schreibweise), `Datenbank bereits geseeded …`,
`[Zeitplaner] Uhr gestartet (jede Minute).`, `✓ Ready in …`. Sobald `✓ Ready` und eine
`[Zeitplaner]`-Zeile da sind, `Strg+C` (beendet nur die Anzeige). Ein Fehler mit `DocumentType`
oder `invalid input value for enum`, jede andere Warnung, `FATAL` oder nach 3 Minuten kein
`✓ Ready` → `Strg+C`, **STOPP, Ausgabe an Claude**; die Fehlerbilder und Befehl D stehen in 4.4
(bei `Restarting` sofort Befehl D). Sonst danach 5.1 wiederholen.

**Nach Weg A:**

- Die Override-Datei bleibt, solange das alte Image laufen soll. Solange sie existiert, **nie**
  `sudo docker compose up -d --build` — der neue Build bekäme sonst das Etikett
  `hr-portal-app:b6e1c8a` und überschriebe das alte Image. Vor dem nächsten Vorwärts-Deploy wird
  sie mit Befehl E gelöscht.
- Unter Brief-Vorlagen „Rückgabeprotokoll Ausstattung“ und — falls 5.3 Schritt 5 lief —
  „Übergabeprotokoll Ausstattung“ deaktivieren (oben, „Was auch nach Weg A stehen bleibt“). Lief
  Handgriff 0 und kam Weg A vor 5.3 Schritt 1: `onboarding-task-completed` mit Claude klären,
  bevor sie wieder eingeschaltet wird.
- Stufe 2 ist mit dem Katalog weg; die Stellen sehen im alten Image ohnehin keine Übergaben. Der
  Kurztext (Abschnitt 8) geht dann nicht hinaus, bevor Claude ihn angepasst hat.
- Der Repo-Stand bleibt `main`; die Reparatur kommt als neuer Commit. Sicherungen
  `vor-deploy-main-2026-10-…` und `vor-rueckfall-…` aufheben.

### 7.4 Weg B: Sicherung aus 4.1 einspielen (nur mit Claude, nicht geprobt)

Nur, wenn Weg A nicht geht oder die Datenbank selbst beschädigt ist, und nur direkt nach dem
Update: Weg B verwirft **alles**, was seit 4.1 geschrieben wurde, in allen Tabellen (auch
Fragebögen über öffentliche Links, Abhaken der Stellen über ihre Links, und alles, was HR seit
dem Bescheid in 5.3 Schritt 6 gearbeitet hat). Was dabei schon **außerhalb der Datenbank**
geschah, holt Weg B nicht zurück: Mails, die seit 5.3 Schritt 6 hinausgingen — darunter
individuelle E-Mails und Dokumentenpakete —, verlieren ihren Nachweis (`individuelle_mails`,
`email_logs`, AuditLog, Versandnachweise), obwohl sie zugestellt wurden; ihre Anhänge und andere
seitdem abgelegte Dateien bleiben verwaist unter `uploads/` liegen (etwa
`uploads/individuelle-mails/`). Ob diese Nachweise aus der Sicherung des jetzigen Stands
(`vor-rueckfall-…`, unten) nachgetragen werden, klärt Claude vorher.

Ablauf grundsätzlich wie in [deploy-paket4-stufe1.md](deploy-paket4-stufe1.md), Abschnitt 7.3, in
dieser Reihenfolge: (1) die Prüfung „ob gearbeitet wurde“ aus
[deploy-onboarding-pakete-2026-09.md](deploy-onboarding-pakete-2026-09.md), Abschnitt 7.3, und
hier 7.3 Schritt 3 (beide Befehle: Etikett da, ID richtig); (2) Portal anhalten und den jetzigen
Stand sichern wie hier in 7.3 Schritt 6 bis 8; (3) die Sicherung
`backups/vor-deploy-main-2026-10-manuell.sql` einspielen; (4) Override-Datei mit
`image: hr-portal-app:b6e1c8a`, der Schema-Vergleich muss `0` zeigen; (5) erst dann starten.
**Aus dem dortigen Block nie die Datei `vor-deploy-paket4-manuell.sql` und nie das Etikett
`7bc91ec` übernehmen:** Beide liegen auf dem Server noch vor und passen zueinander, sodass der
Schema-Vergleich des Blocks `0` zeigte — die Datenbank stünde dann still wieder auf dem 30.09.
(alles seither verworfen, auch alle individuellen E-Mails seit dem 02.10.), und es liefe ein Image
ohne Paket 3. Der dortige Block ist außerdem mehrzeilig und hält sich nicht an die Kopierregel
dieser Anleitung. Die genauen Befehle gibt Claude im Ernstfall, je Kasten eine Zeile. Die Uploads
bleiben, wie sie sind; das Archiv aus 4.1 ist nur für einen Schaden am Volume da.

### 7.5 Weg C: altes Image ohne Entrypoint (nur mit Claude, nicht geprobt)

Für den Fall, dass 7.3 Schritt 2 nicht wie erwartet ausfällt —
Arbeitsorte, Rückgabe-Zustände, Katalogänderungen, Ausgaben oder andere Ausstattungsdaten also
bleiben sollen. Dann gehen weder Weg A (löschte sie) noch Weg B (verwürfe alles seit 4.1). Wie in
[deploy-paket4-stufe1.md](deploy-paket4-stufe1.md), Abschnitt 7.4: das alte Image über eine
Override-Datei mit `image: hr-portal-app:b6e1c8a` **und** `entrypoint: ["node", "server.js"]`
starten — vorher 7.3 Schritt 3 (beide Befehle: Etikett vorhanden, ID `sha256:5b1a01dd32ef…`).
Ohne Entrypoint gibt es weder Sicherung noch Push noch Seed-Check; Tabellen und Spalten
bleiben samt Inhalt stehen, der alte Code kennt sie nicht. Das hat Folgen, die Claude im Ernstfall
vorher prüft: Gestrichene Ausstattungsaufgaben erscheinen im alten Image als offen, Arbeitsorte und
Rückgabe-Zustände werden nicht beachtet, und ein hochgeladenes Übergabeprotokoll (ein Dokumenttyp,
den der alte Code nicht kennt) kann Dokumentlisten scheitern lassen. Mit Stufe 2 kommt dazu:
Vermerkte Ausgaben und ihre Nummern bleiben in der Tabelle, aber weder Karte noch Link-Seite zeigen
sie, Rücknahme- und Sperraufgaben stehen im alten Offboarding voraussichtlich als gewöhnliche
Aufgaben ohne Zustand (nicht geprüft), und der Lauf, der Ausgaben nach Frist löscht, fehlt dem alten
Image. Die Karte „Ausstattung & Zugänge“ gibt es in dieser Zeit nicht (die Karte „Individuelle
E-Mail“ schon — das Image `b6e1c8a` kennt sie), und Führungskräfte mit neuem Vorgesetzten-Link
sehen das alte Formular ohne den Ausstattungsschritt.
Der Entrypoint muss bei **jedem** Start umgangen sein (die Override-Datei bleibt so lange stehen),
sonst tritt 7.1 ein. Beim nächsten Vorwärts-Deploy findet der neue Entrypoint alles schon vor;
nichts geht verloren. Die genauen Befehle gibt Claude im Ernstfall.

---

## 8 · Kurztexte nach dem Update

### 8.1 Kurztext für das Personalbüro

Zum Verschicken, wenn 5.4 bis 6.2 durch sind (die Bitte in 5.3 Schritt 6 sagt „heute, in etwa
einer Stunde“). Einige Stellen hängen an Handschritten oder Abfragen; die Hinweise in eckigen
Klammern vor dem Verschicken entfernen — und den Satz bzw. Punkt dahinter gleich mit, wenn die
Bedingung nicht erfüllt ist. Die Klammern im Einzelnen — drei davon sind eine Auswahl bzw. etwas zum
Einsetzen (Punkt 9 „[Titel aus dem Protokoll]“, Punkt 10 „[das Personal-Postfach / …]“, Punkt 13
„[mit Stufe 2:] … [ohne Stufe 2:]“), die übrigen sind Bedingungen:

- **„[seit 02.10. – nur wenn HR damals nicht informiert wurde:]“** vor den Punkten 1 und 2 — ein
  Hinweis für den Projektverantwortlichen: Beide Punkte sind seit dem nicht protokollierten Deploy
  vom 02.10.2026 im Portal (Kopf), kommen mit diesem Update also **nicht** neu. Ob HR damals
  Bescheid bekam, ist nicht bekannt — vermutlich nicht. Wurde HR informiert, beide Punkte streichen
  und die übrigen in der Mail neu nummerieren (die Verweise dieser Anleitung auf „Punkt 4“ bis
  „Punkt 15“ meinen dann die Nummern 2 bis 13). Sonst stehen lassen: Sie sind im Text als „seit dem
  2. Oktober“ gekennzeichnet, nicht als neu.
- **„[nur wenn 6.2 eingeschaltet:]“** — die Löschung nach 12 Monaten geschieht nur über den Lauf
  aus 6.2. Endete 6.2 im STOPP, den Satz streichen.
- **„[nur wenn 6.1 erledigt:]“** — Punkt 7 stimmt erst mit gepflegter Freigabeliste (leer heißt:
  keine Einschränkung). Sonst Punkt 7 streichen.
- **„[nur mit beigelegtem Handbuch:]“** — das Portal zeigt das Handbuch nicht, und eine ältere
  Fassung bei HR enthält das Kapitel noch nicht. Den Satz nur stehen lassen, wenn der Mail die
  aktuelle Fassung beiliegt: den Ordner `docs/handbuch/` aus dem Repo, Stand `main` — `handbuch.html`
  **zusammen mit** dem Bildordner `screenshots/` (die Bilder werden von dort geladen), z. B. als
  ZIP. Claude stellt ihn auf Wunsch zusammen.
- **„[nur wenn Rückmeldung zugestellt wird:]“** — Punkt 10 stimmt nur, wenn
  `onboarding-task-completed` nach 5.3 Schritt 1 eingeschaltet ist (oder gar nicht gespeichert
  war) und entweder 1.9 `hr_postfach_gesetzt` = `t` gezeigt hat oder die gespeicherte Vorlage ein
  eigenes An-Feld hat (1.9: `an_feld` = `t`). Sonst Punkt 10 streichen.
- **„[das Personal-Postfach / die in der Vorlage eingetragene Adresse]“** in Punkt 10 ist eine
  Auswahl: Zeigte 1.9 bei `onboarding-task-completed` `an_feld` = `t`, die Adresse aus dem An-Feld
  der Vorlage einsetzen (Einstellungen → E-Mail-Vorlagen), sonst „das Personal-Postfach“.
- **„[nur wenn 1.9 eigene Vorlagen zeigt:]“** — die letzten beiden Sätze von Punkt 12 nur, wenn
  die Abfrage nach eigenen Brief-Vorlagen mit Rückgabeliste in 1.9 Zeilen gezeigt hat.
- **„[nur wenn 5.3 Schritt 3 etwas geändert hat:]“** in Punkt 9 — den Satz nur, wenn dort ein
  Vorlagenpunkt entfernt oder umbenannt wurde; in **„[Titel aus dem Protokoll]“** die
  tatsächlichen Titel einsetzen (Protokoll zu 5.3 Schritt 3).
- **„[mit Stufe 2:] … [ohne Stufe 2:] …“** in Punkt 13 ist eine Auswahl: Lief 5.3 Schritt 5, den
  Teil „mit Stufe 2“ stehen lassen, sonst den Teil „ohne Stufe 2“.

Zeigte 5.3 Schritt 2 eine rote Warnung (Adresslücke), passt Claude vor dem Verschicken Punkt 9 und
den Infotext 8.2 an (dort die Aufzählung „Zugänge, Rechner, Telefon oder Schlüssel“ und die
Empfänger der zweiten Mail): Die Positionen dieser Stelle erscheinen dort nicht im Formular. Ebenso,
wenn 1.9 bei einer Stelle `seed_platzhalter` = `1` zeigte und Claude die Adresse nicht bestätigt
hat (die Aufgaben dieser Stelle gingen an den Platzhalter).

> **Betreff:** HR-Portal: Aktualisierung vom [Datum] – was neu ist
>
> Liebe Kolleginnen und Kollegen,
>
> das HR-Portal wurde am [Datum] aktualisiert. Ab jetzt können Sie alles wieder nutzen, auch die
> neuen Teile und die Links an Führungskräfte. Für Sie ändert sich Folgendes:
>
> 1. [seit 02.10. – nur wenn HR damals nicht informiert wurde:] **Schon seit dem 2. Oktober:
>    Individuelle E-Mail aus dem Vorgang.** Im Reiter „Dokumente“ von Onboarding, Offboarding,
>    Verbeamtung und Vertragsverlängerung gibt es unter dem Dokumentenpaket die Karte
>    „Individuelle E-Mail“: eine freie Nachricht an die Person mit eigenem Betreff und bis zu 10
>    Anhängen (PDF, JPG, PNG oder WebP, zusammen höchstens 9 MB), etwa für den gegengezeichneten
>    Vertrag. Die Mail steht danach im Vorgang, auch im Reiter „E-Mails“; Antworten der Person
>    kommen im HR-Postfach an. [nur wenn 6.2 eingeschaltet:] Text und Anhänge werden nach 12 Monaten
>    gelöscht; Datum, Empfänger, Betreff und Dateinamen bleiben als Nachweis. [nur mit beigelegtem
>    Handbuch:] Eine Anleitung finden Sie im beigefügten Handbuch unter „Eine individuelle E-Mail
>    mit Anhang schreiben“.
> 2. [seit 02.10. – nur wenn HR damals nicht informiert wurde:] **Schon seit dem 2. Oktober:
>    Reihenfolge der Checklisten.** Die Punkte einer Checklisten-Vorlage lassen sich verschieben,
>    und Vorgänge zeigen sie in der Reihenfolge der Vorlage statt alphabetisch nach Kategorie – in
>    laufenden Vorgängen hat sich die Anzeige deshalb einmalig verschoben, es ging nichts verloren.
> 3. **Vertragsende.** Kommt eine Anfrage oder Erinnerung bei der Führungskraft nicht an, meldet
>    das Portal das jetzt; nach ihrer Antwort lässt sich keine neue Anfrage mehr senden, und im
>    Verlängerungsschreiben steht die gewählte Betriebsstätte statt „___“.
> 4. **Datum in deutscher Zeit, immer als TT.MM.JJJJ** (z. B. 09.10.2026) – in PDFs, Briefen,
>    Dateinamen und Exporten, **auch im CSV-Export des Onboardings. Bitte prüfen Sie beim nächsten
>    LOGA-Import einmal, ob die Daten richtig übernommen werden.**
> 5. **Verbeamtung.** Im Reiter „Dokumente“ stehen hochgeladene Dateien jetzt bei ihrer
>    Dokumentart statt gesammelt unter „Weitere Dokumente“.
> 6. **Elternzeit.** Eine Geburtsurkunde, die die Person über ihren Link hochlädt, ersetzt nur noch
>    ihre eigene frühere Datei – eine von Ihnen hochgeladene bleibt erhalten.
> 7. [nur wenn 6.1 erledigt:] **Abweichende Empfängeradressen.** Eine Adresse, die nicht im Vorgang
>    hinterlegt ist – etwa eine neu eingetippte Adresse einer Führungskraft (auch bei der
>    Zeugnis-Bewertung im Offboarding) oder ein anderer Empfänger einer E-Mail –, nimmt das Portal
>    nur noch an, wenn ihre Endung (der Teil nach dem @, z. B. @fes-minden.de) freigegeben ist;
>    sonst zeigt es eine Meldung. Die im Vorgang hinterlegte Adresse der Person geht immer. Die
>    Liste der freigegebenen Endungen pflegt die Portal-Administration – fehlt eine, sagen Sie uns
>    bitte Bescheid.
> 8. **Arbeitsort im Onboarding.** Beim Anlegen eines Onboardings gibt es das freiwillige Feld
>    „Arbeitsort“, in der Übersicht des Vorgangs die Zeile „Arbeitsort“ mit „Ändern…“. Bitte nur
>    ausfüllen, wenn die Person nicht in der Einrichtung arbeitet, die sie anstellt – etwa eine
>    OGS-Kraft des Fördervereins an einer Grundschule. Die Aufgaben für Abteilungen (IT,
>    Gebäudewirtschaft, Verwaltung) gehen dann an den Arbeitsort, und die Führungskraft bekommt im
>    Formular die Ausstattung angeboten, die dort gilt. Ändern lässt er sich nur, bis der Link an die
>    Führungskraft erzeugt ist.
> 9. **„Ausstattung & Zugänge“ ist in Betrieb.** Die Führungskraft wählt im Formular der
>    Einstellungsmodalitäten in einem neuen Schritt aus, was zum Arbeitsbeginn bereitstehen soll –
>    Zugänge, Rechner, Telefon, Schlüssel und Ähnliches. Das gilt für Links an die Führungskraft,
>    die ab heute erzeugt werden; schon verschickte Links bleiben ohne den neuen Schritt.
>    Vorausgewählt sind das Benutzerkonto mit Dienst-E-Mail, die Schlüssel für den Haupteingang und
>    – je nach Einrichtung – für Lehrerzimmer, Gruppenraum oder Büro, an Schulen das Fach im
>    Lehrerzimmer und für Angestellte, Beamte und Kita-Personal Rechner und Telefon. Bei Minijob
>    und Ehrenamt erscheinen Rechner und Telefon gar nicht. Die Führungskraft kann abwählen und
>    Bemerkungen ergänzen. Aus jeder Wahl wird eine Aufgabe der zuständigen Abteilung (IT,
>    Gebäudewirtschaft oder Verwaltung / Sekretariat), fällig drei bis sieben Tage vor
>    Dienstbeginn; sie geht wie die übrigen Aufgaben mit „Abteilungen informieren…“ hinaus. Die
>    Schlüssel gibt die Gebäudewirtschaft aus. [nur wenn 5.3 Schritt 3 etwas geändert hat:] Doppelte
>    Punkte in den Checklisten-Vorlagen haben wir deshalb entfernt bzw. umbenannt: [Titel aus dem
>    Protokoll]. Sie sehen die Auswahl in der Karte „Ausstattung & Zugänge“ (Reiter „Checkliste“
>    und „Vorgesetzter“) und können sie nach der Abgabe dort ergänzen, ändern oder streichen –
>    bitte sehen Sie sie vor „Abteilungen informieren…“ durch. Sind beim Abschließen eines
>    Onboardings noch Ausstattungsaufgaben offen, fragt das Portal nach und nennt sie; abschließen
>    können Sie trotzdem, danach können die Abteilungen über ihren Link nichts mehr abhaken.
>    **Für die Leitung:** Unter
>    Einstellungen gibt es den neuen Reiter „Ausstattung & Zugänge“ mit dem Katalog; dort pflegen
>    Sie die Positionen. Eine Position erscheint im Formular nur, wenn die zuständige Abteilung am
>    Arbeitsort eine Adresse hat (Einstellungen → Abteilungen); Lücken zeigt die Katalogseite an.
> 10. [nur wenn Rückmeldung zugestellt wird:] **Rückmeldungen der Abteilungen.** Hakt eine
>     Abteilung eine Onboarding-Aufgabe über ihren Link ab oder hinterlässt sie dort einen
>     Kommentar, kommt eine E-Mail an [das Personal-Postfach / die in der Vorlage eingetragene
>     Adresse], Betreff „Onboarding-Aufgabe erledigt: …“ oder „… kommentiert: …“. Neu ist die Mail
>     bei einem reinen Kommentar: Bitte lesen Sie ihn, oft ist dann von Ihrer Seite etwas zu tun.
> 11. **Absage eines Onboardings.** Markieren Sie ein Onboarding als abgelaufen, nachdem Abteilungen
>     schon informiert wurden, bietet die Karte „Aufgaben für Abteilungen“ den Knopf „Stellen über
>     die Absage informieren…“. Er schickt den informierten Abteilungen eine E-Mail ohne Link mit
>     dem, was sie schon erledigt haben, damit sie Zugänge und Ausgegebenes zurücknehmen. Von selbst
>     geht nichts hinaus. Der Knopf steht auch bei älteren abgelaufenen Vorgängen; nutzen Sie ihn
>     dort bitte nur, wenn die Abteilungen noch nicht Bescheid wissen.
> 12. **Rückgaben im Offboarding.** Im Reiter „Rückgaben“ lassen sich Gegenstände wieder erfassen
>     (bisher kam eine Fehlermeldung). Unter „Zustand…“ wählen Sie je Gegenstand: zurückerhalten,
>     beschädigt zurückerhalten, fehlt, verbleibt bei der Person oder entfällt. Beim Abschließen
>     eines Austritts fragt das Portal nach und nennt noch offene Rückgaben; abschließen können Sie
>     trotzdem. Neu unter den Brief-Vorlagen ist das „Rückgabeprotokoll Ausstattung“ mit einer Seite
>     je zuständiger Stelle. [nur wenn 1.9 eigene Vorlagen zeigt:] Eigene Brief-Vorlagen mit der
>     Rückgabeliste nennen jetzt auch den Zustand (z. B. „— fehlt“). Als „offen“ gelten dort nur
>     noch Gegenstände ohne Zustand – „fehlt“, „verbleibt“ und „entfällt“ zählen nicht mehr als
>     offen.
> 13. [mit Stufe 2:] **Übergabe und Rückgabe laut Portal.** Bei Geräten, Schlüsseln und anderen
>     Gegenständen, die beim Austritt zurückkommen müssen, vermerkt die Abteilung auf ihrer
>     Aufgabenseite unter „Übergabe vermerken“, was sie übergeben hat – möglichst mit Nummer
>     (Inventar-, Schlüssel-, Chip-, Karten- oder Ausweisnummer); bei Zugängen vermerkt die IT, dass
>     sie eingerichtet sind. Das geschieht getrennt vom Abhaken. In der Karte „Ausstattung &
>     Zugänge“ sehen Sie die Übergaben und können sie nachtragen, korrigieren oder ein Stück
>     tauschen. Für die Unterschrift gibt es unter den Brief-Vorlagen das „Übergabeprotokoll
>     Ausstattung“ mit einer Seite je Stelle; das unterschriebene Protokoll laden Sie im Reiter
>     „Dokumente“ des Onboardings hoch. **Beim Austritt** ordnen Sie im Offboarding (Reiter
>     „Rückgaben“) über „Einstellung zuordnen …“ das Onboarding der Person zu – das Portal schlägt
>     passende vor; bitte vor „Abteilungen informieren…“. Dann bekommt jede Abteilung, die etwas
>     ausgegeben hat, eine Aufgabe „… zurücknehmen“ bzw. „… sperren“ und trägt dort ein, ob das
>     Stück zurückkam, beschädigt ist oder fehlt; im Reiter „Rückgaben“ stehen die Stücke mit ihrem
>     Zustand. Übergaben kennt das Portal nur bei Einstellungen ab heute; bei älteren bleibt es bei
>     der Checkliste. Das Portal ist eine Gedächtnisstütze – maßgeblich bleiben Geräteverwaltung und
>     Schließplan. [ohne Stufe 2:] **Hinweis „Einstellung zuordnen …“ im Offboarding.** Findet das
>     Portal zu einem Austritt das passende Onboarding, erscheint dieser Hinweis. Er wird erst
>     wichtig, wenn das Portal Übergaben erfasst – das schalten wir gesondert ein; bis dahin
>     übergehen Sie ihn bitte.
> 14. **Hinweis an Sammelpunkten der Offboarding-Checkliste.** Bei neu angelegten Austritten steht
>     unter Punkten wie „Rueckgabe aller Arbeitsmittel“ oder „IT-Zugaenge … sperren“ ein grauer
>     Hinweis, den auch die Abteilungen in ihrer E-Mail sehen: Gemeint ist alles, was nicht als
>     eigene Aufgabe unter „Ausstattung & Zugänge“ steht. Laufende Austritte bleiben, wie sie sind.
>     Der Hinweis bleibt so stehen.
> 15. **Exit-Interview und Zeugnis im Offboarding.** Kann die Einladung zum Exit-Interview nicht
>     zugestellt werden, zeigt das Portal jetzt eine Fehlermeldung, und der Status bleibt
>     unverändert (bisher galt sie trotzdem als versendet) – bitte später erneut senden. Die
>     Prüfung der Zeugnis-Bewertung durch die Leitung ist erst möglich, wenn die Führungskraft ihre
>     Bewertung eingereicht hat.
>
> Für Führungskräfte und Abteilungen liegt ein kurzer Infotext bei, den Sie gern weitergeben.
>
> Bei Fragen melden Sie sich gern.

### 8.2 Infotext für Führungskräfte und Abteilungen (Vorschlag)

Zum Weitergeben durch HR, z. B. als Rundmail an die Leitungen und an die Postfächer von IT,
Gebäudewirtschaft und Verwaltung / Sekretariat (Anrede „Sie“, wie in allen Mails). Den Absatz
**„[nur mit Stufe 2:]“** streichen, wenn 5.3 Schritt 5 ausgelassen wurde. „[Datum]“ ist der Tag des
Updates. Zeigte 5.3 Schritt 2 eine rote Warnung (oder 1.9 einen nicht bestätigten Platzhalter),
geht der Infotext erst nach Claudes Anpassung an HR (8.1, Satz vor dem Kurztext).

> **An die Führungskräfte — Betreff:** HR-Portal: neuer Schritt „Ausstattung & Zugänge“
>
> Liebe Kolleginnen und Kollegen,
>
> wenn Sie für eine Neueinstellung den Link zu den Einstellungsmodalitäten erhalten, finden Sie dort
> seit dem [Datum] den neuen Schritt „Ausstattung & Zugänge“. Bitte kreuzen Sie an, was zum ersten
> Arbeitstag bereitstehen soll – etwa Zugänge, Rechner, Telefon oder Schlüssel. Einiges ist schon
> vorausgewählt; bitte wählen Sie ab, was nicht gebraucht wird, und nennen Sie Einzelheiten in den
> Bemerkungen (z. B. weitere Räume). Die zuständigen Abteilungen erhalten daraus ihre Aufgaben. Der
> Schritt erscheint nur bei Links, die seit dem [Datum] verschickt wurden.
>
> Bei Fragen wenden Sie sich bitte an das Personalbüro.

> **An IT, Gebäudewirtschaft und Verwaltung / Sekretariat — Betreff:** HR-Portal: Aufgaben zur
> Ausstattung neuer Mitarbeitender
>
> Liebe Kolleginnen und Kollegen,
>
> in den E-Mails des Personalbüros zu einer Neueinstellung stehen seit dem [Datum] auch Aufgaben zur
> Ausstattung, zum Beispiel „Schlüssel ausgeben: Haupteingang“ oder „Zugang einrichten:
> Benutzerkonto und Dienst-E-Mail“ – mit Fälligkeit und den Bemerkungen der Führungskraft. Sie
> haken sie wie gewohnt über den Link in der E-Mail ab. Die Schlüssel gibt die Gebäudewirtschaft
> aus.
>
> Wird eine Einstellung abgesagt, nachdem Sie informiert wurden, erhalten Sie eine E-Mail
> „Absage: Onboarding für … entfällt“ ohne Link. Sie nennt, was Sie schon erledigt haben – bitte
> nehmen Sie eingerichtete Zugänge und Ausgegebenes dann zurück. In den E-Mails zu neuen Austritten
> steht unter Sammelpunkten wie „Rueckgabe aller Arbeitsmittel“ ein grauer Hinweis: Gemeint ist
> alles, was nicht als eigene Aufgabe aufgeführt ist.
>
> [nur mit Stufe 2:] Neu ist außerdem „Übergabe vermerken“: Bei Geräten, Schlüsseln und anderen
> Gegenständen tragen Sie auf derselben Seite ein, was Sie übergeben haben, möglichst mit Nummer
> (Inventar-, Schlüssel- oder Chipnummer); bei Zugängen vermerken Sie die Einrichtung. Das ist
> unabhängig vom Abhaken. Scheidet die Person später aus, erhalten Sie eine Aufgabe „… zurücknehmen“
> bzw. „… sperren“ und tragen dort ein, ob das Stück zurückkam, beschädigt ist oder fehlt.
>
> Bei Fragen wenden Sie sich bitte an das Personalbüro.

---

## 9 · Protokoll

### Vorlage zum Ausfüllen

Nach dem Update kommt dieser Teil, ausgefüllt, als „Protokoll vom [Datum]“ direkt unter den Kopf
dieses Dokuments (Claude trägt ihn ein). Uhrzeiten in deutscher Zeit; Dateinamen und Zeitstempel
im Container sind UTC.

| Schritt | Uhrzeit | Ergebnis / Ausgabe | Abweichung |
|---|---|---|---|
| 1.1 Serverstand (`git log -1`, erwartet `b6e1c8a`) | | | |
| 1.2 Container, Erstelldatum und Image (`2026-10-02T07:47:30`, `sha256:5b1a01dd32ef…`) | | | |
| 1.3 Drift (erwartet `0`) | | | |
| 1.4 Sicherungsverzeichnis, beide Schreibtests | | | |
| 1.5 Freier Platz (Docker / `/vol/container`), Image-Größe | | | |
| 1.6 Uploads-Volume (Name, Größe) | | | |
| 1.7 Tabellen (`individuelle_*` da, 7 × leer); individuelle E-Mails (`mails` / `anhaenge`); Fremdschlüssel (`0 / 0`); Merker (`10`), `modalitaeten`; Sperrpunkte (`bekommen_hinweis` / `eigene_beschreibung`); System-Vorlagen (1 Zeile?) | | | |
| 1.8 Läufe (alle `f`?) | | | |
| 1.9 Mailvorlagen (8 Zeilen, `handlung` je Zeile, Handgriff 0 nötig?); Webhooks (Onboarding: löschen; Offboarding aktiv? → geklärt mit dem Projektverantwortlichen); `hr_postfach_gesetzt` / `smtp_aktiv`; `SKIPPED` von `onboarding-task-completed`; eigene Vorlagen mit Rückgabeliste; offene Rückgaben (Austritte / Gegenstände); `N8N_API_KEY` (`0`/`1`); Adressen `FACILITY` / `IT` / `VERWALTUNG` (`aktiv_mit_adresse`, `seed_platzhalter`) | | | |
| 2.1 Etikett `hr-portal-app:b6e1c8a` auf die feste ID `sha256:5b1a01dd32ef…` (= laufend?); altes Etikett `f6d3daf` (fehlt / gleiche ID / andere ID → STOPP); `Untagged:` ja/nein | | | |
| 2.2 Leseprobe (Dateien, Bytes, `tar OK`) | | | |
| 3.1 `git pull` (von `b6e1c8a` nach …) | | | |
| 3.2 Anker `a2e2e64`/`0974b7f`, voller Hash `0974b7f…`, Commits ab `b6e1c8a` (`31`, Merges `4`), Dateien von `0974b7f` (16), nach `0974b7f` nur Doku (welche Dateien?), Migration im Seed-Check (`1`), Betriebsdateien (4 Zeilen, `884 48`), `package.json` und `package-lock` unverändert | | | |
| 3.3 Build (Dauer; `npm ci` `CACHED` oder neu) | | | |
| 3.4 Vorschau (19/1/7/21/20, kein DROP, 7 Tabellen ohne `individuelle_*`, Spalten, Enum-Wert, Fremdschlüssel) | | | |
| 4.1 Portal angehalten; individuelle E-Mails bei angehaltenem Portal (`mails` / `anhaenge`); DB-Sicherung (Bytes, `1`); Uploads (Bytes, Zeilen, `tar OK`); Handgriff 0 (ja/nein, `UPDATE …`) | | | |
| 4.2 Start | | | |
| 4.3 Log: Entrypoint-Sicherung (Bytes), Warnung (2 Punkte?), `db push` (ms), System-Vorlagen (3 Zeilen, Führungszeugnis `ist aktuell`?), Migrationszeilen (3, Zahlen; Standardkatalog `20`/`13`?), `Ready` (ms) | | | |
| 4.5 Entrypoint-Sicherung kopiert | | | |
| 5.1 Health (`uhrAktiv`, `letzterTakt`), Portal wieder erreichbar ab | | | |
| 5.2 Drift `0`; individuelle E-Mails gleich 4.1; Ausstattung (Katalog `20`, sonst 6 × `0`); Katalog `20 / 13 / 0 / 0`; Personengruppen (2 Zeilen); Schlüssel je Einrichtungsart (überall `1`?); Indizes je Tabelle (27); Bestand (3 Zeilen); Merker `13` und Werte; Merker Standardkatalog `0 / 20 / 13 / 1`; `mitAusstattung`; Sperrpunkte mit Hinweis; System-Vorlagen (3); Läufe `11 / 0`; Mails seit dem Start | | | |
| 5.3 Schritt 1: Vorlagen zurückgesetzt (welche), Handgriff 0 abgeschlossen, Betreff korrigiert | | | |
| 5.3 Schritt 2: Katalog `20`/`13`; Warnungen (Adresslücken je Stelle, ähnliche Vorlagenpunkte, Freigabeliste); Abteilungen IT / Verwaltung / Gebäudewirtschaft | | | |
| 5.3 Schritt 3: Vorlagenpunkte vorher (Zeilen), je Punkt entfernt / umbenannt / stehen gelassen (Grund), nachher (Zeilen); Transponder laut HR (ja/nein/offen); Hinweistext des entfernten Punkts „Benutzerkonto …“ (wörtlich) | | | |
| 5.3 Schritt 4: Onboarding-Webhooks gelöscht (welche); Offboarding-Webhooks (`(0 rows)` / gelöscht / STOPP) | | | |
| 5.3 Schritt 5: Übergabeprotokoll reaktiviert; Meldung der Rückgabe-Vorgaben (wörtlich, oder „verpasst“; ohne Webhook-Hinweis?); Prüfabfrage (3 / 11 / 3 / 3); `1 / 2` — oder: Stufe 2 ausgelassen (Grund) | | | |
| 5.3 Schritt 6: HR Bescheid gegeben um | | | |
| 5.4 Probe: individuelle E-Mail (optional, nur Testvorgang mit eigener Adresse) / Verbeamtung / Vertragsende / Checklisten (optional) / Ausstattung-Reiter / Onboarding / Offboarding / Brief-Vorlagen | | | |
| 5.5 Versandprotokoll der Probe (Betreff seit dem Start: `SENT` mit `1`; `mails` / `anhaenge` `1 / 1`) — oder: ausgelassen (kein Testvorgang mit eigener Adresse) | | | |
| 6.1 Freigabeliste (eingetragene Domains) | | | |
| 6.2 Aufbewahrung: Probelauf („ohne Befund“, 5 × `0`), eingeschaltet um | | | |
| 8 Kurztext an HR verschickt (welche Klammern gestrichen bzw. eingesetzt, Punkte 1 und 2 „seit 02.10.“ stehen gelassen oder gestrichen, mit oder ohne Stufe 2, Handbuch beigelegt?); Infotext 8.2 an HR zum Weitergeben | | | |

**Sicherungen auf dem Server** (Größen eintragen):

| Datei | Größe | Zweck |
|---|---|---|
| `backups/vor-deploy-main-2026-10-manuell.sql` | | maßgeblich für Weg B (`pg_dump` 16 aus dem DB-Container) |
| `backups/vor-deploy-main-2026-10-entrypoint.sql` | | Kopie der Entrypoint-Sicherung (`pg_dump` 18), aus der Rotation genommen |
| `backups/uploads-vor-deploy-main-2026-10.tar.gz` | | Uploads vor dem Update — enthält Personalunterlagen, bleibt auf dem Server |
| Image `hr-portal-app:b6e1c8a` | | altes Image (Deploy vom 02.10.) für Weg A, Weg B und Weg C |

**Log des Starts** (Auszug aus `start-log.txt`, wörtlich — nie mit einer Zeile
`INITIALES PASSWORT`, siehe 4.3): _…_

### Was an Claude geht

| Wann | Was | Weiter erst nach Antwort? |
|---|---|---|
| 1.1–2.2 | jede Abweichung, auch jede STOPP-Zeile aus 1.7, 1.9 und 2.1 (Etikett `f6d3daf` mit anderer ID) (Fremdschlüssel, Duplikat einer System-Vorlage, `ENTSCHEIDUNG`, ausgeschaltete Abteilungsvorlage mit aktivem Webhook, SMTP aus) | **ja** |
| 1.9 | `N8N_API_KEY` = `1`; ein aktiver Webhook mit `feuert weiter …` (Stufe 2 hängt daran, Klärung bis 5.3 Schritt 4); `aktiv_mit_adresse` = `0` oder `seed_platzhalter` = `1` bei einer der drei Stellen | nein (bei `seed_platzhalter` = `1` bleiben die Punkte dieser Stelle in 5.3 Schritt 3 stehen, solange Claude die Adresse nicht bestätigt hat) |
| 3.1–3.4 | Konflikt, Ausgabe beim Diff, Build-Fehler, `vorschau-delta.sql` bei abweichender Zählung | **ja** (das Portal läuft weiter) |
| 4.1 | Fehler beim Zählen der individuellen E-Mails, Sicherung zu klein, `grep` `0`, kein `tar OK`, Fehler bei Handgriff 0 | **ja** (vorher Befehl B) |
| 4.3 | `start-log.txt`, **immer** (außer mit Seed-Zeile, 4.3: dann nur diese Zeile) | nein, außer bei Fehlern |
| 4.4 | jeder Fehlschlag, bei einer Neustart-Schleife nach Befehl D | **ja** |
| 4.5 | Kopie fehlt oder die beiden `.sql` weichen deutlich voneinander ab | nein (das Portal läuft weiter) |
| 5.1–5.2 | Ergebnisse und Abweichungen; in 5.2 weniger individuelle E-Mails als in 4.1 (**sofort**); eine Zeile `schluessel_positionen` ≠ `1` (Hinweis, kein STOPP) | nein, außer bei Fehlern |
| 5.3 Schritt 1 | eine `handlung` nach dem Zurücksetzen nicht `nichts (Text aktuell)`; `hr_postfach_gesetzt` = `f` | **ja** vor dem Bescheid an HR, wenn eine `handlung` abweicht; sonst nein |
| 5.3 Schritt 2 | Bildschirmfoto der Katalog-Warnungen; eine andere Zahl von Positionen | nein; bei anderer Zahl **ja** |
| 5.3 Schritt 3 | Ausgabe der Vorlagenpunkt-Abfrage (vorher), Zeilen mit anderem Titel, Fehler beim Speichern | nein für Schritt 4 und 5; bei Zeilen mit anderem Titel oder Fehler beim Speichern **ja** vor dem Bescheid an HR (Schritt 6) |
| 5.3 Schritt 4 | ein aktiver Offboarding-Webhook, der nicht geklärt ist | nein für den Rest; Stufe 2 bleibt aus |
| 5.3 Schritt 5 | Webhook-Hinweis nach „Vorgaben übernehmen“, eine andere Meldung oder Zahl, Abweichung der Prüfabfrage, Fehler beim Reaktivieren | **ja** vor dem Bescheid an HR (außer beim Fehler beim Reaktivieren: Stufe 2 auslassen, weiter mit Schritt 6) |
| 5.4–5.5 | Abweichungen der Probe | nein |
| 6.1 | Fehlermeldung der Domain-Abfrage; Gegenprobe ohne rote Meldung | nein |
| 6.2 | Probelauf nicht „ohne Befund“ oder mit einer Zahl größer 0 | **ja** |
| 7 | vor **jedem** Rückfall | **ja** |

### Danach, nicht Teil dieses Deploys

1. **Automatische Läufe prüfen und einschalten.** Alle elf sind seit dem 30.09. aus (außer der
   Aufbewahrung aus 6.2). Ohne sie gibt es keine Erinnerungen, keine Fristenläufe und keine
   Löschungen nach DSGVO-Fristen. Für „Ausstattung & Zugänge“ zählt vor allem
   **„Onboarding-Erinnerungen“**: Er erinnert Personen, Führungskräfte und Stellen, holt fehlende
   Ausstattungsaufgaben nach und schickt die Sammelmail vor Dienstbeginn an das HR-Postfach (offene
   Ausstattung, `onboarding-ausstattung-offen`) — ohne ihn gibt es nichts davon. Einführung nach
   `docs/module/betrieb/zeitplaner-plan.md`, Abschnitt 8: HR vorher informieren (die
   Erinnerungsläufe verschicken beim ersten Lauf alles Fällige auf einmal), Löschläufe erst nach
   einem Probelauf.
2. **n8n aufräumen — aber den Flow „Email-Vertragsende-Personal 3.0“ nicht löschen.** Er ersetzt
   keinen Lauf des Portals, sondern liefert jeden Montag um 9 Uhr die Vertragsenden aus DokuBit ins
   Portal (`/api/webhooks/contract-end`). Die abgelösten Erinnerungs-Workflows dürfen weg. Zeigte
   1.9 einen `N8N_API_KEY`: prüfen, dass kein Flow die Offboarding-Unterrouten aufruft (sie
   antworten dem Schlüssel jetzt mit 403). Neue Webhooks auf die vier Offboarding-Ereignisse der
   Abteilungen bei eingeschalteter Stufe 2 nicht anlegen (sie bekämen den Link der Stellen samt
   Nummern; CLAUDE.md, Regel 29).
3. **Regelmäßige Sicherung von Datenbank und Volume `uploads_data` mit der IT klären.** Die
   Sicherungen dieses Ablaufs sind einmalig. Seit Paket 3 liegen im Volume auch die Anhänge der
   individuellen E-Mails, seit Stufe 2 auch hochgeladene Übergabe- und Rückgabeprotokolle.
4. **Antwortadresse** (`SmtpConfig.replyToEmail`), falls 1.9 sie leer gezeigt hat: mit HR klären
   und unter Einstellungen → SMTP eintragen. Sie gilt als Reply-To für alle Mails; ohne sie werden
   die Rückmeldungen der Stellen, die Sammelmail und die Berichtsmails übersprungen.
5. **„Ausstattung & Zugänge“ im Betrieb** (HR-Leitung; Einzelheiten in CLAUDE.md, Abschnitt
   „Ausstattung & Zugänge“, Regel 1a und „Vorlagen und Betrieb“, sowie Feinplan Abschnitt 8):
   1. **Adresslücken schließen**, die 5.3 Schritt 2 gemeldet hat (Einstellungen → Abteilungen) —
      sonst sieht die Führungskraft dort die Position nicht. Danach die in 5.3 Schritt 3 wegen
      einer Lücke stehen gelassenen Vorlagenpunkte nach derselben Tabelle nachziehen, ebenso Punkte
      mit abweichendem Titel nach Claudes Antwort.
   2. **Katalog ergänzen:** eigene Positionen einzelner Einrichtungen (etwa Räume, Pflegehinweis der
      Schlüssel-Position), ausgeschaltete Standardpositionen einschalten, wo sie gebraucht werden
      (z. B. Transponder), Personengruppen ändern, wo „jeder“ nicht passt. Schon gespeicherte
      Formulare behalten ihre Auswahl (Momentaufnahme, CLAUDE.md Regel 4). Den im Protokoll zu
      5.3 Schritt 3 notierten Hinweistext des entfernten IT-Punkts „Benutzerkonto …“ bei Bedarf an
      der Position „Zugänge“ im Feld „Hinweis für die Stelle“ ergänzen (sie trägt schon einen
      Hinweis; Feinplan Abschnitt 8).
   3. **Nur falls 5.3 Schritt 5 ausgelassen wurde: Stufe 2 nachholen** — nach der Klärung der
      aktiven Offboarding-Webhooks die Schritte 4 und 5 aus 5.3 wiederholen (mit denselben
      Erwartungen) und HR den Teil „mit Stufe 2“ von Punkt 13 aus 8.1 sowie den Absatz „[nur mit
      Stufe 2:]“ aus 8.2 nachreichen. Nie über „Vorschläge übernehmen“.
6. **Freigabeliste (6.1) nachholen**, falls die Endungen am Tag des Updates noch fehlten: sobald HR
   sie genannt hat, 6.1 samt Gegenprobe ausführen und HR Punkt 7 des Kurztexts (8.1) nachreichen.

**Nach dem Update (Claude):** das Protokoll hier eintragen; im Kopf von
[deploy-paket4-stufe1.md](deploy-paket4-stufe1.md) den Deploy vom 30.09.2026 nachtragen **und
gleich dahinter den ebenfalls nicht protokollierten Deploy vom 02.10.2026** — `da5c743` (Paket 3)
bis `b6e1c8a` (Checklisten-Reihenfolge), Pulls laut `git reflog` am 01.10. 06:30 UTC und 02.10.
07:44 UTC, Container 07:47:30 UTC, Image `sha256:5b1a01dd32ef…`, Tabellen von Paket 3 seitdem
vorhanden (Quelle: Server-Ausgaben vom 14.10., Kopf dieser Datei), dazu, ob HR damals informiert
wurde (Antwort des Projektverantwortlichen zu 8.1, Punkte 1 und 2); in CLAUDE.md (Abschnitt
„Ausstattung & Zugänge“, „Vorlagen und Betrieb“ und „Vor dem Einschalten“) vermerken, dass A1–A4
deployt sind, Stufe 1 mit dem Standardkatalog in Betrieb ist und Stufe 2 am Tag des Updates
eingeschaltet wurde (bzw. noch aus ist, wenn 5.3 Schritt 5 ausgelassen wurde).
