# Deploy Paket 4 Stufe 1 — Unterlagen nachfordern (Ablaufplan)

> **Stand:** Ablaufplan vom 25.09.2026, **noch nicht ausgeführt**. Das Protokoll kommt nach dem
> Deploy direkt unter diesen Kopf, wie beim [Deploy vom 24.09.](deploy-onboarding-pakete-2026-09.md).
> **Server:** `fes-vm-ubuntudocker`, `/vol/container/HR_Portal_CREDO`, `https://hr.fes-credo.de`
> **Ausgangsstand:** Server auf `8952e1a` (Code `7bc91ec`, Deploy vom 24.09.2026).
> **Ziel:** `main` nach dem Merge von `paket-4-unterlagen-nachfordern` am 26.09.2026
> (Fast-Forward, Code bis `3f42546`, dazu der Übergabe-Commit; ausgerollten Commit beim
> Deploy hier eintragen). Code-Commits `efcd820` bis `0dcceb9`, `b6532e2`, `3f42546`.
> **Vor dem Deploy:** Code-Review des ganzen Pakets (`ce1888e..main`) — Begründung in
> [paket4-stufe1-uebergabe.md](paket4-stufe1-uebergabe.md), Abschnitt 3.
> **Spezifikation:** `docs/module/onboarding/paket4-feinplanung.md` (Abschnitt 15 Deploy,
> Abschnitt 18 Abweichungen). Regeln für Änderungen: CLAUDE.md, „Unterlagen nachfordern (Paket 4)“.

Paket 4 bringt vier neue Tabellen, fünf neue Mails, eine öffentliche Upload-Seite und einen
neuen täglichen Lauf. Von allein passiert nach dem Start nichts: Die erste Mail an eine
Person geht erst hinaus, wenn HR zum ersten Mal „Anfordern und E-Mail senden“ klickt, und
der Lauf kommt nur, wenn n8n ihn aufruft. Der Deploy selbst ist deshalb risikoarm. Die
eigentlichen Voraussetzungen liegen außerhalb des Codes: n8n, Datenschutz, Sicherungen.

**Grundregel wie am 24.09.:** Wo „an Claude“ steht, wird angehalten. Das Portal läuft bis
Schritt 3.4 unverändert weiter, Anhalten kostet also nichts.

---

## 0 · Auf einen Blick

### Was ausgerollt wird

| Commit | Inhalt |
|---|---|
| `6e358dc` | Feinplanung (nur `docs/`) |
| `efcd820` | Vorarbeiten: Kalendertag-Helfer, Typerkennung aus den Bytes, Löschhelfer, Pflichtliste an einer Stelle, `robots.txt` |
| `49ed237` | Datenmodell (vier Tabellen, `documents.bezeichnung`, `documents.unbefristet`) und reine Regeln |
| `d050a48` | Fünf Events und Vorlagen, Betreffsperre, neue Texte in `dokument-ablauf-warnung` und `dokument-abgelaufen` (Z3) |
| `a43d4c1` | Anfordern, Ergänzen, Frist ändern, Link erneut senden, Zurückziehen |
| `4236544` | Prüfen und Übernahme per Hardlink; **Härtung der Download-Route** für Onboarding-Dokumente |
| `c6ee89c` | Öffentliche API, **Middleware-Ausnahme** für `/api/unterlagen/` |
| `0600adf` | Täglicher Lauf `/api/cron/unterlagen-fristen`, `dokument-ablauf` überspringt unbefristete Nachweise |
| `ce68d64` | Upload-Seite `/unterlagen/[token]` |
| `da8f8ed` | HR-Karte und Prüf-Dialoge |
| `0dcceb9` | Dialog „Unterlagen nachfordern…“, Einbau in die Vorgangsansicht, Kasten „Offene Nachweise“, Warnbalken |
| `b6532e2` | Restpunkte aus Browserprobe und Prüfberichten (Vorauswahl, rote Meldung, `?tab=dokumente`, `aktionen.ts`) |
| `2ef8199` | Doku: CLAUDE.md, Feinplanung, dieser Ablaufplan, Handbuch, Änderungsplan Fassung 7 |
| `3f42546` | Abschlussdurchsicht: 30 bestätigte Befunde behoben |
| Übergabe | `docs/historie/paket4-stufe1-uebergabe.md`, Statusangaben nach dem Merge (nur `docs/`, `CLAUDE.md`) |

Vollständige Liste auf dem Server: `sudo git log --oneline 7bc91ec..HEAD`.

### Was sich an Datenbank und Betrieb ändert

- **Schema ab `7bc91ec`, rein additiv:**
  - vier neue Tabellen `unterlagen_nachforderungen`, `unterlagen_positionen`,
    `unterlagen_dateien`, `unterlagen_links` samt 9 Indizes (davon 3 eindeutig:
    `laufendSchluessel`, `tokenHash`, `(nachforderungId, typ)`) und 7 Fremdschlüsseln
    (auf `onboarding_processes` mit Cascade, auf `users` mit SetNull, untereinander mit Cascade);
  - an `documents` zwei Spalten: `bezeichnung` (nullbar) und `unbefristet`
    (`BOOLEAN NOT NULL DEFAULT false`, Bestandszeilen bekommen `false`).
  - In den neuen Tabellen stecken auch die Ergänzungen aus der Umsetzung:
    `unterlagen_nachforderungen.hrMeldungStatus`/`hrMeldungDetail` und
    `unterlagen_links.fruehereSperren` (Feinplanung 18, U-1 und U-2).
  - Kein `DROP`, kein `RENAME`, kein Typwechsel, kein neuer Enum-Wert, kein neues
    `NOT NULL` ohne Standardwert an einer Bestandstabelle.
- **Keine einmalige Migration.** `prisma/seed-check.js` ist seit `7bc91ec` unverändert, es
  werden keine Bestandsdaten umgestellt. Alle zehn Migrations-Merker stehen seit dem 24.09.
- **Unverändert:** `docker-compose.yml`, `Dockerfile`, `entrypoint.sh`, `package.json`,
  `package-lock.json`, `.env.production.example`, `.dockerignore`, `next.config.ts`,
  `public/system-dokumente/`. Beleg:
  `sudo git diff --stat 7bc91ec HEAD -- docker-compose.yml Dockerfile entrypoint.sh package.json package-lock.json .env.production.example .dockerignore next.config.ts prisma/seed-check.js public/system-dokumente`
  gibt nichts aus. Keine neue Umgebungsvariable, keine neue Abhängigkeit.
- **Neu im Betrieb:**
  - die Upload-Seite `https://hr.fes-credo.de/unterlagen/<token>` (öffentlich, nur mit Token);
  - Dateien unter `uploads/unterlagen/<nachforderungId>/` im Volume `uploads_data`
    (gehört `nextjs`, kein `chown` nötig); angenommene ziehen per Hardlink nach
    `uploads/<onboardingId>/`;
  - der Lauf `POST /api/cron/unterlagen-fristen` (n8n, Abschnitt 6). Er braucht ein
    `CRON_SECRET` mit **mindestens 24 Zeichen**, sonst antwortet er mit 500 (1.7).
- **Verhalten ändert sich an bestehenden Stellen:**
  - **Download-Route** `GET /api/onboarding/[id]/documents/[docId]`: nur noch Portal-Rollen.
    Der n8n-Schlüssel (`N8N_API_KEY`, Rolle `SERVICE`) bekommt **403**. Fremder Mandant 404
    statt 403, `Cache-Control: no-store`, Endung des Download-Namens aus dem Dateityp,
    Protokoll `DOKUMENT_GEOEFFNET` bei sensiblen Arten.
  - **Middleware:** `/api/unterlagen/*` läuft nicht mehr durch sie (Grenzen und Kopfzeilen
    setzt die Route selbst). Die Datei-Route der Nachforderung setzt ihre CSP selbst.
  - **Frist-Korrektur** an Nachweisen: `EXPIRED` wird zu `APPROVED`, wenn `reviewedAt`
    gesetzt ist (nur Paket 4 setzt es). Altbestand ist nicht betroffen.
  - **Lauf `dokument-ablauf`:** überspringt Arten mit einem unbefristeten Nachweis;
    `dokument_datei` nennt Bezeichnung bzw. Art und Upload-Datum statt des Dateinamens.
  - **Zwei Mailvorlagen** mit neuem Text: `dokument-ablauf-warnung` und `dokument-abgelaufen`
    (Z3). Beide liegen in Produktion gespeichert → Handschritt 5.1.

### Voraussetzungen (vor dem Deploy)

| # | Voraussetzung | Art | Abschnitt |
|---|---|---|---|
| V-1 | `./backups:/backups` eingehängt und `sudo chown 1001 backups` gesetzt — sonst bricht der Start ab | **Pflicht** | 1.3 |
| V-2 | Die beiden bestehenden n8n-Läufe rufen `hr.fes-credo.de` auf (heute `hr.credo-schulen.de`) | **Pflicht**: ohne Lauf keine Erinnerungen und keine Löschung nach 30 Tagen | 6.1 |
| V-3 | n8n-Läufe `unterlagen-fristen` und `dokument-ablauf` angelegt (beide zunächst inaktiv); `dokument-ablauf` aktiv nach 5.1, `unterlagen-fristen` mit `?dryRun=1` nach 4.3 | **Pflicht** vor dem ersten „Anfordern“ | 6.2, 6.3 |
| V-4 | Art.-13-Text der Upload-Seite vom DSB — **im Code steht ein Platzhalter** | **Pflicht** (Code-Änderung vor dem Merge) oder ausdrückliche Entscheidung | 1.8 |
| V-5 | Sicherung des Volumes `uploads_data` | **Pflicht** | 3.4 |
| V-6 | Antwortadresse (= HR-Postfach) in den SMTP-Einstellungen gesetzt | Pflicht vor dem ersten „Anfordern“ | 2.3 (V4), 5.2 |
| V-7 | `N8N_API_KEY` geprüft: Holt etwas außerhalb des Repos Dokumente über die Download-Route? | ENTSCHEIDUNG, falls gesetzt | 1.7 |
| V-8 | Freigabeliste für abweichende Empfängeradressen | empfohlen | 5.3 |
| V-9 | Caddy: Schreibt der Server ein Zugriffsprotokoll, filtert es die URI (der Token der Upload-Seite steht im Pfad und öffnet den Zugang zu Personalunterlagen) | **Pflicht** vor dem ersten „Anfordern“; lesende Prüfung vor dem Deploy, ein `log` ohne URI-Filter ist ENTSCHEIDUNG | 1.9, 5.2 |

### Dauer (Schätzung, nicht gemessen)

| Abschnitt | Dauer | Portal |
|---|---|---|
| 1–2 Vorbereitung, VORHER-Prüfung, Freigabe durch Claude | 30–45 min | läuft |
| 3.1–3.3 Code holen, Image bauen, Vorschau | 10–20 min | läuft |
| 3.4–3.6 eigene Sicherungen (Datenbank und Uploads), Start | wenige Minuten, je nach Größe von `uploads_data` | **offline** |
| 4 NACHHER-Prüfung | 10 min | läuft |
| 5 Handschritte und Probe mit Testvorgang | 1–2 h, am selben Tag | läuft |
| 6 n8n: 1–3 Tage Probelauf, dann scharf | über mehrere Tage | läuft |

### Risiko in einem Satz

Der Start ist risikoarm, weil das Delta rein additiv ist und nichts von selbst passiert; die
echten Risiken sind ein Rückfall auf ein älteres Image, der die neuen Tabellen still löscht
(Abschnitt 7), ein nicht eingeplanter Lauf, mit dem die zugesagte Löschung nach 30 Tagen nie
geschieht, und die Download-Route, die ab jetzt den n8n-Schlüssel abweist.

### Termin

- **Nach** der n8n-Reparatur (V-2) und nachdem HR informiert ist: Der erste Lauf nach der
  Korrektur verschickt echte Erinnerungen (6.1).
- **An einem Werktag, an dem HR erreichbar ist.** Die Probe in 5.4 braucht eine HR-Kraft und
  ein Handy.
- Kein Zeitfenster um einen n8n-Lauf nötig: `unterlagen-fristen` und `dokument-ablauf` sind bis
  6.3 nicht aktiv, und die bestehenden Läufe berührt dieser Deploy nicht.

---

## 1 · Vorher auf dem Server (nur lesend)

Alle Befehle laufen im Projektordner. Ausnahme ist 1.5, das legt nur ein zusätzliches
Etikett an ein vorhandenes Image.

```bash
cd /vol/container/HR_Portal_CREDO
mkdir -p ~/deploy-paket4
```

In `~/deploy-paket4/` landen alle Arbeitsdateien, also **außerhalb** des Repos. `git` auf
dem Server immer mit `sudo` (Projektordner und `.git` gehören `root`, Lehre 2 vom 24.09.).

### 1.1 Stand des Repos

```bash
sudo git log -1 --oneline
sudo git diff --stat 7bc91ec HEAD -- . ':!docs'
sudo git status --short
ls docker-compose.override.yml 2>/dev/null || echo "kein Override"
```

| Erwartet | Wenn nicht |
|---|---|
| `8952e1a docs: Ablaufplan Deploy - Befunde der Gegenpruefung eingearbeitet` oder ein späterer Commit | anderer Stand: **STOPP, an Claude** |
| Der zweite Befehl gibt **nichts** aus: Seit `7bc91ec` kam auf dem Server nur Doku. | Dateien außerhalb von `docs/`: **STOPP, an Claude** |
| Nur Zeilen `?? backups/<datei>.sql`, je Sicherung eine | andere Zeilen: **STOPP, an Claude**. Nie `git add -A`, `git stash -u` oder `git clean` — das sammelt oder löscht die Sicherungen. |
| `kein Override` | Eine `docker-compose.override.yml` (etwa von einem Rückfall) verändert den Start: **an Claude** |

### 1.2 Laufende Container

```bash
sudo docker compose ps
sudo docker inspect --format '{{.Created}} {{.Image}}' hr-portal-app
```

Erwartet: `app`, `db` und `gotenberg` laufen, `app` und `db` mit `(healthy)`. Das Image
stammt vom 24.09.2026 (UTC). Bei einem anderen Datum: an Claude.

### 1.3 Sicherungsverzeichnis (sonst bricht der Start ab)

```bash
grep -c "backups:/backups" docker-compose.yml
stat -c '%u %U %n' backups
sudo docker run --rm --user nextjs --entrypoint sh -v "$PWD/backups:/backups" "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)" -c 'id; touch /backups/.schreibtest && rm /backups/.schreibtest && echo OK'
```

| Erwartet | Wenn nicht |
|---|---|
| `2` (`app` und `db`) | **STOPP, an Claude.** Ohne Einhängung bricht der Entrypoint ab. |
| `1001 … backups` (der Name ist egal, am 24.09. hieß er `n8n`) | `sudo chown 1001 backups`, Schreibtest wiederholen |
| `uid=1001(nextjs) gid=65533(nogroup) …` und `OK` | `sudo chown 1001 backups`. Bleibt `OK` aus: **an Claude** |

`sudo` vor `docker` ändert nichts an der Kennung im Container, und `chgrp 1001` hilft nicht
(CLAUDE.md, „Docker / Deployment“).

### 1.4 Plattenplatz und Größe der Uploads

```bash
df -h . "$(sudo docker info --format '{{.DockerRootDir}}')"
sudo docker image ls
sudo du -sh backups
UPLOADS_VOL=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' hr-portal-app)
echo "Volume: $UPLOADS_VOL"
sudo du -sh "$(sudo docker volume inspect --format '{{.Mountpoint}}' "$UPLOADS_VOL")"
```

- Der Build braucht etwa so viel Platz wie das jetzige Image, dazu kommen die Sicherung der
  Datenbank (am 24.09.: 1,56 MB) und die Sicherung der Uploads (3.4, etwa so groß wie das
  Volume). **Faustregel:** Ist weniger frei als die doppelte Image-Größe plus die Größe des
  Volumes: an Claude.
- `Volume:` muss einen Namen zeigen (Compose: `uploads_data`, mit Projektpräfix). Ist die
  Zeile leer: an Claude, dann stimmt 3.4 nicht.

### 1.5 Altes Image aufheben (für den Rückfall)

```bash
sudo docker tag "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)" hr-portal-app:7bc91ec
sudo docker image ls hr-portal-app
```

Erwartet ist eine Zeile `hr-portal-app   7bc91ec` (dazu das ältere Etikett `ae490ba` vom 24.09.).

### 1.6 Drift gegen das alte Schema (nur lesend)

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

Erwartet `0`: Die Datenbank entspricht dem Schema von `7bc91ec`. Bei `2` wurde sie außerhalb
eines Deploys verändert, bei `1` gab es einen Fehler. In beiden Fällen: **STOPP, an Claude.**

### 1.7 Umgebung (nur lesend, ohne Werte auszugeben)

```bash
sudo docker exec hr-portal-app sh -c 'printf "CRON_SECRET Zeichen: "; printf %s "$CRON_SECRET" | wc -c'
sudo docker exec hr-portal-app sh -c 'test -n "$N8N_API_KEY" && echo "N8N_API_KEY: gesetzt" || echo "N8N_API_KEY: leer"'
sudo docker exec hr-portal-app printenv APP_URL
```

| Erwartet | Wenn nicht |
|---|---|
| `CRON_SECRET Zeichen: ` 24 oder mehr | Kürzer: Der neue Lauf antwortet mit 500 (`route.ts`, Mindestlänge 24, wie `dokumente-aufbewahrung`). Neues Secret mit `openssl rand -base64 24` in `.env`, dann **alle** n8n-Credentials anpassen (auch `reminders` und `offboarding-reminders`). **An Claude**, bevor etwas geändert wird. |
| `N8N_API_KEY: leer` | **ENTSCHEIDUNG.** Gesetzt heißt: Irgendetwas darf sich als `SERVICE` anmelden. Im Repo ruft kein Workflow die Download-Route auf, ab diesem Deploy bekäme er 403. Mit der IT klären, ob etwas außerhalb des Repos (n8n, Skripte) Dokumente herunterlädt. |
| `https://hr.fes-credo.de` | Die Links in den Mails bauen darauf auf (`getBaseUrl`). Abweichung: **STOPP, an Claude.** |

### 1.8 Datenschutz: Art.-13-Text der Upload-Seite

Der Datenschutztext der Upload-Seite ist im Code ein **Platzhalter**
(`UPLOAD_SEITE_TEXTE.DATENSCHUTZ` in `src/components/unterlagen/upload-seite.tsx`, sinngemäß
der Text des Fragebogens, ohne Art. 9). Der Wortlaut kommt vom DSB und muss **vor dem Merge**
als Code-Änderung eingetragen sein. Deploy mit Platzhalter nur nach ausdrücklicher
Entscheidung. Weitere Punkte für den DSB, die den Deploy nicht blockieren:

- Eintrag im **Verarbeitungsverzeichnis** (Nachforderung von Nachweisen, auch nach Art. 9 und 10).
- **Führungszeugnis bei Kitas:** Kopie oder nur Vermerk der Einsichtnahme (§ 72a Abs. 5 SGB
  VIII)? Bis zur Entscheidung ist es für Einrichtungen vom Typ `KITA` gesperrt (Abfrage V9).
- **Aufbewahrung:** Pseudonymisierung 12 Monate nach „erledigt“ oder „zurückgezogen“ (E-7,
  kommt mit Stufe 2); Frist bestätigen.
- **Restrisiken** zur Kenntnis: Dateien liegen unverschlüsselt ab (wie beim Fragebogen),
  EXIF- und GPS-Daten bleiben erhalten, kein Virenscan.

### 1.9 Caddy: Zugriffsprotokoll (nur lesend, V-9)

Der Token der Upload-Seite steht im Pfad (`/unterlagen/<token>`, `/api/unterlagen/<token>/…`),
wie bei den bestehenden Magic Links. Das Portal protokolliert ihn nicht (für die Upload-Routen
verhindert die Middleware-Ausnahme auch die Warnzeile, die Next.js bei zu großem Body samt URL
schreibt). Schreibt Caddy aber ein Zugriffsprotokoll mit der URI, liegt dort jeder Upload-Link
im Klartext — ein Zugang zu Personalunterlagen, solange der Link gilt (Feinplanung 15,
Handschritt 5; Abschnitt 17 dort stützt die Entscheidung gegen den Token-Header genau auf diese
Prüfung). Das `Caddyfile.hr-portal` im Repo belegt den Live-Stand nicht (es nennt noch den
Container `credo-hr-app`).

```bash
sudo docker ps --format '{{.Names}}\t{{.Image}}' | grep -i caddy
CADDY=caddy   # den Namen aus der ersten Spalte der Zeile oben einsetzen
sudo docker inspect --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}' "$CADDY"
sudo docker exec "$CADDY" sh -c 'grep -n -E "hr\.fes-credo\.de|import|log|output|format|filter|uri|request_body|max_size" /etc/caddy/Caddyfile'
```

Der letzte Befehl zeigt nur Zeilen mit diesen Stichwörtern, keine Zugangsdaten aus dem
Caddyfile.

| Erwartet | Wenn nicht |
|---|---|
| Eine Zeile mit dem Caddy-Container | Keine Zeile: Caddy läuft nicht als Container oder heißt anders. **An Claude**, die IT nennt dann den Ort des Caddyfiles. |
| Unter den Einhängungen eine mit dem Ziel `/etc/caddy/Caddyfile` oder `/etc/caddy` | Anderes Ziel: im letzten Befehl diesen Pfad einsetzen. |
| Im Block `hr.fes-credo.de` **keine** `log`-Zeile (dann schreibt Caddy kein Zugriffsprotokoll) **oder** ein `log` mit `format filter`, der das Feld `request>uri` löscht oder ersetzt | `log` ohne Filter auf `request>uri`: **ENTSCHEIDUNG** (an Claude, mit der Ausgabe). Entweder vor dem ersten „Anfordern“ den Filter ergänzen und Caddy neu laden (IT, 5.2), oder ausdrücklich hinnehmen und die Aufbewahrung des Protokolls klären — heute gilt dasselbe schon für die Magic Links. |
| — | `import`-Zeilen: die eingebundenen Dateien genauso prüfen. Ein `log` in einem Snippet, das der Block einbindet, zählt mit; ein `log` in den globalen Optionen mit an Claude schicken. |

Unabhängig vom Zugriffsprotokoll schreibt Caddy Fehlerzeilen (Logger `http.log.error`, etwa ein
502, solange die App in 3.4 steht) samt angefragter URI in sein Container-Log. Das gehört mit in
die Entscheidung, betrifft aber nur Aufrufe während einer Störung.

Der **Pfad-Matcher für `request_body`** (10 MB für `/api/unterlagen/*`) ist dagegen nur
EMPFOHLEN (5.3): Die Route begrenzt selbst, Caddy wäre die zweite Schicht.

---

## 2 · SQL-Prüfungen VORHER (nur lesend)

Zehn Abfragen, gegen den Serverstand `7bc91ec`. Sie laufen auch gegen das neue Schema und
benutzen für die Tabellen und Spalten von Paket 4 nur `to_regclass` bzw.
`information_schema` — auf dem alten Schema ergibt das `NULL` bzw. `(0 rows)`, keinen Fehler.
**Geprobt am 25.09.2026** mit psql 16.12 und `ON_ERROR_STOP=1` lesend gegen die
Dev-Datenbank (neues Schema): Exit 0, 10 Abschnitte, 0 `ERROR`. Gegen eine Datenbank mit
Schema `7bc91ec` ist die Datei **nicht** geprobt.

**Nur lesend, doppelt gesichert:** Die Sitzung läuft mit
`PGOPTIONS='-c default_transaction_read_only=on'`, und die Datei setzt in ihrer ersten
Anweisung noch einmal `default_transaction_read_only = on`. Namen: Tabellen `snake_case`,
Spalten `"camelCase"`.

### 2.1 Datei auf dem Server anlegen

**Variante 1: ohne Einfügen** (nur, wenn dieses Dokument schon auf `origin/main` liegt):

```bash
cd /vol/container/HR_Portal_CREDO && sudo git fetch origin
sudo git show origin/main:docs/historie/deploy-paket4-stufe1.md \
  | awk '/^cat > ~\/deploy-paket4\/vorher-paket4.sql/{f=1;next} /^ENDE_SQL$/{f=0} f' > ~/deploy-paket4/vorher-paket4.sql
md5sum ~/deploy-paket4/vorher-paket4.sql
```

**Variante 2: Einfügen.** Den ganzen folgenden Block ins Terminal kopieren (`set +H` schaltet
die Verlaufsersetzung von `!` ab, das Ende-Wort in Anführungszeichen verhindert jede Ersetzung).
Besser ist Variante 1 oder eine binäre Übertragung durch die IT (Lehre 4 vom 24.09.).

```bash
set +H
cat > ~/deploy-paket4/vorher-paket4.sql <<'ENDE_SQL'
-- Paket 4 Stufe 1 · VORHER-Pruefungen (nur lesend) · docs/historie/deploy-paket4-stufe1.md, Abschnitt 2
SET default_transaction_read_only = on;
\pset pager off

\echo '== VORHER V1 · PostgreSQL-Version'
SHOW server_version;

\echo '== VORHER V2 · Tabellen von Paket 4 (erwartet: alle vier Spalten leer)'
SELECT to_regclass('public.unterlagen_nachforderungen') AS nachforderungen,
       to_regclass('public.unterlagen_positionen')      AS positionen,
       to_regclass('public.unterlagen_dateien')         AS dateien,
       to_regclass('public.unterlagen_links')           AS links;

\echo '== VORHER V3 · Neue Spalten an documents (erwartet: (0 rows))'
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'documents'
  AND column_name IN ('bezeichnung', 'unbefristet')
ORDER BY 1;

\echo '== VORHER V4 · SMTP: HR-Postfach (= Antwortadresse) und Freigabeliste'
SELECT CASE WHEN btrim("replyToEmail") = '' THEN 'LEER' ELSE "replyToEmail" END AS hr_postfach,
       CASE WHEN btrim("allowedRecipientDomains") = '' THEN 'LEER (keine Einschraenkung)'
            ELSE "allowedRecipientDomains" END AS freigabeliste
FROM smtp_config;

\echo '== VORHER V5 · Gespeicherte Vorlagen, die dieser Deploy beruehrt'
SELECT event,
       "isActive"                     AS aktiv,
       NULLIF(btrim("recipientTo"), '')  AS an,
       NULLIF(btrim("recipientCc"), '')  AS cc,
       NULLIF(btrim("recipientBcc"), '') AS bcc,
       "updatedAt"                    AS gespeichert_utc,
       md5("bodyHtml")                AS md5_html,
       md5(COALESCE("bodyText", ''))  AS md5_text,
       CASE md5("bodyHtml")
         WHEN 'd3905995937c15d7e67462cefc796a14' THEN 'Standard 7bc91ec'
         WHEN '35aa931001718762f1dae3d7a51122dd' THEN 'Standard 7bc91ec'
         ELSE 'ABWEICHEND'
       END                            AS textstand
FROM email_templates
WHERE event IN ('dokument-ablauf-warnung', 'dokument-abgelaufen',
                'unterlagen-angefordert', 'unterlagen-erinnerung', 'unterlage-zurueckgewiesen',
                'unterlagen-vollstaendig', 'unterlagen-frist-verstrichen')
ORDER BY event;

\echo '== VORHER V6 · Webhooks auf die fuenf neuen Ereignisse und die beiden dokument-* (ohne Zugangsdaten)'
SELECT event, name, "isActive" AS aktiv, split_part(regexp_replace(url, '^https?://', ''), '/', 1) AS host
FROM webhook_configs
WHERE event IN ('dokument-ablauf-warnung', 'dokument-abgelaufen',
                'unterlagen-angefordert', 'unterlagen-erinnerung', 'unterlage-zurueckgewiesen',
                'unterlagen-vollstaendig', 'unterlagen-frist-verstrichen')
ORDER BY event, name;

\echo '== VORHER V7 · Kommen die n8n-Laeufe an? Letzter Eintrag im Versandprotokoll je Ereignis'
SELECT event, status, COUNT(1) AS anzahl, MAX("createdAt") AS zuletzt_utc
FROM email_logs
WHERE event IN ('employee-reminder', 'supervisor-reminder', 'offboarding-reminder',
                'onboarding-department-reminder', 'dokument-ablauf-warnung', 'dokument-abgelaufen')
GROUP BY event, status
ORDER BY event, status;

\echo '== VORHER V8 · Nachweise mit Ablaufdatum (Grundlage fuer dokument-ablauf)'
SELECT type, status, COUNT(1) AS anzahl,
       COUNT(1) FILTER (WHERE "gueltigBis" IS NOT NULL) AS mit_datum,
       MIN("gueltigBis") AS fruehestes_datum
FROM documents
WHERE type IN ('AUFENTHALTSTITEL', 'ARBEITSERLAUBNIS')
GROUP BY type, status
ORDER BY type, status;

\echo '== VORHER V9 · Einrichtungen vom Typ KITA (Fuehrungszeugnis dort nicht anforderbar)'
SELECT name, "isActive" AS aktiv FROM organizations WHERE type = 'KITA' ORDER BY name;

\echo '== VORHER V10 · Aktive Konten mit Bearbeitungsrecht (koennen Unterlagen anfordern)'
SELECT role, COUNT(1) AS aktiv FROM users
WHERE "isActive" AND role IN ('SUPER_ADMIN', 'HR_LEITUNG', 'HR_SACHBEARBEITER')
GROUP BY role ORDER BY role;
ENDE_SQL
md5sum ~/deploy-paket4/vorher-paket4.sql
```

Erwartete Prüfsumme: `c37dafdd281365d72225aca4238ebd8e`. Weicht sie ab, ist die Datei beim Übertragen verändert
worden (Zeilenenden, Anführungszeichen): neu anlegen, nicht ausführen.

### 2.2 Ausführen

```bash
cd /vol/container/HR_Portal_CREDO
sudo docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db \
  psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 < ~/deploy-paket4/vorher-paket4.sql > ~/deploy-paket4/vorher-ergebnis.txt 2>&1; echo "Exit: $?"
grep -c '^== VORHER' ~/deploy-paket4/vorher-ergebnis.txt
grep -c 'ERROR' ~/deploy-paket4/vorher-ergebnis.txt
less ~/deploy-paket4/vorher-ergebnis.txt
```

**Erwartet:** `Exit: 0`, `10`, `0`.

> **Ergebnis an Claude schicken — immer**, dann auf die Freigabe warten. Die Datei enthält das
> HR-Postfach, dienstliche Adressen in Empfängerfeldern, Einrichtungsnamen und Hostnamen von
> Webhooks, aber keine Personendaten aus Vorgängen.

### 2.3 Was jede Abfrage zeigt

- **STOPP:** Weicht das Ergebnis ab, wird nicht deployt.
- **ENTSCHEIDUNG:** Vor dem Deploy mit Claude klären.
- **INFO:** Nur merken, meist für die Handschritte.

| Nr | Zeigt | Erwartet | Art · wenn nicht |
|---|---|---|---|
| V1 | PostgreSQL-Version | `16.x` | STOPP · an Claude |
| V2 | Gibt es die Tabellen von Paket 4 schon? | alle vier Spalten **leer** | Ein Name steht da: **STOPP**. Die Datenbank ist nicht auf `7bc91ec` (widerspricht 1.6). |
| V3 | Gibt es `documents.bezeichnung` oder `documents.unbefristet` schon? | `(0 rows)` | Eine Zeile: **STOPP**, wie V2 |
| V4 | HR-Postfach (`smtp_config."replyToEmail"`) und Freigabeliste | `hr_postfach` ist eine Adresse | `LEER`: **PFLICHT vor dem ersten „Anfordern“** (5.2). Ohne HR-Postfach fehlt die Kopie der HR-Mails, die Person kann nicht antworten, und ist das Konto der anfordernden HR-Kraft inaktiv, geht die HR-Meldung an niemanden. Die Freigabeliste ist INFO (5.3). |
| V5 | Gespeicherte Vorlagen, die der Deploy berührt | Zwei Zeilen `dokument-ablauf-warnung` und `dokument-abgelaufen` mit `textstand = Standard 7bc91ec` (am 24.09. per SQL auf diesen Standard gesetzt). Keine Zeile `unterlagen-*` / `unterlage-*`. | `ABWEICHEND` bei einer `dokument-*`-Zeile: HR hat den Text nach dem 24.09. geändert → **ENTSCHEIDUNG** für 5.1 (zurücksetzen oder zusammenführen). Eine Zeile `unterlagen-*`: **STOPP**, an Claude. `an` leer bei `dokument-*`: INFO für 6.3 — ohne An-Feld verschickt `dokument-ablauf` nichts. |
| V6 | Webhooks auf die fünf neuen Ereignisse und die beiden `dokument-*` | `(0 rows)` | Jede Zeile: **ENTSCHEIDUNG.** Webhooks auf die drei Personen-Mails feuern nie (zweite Ausnahme vom Dispatcher-Gebot); auf die HR-Mails feuern sie zusätzlich — möglicher Doppelversand. |
| V7 | Letzte Einträge im Versandprotokoll der Erinnerungsläufe | beliebig | INFO: Zeigt, ob n8n das Portal heute erreicht. Am 24.09. fehlten `employee-reminder` und `supervisor-reminder` seit mindestens 60 Tagen (6.1). |
| V8 | Befristete Nachweise (Aufenthaltstitel, Arbeitserlaubnis) je Status | beliebig | INFO für 6.3: So viele Dokumente überwacht `dokument-ablauf`, sobald er eingeplant ist. Liegt ein `fruehestes_datum` höchstens 90 Tage in der Zukunft oder bis zu 180 Tage zurück, mailt schon der erste Lauf an HR (bzw. setzt ohne An-Feld nur Merker). |
| V9 | Einrichtungen vom Typ `KITA` | beliebig | INFO: Dort ist das Führungszeugnis nicht anforderbar, bis der DSB entschieden hat (1.8). |
| V10 | Aktive Konten mit Bearbeitungsrecht | mindestens eine HR-Kraft | INFO: Nur diese Rollen sehen Dateien und Knöpfe der Karte. |

### 2.4 Freigabe

Deployt wird erst, wenn **alle STOPP-Prüfungen** stimmen, V-1 bis V-5 aus Abschnitt 0 erfüllt
sind **und** Claude die ENTSCHEIDUNGS-Punkte mit Ihnen durchgegangen ist.

---

## 3 · Deploy

Ablauf wie am 24.09., in Einzelschritten. `sudo docker compose up -d --build` ersetzt 3.2 bis
3.5, ist aber **nicht zu empfehlen**: Ohne 3.4 fehlen die eigene Sicherung der Datenbank
(die des Entrypoints schreibt `pg_dump` 18 und lässt sich nicht unverändert in PostgreSQL 16
einspielen, Lehre 3 vom 24.09.) und die Sicherung der Uploads.

### 3.1 Code holen

```bash
cd /vol/container/HR_Portal_CREDO
sudo git fetch origin && sudo git checkout main && sudo git pull
sudo git log -1 --oneline
sudo git diff --stat 7bc91ec HEAD -- docker-compose.yml Dockerfile entrypoint.sh package.json package-lock.json .env.production.example .dockerignore next.config.ts prisma/seed-check.js public/system-dokumente
sudo git status --short
```

**Erwartet:** `git log` zeigt den Merge-Commit von Paket 4 oder einen späteren Doku-Commit; der
vorletzte Befehl gibt **nichts** aus; `git status` zeigt wie in 1.1 nur die Sicherungen.
**Wenn nicht** (Konflikt, Ausgabe beim vorletzten Befehl): **STOPP, an Claude.**

### 3.2 Image bauen (das Portal läuft weiter)

```bash
sudo docker compose build app
```

Erwartet: kein `ERROR`. Die `npm ci`-Schicht kommt aus dem Cache (`package*.json` unverändert),
`prisma generate` läuft neu.

### 3.3 Vorschau: Was `db push` gleich tun wird (nur lesend)

```bash
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > ~/deploy-paket4/vorschau-delta.sql
V=~/deploy-paket4/vorschau-delta.sql
for m in 'ADD COLUMN' 'ADD VALUE' 'CREATE TABLE' 'INDEX' 'ADD CONSTRAINT'; do printf '%-15s %s\n' "$m" "$(grep -c "$m" "$V")"; done
grep -nE 'DROP|RENAME|ALTER COLUMN .* TYPE|SET NOT NULL' "$V" || echo "keine DROP/RENAME/TYPE-Zeile"
```

**Erwartet:**

```
ADD COLUMN      2
ADD VALUE       0
CREATE TABLE    4
INDEX           9
ADD CONSTRAINT  7
keine DROP/RENAME/TYPE-Zeile
```

`ADD COLUMN` sind `documents."bezeichnung"` und `documents."unbefristet"` (zwei Zeilen einer
Anweisung). `INDEX` zählt 9 Zeilen `CREATE (UNIQUE) INDEX`, `ADD CONSTRAINT` die 7
Fremdschlüssel; die Primärschlüssel stehen in den `CREATE TABLE`-Blöcken.

**Beleg:** Diese Zählung ergibt `prisma migrate diff --from-schema-datamodel <Schema 7bc91ec>
--to-schema-datamodel <Schema 0dcceb9> --script` (am 25.09. lokal, ohne Datenbank). Ändert die
Fix-Runde das Schema, rechnet Claude die Zahlen vor dem Deploy neu. Auf dem Server ist der
Befehl am 24.09. gelaufen, gegen dieses Delta nicht geprobt.

**Wenn nicht:** Weicht eine Zahl ab oder kommt eine `DROP`/`RENAME`/`TYPE`-Zeile: **STOPP,
nicht starten**, `vorschau-delta.sql` an Claude. Das Portal läuft ja noch mit dem alten
Container.

### 3.4 Portal anhalten, eigene Sicherungen anlegen

```bash
sudo docker compose stop app
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-deploy-paket4-manuell.sql'
sudo ls -l backups/vor-deploy-paket4-manuell.sql
sudo grep -c 'PostgreSQL database dump complete' backups/vor-deploy-paket4-manuell.sql
UPLOADS_VOL=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' hr-portal-app)
sudo docker run --rm --user nextjs --entrypoint sh -v "$UPLOADS_VOL:/daten:ro" -v "$PWD/backups:/sicherung" hr-portal-app:7bc91ec -c 'tar czf /sicherung/uploads-vor-deploy-paket4.tar.gz -C /daten . && echo "tar OK"'
sudo ls -l backups/uploads-vor-deploy-paket4.tar.gz
sudo tar tzf backups/uploads-vor-deploy-paket4.tar.gz | wc -l
```

**Ab hier ist das Portal offline.**

- **Datenbank:** `pg_dump` aus dem DB-Container (Version 16, passend zum `psql` für einen
  Rückfall), unter einem Namen, den die Rotation des Entrypoints nicht erfasst. Für Weg A in
  Abschnitt 7 ist **diese** Sicherung maßgeblich.
- **Uploads (V-5):** Der Entrypoint sichert nur die Datenbank. Die Sicherung läuft mit dem
  alten Image als `nextjs` (gehört das Volume und darf nach `backups/` schreiben, 1.3), das
  Volume ist nur lesend eingehängt. Sie enthält Personalunterlagen aller Vorgänge, auch
  `uploads/bem/` — **auf dem Server lassen**, nicht herunterladen. Dauerhaft braucht das Volume
  eine eigene Sicherung (IT, Abschnitt 8).

**Erwartet:** Datenbank-Sicherung um 1,5 MB oder größer, `grep` meldet `1`; `tar OK`, das
Archiv etwa so groß wie in 1.4 (komprimiert eher kleiner), die Zeilenzahl größer als 1.

**Wenn nicht:** Datenbank-Sicherung deutlich unter 1 MB oder `grep` `0`, oder kein `tar OK`:
**STOPP.** `sudo docker compose start app` bringt das alte Portal zurück, dann an Claude.
**Nicht geprobt:** der `tar`-Aufruf auf dem Server.

### 3.5 Starten

```bash
sudo docker compose up -d
sudo docker compose logs -f app
```

`Strg+C` beendet nur die Anzeige, nicht den Container.

### 3.6 Was im Log erscheinen MUSS

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
✓ Ready in …
```

- **Warnung von `--accept-data-loss`:** voraussichtlich **keine**, denn es kommen nur neue
  Tabellen und eine Spalte mit Standardwert dazu. Eine Warnung zu einer Tabelle
  `unterlagen_*` ist unkritisch (neu und leer); jede andere Warnung: an Claude, **ohne** den
  Container anzuhalten, solange er nicht neu startet.
- **Keine Migrationszeile.** Alle zehn Merker stehen seit dem 24.09., die Migrationen kehren
  ohne Ausgabe zurück. Kommt eine Zeile mit `Vertragsende-Label`, `parallele Spuren`,
  `Abteilungsaufgaben`, `Masernschutz`, `Kostenstellen`, `Betriebsnummer`, `MINIJOB` oder
  `currentStep`: an Claude, dann fehlte ein Merker.
- **System-Vorlage:** `ist aktuell`, denn `public/system-dokumente/` ist unverändert.
  `angelegt` oder `aktualisiert`: an Claude.

```bash
sudo docker compose logs --no-log-prefix app > ~/deploy-paket4/start-log.txt
```

> **`start-log.txt` an Claude schicken**, bei jedem Deploy.

### 3.7 Fehlschlag erkennen

Es gilt die Tabelle aus dem Ablaufplan vom 24.09. (`deploy-onboarding-pakete-2026-09.md`,
Abschnitt 3.7). Das Wichtigste daraus:

| Zeichen im Log | Sofort |
|---|---|
| `Datenbank-Schema ist bereits deckungsgleich …` beim **ersten** Start | Das alte Image läuft (Build gescheitert?). An Claude mit `start-log.txt` und `sudo docker compose images app`. |
| `FATAL: Sicherungsverzeichnis /backups fehlt.` / `FATAL: Sicherung nach … fehlgeschlagen.` | Datenbank unverändert. Bei Rechten: `sudo chown 1001 backups`, der Container startet von selbst neu. Sonst an Claude. |
| Prisma-Fehler statt `…synchronisiert.`, `docker compose ps` zeigt `Restarting` | **Sofort** `sudo docker compose stop app` (jeder Neustart legt eine Sicherung an, nach zehn ist die vom Deploy weggeräumt), dann an Claude. |
| Kein `✓ Ready`, oder 4.1 meldet einen Fehler | an Claude mit `start-log.txt` |

### 3.8 Die Sicherung des Entrypoints aus der Rotation nehmen

```bash
sudo sh -c 'cd /vol/container/HR_Portal_CREDO/backups && cp -p "$(ls -1t vor-schema-abgleich-*.sql | head -1)" vor-deploy-paket4-entrypoint.sql && ls -l vor-deploy-paket4-*.sql uploads-vor-deploy-paket4.tar.gz'
```

Erwartet: drei Dateien. Den Dateinamen der neuesten Entrypoint-Sicherung notfalls aus dem Log
abschreiben (Lehre 5 vom 24.09.: Sternchen gehen beim Kopieren aus dem Chat verloren).

---

## 4 · NACHHER-Prüfungen

**Reihenfolge nach dem Start:** 3.8 → 4.1 → 4.2 → **5.1** → 6.3 Nr. 2 (`dokument-ablauf`
aktivieren) → 4.3 → 6.3 Nr. 3 (`unterlagen-fristen` mit `?dryRun=1` aktivieren) → 5.2–5.4.

### 4.1 Health

```bash
sudo docker exec hr-portal-app curl -s http://localhost:3000/api/health
sudo docker compose ps
```

Erwartet `{"status":"ok"…}` und `app` mit `(healthy)`.

### 4.2 SQL NACHHER (nur lesend)

Anlegen wie in 2.1. Variante 1:

```bash
sudo git show origin/main:docs/historie/deploy-paket4-stufe1.md \
  | awk '/^cat > ~\/deploy-paket4\/nachher-paket4.sql/{f=1;next} /^ENDE_SQL$/{f=0} f' > ~/deploy-paket4/nachher-paket4.sql
md5sum ~/deploy-paket4/nachher-paket4.sql
```

Variante 2 (Einfügen):

```bash
set +H
cat > ~/deploy-paket4/nachher-paket4.sql <<'ENDE_SQL'
-- Paket 4 Stufe 1 · NACHHER-Pruefungen (nur lesend) · docs/historie/deploy-paket4-stufe1.md, Abschnitt 4
SET default_transaction_read_only = on;
\pset pager off

\echo '== NACHHER N1 · Die vier Tabellen gibt es, leer'
SELECT 'unterlagen_nachforderungen' AS tabelle, COUNT(1) AS zeilen FROM unterlagen_nachforderungen
UNION ALL SELECT 'unterlagen_positionen', COUNT(1) FROM unterlagen_positionen
UNION ALL SELECT 'unterlagen_dateien',    COUNT(1) FROM unterlagen_dateien
UNION ALL SELECT 'unterlagen_links',      COUNT(1) FROM unterlagen_links;

\echo '== NACHHER N2 · Neue Spalten an documents: bezeichnung ueberall leer, unbefristet ueberall false'
SELECT COUNT(1) AS dokumente,
       COUNT(1) FILTER (WHERE bezeichnung IS NOT NULL) AS mit_bezeichnung,
       COUNT(1) FILTER (WHERE unbefristet)             AS unbefristet
FROM documents;

\echo '== NACHHER N3 · Unique-Indizes von Paket 4 (erwartet: 3 Zeilen)'
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename LIKE 'unterlagen\_%' AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  AND indexname NOT LIKE '%\_pkey'
ORDER BY 1;

\echo '== NACHHER N4 · Vorlagen nach „Text auf Standard zuruecksetzen“ (erwartet: Standard Paket 4)'
SELECT event, "isActive" AS aktiv, "updatedAt" AS gespeichert_utc, md5("bodyHtml") AS md5_html,
       CASE md5("bodyHtml")
         WHEN '1e7943515396bfc3f865def6668f9a49' THEN 'Standard Paket 4'
         WHEN '0de4f4e85754eff09f53e756e4b7c444' THEN 'Standard Paket 4'
         WHEN 'd3905995937c15d7e67462cefc796a14' THEN 'ALTER STANDARD: zuruecksetzen'
         WHEN '35aa931001718762f1dae3d7a51122dd' THEN 'ALTER STANDARD: zuruecksetzen'
         ELSE 'ABWEICHEND'
       END AS textstand
FROM email_templates
WHERE event IN ('dokument-ablauf-warnung', 'dokument-abgelaufen')
ORDER BY event;

\echo '== NACHHER N5 · Versandprotokoll der fuenf neuen Ereignisse (nach der Probe)'
SELECT event, status, COUNT(1) AS anzahl, MAX("createdAt") AS zuletzt_utc
FROM email_logs
WHERE event IN ('unterlagen-angefordert', 'unterlagen-erinnerung', 'unterlage-zurueckgewiesen',
                'unterlagen-vollstaendig', 'unterlagen-frist-verstrichen')
GROUP BY event, status
ORDER BY event, status;

\echo '== NACHHER R1 · Was ein Rueckfall auf 7bc91ec verloere (vor JEDEM Rueckfall frisch ausfuehren)'
SELECT (SELECT COUNT(1) FROM unterlagen_nachforderungen)                          AS nachforderungen,
       (SELECT COUNT(1) FROM unterlagen_nachforderungen WHERE status = 'LAUFEND') AS davon_laufend,
       (SELECT COUNT(1) FROM unterlagen_dateien WHERE "speicherPfad" IS NOT NULL) AS dateien_bei_nachforderung,
       (SELECT COUNT(1) FROM unterlagen_dateien WHERE "uebernahmeZiel" = 'DOCUMENT') AS uebernommen,
       (SELECT COUNT(1) FROM documents WHERE bezeichnung IS NOT NULL)              AS dokumente_mit_bezeichnung,
       (SELECT COUNT(1) FROM documents WHERE unbefristet)                          AS dokumente_unbefristet;
ENDE_SQL
md5sum ~/deploy-paket4/nachher-paket4.sql
```

Erwartete Prüfsumme: `1bdbdba06d78bec2a91e76ce32ef3b2a` (neu seit der Nachbesserung: nur die zwei
Prüfsummen in N4 sind andere). Geprobt wie die VORHER-Datei (Dev-Datenbank, psql 16.12, Exit 0,
6 Abschnitte, 0 `ERROR`).

```bash
sudo docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db \
  psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 < ~/deploy-paket4/nachher-paket4.sql > ~/deploy-paket4/nachher-ergebnis.txt 2>&1; echo "Exit: $?"
grep -c '^== NACHHER' ~/deploy-paket4/nachher-ergebnis.txt
grep -c 'ERROR' ~/deploy-paket4/nachher-ergebnis.txt
```

**Erwartet:** `Exit: 0`, `6`, `0`.

| Nr | Erwartet direkt nach dem Start | Wenn nicht |
|---|---|---|
| N1 | vier Tabellen, jede mit `0` Zeilen | an Claude |
| N2 | `mit_bezeichnung = 0`, `unbefristet = 0` | an Claude |
| N3 | drei Zeilen: `unterlagen_links_tokenHash_key`, `unterlagen_nachforderungen_laufendSchluessel_key`, `unterlagen_positionen_nachforderungId_typ_key` | an Claude — ohne den Index auf `laufendSchluessel` ließen sich zwei Nachforderungen je Vorgang anlegen |
| N4 | vor 5.1: `ALTER STANDARD: zuruecksetzen`; **nach 5.1: `Standard Paket 4`** | `ABWEICHEND` nach 5.1: an Claude |
| N5 | leer; nach der Probe in 5.4 je eine Zeile je versendeter Mail | FAILED oder SKIPPED: an Claude |
| R1 | alles `0` | nur für einen Rückfall (Abschnitt 7) |

Die Prüfsummen in V5 und N4 sind die der Code-Standards von `7bc91ec` bzw. von Paket 4 nach der
Nachbesserung der Abschlussdurchsicht (Feinplanung 18, U-37: Bedingungsblöcke
`nachforderung_moeglich`/`nachforderung_gesperrt`, `{{dokument_typ}}` im Satz der Ablaufwarnung) —
berechnet wie „Text auf Standard zurücksetzen“ speichert: `md5` von `bodyHtml.trim()` aus
`DEFAULT_EMAIL_TEMPLATES`. Ändert eine spätere Fix-Runde eine der beiden Vorlagen, rechnet Claude
sie vor dem Deploy neu (und damit auch die Prüfsumme der NACHHER-Datei oben).

> **`nachher-ergebnis.txt` an Claude schicken.**

### 4.3 Lauf-Probe (ohne Mails)

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://hr.fes-credo.de/api/cron/unterlagen-fristen
sudo docker exec hr-portal-app sh -c 'curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/unterlagen-fristen?dryRun=1"'
```

- Der erste Aufruf (ohne Schlüssel, von außen über Caddy): erwartet `401`. Das zeigt, dass die
  Route von außen erreichbar ist und den fehlenden Schlüssel ablehnt. `500` heißt: `CRON_SECRET`
  fehlt oder ist zu kurz (1.7).
- Der zweite (mit Schlüssel, im Container, **nur mit `?dryRun=1`**): erwartet
  `{"success":true,…,"dryRun":true,…,"total":0,"details":[]}`. Ein Probelauf schreibt, mailt,
  löscht und sperrt nichts. Ohne Nachforderung ist ohnehin nichts zu tun.
- **Nicht** ohne `?dryRun=1` von Hand aufrufen, sobald es Nachforderungen gibt: Der scharfe
  Lauf verschickt Erinnerungen und löscht Dateien.

---

## 5 · Handschritte im Portal

Die Einstellungen erreichen nur SUPER_ADMIN und HR_LEITUNG. Wie „Text auf Standard
zurücksetzen“ geht, steht im Ablaufplan vom 24.09. (Abschnitt 5.5): Betreff, HTML, Text und
Variablenliste werden ersetzt; Empfängerfelder, Aktiv-Schalter und Name bleiben.

### 5.1 PFLICHT, direkt nach 4.2: zwei Vorlagen zurücksetzen (Z3)

| Vorlage (Anzeigename) | Event | Was neu ist |
|---|---|---|
| Befristeter Nachweis läuft ab (HR-Erinnerung) | `dokument-ablauf-warnung` | Der Schlusssatz verweist auf „Unterlagen nachfordern“ und nennt die Annahme mit Ablaufdatum oder als „Unbefristet“ — nur, wo das Portal die Nachforderung anbietet (`{{#nachforderung_moeglich}}`); bei einem abgelaufenen Vorgang oder offenem Fragebogen steht stattdessen der Grund (`{{nachforderung_hinweis}}`). `dokument_datei` nennt Bezeichnung bzw. Art und Upload-Datum statt des Dateinamens. Drei neue Variablen in der Liste. |
| Befristeter Nachweis ist abgelaufen (HR-Warnung) | `dokument-abgelaufen` | „… dann fordern Sie diese im Vorgang über ‚Unterlagen nachfordern‘ an; sobald Sie sie als {{dokument_typ}} mit ihrem Ablaufdatum annehmen, endet die Warnung.“ (die gemahnte Art — Aufenthaltstitel oder Arbeitserlaubnis), ebenfalls nur mit `nachforderung_moeglich`. Vorher: „laden Sie diese als Nachweis hoch“ — das kann HR im Onboarding nicht. |

1. **Fassung vergleichen:** Zeigt V5 `Standard 7bc91ec`, ist die gespeicherte Fassung der
   unveränderte alte Standard, der Reset verliert nichts. Zeigt V5 `ABWEICHEND`, gilt die
   Entscheidung aus 2.3. Im Editor erscheint bei beiden der Hinweis „Der Standardtext weicht
   von Ihrer gespeicherten Fassung ab.“
2. Je Vorlage **„Text auf Standard zurücksetzen“** und bestätigen.
3. 4.2 erneut ausführen: N4 zeigt zweimal `Standard Paket 4`.

Das muss vor dem nächsten Lauf von `dokument-ablauf` erledigt sein, sonst geht die alte
Handlungsanweisung hinaus.

### 5.2 PFLICHT vor dem ersten „Anfordern“

1. **Einstellungen → SMTP → Antwortadresse** (= HR-Postfach), falls V4 `LEER` zeigte. Sie ist
   zugleich die CC der beiden HR-Mails und die Antwortadresse der Mails an die Person. Danach
   zeigt **Einstellungen → Versand-Status** keinen Hinweis „Nutzt {{hr_postfach}}, aber … keine
   Antwortadresse“ mehr.
2. **n8n:** Die bestehenden Läufe erreichen das Portal (6.1), `dokument-ablauf` ist nach 5.1
   aktiv (6.3 Nr. 2), und `unterlagen-fristen` läuft mindestens mit `?dryRun=1` (6.2, 6.3
   Nr. 3). **Der Probelauf genügt nur für die Probe mit einem Testvorgang (5.4), nicht für
   echte Nachforderungen:** Er verschickt keine Erinnerung, holt keine gescheiterte Mail nach,
   meldet HR keine verstrichene Frist und löscht nichts — die Upload-Seite und der Dialog
   versprechen das aber. Eine in dieser Zeit fällige Fristtag-Erinnerung fällt endgültig aus
   (ein verpasster Fristtag wird nicht nachgeholt), und eine fällige Vorab-Erinnerung hinterlässt
   keine Spur, sodass die Karte „Der tägliche Lauf erreicht das Portal vermutlich nicht …“
   meldet. **Echte Nachforderungen deshalb erst nach dem Scharfschalten (6.3 Nr. 4)** — erst
   dann HR informieren (Nr. 5).
3. **DSB-Text** der Upload-Seite (1.8), falls mit Platzhalter deployt wurde.
4. **Caddy (V-9):** Zeigte 1.9 ein Zugriffsprotokoll ohne Filter auf `request>uri` und lautete
   die Entscheidung „Filter ergänzen“, ist er eingetragen und Caddy neu geladen; 1.9 noch einmal
   ausführen. Lautete sie „hinnehmen“, ist das hier vermerkt.
5. **HR informieren — erst, wenn `unterlagen-fristen` scharf läuft (6.3 Nr. 4):** Handbuch,
   Kapitel 3.7 „Unterlagen nachfordern“ (`docs/handbuch/handbuch.html#onboarding-unterlagen`).
   Besonders: Unterlagen nicht per Mail annehmen, sensible Unterlagen nie über freie Zeilen
   anfordern, Entwürfe sieht HR nie.

### 5.3 EMPFOHLEN

- **Freigabeliste** (Einstellungen → SMTP → Erlaubte Empfänger-Domains) pflegen. Eine leere
  Liste schränkt nichts ein, die Adresse aus dem Vorgang ist immer erlaubt; eine abweichende
  Adresse verlangt im Dialog zusätzlich das Kästchen „Adresse geprüft“.
- **„Test senden“** an die eigene Adresse, je Vorlage einmal: „Unterlagen angefordert“,
  „Erinnerung: Unterlagen“, „Unterlage zurückgewiesen“, „Unterlagen vollständig eingegangen
  (HR)“, „Frist für Unterlagen verstrichen (HR)“ (Gruppe „Unterlagen“). Der Testversand nutzt
  die Beispielgeschichte mit `https://hr.fes-credo.de/beispiel-link` — kein echter Link.
- **Caddy `request_body`:** optional ein Pfad-Matcher mit 10 MB für `/api/unterlagen/*` — die
  Route begrenzt selbst, Caddy wäre die zweite Schicht. (Die Prüfung des Zugriffsprotokolls ist
  keine Empfehlung, sondern V-9: 1.9 und 5.2.)

### 5.4 Probe mit einem Testvorgang an eine eigene Adresse

Voraussetzung: ein Onboarding-Vorgang mit **eigener** Adresse, dessen Fragebogen abgesendet ist
(„Unterlagen nachfordern…“ gibt es erst danach). Am besten in einer Einrichtung, die nicht vom
Typ `KITA` ist, und mit einer Führungskraft-Adresse, die ebenfalls die eigene ist. Aufenthaltstitel
und Masernschutz lassen sich nur anfordern, wenn sie für den Vorgang Pflicht sind: im
Test-Fragebogen also die Angaben machen, aus denen die Pflicht folgt — Aufenthaltstitel
erforderlich; Masernschutz: ein Geburtsdatum nach dem 31.12.1970 UND eine Einrichtung vom Typ
Schule (Gymnasium, Gesamtschule, Grundschule, Berufskolleg). Ein Haken in der Formularvorlage
genügt für den Masernschutz nicht, die Pflicht folgt allein aus dieser Regel. Sonst stehen sie
im Dialog grau mit Grund — auch das ist ein Ergebnis.

1. **Anfordern:** Aufenthaltstitel, Masernschutz und eine freie Zeile („Test: unterschriebenes
   Formular“, Original erforderlich), Frist in 14 Tagen. Mail prüfen: Masernschutz und
   Aufenthaltstitel erscheinen nur als „Eine vertrauliche Unterlage – Einzelheiten sehen Sie nach
   dem Öffnen des Links“, der Betreff nennt keine Unterlage.
2. **Hochladen vom Handy** (iPhone: ein Foto — kommt HEIC als JPEG an? Android: ein Foto) und
   **vom PC** (ein PDF). Einen Entwurf entfernen, dann „Unterlagen übermitteln“. HR-Mail
   „Unterlagen eingegangen“ prüfen: An die anfordernde HR-Kraft, CC das HR-Postfach, der Knopf
   führt in den Reiter „Dokumente“.
3. **„Öffnen“ eines PDF und eines Bildes** in Edge, Chrome, Firefox und Safari (iOS). Die
   Datei-Route setzt für PDFs die Portal-CSP (`object-src 'none'`) und für Bilder `sandbox`.
   **Zeigt ein Browser das PDF nicht an: an Claude** — dann wird die Route für PDFs auf
   `attachment` umgestellt (Code-Änderung).
4. **Annehmen:** den Aufenthaltstitel mit einem Datum in etwa 10 Tagen — der **gelbe**
   Warnbalken „Nachweis läuft in Kürze ab“ erscheint (kritisch ab 14 Tagen; rot „⚠ Nachweis
   abgelaufen“ erst nach dem Ablauf), die Dokumentenliste zeigt „aus Nachforderung angenommen
   am …“. Dann „Annahme zurücknehmen…“ (das Dokument verschwindet), erneut annehmen, diesmal
   „Unbefristet“ — der Warnbalken verschwindet, die Dokumentenzeile zeigt „Unbefristet“.
5. **Zurückweisen** der freien Zeile mit Begründung: Mail mit neuem Link. Dann „Link erneut
   senden“ mit „Frühere Links sperren“ und einen alten Link aufrufen: erwartet „Dieser Link
   wurde durch einen neueren ersetzt …“ (410). Nach Ablauf der Sperrzeit von 10 Minuten noch
   einmal „Link erneut senden“, jetzt an eine **abweichende** eigene Adresse mit „Adresse
   geprüft“ (ist die Freigabeliste gepflegt, muss ihre Domain darin stehen): Der Link aus der
   ersten „Link erneut senden“-Mail zeigt danach „Dieser Link ist ungültig …“ (404). Die schon
   gesperrten Links (Aufforderung, Zurückweisung) bleiben bei „… durch einen neueren ersetzt …“
   (410) — ein Adresswechsel entwertet nur, was noch gültig war.
6. **Zurückziehen** und den Testvorgang auf „abgelaufen“ setzen. Zum Schluss 4.2: N5 zeigt die
   versendeten Mails als SENT.

> **Ergebnis an Claude:** je Schritt kurz „wie erwartet“ oder die Abweichung, besonders 2
> (HEIC) und 3 (Browser).

---

## 6 · n8n

**Im Repo liegt kein Export für den neuen Lauf** (`/n8n/` steht in `.gitignore`: „interner
Stand, nie ins Repo“; das Repo ist öffentlich). Die drei alten Exporte vom 28.03. sind noch
versioniert, zeigen aber nicht den Live-Stand; die beiden Reminder-Exporte rufen
`hr.credo-schulen.de` auf (der dritte, `CREDO_HR_Portal_Offboarding_Workflow.json`, nennt schon
`hr.fes-credo.de`). Maßgeblich ist, was in der n8n-Oberfläche steht.

**Für alle Cron-Aufrufe gilt:** Methode `POST`, Header `Authorization: Bearer <CRON_SECRET>`
über ein **Header-Auth-Credential** (Name `Authorization`, Wert `Bearer <CRON_SECRET>` aus der
`.env` des Servers) statt eines Klartext-Headers im Knoten. Ohne oder mit falschem Header: 401.

### 6.1 Bestehende Läufe reparieren (V-2, vor dem Deploy)

| Lauf | URL | Zeitplan | Prüfen |
|---|---|---|---|
| Onboarding-Erinnerungen | `https://hr.fes-credo.de/api/cron/reminders` | täglich 08:00 | URL (heute vermutlich `hr.credo-schulen.de`), Timeout mindestens 120 s |
| Offboarding-Abteilungserinnerungen | `https://hr.fes-credo.de/api/cron/offboarding-reminders` | täglich 08:00 | wie oben |

> **Achtung, echte Mails.** `reminders` und `offboarding-reminders` kennen kein `dryRun`. Kommen
> sie heute nicht an, ist der Lauf nach der Korrektur der erste überhaupt: Er verschickt alle
> fälligen Fragebogen- und Vorgesetzten-Erinnerungen auf einmal (am 24.09. waren es fünf) und
> die Erinnerungen der Abteilungsaufgaben. **HR vorher informieren und an einem Werktag morgens
> scharf schalten.** V7 zeigt, ob die Läufe heute ankommen.

Die Reparatur ist zugleich Voraussetzung für die Löschfristen nach DSGVO: die 30 Tage der
Dateien aus Paket 4 und die 90 Tage des `EmailLog` (sonst löscht das Portal alte Einträge nur
beim Öffnen des Versandprotokolls).

### 6.2 Neuer Lauf `unterlagen-fristen`

| Einstellung | Wert |
|---|---|
| Auslöser | Schedule Trigger, **täglich 07:00**, Zeitzone des Workflows **Europe/Berlin** |
| HTTP Request | `POST https://hr.fes-credo.de/api/cron/unterlagen-fristen?dryRun=1` (in den ersten 1–3 Tagen, danach ohne `?dryRun=1`) |
| Authentifizierung | Generic Credential Type → Header Auth, Credential wie oben |
| Timeout | **300000 ms** (jede Mail kann bis zu etwa 40 s brauchen, der Lauf bremst erst nach drei Fehlern in Folge) |
| Retry On Fail | **aus** — ein zweiter gleichzeitiger Aufruf bekäme 409, und ein wiederholter scharfer Lauf wäre bestenfalls wirkungslos |
| Bericht | Mail an HR bzw. IT, wenn `errors > 0` **oder** `nichtZugestellt > 0`, dazu der Fehlerausgang des HTTP-Knotens (401, 409, 500, Zeitüberschreitung) |

- **Antwort** (ohne Personendaten, n8n speichert Ausführungsdaten): `success`, `heute`,
  `dryRun`, `erinnerungen.vorab`/`.fristtag`, `hrMeldungen.vollstaendigNachgeholt`/
  `.fristVerstrichen`, `nachgeholt`, `nichtZugestellt`, `mailUebersprungen`, `uebersprungen`,
  `zurueckgezogen`, `aufgeraeumt.dateien`/`.entwuerfe`/`.waisen`/`.fehler`, `errors`, `total`,
  `details[]` (Nachforderungs-ID, Modul, Schritt, Anlass, Status). Im Probelauf zählen die
  Mail-Zähler das Geplante, jeder Eintrag in `details` hat `status: "GEPLANT"`.
- **Statuscodes:** 200 auch bei Teilfehlern (`errors`), 409, solange ein Lauf arbeitet, 401 ohne
  gültigen Schlüssel, 500 bei fehlendem oder zu kurzem `CRON_SECRET` oder schwerem Fehler.
- **Warum 07:00:** vor Arbeitsbeginn und vor den beiden 08:00-Läufen. Die Fristtag-Erinnerung
  erreicht die Person dann am Morgen des Fristtags.

### 6.3 Einführung

Die Reihenfolge (so auch in Abschnitt 4 und 5.2): anlegen vor dem Deploy,
`dokument-ablauf` direkt nach 5.1, `unterlagen-fristen` nach 4.3 — beide vor dem ersten
„Anfordern“ (5.4).

1. **Beide Workflows anlegen, zunächst inaktiv** (V-3, vor dem Deploy): `unterlagen-fristen` wie
   in 6.2 (die Route antwortet vor dem Deploy mit 404) und `POST
   https://hr.fes-credo.de/api/cron/dokument-ablauf` (seit 08.09. auf dem Server, nie
   eingeplant), täglich, Empfehlung 07:30, gleiches Credential. `dokument-ablauf` bleibt bis 5.1
   aus, sonst verschickt er noch die alte Handlungsanweisung (Z3).
2. **Direkt nach 5.1 `dokument-ablauf` aktivieren**, vor dem ersten „Anfordern“ (Feinplanung 15:
   „mit einplanen“; aktiv erst nach dem Reset, weil die gespeicherten Vorlagen bis dahin den alten
   Text tragen). Vorher müssen beide `dokument-*`-Vorlagen ein An-Feld haben (V5 `an`;
   Katalog-Empfänger leer), sonst setzt der Lauf nur Merker und verschiebt die Erinnerung. V8
   zeigt, wie viele Nachweise er überwacht. Ein Probelauf fehlt dieser Route; der erste Lauf
   mailt, sobald ein Nachweis im Horizont liegt.
3. **Nach 4.3 `unterlagen-fristen` aktivieren, mit `?dryRun=1`**, 1–3 Tage. Jeden Morgen die
   Antwort mit den Karten im Portal vergleichen: Stimmen geplante Erinnerungen, HR-Meldungen und
   Löschungen mit dem, was die Karten zeigen?
4. Dann `?dryRun=1` aus der URL nehmen. **Ab jetzt verschickt der Lauf echte Mails und löscht
   Dateien.** Erst jetzt HR informieren und echte Nachforderungen zulassen (5.2 Nr. 2 und 5).

### 6.4 Webhooks

Die drei Mails an die Person (`unterlagen-angefordert`, `unterlagen-erinnerung`,
`unterlage-zurueckgewiesen`) laufen **nie** über Webhooks — sie tragen den persönlichen
Upload-Link. Ein Webhook darauf lässt sich anlegen, feuert aber nie; die Ereignisliste zeigt
dazu einen Hinweis. Die beiden HR-Mails feuern Webhooks zusätzlich zur Portal-Mail: Ein
n8n-Workflow mit eigener Mail ergäbe Doppelversand (V6).

---

## 7 · Rückfall

### 7.1 Was man NICHT tun darf

**Das alte Image nie mit dem normalen Entrypoint gegen die neue Datenbank starten**, also weder
`sudo git checkout 7bc91ec && sudo docker compose up -d --build` noch das Image
`hr-portal-app:7bc91ec` ohne vorheriges Einspielen der Sicherung. Der Entrypoint sähe das alte
Schema, zöge einen `pg_dump` und schöbe das alte Schema mit `db push --accept-data-loss`
darüber. Das **löscht ohne Rückfrage**:

- die vier Tabellen `unterlagen_*` — alle Nachforderungen, Positionen, Dateizeilen samt
  Begründungen und Prüfsummen und den Mailverlauf,
- die Spalten `documents.bezeichnung` und `documents.unbefristet` — übernommene freie Zeilen
  heißen danach nur noch „Sonstiges“, und unbefristete Titel erzeugen wieder Warnbalken und
  HR-Erinnerungen.

Übernommene `Document`-Zeilen und ihre Dateien unter `uploads/<onboardingId>/` bleiben gültig.
Laufende Nachforderungen und alles unter `uploads/unterlagen/` sind verwaist — der alte Code
kennt sie nicht und löscht sie nie. Die Links in schon verschickten Mails führen ins Leere.
Die Härtung der Download-Route ist wieder weg.

**Ebenso nicht:** `sudo docker compose down -v` (löscht Datenbank und Uploads),
`node prisma/seed.js` (überschreibt gepflegte Vorlagen), `git clean` im Projektordner (löscht
die Sicherungen).

### 7.2 Erst entscheiden: vorwärts oder zurück

**Vorwärts reparieren ist fast immer besser**, besonders in den ersten Tagen: Ein Fehler im
Code wird mit einem neuen Commit behoben und neu deployt. Ändert sich das Schema dabei nicht,
meldet der Entrypoint „bereits deckungsgleich“ und macht weder Sicherung noch Push. Das Risiko
eines Rückfalls ist klein, weil nichts von selbst geschieht, bevor HR zum ersten Mal
„Anfordern“ klickt — bis dahin sind die neuen Tabellen leer.

Zurück nur mit Claude. Vorher R1 aus 4.2 frisch ausführen: Die Zahlen sind genau das, was
verloren ginge.

### 7.3 Weg A: Sicherung einspielen, dann altes Image (nur direkt nach dem Deploy)

Nur solange seit dem Start **niemand gearbeitet hat** (R1 alles `0` und die Prüfung „ob
gearbeitet wurde“ aus dem Ablaufplan vom 24.09., Abschnitt 7.3). Ablauf wie dort, mit diesen
Namen:

```bash
cd /vol/container/HR_Portal_CREDO
sudo docker compose stop app
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-rueckfall-$(date +%Y%m%d-%H%M%S).sql'
sudo grep -c 'PostgreSQL database dump complete' backups/vor-deploy-paket4-manuell.sql   # erwartet 1
sudo docker exec hr-portal-db psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE;'
sudo docker exec hr-portal-db psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 -1 -f /backups/vor-deploy-paket4-manuell.sql
sudo tee docker-compose.override.yml >/dev/null <<'EOF'
services:
  app:
    image: hr-portal-app:7bc91ec
EOF
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
# erwartet: 0. Bei allem anderen NICHT starten: an Claude.
sudo docker compose up -d --no-build app
```

Scheitert das Einspielen, ist das Schema leer: **nicht** starten, die `vor-rueckfall-*`-Sicherung
genauso einspielen, an Claude. Die Uploads bleiben bei Weg A, wie sie sind: Seit dem Start hat
niemand gearbeitet, also liegt nichts unter `uploads/unterlagen/`. Die Sicherung aus 3.4 ist
nur für einen Schaden am Volume da. Nach dem Rückfall die `docker-compose.override.yml` wieder
löschen (`sudo rm docker-compose.override.yml`), bevor vorwärts deployt wird.

### 7.4 Weg B: altes Image ohne Entrypoint (nur mit Claude, nicht geprobt)

Wenn schon gearbeitet wurde und die Daten bleiben sollen: das alte Image mit
`entrypoint: ["node", "server.js"]` in einer Override-Datei starten. Der alte Prisma-Client
ignoriert die neuen Tabellen; `documents.unbefristet` hat einen Standardwert, neue Dokumente
des alten Codes bekommen `false`. Der Entrypoint muss bei **jedem** Start umgangen sein, sonst
tritt 7.1 ein. Die Upload-Seite und die Karte gibt es dann nicht; Mails mit Links führen ins
Leere.

---

## 8 · Offene Punkte nach dem Deploy

- **Dauerhafte Sicherung des Volumes `uploads_data`** (IT). 3.4 ist eine einmalige Sicherung.
- **n8n-Bericht** für `reminders` wertet `departmentReminders` nicht aus (bekannt seit 24.09.).
- **Datenschutz:** Verarbeitungsverzeichnis, Führungszeugnis bei Kitas, Aufbewahrung (1.8).
- **Stufe 2:** übrige fünf Vorgangsarten, Listenspalte „Unterlagen“ (E-6),
  Pseudonymisierung (E-7).
- **Technische Schuld:** Sperren und Bremsen im Speicher des Prozesses tragen nur bei einem
  Container (CLAUDE.md, Paket 4). Große Komponenten (`upload-seite.tsx`,
  `nachforderung-karte.tsx`, `nachforderung-dialog.tsx`, `pruef-dialoge.tsx`, je rund
  900–1200 Zeilen).
- **Nach dem Deploy:** dieses Dokument um Log und Ergebnisse ergänzen (Protokoll oben), den
  Änderungsplan und die Feinplanung auf „deployt“ setzen.

---

## Anhang A · Rückmeldungen an Claude

| Wann | Was schicken | Weiter erst nach Antwort? |
|---|---|---|
| 1.1–1.9 | jede Abweichung vom Erwarteten, dazu die Ergebnisse von 1.7 und 1.9 | ja, bei STOPP und ENTSCHEIDUNG |
| 2.2 | `vorher-ergebnis.txt`, **immer** | **ja** |
| 3.1 | Konflikt oder Ausgabe beim `git diff` | ja |
| 3.3 | `vorschau-delta.sql`, wenn die Zählung abweicht oder der Befehl scheitert | ja |
| 3.4 | Sicherung zu klein, unvollständig, kein `tar OK` | ja (vorher `sudo docker compose start app`) |
| 3.6 | `start-log.txt`, **immer** | nein, außer bei Fehlern |
| 4.2 | `nachher-ergebnis.txt`, **immer** | nein, außer bei Abweichungen |
| 5.4 | Ergebnis der Probe je Schritt, besonders HEIC und Browser | nein, außer bei Abweichungen |
| 6.3 | die Antworten des Probelaufs der ersten Tage, bevor `dryRun` wegfällt | **ja** |
| 7 | vor **jedem** Rückfall, mit frischem R1 | **ja** |

## Anhang B · Ungeklärt

- **n8n:** Live-Stand der bestehenden Läufe (URL, Timeout, Zeitplan) und ob
  `dokument-ablauf` irgendwo eingeplant ist.
- **`N8N_API_KEY`:** ob gesetzt und wer ihn nutzt (1.7).
- **Caddy, Live-Stand:** ob ein Zugriffsprotokoll die URI samt Token festhält, wo das
  Caddyfile liegt und welches `request_body` gilt (1.9, V-9). Das `Caddyfile.hr-portal` im Repo
  ist veraltet. Die Befehle in 1.9 sind nicht geprobt.
- **Handy und Caddy:** ob iOS HEIC in JPEG umwandelt und ob `Content-Length` über Caddy und
  HTTP/2 ankommt (die Grenze greift auch ohne den Header).
- **Browser:** ob das Inline-PDF unter der Portal-CSP überall angezeigt wird (5.4 Nr. 3).
- **`after()` im Standalone-Build:** Die HR-Meldung „vollständig“ geht nach der Antwort
  hinaus; im Projekt erstmals eingesetzt. Fällt sie aus, holt der nächste Lauf sie nach.
- **Nicht geprobt:** die VORHER-Datei gegen das Schema `7bc91ec`, die Vorschau in 3.3 gegen
  dieses Delta auf dem Server, der `tar`-Aufruf in 3.4, Weg A und B in Abschnitt 7.
