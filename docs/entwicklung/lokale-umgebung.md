# Lokale Entwicklungsumgebung einrichten

> **Stand:** 18.10.2026 · geprüft auf dem Code-Stand `0e1d8de` (seit PR #6 am 18.10.2026 in
> `main`)
> **Zweck:** Auf einem neuen Rechner nur mit dem Repo arbeitsfähig werden. Bisher stand das Rezept in
> einer Datei außerhalb des Repos (`../CLAUDE.md`, „Dev-Umgebung starten“) und in Bruchstücken in
> mehreren Modul-Dokumenten. Diese Anleitung bündelt es und enthält **keine Werte**: Jedes Geheimnis
> und jedes Passwort erzeugt man auf dem Rechner selbst.

Was es außer dem Repo gibt und wo es maßgeblich liegt (Gedächtnis von Claude, Workspace-Datei,
n8n-Exporte, lokaler Stash), steht in der
[Übergabe S0, Abschnitt 8.6](../historie/uebergabe-selfservice-s0-2026-10-17.md).

---

## 1. Voraussetzungen

- **Git**, **Docker** (Docker Desktop), **Node.js 22 LTS** wie im Image (`node:22-alpine` im
  `Dockerfile`; das README nennt seit dem 18.10.2026 ebenfalls 22). Auf dem Mac lief bisher
  Node 24.12 mit npm 11.6; dazu der Stolperstein in Abschnitt 9.
- **openssl** für die Geheimnisse. Unter Windows bringt Git Bash es mit. Die Befehle dieser Anleitung
  sind bash; unter PowerShell 5.1 ist `curl` ein anderes Programm (`curl.exe` nehmen).
- **Nicht in einen synchronisierten Ordner klonen** (iCloud-Schreibtisch, OneDrive). Die
  Synchronisierung legt Kopien mit „ 2“, „ 3“ … im Namen an, auch in `.git` und `.next`, und bricht
  damit `git fetch` und die Typprüfung (Übergabe S0, Abschnitt 8.5).
- **Git-Kennung setzen**, einmal je Rechner, gleich auf allen Rechnern:
  `git config --global user.name "…"` und `git config --global user.email "…"`. Ohne sie trägt Git
  eine aus dem Rechnernamen erzeugte Adresse ein (so bei 42 Commits bis `a4b1680`). Auf dem Mac sind
  `user.name` und `user.email` seit dem 18.10.2026 gesetzt. Das Repo ist öffentlich, die Adresse
  steht in jedem Commit.

## 2. Repo holen

```bash
git clone https://github.com/Penknife5550/HR_Portal_CREDO.git
cd HR_Portal_CREDO
```

Seit dem 18.10.2026 liegt alles auf `main` (PR #6 gemergt); ein anderer Zweig ist nicht nötig.

Danach Abhängigkeiten und Prisma Client (es gibt kein `postinstall`):

```bash
npm ci
npx prisma generate
```

`npm ci` statt `npm install`: Es hält sich genau an `package-lock.json`.

## 3. Abnahme ohne Datenbank

```bash
npm run pruefen
```

Typprüfung, Lint und Tests brauchen weder Datenbank noch Umgebungsvariablen. **Erwartet** (Stand
`0e1d8de`, am 18.10.2026 in einem frischen Klon geprobt): Typprüfung fehlerfrei, Lint mit den
5 bekannten Warnungen in Bestandsdateien, **247 Suites, 7.526 Tests** grün. Erst wenn das stimmt,
lohnt sich der Rest.

## 4. Datenbank

PostgreSQL 16 im Container, auf Port **5433**: 5432 ist auf Entwicklerrechnern oft schon belegt, und
die Dokumente des Repos (außer `.env.example`) rechnen mit 5433.

```bash
docker run -d --name credo-hr-db-dev -e POSTGRES_USER=credo -e POSTGRES_PASSWORD=<entwicklungspasswort> -e POSTGRES_DB=hr_portal -p 5433:5432 -v credo-hr-db-dev:/var/lib/postgresql/data postgres:16-alpine
```

Das benannte Volume `credo-hr-db-dev` hält die Daten über ein Neuanlegen des Containers hinweg (der
Container auf dem Mac nutzt ein anonymes Volume). Später genügt `docker start credo-hr-db-dev`.
**Neu aufsetzen** (`docker rm -f credo-hr-db-dev` und `docker volume rm credo-hr-db-dev`) löscht die
lokale Datenbank samt Testdaten, also nur nach Rückfrage.

## 5. Umgebungsvariablen

Eine Datei `.env` im Repo-Ordner. Sie ist per `.gitignore` ausgeschlossen, ebenso `.env*.local`.
Eine `.env` lesen Next.js, die Prisma-CLI, der Seed und `scripts/dev-passwort-neu.js`; die
Prisma-CLI liest `.env.local` **nicht**. Ältere Dokumente setzen die Werte per `export` oder in
`.env.local` — beides geht, die `.env` erspart das Exportieren vor jedem Prisma-Befehl.

`.env.example` taugt nur als Muster: Ihre `DATABASE_URL` zeigt auf Port 5432, `CRON_SECRET` fehlt,
`GOTENBERG_URL` zeigt auf den Dienst im Container-Netz, und `N8N_API_KEY` trägt einen bekannten
Platzhalter (er schaltete lokal den n8n-Schlüssel mit diesem Wert frei).

| Variable | Anforderung | Erzeugen |
|---|---|---|
| `DATABASE_URL` | `postgresql://credo:<entwicklungspasswort>@localhost:5433/hr_portal?schema=public` | Passwort aus Abschnitt 4 |
| `JWT_SECRET` | Pflicht; mindestens 32 Zeichen (in Produktion geprüft, lokal empfohlen) | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | 64 Hex-Zeichen | `openssl rand -hex 32` |
| `BEM_ENCRYPTION_KEY` | 64 Hex-Zeichen, **anderer** Wert als `ENCRYPTION_KEY`; ohne ihn brechen die BEM-Routen ab | `openssl rand -hex 32` |
| `CRON_SECRET` | mindestens **24** Zeichen; fünf Cron-Routen antworten sonst beim Handaufruf mit 500 | `openssl rand -base64 24` |
| `PERSONALSTAMM_SECRET` | mindestens 24 Zeichen, **ungleich** `CRON_SECRET`; sonst antwortet der Webhook von S0 mit 500 | `openssl rand -base64 24` |
| `APP_URL` | `http://localhost:3000` | — |
| `ADMIN_INITIAL_PASSWORD` | optional, nur für den ersten Seed (Abschnitt 7) | selbst wählen |
| `GOTENBERG_URL` | optional, `http://localhost:3001` (Abschnitt 8) | — |

**Nicht setzen:** `ZEITPLANER_AKTIV` (außerhalb der Produktion ist die Uhr des Zeitplaners aus, die
Entwicklungsumgebung verschickt so nie von selbst Mails) und `N8N_API_KEY` (nur zum Probieren des
n8n-Schlüssels, dann mit einem eigenen Zufallswert).

In drei Dokumenten standen bis zum 18.10.2026 Entwicklungswerte der damaligen Datenbank, in zweien
auch ein Testzugang: `docs/module/elternzeit/elternzeit-phase-1-status.md`,
`docs/module/elternzeit/elternzeit-phase-2-status.md` („Aktivierung“) und
`docs/module/verbeamtung/VERBEAMTUNG_BEURTEILUNGEN_STATUS.md`. Seither verweisen sie auf diesen
Abschnitt und auf Abschnitt 7. In der Git-Historie bleiben die Werte lesbar, und der damalige
`ENCRYPTION_KEY` ist zugleich der Testschlüssel in `src/__tests__/lib/encryption.test.ts`: alte Werte
nie wiederverwenden, jeder Rechner erzeugt neue.

## 6. Schema, Grunddaten, System-Vorlagen

```bash
npx prisma db push
```

```bash
npx prisma db seed
```

```bash
node prisma/seed-check.js
```

- **`db push`, nie `prisma migrate dev`** und nie `npm run db:migrate`. Das Schema wird ohne
  Migrationen abgeglichen (CLAUDE.md, „Konventionen“). Der Ordner `prisma/migrations/` ist ein
  ungenutzter Rest vom März 2026. `migrate dev` meldete gegen eine per `db push` gepflegte Datenbank
  Abweichungen und böte an, sie zurückzusetzen — die lokalen Daten wären weg.
- **Der Seed** legt Mandanten, das Admin-Konto und die Standardvorlagen an (nur, was fehlt).
- **`seed-check.js` danach.** Auf dem Server ruft ihn der Entrypoint. Er legt die System-Vorlagen an
  und führt die einmaligen Datenmigrationen samt Merkern aus, darunter den Standardkatalog
  „Ausstattung & Zugänge“. Nach dem Seed meldet er „Seed uebersprungen“. **Nicht vor dem Seed**
  starten: Auf einer Datenbank ohne Benutzer verlangt er `prisma/seed.js`, das nur beim Bau des
  Images entsteht; der Fehler wird abgefangen, und der Seed fehlt.
- **Erwartet** (Stand der lokalen Datenbank auf dem Mac, 18.10.2026): 13 Merker in
  `system_migrations`, 3 System-Vorlagen.
- Optional für die Fristen der Elternzeit: `npx tsx prisma/seeds/schulferien-nrw-2024-2028.ts`
  (Elternzeit-Status Phase 2, „Aktivierung“).

## 7. Anmelden

Das Admin-Konto (Adresse in CLAUDE.md, „Admin-Zugang“, Rolle SUPER_ADMIN) bekommt beim ersten Seed
den Wert von `ADMIN_INITIAL_PASSWORD` oder ein Zufallspasswort, das der Seed genau einmal ausgibt.
Ist es weg:

```bash
node scripts/dev-passwort-neu.js <e-mail>
```

Das Skript arbeitet nur gegen eine lokale Datenbank und gibt ein neues Zufallspasswort aus. **Kein
Passwort ins Repo.** Ein Standardpasswort gibt es nicht: Der Seed erzeugt ohne
`ADMIN_INITIAL_PASSWORD` ein zufälliges (das README nannte bis zum 18.10.2026 eines, das nicht mehr
galt).

## 8. Starten

```bash
docker start credo-hr-db-dev
```

```bash
npx next dev -p 3000
```

Das Portal läuft unter `http://localhost:3000`, die Ansicht von S0 unter `/personen` (eine der drei
HR-Rollen). Testdaten an den Webhook von S0: Übergabe S0, Abschnitt 8.3. Im zweiten Terminal kennt
`curl` das Geheimnis erst nach `set -a; . ./.env; set +a`.

**Gotenberg** (optional, für die Umwandlung `.docx` → PDF in Vorlagenbibliothek und Dokumentenpaket).
Der Vorschlag in `.env.example` (Port 3000) kollidiert mit dem Dev-Server, deshalb Port 3001:

```bash
docker run -d --name credo-gotenberg-dev -p 3001:3000 gotenberg/gotenberg:8
```

Dazu `GOTENBERG_URL=http://localhost:3001` in der `.env`. Ohne Gotenberg meldet der Dialog „PDF-Dienst
nicht erreichbar“.

**Vorschau für Claude.** Die Desktop-App von Claude startet den Dev-Server über `.claude/launch.json`.
Die Datei ist per `.gitignore` ausgeschlossen (`.claude/`) und fehlt auf einem neuen Rechner. Auf dem
Mac setzt sie die Werte selbst und erzeugt `PERSONALSTAMM_SECRET` bei jedem Start neu; ein `curl` aus
einem anderen Terminal kennt den Wert dann nicht. Besser ohne Werte, alles aus der `.env`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "hr-portal-dev",
      "runtimeExecutable": "sh",
      "runtimeArgs": ["-c", "docker start credo-hr-db-dev >/dev/null; exec npx next dev -p 3000"],
      "port": 3000
    }
  ]
}
```

Die Datei bleibt außerhalb von Git; `.claude/settings.local.json` enthält nur Freigaben des
jeweiligen Rechners und wird nicht übertragen.

## 9. Stolpersteine

- **Node 24 mit Next 15:** `node_modules/next` ging auf dem Mac einmal kaputt. Abhilfe:
  `rm -rf node_modules .next` und `npm ci` (Node 22 vermeidet das vermutlich).
- **HTTPS auf localhost:** Der HSTS-Kopf auf localhost ist seit `20a2ed8` behoben. Erzwingt ein
  Browser trotzdem HTTPS für `localhost`: in Chrome `chrome://net-internals/#hsts`, „Delete domain
  security policies“ für `localhost`.
- **Duplikate durch Synchronisierung:** Übergabe S0, Abschnitt 8.5 (Prüfbefehle und Abhilfe).
- **Kein `npm run build` im Repo, solange der Dev-Server läuft** (beide schreiben `.next`; unter
  OneDrive scheiterte der Build mit `EINVAL … readlink`). Abhilfe: Dev-Server stoppen, `.next`
  löschen (nur Zwischenspeicher), neu bauen.
- **Zeilenenden unter Windows:** `.gitattributes` legt nur Shell-Skripte und `Dockerfile` auf LF
  fest. Mit `core.autocrlf=true` (Vorgabe von Git für Windows) steht der Arbeitsbaum in CRLF; am
  19.10.2026 auf dem Zweig `ux-umbau` geprüft: `npm run pruefen` ist so grün (271 Suiten), nachdem
  `personalstamm-n8n-stapel.test.ts` die Anleitung vor dem Vergleich normalisiert. Ins Repository
  kommt trotzdem nur LF (`git grep --cached -I -l -P '\r$'` muss leer sein).
- **`openssl` unter Git Bash endet auf CRLF.** Wer Werte mit `$(openssl rand …)` in die `.env`
  schreibt, schreibt ein unsichtbares `\r` mit. Die Shell schneidet es beim Einlesen
  (`set -a; . ./.env`) ab, Next.js und Prisma lesen es mit — dann passt etwa das Passwort des
  Seeds oder das Geheimnis des Webhooks nicht, obwohl beide Seiten „gleich“ aussehen. Abhilfe:
  `$(openssl rand -hex 32 | tr -d '\r\n')`; eine schon geschriebene `.env` mit `sed -i 's/\r//g' .env`
  bereinigen (steckt das `\r` auch im Passwort des Datenbank-Containers, dort mit `ALTER USER`
  angleichen).
- **`seed-check.js` liest die `.env` nicht selbst:** mit `node` direkt aufgerufen fehlt
  `DATABASE_URL`. Vorher `set -a; . ./.env; set +a`.
- **Abnahme-Skripte** (`scripts/ux-abnahme*.js`) brauchen `puppeteer-core`, das nicht in
  `package.json` steht: `npm install --no-save puppeteer-core@24` (Paketdateien bleiben
  unverändert), dazu Chrome unter `C:/Program Files/Google/Chrome/Application/chrome.exe` und ein
  Testkonto auf `@beispiel.invalid` (mit Rolle SUPER_ADMIN anlegen, Passwort über
  `scripts/dev-passwort-neu.js`).
