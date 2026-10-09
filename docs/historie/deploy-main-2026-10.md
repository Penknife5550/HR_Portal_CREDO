# Server-Update 10/2026 — `main` ab `f6d3daf` (Ablaufplan)

> **Stand:** Ablaufplan vom 09.10.2026, **noch nicht ausgeführt**. Das Protokoll kommt nach dem
> Update direkt unter diesen Kopf (Vorlage in Abschnitt 9), wie beim
> [Deploy vom 24.09.](deploy-onboarding-pakete-2026-09.md).
> **Server:** `fes-vm-ubuntudocker`, `/vol/container/HR_Portal_CREDO`, `https://hr.fes-credo.de`
> **Ausgangsstand:** `f6d3daf` (Deploy vom 30.09.2026: Paket 4 Stufe 1 und Zeitplaner). Dieser
> Deploy ist im Repo **nicht protokolliert** — der Kopf von
> [deploy-paket4-stufe1.md](deploy-paket4-stufe1.md) sagt noch „noch nicht ausgeführt“. Deshalb
> bestätigt Schritt 1.1 den Stand zuerst auf dem Server (Lehre 1 vom 24.09.).
> **Ziel:** `main` mit dem Code bis `a2e2e64` und dem Commit, der diese Anleitung enthält. Bis
> `a2e2e64` sind es 18 Commits nach `f6d3daf` (davon 2 Merges); Liste in 3.2.
> **Geprüft am 09.10.2026** gegen `a2e2e64` (lokal, ohne Server und ohne Datenbank):
> Schema-Delta mit `prisma migrate diff` aus den Schemas von `f6d3daf` und `a2e2e64` gezählt
> (0/0/2/4/3, kein `DROP`; Rückweg: 2 × `DROP TABLE`, 3 × `DROP CONSTRAINT`, sonst nichts); von
> den Betriebsdateien hat sich nur `package.json` geändert (eine
> Zeile); `prisma/seed-check.js` ist unverändert; genau eine neue Mailvorlage, keine geänderte.
> **Muster:** Befehle aus [deploy-paket4-stufe1.md](deploy-paket4-stufe1.md) und
> [deploy-onboarding-pakete-2026-09.md](deploy-onboarding-pakete-2026-09.md) übernommen, nur
> Namen und Erwartungen angepasst.

**Grundregel wie bisher:** Wo „STOPP“ steht, wird angehalten und die Ausgabe an Claude geschickt.
Das Portal läuft bis Schritt 4.1 unverändert weiter — Anhalten kostet bis dahin nichts.

**So wird kopiert:** Jeder Befehl steht in einem eigenen Kasten und ist genau eine Zeile. Einzeln
kopieren, ausführen, die Ausgabe mit „Erwartet“ vergleichen. Alles läuft in **einer** SSH-Sitzung
im Projektordner (1.0). Nach einer neuen Anmeldung zuerst wieder 1.0 und — ab 1.6 — die Zeile mit
`UPLOADS_VOL=` ausführen. Keine Befehlszeile enthält mehr als ein Sternchen (Lehre 5 vom 24.09.),
kein Befehl gibt ein Geheimnis aus. `git` auf dem Server immer mit `sudo` (Projektordner und
`.git` gehören `root`, Lehre 2 vom 24.09.).

---

## 0 · Worum es geht

Der Server läuft seit dem 30.09.2026 auf `f6d3daf`. Seitdem sind auf `main` die individuelle
E-Mail mit Anhang (Paket 3), mehrere Fehlerbehebungen (Vertragsende, Checklisten, Verbeamtung,
Elternzeit, Zeitzone) und eine Sicherheitskorrektur dazugekommen; dieses Update bringt sie auf den
Server. An der Datenbank kommen nur zwei neue, leere Tabellen dazu — nichts wird umbenannt oder
gelöscht, und es läuft keine einmalige Datenmigration. Nach dem Start passiert nichts von selbst:
Eine Mail geht erst hinaus, wenn jemand im Portal etwas versendet. Das Portal ist nur beim Neustart
einige Minuten nicht erreichbar.

### Was ausgerollt wird

| Commit | Was | Merkt HR davon? |
|---|---|---|
| `1c0967b` | Handbuch: Kapitel „Automatische Läufe“ und Reiter „E-Mails“ (nur die Datei im Repo, das Portal zeigt das Handbuch nicht) | nein |
| `da5c743` | **Paket 3:** Karte „Individuelle E-Mail“ im Reiter Dokumente von Onboarding, Offboarding, Verbeamtung und Vertragsverlängerung — freie Nachricht mit Betreff und bis zu 10 Anhängen (PDF/JPG/PNG/WebP, zusammen 9 MB). Zwei neue Tabellen, neue Mailvorlage `individuelle-mail` | **ja**, neue Karte |
| `226338d`, `2fbc4e4` | Checklisten-Vorlagen: Punkte per Ziehen, Pfeilen und „+ Punkt darunter“ ordnen | ja (wer Vorlagen bearbeitet) |
| `bfb0665` | Prüfbefehl `npm run pruefen` und Sperrklinke gegen Altmuster (nur Tests). Ändert `package.json` um eine Zeile — deshalb baut Docker die Abhängigkeiten neu (3.3) | nein |
| `b6e1c8a` | Reihenfolge der Vorlage gilt im Vorgang (vorher alphabetisch nach Kategorie); Nachbesserungen am Verschieben | **ja**, Reihenfolge in Vorgängen kann sich ändern |
| `6982015`, `3f6d3b0` | **Sicherheit:** Der Link-Schlüssel der Führungskraft (Vertragsende) steht nicht mehr in den Antworten der HR-Schnittstellen | nein |
| `232579e`, `099680d`, Merge `aea163a` | Tagesabstände werden schneller berechnet, gleiches Ergebnis | nein |
| `b7c8532` | Vertragsende: Betriebsstätte im Verlängerungsschreiben (vorher „___“) und in der Ansicht (vorher „—“) | ja |
| `6e0e2ce`, Merge `4da68f1` | Vertragsende: Eine nicht zugestellte Anfrage oder Erinnerung wird gemeldet statt als „gesendet“ gezählt; nach der Antwort der Führungskraft keine neue Anfrage mehr | ja |
| `7c09755` | Seed legt nur noch an, was fehlt (läuft ohnehin nur in einer leeren Datenbank) | nein |
| `e25e071` | Datum und Uhrzeit im Server-Code in deutscher Zeit (PDFs, Briefe, Dateinamen, Exporte); Datumsformat überall TT.MM.JJJJ mit führender Null | ja (CSV-Export, Datum in fünf Mails) |
| `75d8277` | Verbeamtung: Reiter Dokumente ordnet Dateien ihrer Dokumentart zu | ja |
| `a2e2e64` | Elternzeit: Der Upload der Person ersetzt nur ihre eigene Geburtsurkunde, nicht die von HR | kaum |

### Was sich an Datenbank und Betrieb ändert

- **Schema, rein additiv:** zwei neue Tabellen `individuelle_mails` und
  `individuelle_mail_anhaenge` samt Indizes und Fremdschlüsseln (Zählung in 3.4). Keine neue
  Spalte an einer Bestandstabelle, kein `DROP`, kein `RENAME`, kein Typwechsel, kein Enum-Wert.
- **Keine einmalige Migration:** `prisma/seed-check.js` ist seit `f6d3daf` unverändert, alle
  Merker stehen seit dem 24.09.
- **Betriebsdateien:** `docker-compose.yml`, `Dockerfile`, `entrypoint.sh`, `package-lock.json`,
  `.env.production.example`, `.dockerignore`, `next.config.ts`, `public/system-dokumente/`
  unverändert. `package.json` hat ein neues Skript (`pruefen`), keine neue Abhängigkeit. Weil sich
  die Datei geändert hat, läuft `npm ci` im Build neu statt aus dem Zwischenspeicher: Der Build
  dauert länger und braucht Zugang zur npm-Registry — den braucht jeder Build ohnehin (`esbuild`
  und die Prisma-CLI holt das `Dockerfile` bei jedem Build neu).
- **Keine neue Umgebungsvariable**, die `.env` bleibt, wie sie ist.
- **Neue Dateien** unter `uploads/individuelle-mails/` im Volume `uploads_data` (gehört `nextjs`,
  kein `chown` nötig).
- **Mailvorlagen:** neu ist nur „Individuelle E-Mail aus einem Vorgang“ (`individuelle-mail`,
  Gruppe „Allgemein“). Ohne gespeicherte Zeile gilt der Text aus dem Code — **kein SQL nötig, und
  die Vorlage nicht vorsorglich im Editor speichern** (eine gespeicherte Zeile friert den heutigen
  Text ein). Keine bestehende Vorlage ist geändert, „Text auf Standard zurücksetzen“ ist nirgends
  nötig.
- **Datumsformat in Mails** (`e25e071`) — „09.10.2026“ statt „9.10.2026“, kein Handschritt nötig:
  - drei Mails mit Vorlage: `{{vertragsende}}` in `contract-end-supervisor-reminder` und
    `contract-end-eskalation`, die Liste in `contract-end-unbearbeitet`. Nur der eingesetzte Wert
    ändert sich, die Vorlagentexte nicht;
  - zwei Mails mit festem Text im Code (ohne Vorlage): die BEM-Einladung zur Einwilligung
    (Fußnote „Dieser Link ist bis zum 09.10.2026 gültig“) und die SMTP-Testmail („Gesendet am“
    jetzt in deutscher Zeit mit Sekunden).
- **CSV-Export Onboarding:** Geburtsdatum, Vertragsbeginn, Vertragsende und voraussichtliches
  Vertragsende jetzt mit führender Null. HR prüft den LOGA-Import einmal (Abschnitt 8).
- **Seed** (`7c09755`): `prisma/seed.ts` ist geändert, läuft aber nur in einer Datenbank ohne
  Benutzer. Auf dem Server **nie** `node prisma/seed.js` ausführen (6.3).

<sub>Belege für Claude: Code-Default der Vorlage über `resolveEventTemplate` in
`src/lib/mailer.ts`; Seed nur bei `userCount === 0` (`prisma/seed-check.js`, Ende von `main`);
Datumsstellen in `src/lib/contract-end-reminder.ts`, `src/lib/laeufe/vertragsende-erinnerungen.ts`,
`src/lib/bem-einladung.ts`, `src/lib/mailer.ts` (`testSmtpConnection`),
`src/app/api/onboarding/[id]/export/route.ts`.</sub>

### Was NICHT dabei ist

- **Branch `ux-umbau`** (neue Oberfläche, Vertragsende-Pilot mit Ansichtsschalter, Adressen
  `/vorgaenge/…`): bleibt auf seinem Branch, der Prototyp-Tag läuft lokal.
- **Keine automatischen Läufe** außer der Aufbewahrung in 6.2 (Liste „Nicht tun“ in 6.3; der Rest
  unter „Danach“ in Abschnitt 9).
- Keine Mailvorlage per SQL, keine Änderung an `.env`, Caddy oder n8n.

### Dauer (Schätzung, nicht gemessen)

| Abschnitt | Dauer | Portal |
|---|---|---|
| 1–2 Vorher prüfen, altes Image sichern | 20–30 min | läuft |
| 3 Holen, bauen, Vorschau | 15–30 min (Build diesmal mit `npm ci`) | läuft |
| 4.1–4.3 Anhalten, Sicherungen, Start | etwa 5 min (24.09.: 2 min; dazu jetzt die Uploads-Sicherung, am 29.09. 94 MB) | **nicht erreichbar** |
| 5 Nachher prüfen und Probe | 20–30 min | läuft |
| 6 Handschritte | 15–30 min | läuft |

### Zeitfenster

- **An einem Werktag, an dem HR erreichbar ist** (Kurztext und Probe).
- **Nicht zwischen 07:00 und 08:45, nicht nachts.** Die Standardzeiten der Läufe liegen bei
  03:00–03:30 (Löschläufe) und 07:00–08:30 (Erinnerungen und Fristen). Sie sind zwar alle aus
  (1.8), aber ein doch eingeschalteter Lauf soll nicht mitten im Neustart stehen. Ein Update am
  Vormittag nach 08:45 berührt keine dieser Zeiten.
- **Nicht montags gegen 09:00:** Dann liefert der n8n-Flow „Email-Vertragsende-Personal 3.0“ die
  Vertragsenden ins Portal (`docs/module/vertragsende/vertragsende-phase2-plan.md`, Abschnitt 7).
- Gut geeignet: Dienstag bis Freitag zwischen 10 und 12 Uhr.
- **HR am Vortag informieren** und bitten, ab Schritt 4.1 bis zur Freigabe nach 5.1 nichts im
  Portal zu speichern. Öffentliche Links (Fragebogen, Modalitäten, Upload-Seite) lassen sich nicht
  anhalten — wer sie in diesen Minuten öffnet, sieht eine Fehlerseite und versucht es später.

**Textvorschlag für die Ankündigung:** „Am [Tag] zwischen [Uhrzeit] und [Uhrzeit] wird das
HR-Portal aktualisiert. Es ist dabei für einige Minuten nicht erreichbar. Bitte speichern Sie in
dieser Zeit nichts im Portal; wir geben Bescheid, sobald es wieder läuft. Außerdem eine Bitte:
Nennen Sie uns bis [Tag] alle dienstlichen E-Mail-Endungen (der Teil nach dem @, z. B.
@fes-minden.de), die Führungskräfte und Abteilungen der Einrichtungen benutzen. Daraus entsteht die
Liste der Endungen, an die das Portal künftig auch Adressen annimmt, die nicht im Vorgang
hinterlegt sind.“

Die Antwort auf diese Bitte braucht Handschritt 6.1. Liegt sie am Tag des Updates nicht vor, bleibt
6.1 liegen, bis sie da ist — das Update selbst hängt nicht daran.

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

**Erwartet:** keine Ausgabe. In `~/deploy-main-2026-10/` landen die Arbeitsdateien.

### 1.1 Stand des Repos (der wichtigste Schritt)

```bash
sudo git log -1 --oneline
```

**Erwartet:**

```
f6d3daf docs: Deploy-Ablauf Paket 4 auf den Zeitplaner umgestellt
```

Weicht ab → **STOPP, Ausgabe an Claude.** Diese Anleitung gilt nur für diesen Ausgangsstand.

```bash
sudo git status --short
```

**Erwartet:** nur Zeilen `?? backups/<datei>` — die Sicherungen früherer Deploys, z. B.
`?? backups/vor-schema-abgleich-20260930-….sql` oder `?? backups/vor-deploy-paket4-manuell.sql`.
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

**Erwartet:** Die Zeile beginnt mit `2026-09-30T` (UTC), danach `sha256:…`. Ein anderes Datum →
**STOPP, Ausgabe an Claude** (dann wurde seit dem 30.09. neu gebaut oder neu angelegt).

### 1.3 Die Datenbank entspricht dem Schema von `f6d3daf`

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

**Erwartet:** `0`. Bei `2` wurde die Datenbank außerhalb eines Deploys verändert, bei `1` gab es
einen Fehler → **STOPP, Ausgabe an Claude.** Es ist derselbe Vergleich, den der Entrypoint bei
jedem Start macht.

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
`Verf.`): in der zweiten Zeile (Docker) **mindestens 3 GB** (24.09.: 15 GB) — diesmal entsteht
auch die Schicht mit den Abhängigkeiten neu —, in der ersten mindestens 1 GB (24.09.: 362 GB).
Weniger → **STOPP, Ausgabe an Claude.**

```bash
sudo docker image ls
```

**Erwartet:** eine Liste; Zeile `hr_portal_credo-app   latest` mit einer Größe um 700 MB (24.09.:
656 MB). Nur notieren. Fehlermeldung statt Liste → **STOPP, Ausgabe an Claude.**

```bash
sudo du -sh backups
```

**Erwartet:** eine Größe (24.09.: 4,9 MB, seit 30.09. eher mehr). Nur notieren.

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

### 1.7 Die neuen Tabellen und die neue Vorlage gibt es noch nicht

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT to_regclass('public.individuelle_mails') AS mails, to_regclass('public.individuelle_mail_anhaenge') AS anhaenge;"
```

**Erwartet:** beide Spalten leer:

```
 mails | anhaenge
-------+----------
       |
(1 row)
```

Steht ein Name darin → **STOPP, Ausgabe an Claude** (widerspricht 1.3).

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT COUNT(1) AS zeilen FROM email_templates WHERE event = 'individuelle-mail';"
```

**Erwartet:** `zeilen` = `0`. Weicht ab → **STOPP, Ausgabe an Claude.**

### 1.8 Automatische Läufe sind aus

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT schluessel, aktiv, probelauf, uhrzeit FROM automatische_laeufe ORDER BY uhrzeit, schluessel;"
```

**Erwartet:** `(11 rows)`, in der Spalte `aktiv` überall `f`. Steht irgendwo `t` → **STOPP, Ausgabe
an Claude** (kein Fehler, aber dann gehören Zeitfenster und Abschnitt 6 anders geplant).

---

## 2 · Sichern, Teil 1 (Portal läuft)

### 2.1 Altes Image etikettieren (für den Rückfall)

```bash
sudo docker tag "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)" hr-portal-app:f6d3daf
```

**Erwartet:** keine Ausgabe.

```bash
sudo docker image ls hr-portal-app
```

**Erwartet:** eine Zeile `hr-portal-app   f6d3daf`, dazu die älteren Etiketten `7bc91ec` und
`ae490ba`, falls noch vorhanden. Fehlt die Zeile `f6d3daf` → **STOPP, Ausgabe an Claude.** Ohne
dieses Etikett wäre das alte Image nach dem Build namenlos und könnte beim Aufräumen verschwinden.

### 2.2 Leseprobe der Uploads

Liest das ganze Volume mit derselben Kennung und demselben Image wie die Sicherung in 4.1 — aber
nur lesend und ohne ein Archiv zu schreiben. `UPLOADS_VOL` stammt aus 1.6.

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" hr-portal-app:f6d3daf -c 'set -o pipefail; find /daten -type f | wc -l; tar cf - -C /daten . | wc -c && echo "tar OK"'
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

**Erwartet:** `Already on 'main'`, dann `Updating f6d3daf..…` und `Fast-forward` mit einer
Dateiliste. Normal und kein Grund zum Anhalten sind davor Zeilen `From …` (vom Holen) und
`Your branch is behind 'origin/main' by … commits … (use "git pull" to update your local branch)`
— das `git pull` steckt schon im selben Befehl. Weicht ab (Konflikt, `error`, `fatal`, eine Frage
nach Zugangsdaten) → **STOPP, Ausgabe an Claude.** Das Portal läuft unverändert weiter.

### 3.2 Was angekommen ist

```bash
sudo git log --oneline -3
```

**Erwartet:** oben der Commit, der diese Anleitung enthält (ein `docs`-Commit; ebenso in Ordnung:
ein späterer Doku-Commit oder ein Merge-Commit), darunter `a2e2e64 fix(elternzeit): …`. Nur zum
Ansehen — geprüft wird mit den nächsten Befehlen.

```bash
sudo git merge-base --is-ancestor a2e2e64 HEAD && echo "a2e2e64 enthalten"
```

**Erwartet:** `a2e2e64 enthalten`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git log --oneline f6d3daf..a2e2e64
```

**Erwartet:** genau diese 18 Zeilen:

```
a2e2e64 fix(elternzeit): Upload der Person ersetzt nur ihre eigene Geburtsurkunde
75d8277 fix(verbeamtung): Reiter Dokumente ordnet Dateien nach documentType zu
e25e071 fix(zeitzone): Datum und Uhrzeit im Server-Code in deutscher Zeit
7c09755 fix(seed): nur anlegen, was fehlt - nie Bestehendes aendern oder loeschen
4da68f1 Merge branch 'claude/competent-turing-c6caae' (Betriebsstätte aus der Auswahl des Formulars)
6e0e2ce fix(vertragsende): Versandergebnis beachten; keine neue Anfrage nach der Antwort
b7c8532 fix(vertragsende): Betriebsstätte aus der Auswahl des Formulars lesen
aea163a Merge branch 'perf/tagezwischen-direkte-rechnung'
099680d perf(kalendertag): alte tageZwischen-Schleife und Vergleichstest entfernt
232579e perf(kalendertag): tageZwischen rechnet direkt; alte Schleife bleibt für den Vergleich
3f6d3b0 test(vertragsende): Sperrklinke für Routen mit Vertragsende-Datensatz; Befunde der Durchsicht
6982015 fix(vertragsende): supervisorToken nicht mehr in den Antworten der HR-Routen
b6e1c8a fix(checklisten): Reihenfolge wirkt im Vorgang; Verschieben, Ziehen und Fokus nachgebessert
bfb0665 test: Sperrklinke gegen neue Altmuster der Oberfläche (je Datei, ohne Kommentare)
2fbc4e4 fix(checklisten): Befunde der Durchsicht am Verschieben im Editor
226338d feat(checklisten): Reihenfolge der Punkte im Vorlagen-Editor ändern
da5c743 feat: Paket 3 - individuelle E-Mail mit Anhang aus einem Vorgang
1c0967b docs(handbuch): Automatische Läufe und Reiter „E-Mails“
```

Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git rev-list --count f6d3daf..a2e2e64
```

**Erwartet:** `18`. Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git diff --stat a2e2e64 HEAD -- . ':!docs' ':!CLAUDE.md'
```

**Erwartet:** **keine** Ausgabe — nach `a2e2e64` kam nur Doku. Erscheint eine Datei →
**STOPP, Ausgabe an Claude.**

```bash
sudo git diff --stat f6d3daf HEAD -- docker-compose.yml Dockerfile entrypoint.sh package.json package-lock.json .env.production.example .dockerignore next.config.ts prisma/seed-check.js public/system-dokumente
```

**Erwartet:** genau

```
 package.json | 1 +
 1 file changed, 1 insertion(+)
```

Weicht ab → **STOPP, Ausgabe an Claude.**

```bash
sudo git status --short
```

**Erwartet:** wie in 1.1, nur Zeilen `?? backups/…`. Weicht ab → **STOPP, Ausgabe an Claude.**

### 3.3 Image bauen (das Portal läuft weiter)

```bash
sudo docker compose build app
```

**Erwartet:** Der Build endet ohne `ERROR`. Diesmal läuft der Schritt `RUN npm ci --ignore-scripts`
neu (nicht `CACHED`), weil sich `package.json` geändert hat — das dauert einige Minuten länger als
sonst. Der alte Container läuft dabei unverändert weiter.

Dabei zum ersten Mal zu sehen und **bekannt, kein Grund zum Abbruch:** Zeilen `npm warn deprecated …`
(etwa zu `glob` mit dem Satz „… widely publicized security vulnerabilities …“, zu `inflight`,
`@types/bcryptjs`, `whatwg-encoding`), eine Zusammenfassung wie `… vulnerabilities (…)` mit dem
Rat `npm audit fix` (nicht ausführen) und `npm notice …` zu einer neuen npm-Version.

**STOPP, Ausgabe an Claude** nur bei `ERROR` (`npm error`, `ERROR: failed to solve …`) oder einer
Netzwerk-Meldung wie `ETIMEDOUT`, `ENOTFOUND`, `ECONNRESET` oder `registry.npmjs.org`. Das Portal
läuft weiter; ein zweiter Versuch später schadet nicht.

### 3.4 Vorschau: Was `db push` gleich tun wird (nur lesend)

Der Befehl startet das **neue** Image einmal kurz ohne Entrypoint und vergleicht seine
Schema-Datei mit der laufenden Datenbank. Er schreibt nichts in die Datenbank.

```bash
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > ~/deploy-main-2026-10/vorschau-delta.sql
```

**Erwartet:** keine Ausgabe oder nur ein Kasten „Update available …“ von Prisma (harmlos). Eine
Fehlermeldung → **STOPP, Ausgabe an Claude.**

Die folgenden drei Befehle lesen diese Datei über ihren vollen Pfad — sie gehen also auch nach einer
neuen Anmeldung (dann vorher nur 1.0).

```bash
for m in 'ADD COLUMN' 'ADD VALUE' 'CREATE TABLE' 'INDEX' 'ADD CONSTRAINT'; do printf '%-15s %s\n' "$m" "$(grep -c "$m" ~/deploy-main-2026-10/vorschau-delta.sql)"; done
```

**Erwartet:**

```
ADD COLUMN      0
ADD VALUE       0
CREATE TABLE    2
INDEX           4
ADD CONSTRAINT  3
```

`CREATE TABLE`: die zwei neuen Tabellen. `INDEX`: drei Indizes an `individuelle_mails` (einer davon
eindeutig, `dialogKennung`) und einer an `individuelle_mail_anhaenge`. `ADD CONSTRAINT`: die drei
Fremdschlüssel; die Primärschlüssel stehen in den `CREATE TABLE`-Blöcken und zählen hier nicht mit.
Lokal am 09.10.2026 genau so gezählt (Schema `f6d3daf` → `a2e2e64`, ohne Datenbank).

```bash
grep -nE 'DROP|RENAME|ALTER COLUMN .* TYPE|SET NOT NULL' ~/deploy-main-2026-10/vorschau-delta.sql || echo "keine DROP/RENAME/TYPE-Zeile"
```

**Erwartet:** `keine DROP/RENAME/TYPE-Zeile`.

```bash
grep 'CREATE TABLE' ~/deploy-main-2026-10/vorschau-delta.sql
```

**Erwartet:** genau diese zwei Zeilen (lokal in dieser Reihenfolge; umgekehrt ist auch in Ordnung)

```
CREATE TABLE "individuelle_mails" (
CREATE TABLE "individuelle_mail_anhaenge" (
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

Datenbank (aus dem DB-Container, `pg_dump` 16, passend zum Einspielen bei einem Rückfall):

```bash
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-deploy-main-2026-10-manuell.sql'
```

**Erwartet:** keine Ausgabe.

```bash
sudo ls -l backups/vor-deploy-main-2026-10-manuell.sql
```

**Erwartet:** um 1,5 MB oder größer (24.09.: 1 561 038 Bytes).

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
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" -v "$PWD/backups:/sicherung" hr-portal-app:f6d3daf -c 'tar czf /sicherung/uploads-vor-deploy-main-2026-10.tar.gz -C /daten . && echo "tar OK"'
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
kommen —, dann `Strg+C`
drücken — das beendet nur die Anzeige, nicht den Container — und mit „Log sichern“ in 4.3
weitermachen. Erscheint nach 3 Minuten kein `✓ Ready`: `Strg+C`, weiter mit 4.4.

### 4.3 Was im Log stehen muss

In dieser Reihenfolge, `…` steht für Zahlen und Namen:

```
CREDO HR-Portal startet...
Umgebungsvariablen geprueft: OK
Schema-Unterschied erkannt — Sicherung wird angelegt...
Sicherung abgelegt: /backups/vor-schema-abgleich-JJJJMMTT-HHMMSS.sql (… Bytes)
Datenbank-Schema wird synchronisiert...
🚀  Your database is now in sync with your Prisma schema. Done in …
Datenbank-Schema synchronisiert.
Pruefe ob Seed notwendig...
System-Vorlage (Fuehrungszeugnis) ist aktuell.
Datenbank bereits geseeded (… User vorhanden). Seed uebersprungen.
Next.js Server startet auf Port 3000...
[Zeitplaner] Uhr gestartet (jede Minute).
 ✓ Ready in …
```

- **Dazwischen dürfen stehen:** Zeilen von Prisma (`Prisma schema loaded …`, `Datasource "db" …`,
  ein Kasten „Update available …“), von Next.js (`▲ Next.js …`, `- Local: …`, `✓ Starting...`)
  und, bei mehr als zehn alten Entrypoint-Sicherungen, `Alte Sicherung entfernt: …`. Die
  Zeitplaner-Zeile kann auch nach `✓ Ready` stehen.
- **Warnung von `--accept-data-loss`:** voraussichtlich keine. Eine Warnung, die nur
  `individuelle_mails` oder `individuelle_mail_anhaenge` nennt, ist unkritisch (neu und leer). Jede
  andere Warnung → Ausgabe an Claude, den Container dabei **nicht** anhalten.
- **Keine Migrationszeile:** `prisma/seed-check.js` ist unverändert, alle Merker stehen seit dem
  24.09. Erscheint eine Zeile mit `Vertragsende-Label`, `parallele Spuren`, `Abteilungsaufgaben`,
  `Masernschutz`, `Kostenstellen`, `Betriebsnummer`, `MINIJOB` oder `currentStep` → Ausgabe an
  Claude.
- **`Keine User gefunden — Seed wird ausgefuehrt...`** darf nie erscheinen → sofort an Claude.
- **System-Vorlage:** `ist aktuell` (`public/system-dokumente/` ist unverändert); `angelegt` oder
  `aktualisiert` → Ausgabe an Claude.

Log sichern:

```bash
sudo docker compose logs --no-log-prefix app > ~/deploy-main-2026-10/start-log.txt
```

**Erwartet:** keine Ausgabe.

Die wichtigen Zeilen herausziehen:

```bash
sudo docker compose logs --no-log-prefix app | grep -E 'Schema|Sicherung|synchron|in sync|Seed|System-Vorlage|Zeitplaner|Ready|FATAL|Fehler|fehlgeschlagen|data loss|Migration'
```

**Erwartet:** genau diese Zeilen (`…` steht für Zahlen und Namen; die Zeitplaner-Zeile darf auch
nach `✓ Ready` stehen):

```
Schema-Unterschied erkannt — Sicherung wird angelegt...
Sicherung abgelegt: /backups/vor-schema-abgleich-JJJJMMTT-HHMMSS.sql (… Bytes)
Datenbank-Schema wird synchronisiert...
🚀  Your database is now in sync with your Prisma schema. Done in …
Datenbank-Schema synchronisiert.
Pruefe ob Seed notwendig...
System-Vorlage (Fuehrungszeugnis) ist aktuell.
Datenbank bereits geseeded (… User vorhanden). Seed uebersprungen.
[Zeitplaner] Uhr gestartet (jede Minute).
 ✓ Ready in …
```

Die Zeile `Next.js Server startet auf Port 3000...` fehlt hier immer (der Filter trifft sie nicht).
Eine zusätzliche Zeile `Alte Sicherung entfernt: …` ist in Ordnung. Jede Zeile mit `FATAL`,
`Fehler`, `fehlgeschlagen` oder `Migration` → Ausgabe an Claude.

> **`start-log.txt` an Claude schicken**, bei jedem Deploy (enthält keine Geheimnisse).

### 4.4 Fehlschlag erkennen

| Zeichen im Log | Bedeutung | Sofort |
|---|---|---|
| `Datenbank-Schema ist bereits deckungsgleich — kein Abgleich noetig.` beim **ersten** Start | Es läuft noch das alte Image (Build gescheitert?). Datenbank unverändert. | Befehl C, dann Ausgabe und `start-log.txt` an Claude |
| `FATAL: Sicherungsverzeichnis /backups fehlt.` | Einhängung fehlt. Datenbank unverändert. | an Claude |
| `FATAL: Sicherung nach … fehlgeschlagen.` | Rechte auf `backups/`. Datenbank unverändert. | Befehl A aus 1.4; der Container startet von selbst neu |
| Prisma-Fehlermeldung statt `Datenbank-Schema synchronisiert.`, und `docker compose ps` zeigt `Restarting` | Push gescheitert, Neustart-Schleife | **sofort** Befehl D, dann an Claude. Jeder Neustart legt eine Sicherung an; nach zehn wäre die vom Update weggeräumt. |
| `Seed-Check Fehler:` oder `Seed-Check fehlgeschlagen (nicht kritisch).` | Das Portal startet trotzdem | an Claude mit `start-log.txt` |
| `[Zeitplaner] Uhr aus (ZEITPLANER_AKTIV).` | In der `.env` steht `ZEITPLANER_AKTIV=false` | an Claude |
| `[Zeitplaner] Takt fehlgeschlagen: …` | Die Uhr erreicht das Portal nicht | an Claude |
| Kein `✓ Ready`, oder 5.1 meldet einen Fehler | Die App startet nicht | an Claude mit `start-log.txt` |

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
`pg_dump`-Versionen 18 und 16). Weicht ab → Ausgabe an Claude (das Portal läuft weiter).

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

```bash
curl -s https://hr.fes-credo.de/api/health
```

**Erwartet:** dasselbe von außen über Caddy. Weicht ab → **STOPP, Ausgabe an Claude.**

**Jetzt HR Bescheid geben:** Das Portal läuft wieder.

### 5.2 Datenbank

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

**Erwartet:** `0` — Datenbank und neues Schema sind deckungsgleich. Weicht ab → Ausgabe an Claude.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT (SELECT COUNT(1) FROM individuelle_mails) AS mails, (SELECT COUNT(1) FROM individuelle_mail_anhaenge) AS anhaenge;"
```

**Erwartet:**

```
 mails | anhaenge
-------+----------
     0 |        0
(1 row)
```

Weicht ab → Ausgabe an Claude.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('individuelle_mails', 'individuelle_mail_anhaenge') ORDER BY 1;"
```

**Erwartet:** sechs Zeilen (vier Indizes und zwei Primärschlüssel):

```
 individuelle_mail_anhaenge_mailId_idx
 individuelle_mail_anhaenge_pkey
 individuelle_mails_createdAt_idx
 individuelle_mails_dialogKennung_key
 individuelle_mails_modul_refId_createdAt_idx
 individuelle_mails_pkey
(6 rows)
```

Fehlt `individuelle_mails_dialogKennung_key` → Ausgabe an Claude (ohne ihn ließe sich eine Mail
doppelt nachweisen).

### 5.3 Probe im Browser

Angemeldet mit einem Konto mit Bearbeitungsrecht (z. B. dem eigenen SUPER_ADMIN-Konto).
Abweichungen hier sind kein Grund, das Portal anzuhalten: Bildschirmfoto oder Meldung an Claude.

1. **Anmelden.** Das Dashboard lädt wie gewohnt.
2. **Individuelle E-Mail an die eigene Adresse.**
   - Vorgang wählen: am besten einen Testvorgang mit Ihrer eigenen Adresse (etwa aus der Probe vom
     30.09., falls angelegt). Gibt es keinen, einen beliebigen Vorgang nehmen und unter „An“
     „Andere Adresse…“ mit Ihrer **eigenen dienstlichen** Adresse wählen. Die Mail geht dann nur an
     Sie, steht aber als Nachweis in diesem Vorgang (Reiter „E-Mails“ und Karte).
   - Reiter „Dokumente“ → Karte **„Individuelle E-Mail“** → „E-Mail schreiben…“.
   - Betreff „Test HR-Portal – bitte ignorieren“, ein Satz als Nachricht, als Anhang eine kleine
     PDF-Datei **ohne Personendaten** (z. B. eine leere Seite) → „E-Mail senden“.
   - **Erwartet:** Im Dialog die grüne Meldung „✓ E-Mail „…“ an … versendet.“, darunter der
     Anhang — dort „Öffnen“ klicken, der Browser lädt die PDF herunter (immer als Download, so
     gewollt). Die Mail kommt mit Betreff, Text und Anhang an. Nach „Schließen“ zeigt die Karte
     neben „E-Mail schreiben…“ die Zeile „Zuletzt am …
     an … – „Test HR-Portal – bitte ignorieren“ · 1 Anhang“ (einen Öffnen-Verweis hat die Karte
     nicht; später geht das über „E-Mail schreiben…“ → „Bisher gesendete E-Mails (1)“). Im Reiter
     „E-Mails“ des Vorgangs steht die Mail. Auf die Probe-Mail **nicht antworten** — die Antwort
     ginge an das HR-Postfach.
   - Rote Meldung (etwa „SMTP …“, „Adresse nicht freigegeben“) → Meldung an Claude.
3. **Verbeamtung:** einen Vorgang mit hochgeladenen Unterlagen öffnen, Reiter „Dokumente“.
   **Erwartet:** Jede hochgeladene Datei steht bei ihrer Dokumentart; Arten mit Datei stehen nicht
   mehr auf „Ausstehend“, und nicht mehr alles liegt unter „Weitere Dokumente“.
4. **Vertragsende:** im Dashboard den Bereich Vertragsende öffnen und einen Vorgang ansehen.
   **Erwartet:** Die Seite lädt wie bisher. Hat die Führungskraft schon geantwortet und eine
   Betriebsstätte gewählt, steht bei „Betriebsstätte“ ein Name statt „—“. **Nicht** „Anfrage an
   Vorgesetzten senden →“, „Anfrage erneut senden“ oder „Erinnerung senden“ klicken — das schickt
   echte Mails an Führungskräfte.
5. **Optional, Checklisten-Vorlagen:** eine Vorlage zum Bearbeiten öffnen. **Erwartet:** je Punkt
   ein Griff zum Ziehen, zwei Pfeile und „+ Punkt darunter“. Ohne Speichern schließen.

**Außerdem nicht klicken, das verschickt Mails an andere** (zusätzlich zu den drei
Vertragsende-Knöpfen aus Punkt 4): „Neuer Vorgang“, „Vorgesetzten-Link erstellen“, „Abteilungen
informieren…“, Dokumentenpaket „Versenden“, „Unterlagen nachfordern…“, unter Einstellungen →
Automatische Läufe „Jetzt ausführen“.

### 5.4 Versandprotokoll nach der Probe

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT event, status, COUNT(1) AS anzahl FROM email_logs WHERE event = 'individuelle-mail' GROUP BY event, status;"
```

**Erwartet:** eine Zeile `individuelle-mail | SENT | 1` (je Probe-Mail eine mehr). `FAILED` oder
`SKIPPED` → Ausgabe an Claude.

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT (SELECT COUNT(1) FROM individuelle_mails) AS mails, (SELECT COUNT(1) FROM individuelle_mail_anhaenge) AS anhaenge;"
```

**Erwartet:** `1 | 1` nach einer Probe-Mail mit einem Anhang. Weicht ab → Ausgabe an Claude.

Im Portal zeigt Einstellungen → **Versandprotokoll** dieselbe Mail als „versendet“.

---

## 6 · Handschritte im Portal

Die Einstellungen erreichen nur SUPER_ADMIN und HR_LEITUNG.

### 6.1 Freigabeliste pflegen (empfohlen, sobald die Liste von HR vorliegt)

Voraussetzung ist die Antwort von HR auf die Bitte in der Ankündigung (Abschnitt 0, „Zeitfenster“).
Fehlt sie noch, diesen Schritt verschieben, bis sie da ist — eine unvollständige Liste sperrt neu
eingetippte Adressen von Führungskräften.

Einstellungen → **SMTP** → Feld **„Erlaubte Domains für abweichende Empfänger“**.

- **Wofür sie gilt:** für jede Adresse, die **nicht** im Vorgang hinterlegt ist — im
  Dokumentenpaket, in der neuen individuellen E-Mail, bei „Unterlagen nachfordern“ und bei frei
  eingetippten Adressen von Führungskräften (Vorgesetzten-Link im Onboarding, Führungskraft im
  Offboarding). Der Hilfetext unter dem Feld nennt nur das Dokumentenpaket; er ist veraltet.
- **Leer heißt: keine Einschränkung** (heutiger Stand). Die im Vorgang hinterlegte Adresse der
  Person geht immer durch, auch an private Postfächer.
- **Eintragen:** die dienstlichen Domains der Einrichtungen, mit Komma getrennt, z. B.
  `fes-minden.de, credo-gruppe.de` — die vollständige Liste von HR. **Keine
  Freemail-Domains** (`gmail.com`, `web.de`, `gmx.de`, `t-online.de` …). Verglichen wird die Domain
  exakt; Unterdomains einzeln eintragen.
- **Folge:** Ab dann lehnt das Portal eine neu eingetippte Führungskraft- oder Empfängeradresse
  mit einer anderen Domain ab. Darum alle Domains aufnehmen, die Führungskräfte und Abteilungen
  benutzen.

Optional, nur lesend und **nicht geprobt**: Welche Domains Führungskräfte und Abteilungen heute
benutzen (nur Domains und Zahlen, keine Namen):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT lower(split_part(adresse, $$@$$, 2)) AS domain, COUNT(1) AS anzahl FROM (SELECT "supervisorEmail" AS adresse FROM onboarding_processes UNION ALL SELECT "supervisorEmail" FROM offboarding_processes UNION ALL SELECT "supervisorEmail" FROM contract_end_processes UNION ALL SELECT email FROM department_configs) x WHERE adresse LIKE $$%@%$$ GROUP BY 1 ORDER BY 2 DESC;'
```

**Erwartet:** eine Liste `domain | anzahl`. Eine Fehlermeldung → nur an Claude melden, für den
Deploy ohne Belang.

Nach dem Speichern: Einstellungen → SMTP zeigt die Liste. Kurz gegenprobieren: Die Seite eines
Vorgangs **neu laden** (`F5` — die Karte liest die Liste nur beim Laden der Seite; ist die Seite aus
5.3 noch offen, kennt sie die neue Liste nicht), dann in der Karte „Individuelle E-Mail“ →
„E-Mail schreiben…“ unter „An“ „Andere Adresse…“ wählen und eine Adresse mit einer **nicht**
eingetragenen Domain eintippen (nicht senden). **Erwartet:** darunter die rote Meldung „An diese
Adresse darf nicht versendet werden: … ihre Domain ist nicht freigegeben.“, „E-Mail senden“ bleibt
gesperrt. Dialog schließen.

### 6.2 Lauf „Aufbewahrung erzeugter Dokumente“: erst Probelauf, dann einschalten

**Warum jetzt:** Der Dialog der individuellen E-Mail sagt zu, dass Text und Anhänge nach 12
Monaten gelöscht werden. Das tut nur dieser Lauf; ohne ihn geschieht es nie. Derselbe Lauf löscht
auch erzeugte Briefe aus Vorlagen nach 12 Monaten (die führende Ablage ist das DMS). Erzeugte
Briefe gibt es erst seit Juni 2026 — gelöscht wird also frühestens im Juni 2027.

**Vorher HR Bescheid sagen:** Jeder Probelauf schickt eine Berichtsmail an das HR-Postfach (nur
Zahlen, keine Namen). Sie gehört zu diesem Schritt und ist kein Fehler.

1. Einstellungen → **Automatische Läufe** → Karte **„Aufbewahrung erzeugter Dokumente“**
   (Kennzeichen „löscht endgültig“, Status „aus“).
2. **„Probelauf jetzt“** klicken. Nach kurzer Zeit steht unter „Letzter Lauf“ ein Ergebnis mit
   „· Probelauf“; „Protokoll (1)“ aufklappen.
   **Erwartet:** „Letzter Lauf“ zeigt **„ohne Befund“**; im Protokoll „Würde löschen (Dokumente)“
   `0` und „Würde leeren (individuelle E-Mails)“ `0`.
   „bitte prüfen“ (etwa mit „Antwort unvollständig“), „fehlgeschlagen“, „abgebrochen“ oder eine
   Zahl größer 0 → **STOPP, nicht einschalten, an Claude.**
3. Uhrzeit `03:15` stehen lassen. Das Kästchen **„als Probelauf“ muss leer sein** — ist der Haken
   gesetzt (der gespeicherte Wert, in 1.8 Spalte `probelauf` = `t`), ihn entfernen. Dann
   **„Einschalten“**. Die Rückfrage „… Er LÖSCHT ab dann täglich endgültig.“ bestätigen. Steht in
   der Rückfrage stattdessen „(als Probelauf)“, abbrechen und das Kästchen prüfen.
   **Erwartet:** Status „an“ (nicht „an · Probelauf“), „Nächster Lauf“ morgen um 03:15.
4. Am nächsten Tag: „Letzter Lauf“ zeigt „ohne Befund“ (ohne „· Probelauf“). Eine Berichtsmail
   kommt nur bei Problemen.

### 6.3 Nicht tun

Diese Liste gilt für den ganzen Ablauf; andere Stellen verweisen hierher.

- Die Vorlage **„Individuelle E-Mail aus einem Vorgang“** unter E-Mail-Vorlagen **nicht
  speichern** (ansehen und „Test senden“ an die eigene Adresse sind in Ordnung).
- Außer der Aufbewahrung aus 6.2 **keine weiteren Läufe einschalten**, kein „Jetzt ausführen“
  (die übrigen zehn bleiben aus, siehe „Danach“ in Abschnitt 9).
- **Nie `node prisma/seed.js`** im Container ausführen — ältere Anleitungen nennen den Befehl noch.
- Keine Knöpfe, die Mails an andere schicken (Liste in 5.3).

---

## 7 · Rückfall

### 7.1 Was man NICHT tun darf

- **Das alte Image mit normalem Entrypoint starten, sobald echte individuelle E-Mails versendet
  sind.** Sein Entrypoint sähe die zwei neuen Tabellen als überzählig an und löschte sie mit
  `db push --accept-data-loss` ohne Rückfrage — samt aller Nachweise (Datum, Empfänger, Betreff,
  Prüfsummen). Die Dateien unter `uploads/individuelle-mails/` blieben verwaist liegen. Dasselbe
  gilt für `sudo git checkout f6d3daf` mit neuem Build. (Ohne Entrypoint: Weg C, 7.5.)
- `sudo docker compose down -v` — löscht Datenbank und Uploads.
- `node prisma/seed.js` (6.3) — im alten Image steckt zudem noch der alte Seed, der gepflegte
  Mandantennamen, Fragebogen- und Checklisten-Vorlagen überschreibt.
- `git clean`, `git add -A`, `git stash -u` im Projektordner — sammelt oder löscht die Sicherungen.
- Eine Entrypoint-Sicherung (`vor-schema-abgleich-…`, `pg_dump` 18) in die Datenbank einspielen —
  sie scheitert an PostgreSQL 16 und hinterließe ein leeres Schema (Lehre 3 vom 24.09.).

### 7.2 Erst entscheiden: vorwärts oder zurück

**Vorwärts reparieren ist fast immer besser:** Ein Fehler im Code wird mit einem neuen Commit
behoben und neu ausgerollt. Ändert sich das Schema dabei nicht, meldet der Entrypoint „bereits
deckungsgleich“ und macht weder Sicherung noch Push. **Zurück nur nach Rücksprache mit Claude.**

### 7.3 Weg A: altes Image, solange keine echte individuelle E-Mail versendet ist

Für dieses Update gibt es einen einfachen Rückweg: Die Datenbank unterscheidet sich vom alten
Schema nur durch die zwei neuen Tabellen. Startet das alte Image, löscht sein Entrypoint genau
diese beiden — alles andere bleibt, auch was seit dem Start gearbeitet wurde. Das ist **nur sauber,
solange die Tabellen leer sind** (oder nur die eigenen Probe-Mails aus 5.3 enthalten, deren
Nachweis dann verloren geht).

**Bewusste Abweichung von den früheren Anleitungen.** Dort hieß es: das alte Image nie mit dem
normalen Entrypoint gegen die neue Datenbank starten ([deploy-paket4-stufe1.md](deploy-paket4-stufe1.md),
7.1). Damals hätte
der Push Spalten an Bestandstabellen gelöscht. Hier ist es zulässig, weil der Rückweg-Push nur die
zwei neuen Tabellen und ihre drei Fremdschlüssel löscht — die Vorschau unten prüft genau das,
**bevor** das Portal angehalten wird.

Bis zum Anhalten läuft das Portal unverändert weiter. Bei jedem STOPP davor nur Befehl E
ausführen (räumt die Override-Datei weg), dann Ausgabe an Claude.

Befehl E (nur bei STOPP):

```bash
sudo rm docker-compose.override.yml
```

**Erwartet:** keine Ausgabe.

**Schritt 1 — Projektordner:**

```bash
cd /vol/container/HR_Portal_CREDO
```

**Schritt 2 — prüfen, was verloren ginge** (nur lesend):

```bash
sudo docker exec -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db psql -U hrportal -d hr_portal -c "SELECT (SELECT COUNT(1) FROM individuelle_mails) AS mails, (SELECT COUNT(1) FROM individuelle_mail_anhaenge) AS anhaenge;"
```

**Erwartet:** `mails` höchstens so groß wie die Zahl Ihrer eigenen Probe-Mails. Größer → **STOPP,
kein Weg A, Ausgabe an Claude** (dann vorwärts reparieren, Weg C in 7.5 oder Weg B in 7.4).

**Schritt 3 — das alte Image ist noch da** (nur lesend):

```bash
sudo docker image ls hr-portal-app
```

**Erwartet:** eine Zeile `hr-portal-app   f6d3daf` (aus 2.1). Fehlt sie → **STOPP, kein Weg A,
Ausgabe an Claude** — ohne das Image versuchte Docker in Schritt 5 womöglich, es neu zu bauen, und
zwar aus dem neuen Code.

**Schritt 4 — Override-Datei anlegen** (wirkt erst beim Start in Schritt 10):

```bash
printf 'services:\n  app:\n    image: hr-portal-app:f6d3daf\n' | sudo tee docker-compose.override.yml
```

**Erwartet:** genau diese drei Zeilen:

```
services:
  app:
    image: hr-portal-app:f6d3daf
```

**Schritt 5 — Vorschau, was das alte Image tun wird** (nur lesend, das Portal läuft weiter):

```bash
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** keine Ausgabe oder nur ein Kasten „Update available …“ von Prisma (harmlos). Eine
Fehlermeldung (etwa `No such image` oder `Error`) → **STOPP: Befehl E, Ausgabe an Claude.**

```bash
grep -c 'DROP TABLE' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** `2`.

```bash
grep -c 'DROP CONSTRAINT' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** `3` (die drei Fremdschlüssel der neuen Tabellen).

```bash
grep 'DROP TABLE' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** genau diese zwei Zeilen, **Reihenfolge egal** (auf dem Server voraussichtlich
`individuelle_mail_anhaenge` zuerst, weil Prisma die Tabellen der Datenbank alphabetisch liest):

```
DROP TABLE "individuelle_mail_anhaenge";
DROP TABLE "individuelle_mails";
```

```bash
grep -c -v -E '^--|^$|DROP' ~/deploy-main-2026-10/rueckfall-delta.sql
```

**Erwartet:** `0` — außer dem Löschen der beiden Tabellen und ihrer drei Fremdschlüssel tut der
Push nichts. Lokal am 09.10.2026 so gezählt (Schema `a2e2e64` → `f6d3daf`: 2 × `DROP TABLE`,
3 × `DROP CONSTRAINT`, keine weitere Zeile).

Weicht in Schritt 5 eine Zahl oder Zeile ab → **STOPP, nicht anhalten: Befehl E, Ausgabe an Claude**
(dazu die Datei `~/deploy-main-2026-10/rueckfall-delta.sql`). Das Portal läuft unverändert weiter.

**Schritt 6 — Portal anhalten.** Ab hier ist das Portal nicht erreichbar.

```bash
sudo docker compose stop app
```

**Erwartet:** `Container hr-portal-app  Stopped`.

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

**Erwartet:** `Schema-Unterschied erkannt — Sicherung wird angelegt...`, `Sicherung abgelegt: …`,
`Datenbank-Schema wird synchronisiert...` (eine Warnung zum Löschen von `individuelle_mails` oder
`individuelle_mail_anhaenge` kann hier erscheinen und ist dann erwartet),
`Datenbank-Schema synchronisiert.`, `Datenbank bereits geseeded …`,
`[Zeitplaner] Uhr gestartet (jede Minute).`, `✓ Ready in …`. Sobald `✓ Ready` und eine
`[Zeitplaner]`-Zeile da sind, `Strg+C` (beendet nur die Anzeige). Jede andere Warnung, `FATAL` oder
nach 3 Minuten kein `✓ Ready` → `Strg+C`, **STOPP, Ausgabe an Claude**; die Fehlerbilder und
Befehl D stehen in 4.4 (bei `Restarting` sofort Befehl D). Sonst danach 5.1 wiederholen.

**Nach Weg A:** Die Override-Datei bleibt, solange das alte Image laufen soll. Solange sie
existiert, **nie** `sudo docker compose up -d --build` — der neue Build bekäme sonst das Etikett
`hr-portal-app:f6d3daf` und überschriebe das alte Image. Vor dem nächsten Vorwärts-Deploy wird sie
mit Befehl E gelöscht.

Der Repo-Stand bleibt `main`; die Reparatur kommt als neuer Commit. Sicherungen
`vor-deploy-main-2026-10-…` und `vor-rueckfall-…` aufheben.

### 7.4 Weg B: Sicherung aus 4.1 einspielen (nur mit Claude, nicht geprobt)

Nur, wenn Weg A nicht geht oder die Datenbank selbst beschädigt ist, und nur direkt nach dem
Update: Weg B verwirft **alles**, was seit 4.1 geschrieben wurde, in allen Tabellen (auch
Fragebögen über öffentliche Links). Ablauf wie in
[deploy-paket4-stufe1.md](deploy-paket4-stufe1.md), Abschnitt 7.3, mit der Sicherung
`backups/vor-deploy-main-2026-10-manuell.sql` und dem Etikett `hr-portal-app:f6d3daf`; vorher die
Prüfung „ob gearbeitet wurde“ aus [deploy-onboarding-pakete-2026-09.md](deploy-onboarding-pakete-2026-09.md),
Abschnitt 7.3. Die genauen Befehle gibt Claude im Ernstfall. Die Uploads bleiben, wie sie sind;
das Archiv aus 4.1 ist nur für einen Schaden am Volume da.

### 7.5 Weg C: altes Image ohne Entrypoint (nur mit Claude, nicht geprobt)

Für den Fall, dass schon **echte** individuelle E-Mails versendet sind und ihre Nachweise bleiben
sollen — dann gehen weder Weg A (löschte die beiden Tabellen) noch Weg B (verwürfe alles seit 4.1).
Wie in [deploy-paket4-stufe1.md](deploy-paket4-stufe1.md), Abschnitt 7.4: das alte Image über eine
Override-Datei mit `image: hr-portal-app:f6d3daf` **und** `entrypoint: ["node", "server.js"]`
starten. Ohne Entrypoint gibt es weder Sicherung noch Push noch Seed-Check; die beiden Tabellen
bleiben samt Inhalt stehen, der alte Code kennt und ignoriert sie, und die Dateien unter
`uploads/individuelle-mails/` bleiben liegen. Die Karte „Individuelle E-Mail“ gibt es in dieser
Zeit nicht. Der Entrypoint muss bei **jedem** Start umgangen sein (die Override-Datei bleibt so
lange stehen), sonst tritt 7.1 ein. Beim nächsten Vorwärts-Deploy findet der neue Entrypoint die
Tabellen schon vor; nichts geht verloren. Die genauen Befehle gibt Claude im Ernstfall.

---

## 8 · Kurztext für das Personalbüro

Zum Verschicken nach dem Update. Drei Stellen hängen an Handschritten; die Hinweise in eckigen
Klammern vor dem Verschicken entfernen — und den Satz dahinter gleich mit, wenn die Bedingung nicht
erfüllt ist:

- **„[nur wenn 6.2 eingeschaltet:]“** — die Löschung nach 12 Monaten geschieht nur über den Lauf
  aus 6.2. Endete 6.2 im STOPP, den Satz streichen.
- **„[nur wenn 6.1 erledigt:]“** — Punkt 7 stimmt erst mit gepflegter Freigabeliste (leer heißt:
  keine Einschränkung). Sonst Punkt 7 streichen.
- **„[nur mit beigelegtem Handbuch:]“** — das Portal zeigt das Handbuch nicht, und eine ältere
  Fassung bei HR enthält das Kapitel noch nicht. Den Satz nur stehen lassen, wenn der Mail die
  aktuelle Fassung beiliegt: den Ordner `docs/handbuch/` aus dem Repo, Stand `main` — `handbuch.html`
  **zusammen mit** dem Bildordner `screenshots/` (die Bilder werden von dort geladen), z. B. als
  ZIP. Claude stellt ihn auf Wunsch zusammen.

> **Betreff:** HR-Portal: Aktualisierung vom [Datum] – was neu ist
>
> Liebe Kolleginnen und Kollegen,
>
> das HR-Portal wurde am [Datum] aktualisiert. Für Sie ändert sich Folgendes:
>
> 1. **Individuelle E-Mail aus dem Vorgang.** Im Reiter „Dokumente“ von Onboarding, Offboarding,
>    Verbeamtung und Vertragsverlängerung gibt es unter dem Dokumentenpaket die neue Karte
>    „Individuelle E-Mail“: eine freie Nachricht an die Person mit eigenem Betreff und bis zu 10
>    Anhängen (PDF, JPG, PNG oder WebP, zusammen höchstens 9 MB), etwa für den gegengezeichneten
>    Vertrag. Die Mail steht danach im Vorgang, auch im Reiter „E-Mails“; Antworten der Person
>    kommen im HR-Postfach an. [nur wenn 6.2 eingeschaltet:] Text und Anhänge werden nach 12 Monaten
>    gelöscht; Datum, Empfänger, Betreff und Dateinamen bleiben als Nachweis. [nur mit beigelegtem
>    Handbuch:] Eine Anleitung finden Sie im beigefügten Handbuch unter „Eine individuelle E-Mail
>    mit Anhang schreiben“.
> 2. **Reihenfolge der Checklisten.** Die Punkte einer Checklisten-Vorlage lassen sich jetzt
>    verschieben, und Vorgänge zeigen sie in der Reihenfolge der Vorlage statt alphabetisch nach
>    Kategorie – in laufenden Vorgängen kann sich die Anzeige deshalb einmalig verschieben, es geht
>    nichts verloren.
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
>    hinterlegt ist – etwa eine neu eingetippte Adresse einer Führungskraft oder ein anderer
>    Empfänger einer E-Mail –, nimmt das Portal nur noch an, wenn ihre Endung (der Teil nach dem @,
>    z. B. @fes-minden.de) freigegeben ist; sonst zeigt es eine Meldung. Die im Vorgang hinterlegte
>    Adresse der Person geht immer. Die Liste der freigegebenen Endungen pflegt die
>    Portal-Administration – fehlt eine, sagen Sie uns bitte Bescheid.
>
> Bei Fragen melden Sie sich gern.

---

## 9 · Protokoll

### Vorlage zum Ausfüllen

Nach dem Update kommt dieser Teil, ausgefüllt, als „Protokoll vom [Datum]“ direkt unter den Kopf
dieses Dokuments (Claude trägt ihn ein). Uhrzeiten in deutscher Zeit; Dateinamen und Zeitstempel
im Container sind UTC.

| Schritt | Uhrzeit | Ergebnis / Ausgabe | Abweichung |
|---|---|---|---|
| 1.1 Serverstand (`git log -1`) | | | |
| 1.2 Container, Erstelldatum | | | |
| 1.3 Drift (erwartet `0`) | | | |
| 1.4 Sicherungsverzeichnis, beide Schreibtests | | | |
| 1.5 Freier Platz (Docker / `/vol/container`), Image-Größe | | | |
| 1.6 Uploads-Volume (Name, Größe) | | | |
| 1.7 Neue Tabellen leer, Vorlage `0` | | | |
| 1.8 Läufe (alle `f`?) | | | |
| 2.1 Etikett `hr-portal-app:f6d3daf` | | | |
| 2.2 Leseprobe (Dateien, Bytes, `tar OK`) | | | |
| 3.1 `git pull` (von … nach …) | | | |
| 3.2 Commits (18), Betriebsdateien (nur `package.json`) | | | |
| 3.3 Build (Dauer) | | | |
| 3.4 Vorschau (0/0/2/4/3, kein DROP) | | | |
| 4.1 Portal angehalten; DB-Sicherung (Bytes, `1`); Uploads (Bytes, Zeilen, `tar OK`) | | | |
| 4.2 Start | | | |
| 4.3 Log: Entrypoint-Sicherung (Bytes), `db push` (ms), `Ready` (ms), Warnungen | | | |
| 4.5 Entrypoint-Sicherung kopiert | | | |
| 5.1 Health (`uhrAktiv`, `letzterTakt`), Portal wieder erreichbar ab | | | |
| 5.2 Drift `0`, Tabellen `0/0`, 6 Indizes | | | |
| 5.3 Probe: individuelle E-Mail / Verbeamtung / Vertragsende / Checklisten | | | |
| 5.4 Versandprotokoll (`SENT`) | | | |
| 6.1 Freigabeliste (eingetragene Domains) | | | |
| 6.2 Aufbewahrung: Probelauf („ohne Befund“, 0/0), eingeschaltet um | | | |
| 8 Kurztext an HR verschickt (welche Klammer-Sätze gestrichen?, Handbuch beigelegt?) | | | |

**Sicherungen auf dem Server** (Größen eintragen):

| Datei | Größe | Zweck |
|---|---|---|
| `backups/vor-deploy-main-2026-10-manuell.sql` | | maßgeblich für Weg B (`pg_dump` 16 aus dem DB-Container) |
| `backups/vor-deploy-main-2026-10-entrypoint.sql` | | Kopie der Entrypoint-Sicherung (`pg_dump` 18), aus der Rotation genommen |
| `backups/uploads-vor-deploy-main-2026-10.tar.gz` | | Uploads vor dem Update — enthält Personalunterlagen, bleibt auf dem Server |
| Image `hr-portal-app:f6d3daf` | | altes Image für Weg A |

**Log des Starts** (Auszug aus `start-log.txt`, wörtlich): _…_

### Was an Claude geht

| Wann | Was | Weiter erst nach Antwort? |
|---|---|---|
| 1.1–2.2 | jede Abweichung | **ja** |
| 3.1–3.4 | Konflikt, Ausgabe beim Diff, Build-Fehler, `vorschau-delta.sql` bei abweichender Zählung | **ja** (das Portal läuft weiter) |
| 4.1 | Sicherung zu klein, `grep` `0`, kein `tar OK` | **ja** (vorher Befehl B) |
| 4.3 | `start-log.txt`, **immer** | nein, außer bei Fehlern |
| 4.4 | jeder Fehlschlag, bei einer Neustart-Schleife nach Befehl D | **ja** |
| 5 | Ergebnisse und Abweichungen | nein, außer bei Fehlern |
| 6.2 | Probelauf nicht „ohne Befund“ oder mit einer Zahl größer 0 | **ja** |
| 7 | vor **jedem** Rückfall | **ja** |

### Danach, nicht Teil dieses Deploys

1. **Automatische Läufe prüfen und einschalten.** Alle elf sind seit dem 30.09. aus (außer der
   Aufbewahrung aus 6.2). Ohne sie gibt es keine Erinnerungen, keine Fristenläufe und keine
   Löschungen nach DSGVO-Fristen. Einführung nach `docs/module/betrieb/zeitplaner-plan.md`,
   Abschnitt 8: HR vorher informieren (die Erinnerungsläufe verschicken beim ersten Lauf alles
   Fällige auf einmal), Löschläufe erst nach einem Probelauf.
2. **n8n aufräumen — aber den Flow „Email-Vertragsende-Personal 3.0“ nicht löschen.** Er ersetzt
   keinen Lauf des Portals, sondern liefert jeden Montag um 9 Uhr die Vertragsenden aus DokuBit ins
   Portal (`/api/webhooks/contract-end`). Die abgelösten Erinnerungs-Workflows dürfen weg.
3. **Regelmäßige Sicherung von Datenbank und Volume `uploads_data` mit der IT klären.** Die
   Sicherungen dieses Ablaufs sind einmalig. Seit Paket 3 liegen im Volume auch die Anhänge der
   individuellen E-Mails.

**Nach dem Update (Claude):** das Protokoll hier eintragen; im Kopf von
[deploy-paket4-stufe1.md](deploy-paket4-stufe1.md) den Deploy vom 30.09.2026 nachtragen.
