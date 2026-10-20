# UX-Umbau „Klarer Weg“ — Übergabe zur Deploy-Vorbereitung

> **Stand:** 20.10.2026 · Zweig `ux-umbau` auf `eab3054` (gepusht) · Pull Request
> [#8](https://github.com/Penknife5550/HR_Portal_CREDO/pull/8) nach `main`, **Entwurf** · Code-Stand des
> Deploys `7d595e5` · **nicht gemergt, nicht deployt**
> **Arbeitsblock:** 19./20.10.2026 auf dem Windows-Rechner (Klon unter
> `C:\Users\driesen.FES\Projekte\HR_Portal_CREDO`, außerhalb von OneDrive)
> **Zweck:** In einer neuen Sitzung — auf diesem oder einem anderen Rechner — ohne Vorwissen
> weitermachen: was steht, was entschieden ist, was in welcher Reihenfolge als Nächstes kommt, und
> was nur auf diesem Rechner liegt.

## Stand 20.10.2026 — hier weitermachen

**Wo die Arbeit steht.**

- `main` ist am 19.10.2026 in `ux-umbau` gemergt (`8f4f064`, `main` bis `5fc31bd`: Self-Service S0,
  Kachel-Fix `0e1d8de`, Doku). Danach die Abnahme nach dem Merge (`7d595e5`: Seite „Personen“ im
  neuen Kopf, Überschriften, Stolpersteine unter Windows) und die Doku zum Deploy (`eab3054`).
- **Abnahme grün** (19./20.10.2026): `npm run pruefen` 271 Suiten / 8619 Tests, `npm run build`,
  Browser-Abnahme Pilot 213 Prüfungen und Kopf 26 Prüfungen (Logbuch
  [`projekt-ux-umbau.md`](../module/ux-ui/projekt-ux-umbau.md), Abschnitt 7, „19.10.2026“).
- **Ablaufplan fertig und geprüft:** [`deploy-ux-umbau-2026-10.md`](deploy-ux-umbau-2026-10.md) mit
  Generalprobe beider Images und zwei Prüfrunden (35 und 22 Befunde, alle umgesetzt; Prüfprotokoll
  [`codereview-deploy-ux-umbau-2026-10.md`](codereview-deploy-ux-umbau-2026-10.md)). **Noch nicht
  ausführbar:** Er braucht Werte aus dem Protokoll von Etappe 1 von S0 (Platzhalter `‹E1: …›`, Liste in
  seinem Abschnitt 0, Punkt 1).
- **PR #8 ist ein Entwurf**, damit der Merge-Knopf gesperrt bleibt. Gemergt wird erst **nach Etappe 1
  von S0** und nur mit **„Create a merge commit“** (der Plan prüft den festen Stand `7d595e5`).
- Ankündigung an das Personalbüro auf dem Stand: [`pilot-ankuendigung.md`](../module/ux-ui/pilot-ankuendigung.md).

**Entscheidungen des Auftraggebers vom 19.10.2026:**

- Erst S0 Etappe 1, dann dieser Deploy; Ziel der Woche war „Pilot bereit, Deploy später“ (erreicht).
- Die alten Adressen leiten **dauerhaft** (308) weiter — hinnehmen, kein neuer Code-Stand (Plan 0,
  Punkt 3).
- **Mit dem DSB ist alles geklärt und freigegeben** (Plan 0, Punkte 7 und 8). Eine Frist für die
  Aufbewahrung der Sicherungen steht nicht im Repo; trägt der Auftraggeber sie nach, gehört sie in
  Plan 10, Punkt 4, und als datierter Vermerk an die DSB-Mitteilung.

**Nächste Schritte, in dieser Reihenfolge:**

1. **Etappe 1 von S0** nach [`deploy-selfservice-s0-2026-10.md`](deploy-selfservice-s0-2026-10.md)
   (eigener Ablauf; Einstieg: Übergabe S0, Abschnitt „Stand … — hier weitermachen“). Bis dahin auf
   `main` nur Doku; auch auf `ux-umbau` nach `7d595e5` nur Doku.
2. **Mit der Nachführung von Etappe 1** (Claude, auf `main` über einen Doku-PR):
   - In den S0-Plan, Abschnitt 10, und den Altlasten-Satz der CLAUDE.md schreiben: Die Punkte 11
     (n8n-Exporte aus Git) und 13 (Altlasten in Testskripten) kommen erst **nach dem UX-Deploy** auf
     `main` (UX-Plan 0, Punkt 1).
   - In der Übergabe S0 (Abschnitte 7 und 8.1) den Stand von `ux-umbau` nachführen (PR #8).
3. **`main` in `ux-umbau` mergen** — nur per Merge (lokal `git merge origin/main` oder „Resolve
   conflicts“ auf GitHub), **nie per Rebase** (sonst fehlt `7d595e5`). Ein Konflikt in `CLAUDE.md`
   (Abschnitt „Laufende Arbeit“) ist wahrscheinlich; beide Seiten behalten. Danach `npm run pruefen`.
4. **Platzhalter `‹E1: …›` füllen** (Kopf, 1.1, 1.2, 1.5, 2.1, 3.1, 4.1 des UX-Plans) aus dem Protokoll
   von Etappe 1 und **die festen Stände nachrechnen** (Abschnitt 3 unten). Kam nach `7d595e5` doch
   Code dazu: alle Zahlen neu, die Generalprobe wiederholen (Abschnitt 4), das Prüfprotokoll ergänzen.
5. Vor dem Termin klären (UX-Plan 0): **Punkt 2** (Etappe 2 von S0 vor oder nach diesem Deploy) und
   **Punkt 5** (Ausgangswerte des Prototyp-Tags oder das Maß fallen lassen). HR am Vortag informieren
   (Textvorschlag im Plan, „Zeitfenster“).
6. **PR #8 aus dem Entwurf holen**, auf dem Entwicklerrechner die Prüfzeile aus UX-Plan 0, Punkt 1
   laufen lassen, dann mit „Create a merge commit“ mergen.
7. **Deploy** nach dem UX-Plan (Abschnitte 1 bis 6), danach trägt Claude das Protokoll ein und führt
   die Liste „Nach dem Update (Claude)“ nach (Plan, Abschnitt 9).
8. **Zwei Wochen Rückmeldung** zum Pilot, dann die Entscheidung „neue Ansicht wird Vorgabe, Onboarding
   folgt“ (Feinplan Pilot, Abschnitt 8).

**Offen, ohne den Deploy aufzuhalten:**

- **Handbuch-Text** (`docs/handbuch/handbuch.html`): Kopf, Startseite („Dashboard“), Rollennamen und
  Adressen sind ab dem Deploy falsch — mit oder kurz nach dem Deploy nachführen (nur Doku, darf auch
  vorher auf `ux-umbau`). Auftrag für eine eigene Sitzung: den Text auf `NAVIGATION`, `ROLLEN_NAMEN`
  und `startAdresse` in `src/lib/navigation.ts` und die Adressen aus `src/lib/adressen.ts` bringen; die
  Bilder nicht ersetzen (nur ein Hinweis, wo ein Bild den alten Kopf zeigt); die Vertragsende-Ansicht
  nicht beschreiben; `git diff` nur unter `docs/handbuch/`; nicht committen ohne Freigabe.
- **Gendersprache:** ob Paarformen in neuen Texten gehen, entscheidet der Auftraggeber (CLAUDE.md,
  Hausregeln). Daran hängt der Rollenname „BEM-Beauftragte:r“ (UX-Plan 10, Punkt 9; eigener kleiner
  Fix). Die Ankündigung kommt mit neutralen Wörtern ohne diese Entscheidung aus.
- Weitere Punkte nach dem Deploy: UX-Plan, Abschnitt 10.

---

## 1 · Was in diesem Arbeitsblock entstand

| Commit | Datum | Inhalt |
|---|---|---|
| `8f4f064` | 19.10.2026 | Merge von `main` (bis `5fc31bd`) in `ux-umbau`: S0 samt Seite „Personen“, Kachel-Fix, Doku; Konflikte in `CLAUDE.md` und `docs/README.md` aufgelöst, alter Kopf `portal-header.tsx` entfernt |
| `7d595e5` | 19.10.2026 | Abnahme nach dem Merge: „Personen“ in `NAVIGATION` (nur HR-Rollen), Seite „Personen“ ohne eigenen Kopf, Überschriften `h1`/`h2`/`h3`, Testanpassungen, Abnahme-Skript U1, Bilder `u1-kopf-*.png`, Stolpersteine unter Windows in `lokale-umgebung.md` — **Code-Stand des Deploys** |
| `eab3054` | 19.10.2026 | Ablaufplan UX-Deploy, Prüfprotokoll, Ankündigung, Einträge in `docs/README.md`, Logbuch und CLAUDE.md; Entscheidungen vom 19.10. |
| PR #8 | 20.10.2026 | Entwurf nach `main`, Beschreibung mit „Nicht mergen vor Etappe 1“, an die Sitzung gebunden; vor dem Push `npm run pruefen` grün |

## 2 · Dokumente

| Dokument | Inhalt |
|---|---|
| [`deploy-ux-umbau-2026-10.md`](deploy-ux-umbau-2026-10.md) | Ablaufplan: Abschnitt 0 (was, Dauer, Zeitfenster, Entscheidungen), 1–5 (Server Befehl für Befehl), 6 (Folgetag, Wartung), 7 (Rückfall nur auf `hr-portal-app:0e1d8de`), 8 (Zusammenspiel mit Etappe 2), 9 (Protokoll, „Nach dem Update“), 10 (offen) |
| [`codereview-deploy-ux-umbau-2026-10.md`](codereview-deploy-ux-umbau-2026-10.md) | Prüfprotokoll: Generalprobe (Runde 0), drei Prüfer mit Gegenprüfung (Runde 1), Abschlussprüfung (Runde 2), verworfene Teilvorschläge, Restrisiken, Entscheidungen |
| [`pilot-ankuendigung.md`](../module/ux-ui/pilot-ankuendigung.md) | Mail an das Personalbüro mit Checkliste; verschickt erst nach der Probe im Browser (Plan 5.4/5.5) |
| [`projekt-ux-umbau.md`](../module/ux-ui/projekt-ux-umbau.md) | Logbuch des Umbaus, Abschnitt 0.0 „Hier anfangen“, Protokoll je Arbeitstag |
| [`mailtext-im-protokoll-dsb-mitteilung.md`](../module/betrieb/mailtext-im-protokoll-dsb-mitteilung.md) | Mitteilung an den DSB zum Mailtext (abgestimmt 15.10.2026, unverändert) |
| [`deploy-selfservice-s0-2026-10.md`](deploy-selfservice-s0-2026-10.md) | Vorbedingung: Etappe 1 von S0 |

## 3 · Feste Stände und wie man sie nachrechnet

| Was | Wert |
|---|---|
| S0-Schema (Anker) | `a43aa25cdb6bae53f5ddda3c9a8b303ac422d13c` |
| Code-Stand Etappe 1 (Anker, Rückfall-Image `hr-portal-app:0e1d8de`) | `0e1d8de8cf0d5b714c059140b9f2f09552eb00d1` |
| Code-Stand dieses Deploys (neuer Anker) | `7d595e551b1edb6acbe5509165ce43ebcd4a15ae` |
| `0e1d8de..7d595e5` | 71 Commits, 14 Merges (6 davon schon mit Etappe 1 auf dem Server; neu 65 mit 12 Merges) |
| Betriebsdateien `0e1d8de..7d595e5` | `package-lock.json` 120/3, `package.json` 1/0 (nur `jest-axe`), `prisma/schema.prisma` 21/0, `public/robots.txt` 2/0, `src/middleware.ts` 22/5 |
| Schema-Delta | +1 Tabelle `email_log_texte` mit Fremdschlüssel `ON DELETE CASCADE` auf `email_logs`; keine Datenmigration (13 Merker bleiben) |

Nachrechnen im Repo (nach dem Merge von `main` in `ux-umbau`), alle Zeilen müssen ihre Meldung zeigen:

```bash
git merge-base --is-ancestor 7d595e551b1edb6acbe5509165ce43ebcd4a15ae HEAD && echo "7d595e5 enthalten"
git diff --quiet 7d595e5 HEAD -- . ':!docs' ':!CLAUDE.md' ':!README.md' && echo "nach 7d595e5 nur Doku"
git rev-list --count 0e1d8de..7d595e5; git rev-list --count --merges 0e1d8de..7d595e5
git diff --numstat 0e1d8de 7d595e5 -- docker-compose.yml Dockerfile entrypoint.sh package.json package-lock.json .env.production.example .dockerignore next.config.ts prisma/schema.prisma prisma/seed-check.js prisma/seed.ts public src/middleware.ts src/instrumentation.ts
```

Erwartet: die beiden Meldungen, `71` und `14`, die fünf Zeilen der Tabelle. Weicht etwas ab, ist
nach `7d595e5` Code dazugekommen: dann den Plan mit Claude auf einen neuen Code-Stand heben (alle
Stellen mit `7d595e5`, Zahlen in 3.2, Vorschau in 3.4), die Generalprobe wiederholen und eine neue
Runde im Prüfprotokoll anlegen.

## 4 · Generalprobe wiederholen (nur wenn nötig)

Nötig nur, wenn sich der Code-Stand ändert. Sie lief am 19.10.2026 mit Docker Desktop unter Windows
(Ergebnisse: Prüfprotokoll, Runde 0). Das Skript liegt nicht im Repo (ein Skript außerhalb von `docs/`
hielte die Prüfung „nur Doku“ an); zum Wiederholen in eine Datei **außerhalb des Repos** kopieren und
aus dem Repo-Ordner aufrufen. Es legt nichts im Repo an, verschickt keine Mails (`ZEITPLANER_AKTIV=false`,
kein Mailserver) und erzeugt seine Geheimnisse selbst.

```bash
#!/usr/bin/env bash
# Aufruf aus dem Repo-Ordner: bash /pfad/generalprobe.sh <alter-hash> <neuer-hash> <arbeitsordner-ausserhalb>
set -u
ALT=${1:?alter Stand}; NEU=${2:?neuer Stand}; P=${3:?Arbeitsordner}
mkdir -p "$P"; NET=hr-probe
log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$P/ablauf.log"; }
bereit() { for i in $(seq 1 120); do docker logs "$1" 2>&1 | grep -q "Ready in" && return 0; [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ] || return 1; sleep 2; done; return 1; }
aufraeumen() { docker rm -f probe-alt probe-neu probe-alt2 probe-db >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1; }
: > "$P/ablauf.log"; aufraeumen
log "Build alt"; git archive --format=tar "$ALT" | docker build -t hr-portal-probe:alt - > "$P/build-alt.log" 2>&1 || exit 1
log "Build neu"; git archive --format=tar "$NEU" | docker build -t hr-portal-probe:neu - > "$P/build-neu.log" 2>&1 || exit 1
docker network create "$NET" >/dev/null
PW=$(openssl rand -hex 16 | tr -d '\r\n')
docker run -d --name probe-db --network "$NET" -e POSTGRES_USER=probe -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=hr_portal postgres:16-alpine >/dev/null
for i in $(seq 1 30); do docker exec probe-db pg_isready -U probe -d hr_portal >/dev/null 2>&1 && break; sleep 1; done
{ printf 'DATABASE_URL=postgresql://probe:%s@probe-db:5432/hr_portal?schema=public\n' "$PW"
  for v in JWT_SECRET ENCRYPTION_KEY BEM_ENCRYPTION_KEY; do printf '%s=%s\n' "$v" "$(openssl rand -hex 32 | tr -d '\r\n')"; done
  printf 'CRON_SECRET=%s\nAPP_URL=https://hr.example.invalid\nZEITPLANER_AKTIV=false\nNODE_ENV=production\n' "$(openssl rand -hex 24 | tr -d '\r\n')"; } > "$P/probe.env"
unset PW
vorschau() { docker run --rm --network "$NET" --env-file "$P/probe.env" --entrypoint sh "$1" -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > "$2" 2>/dev/null; }
log "1. alt erstmals (Schema + Seed)"; docker run -d --name probe-alt --network "$NET" --env-file "$P/probe.env" --tmpfs /backups:rw,mode=1777 hr-portal-probe:alt >/dev/null; bereit probe-alt; docker logs probe-alt > "$P/1-alt-start.log" 2>&1; docker rm -f probe-alt >/dev/null
log "2. Vorschau neu (wie Plan 3.4)"; vorschau hr-portal-probe:neu "$P/2-vorschau-delta.sql"
log "3. neu mit Entrypoint"; docker run -d --name probe-neu --network "$NET" --env-file "$P/probe.env" --tmpfs /backups:rw,mode=1777 hr-portal-probe:neu >/dev/null; bereit probe-neu; sleep 5; docker logs probe-neu > "$P/3-neu-start.log" 2>&1
for p in /dashboard '/dashboard?tab=contract-end' /dashboard/bem /vorgaenge /bem/einwilligung/probe; do echo "== $p"; docker exec probe-neu curl -s -o /dev/null -D - -H 'Host: hr.fes-credo.de' -H 'X-Forwarded-Proto: https' "http://localhost:3000$p" | grep -i -E '^(HTTP|location|cache-control)' | tr -d '\r'; done > "$P/3-kopfzeilen.txt"
docker rm -f probe-neu >/dev/null
log "4. Vorschau Rückfall (wie Plan 7.3 Schritt 5)"; vorschau hr-portal-probe:alt "$P/4-rueckfall-delta.sql"
log "5. Rückfall: alt mit Entrypoint (Weg A)"; docker run -d --name probe-alt2 --network "$NET" --env-file "$P/probe.env" --tmpfs /backups:rw,mode=1777 hr-portal-probe:alt >/dev/null; bereit probe-alt2; docker logs probe-alt2 > "$P/5-rueckfall-start.log" 2>&1
aufraeumen; rm -f "$P/probe.env"; log "FERTIG — danach: docker image rm hr-portal-probe:alt hr-portal-probe:neu"
```

Auswerten gegen den Plan: `2-vorschau-delta.sql` (3.4), `3-neu-start.log` (4.3), `3-kopfzeilen.txt`
(5.3), `4-rueckfall-delta.sql` (7.3 Schritt 5), `5-rueckfall-start.log` (7.3 Schritt 11). Auf einer
leeren Datenbank erscheinen beim zweiten Start drei Migrationszeilen (MINIJOB, Masernschutz,
Betriebsnummern) — ein Kunstprodukt des ersten Starts, auf dem Server nicht zu erwarten
(Prüfprotokoll, Runde 0). Der Build dauert ohne Zwischenspeicher je Image 6 bis 7 Minuten; beide
Images belegen zusammen rund 1,8 GB.

## 5 · Wiedereinstieg

### 5.1 Zweige und Pull Requests

| Zweig | Stand |
|---|---|
| `main` | `5fc31bd` (PR #7, Doku nach PR #6), davor `82b58ce` (PR #6, Kachel-Fix `0e1d8de`) |
| `ux-umbau` | `eab3054`, gepusht; PR #8 (Entwurf) nach `main` |

- Auf dem Windows-Rechner ist `gh` angemeldet (`Penknife5550`); PR #8 ist an die Sitzung gebunden.
  Es gibt **keine CI** — `npm run pruefen` vor jedem Push ist die Prüfung. Auto-fix ist aus (den
  Konflikt nach Etappe 1 löst man bewusst per Merge).
- Commit und Push nur auf ausdrückliche Freigabe; das Repo ist öffentlich.

### 5.2 Auf einem anderen Rechner (etwa dem Mac)

```bash
git fetch origin && git switch ux-umbau && git pull --ff-only
```

Dann „Lies `docs/historie/uebergabe-ux-umbau-2026-10-20.md`“. Auf `main` führt die CLAUDE.md über den
Eintrag „UX-Umbau“ zum Zweig und zum Logbuch, Abschnitt 0.0, das hierher verweist. Der lokale
Mac-Klon hat womöglich noch den alten Stand von `ux-umbau` (16.10.2026): erst ziehen, dann arbeiten.
Die Einrichtung ohne Werte steht in [`lokale-umgebung.md`](../entwicklung/lokale-umgebung.md); die
Stolpersteine unter Windows dort in Abschnitt 9.

### 5.3 Was nur auf dem Windows-Rechner liegt

| Was | Wo | Bedeutung und Ersatz |
|---|---|---|
| Datenbank `credo-hr-db-ux` (Port 5436) mit Daten der Abnahme, darunter die Testlagen T01–T10 und ein Testkonto auf `@beispiel.invalid` mit Rolle SUPER_ADMIN | Docker | nur für die Abnahme-Skripte; auf einem anderen Rechner neu aufsetzen (`lokale-umgebung.md`, Abschnitte 4 bis 7; Testdaten mit `scripts/vertragsende-testdaten.js`). Daneben läuft `credo-hr-db-dev` (Port 5433) |
| `.env` im Repo-Ordner | per `.gitignore` ausgeschlossen | Werte nie übertragen, je Rechner neu erzeugen (`lokale-umgebung.md`, Abschnitt 5) |
| `.claude/launch.json` (Vorschau `hr-portal-dev`, Port 3000) | per `.gitignore` ausgeschlossen | neu anlegen (`lokale-umgebung.md`, Abschnitt 8) |
| Passwörter der lokalen Konten (Admin und Testkonto) | nur lokal gesetzt | neu setzen mit `scripts/dev-passwort-neu.js` |
| `puppeteer-core` für die Abnahme-Skripte | `node_modules`, ohne Eintrag in `package.json` | `npm install --no-save puppeteer-core@24` |
| Gedächtnis von Claude für dieses Projekt | Benutzerordner von Claude auf diesem Rechner | enthält nur Arbeitshinweise (etwa zu Zeilenenden); maßgeblich ist das Repo |
| Rohdaten der Prüfungen und der Generalprobe | temporäre Ablage der Sitzung | nicht nötig; maßgeblich sind Prüfprotokoll und Plan. Die Probe-Images sind gelöscht |

### 5.4 Stolpersteine dieses Arbeitsblocks

- **Zeilenenden:** Die Arbeitskopie steht in CRLF (`core.autocrlf=true`), neu angelegte Dateien
  oft in LF; beides ist in Ordnung, ins Repository kommt LF (`git grep --cached -I -l -P '\r$'` leer).
  Wer Doku per Skript ändert, normalisiert vor dem Suchen auf LF und schreibt im Stil der Datei zurück.
- **Merge von `main`:** Konflikte in Doku-Dateien, die auf `ux-umbau` mit CRLF committet waren, ließen
  sich am besten lösen, indem man die LF-Fassung von `main` nimmt und die Zusätze des Zweigs von Hand
  einsetzt (Logbuch, 19.10.2026).
- **Abnahme im Browser-Bereich der App:** Ist der Bereich ausgeblendet, scheitern Klicks; Formulare
  dann per Skript (`requestSubmit()`) und Seiten über den Text lesen.
