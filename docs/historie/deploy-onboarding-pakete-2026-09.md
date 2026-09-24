# Deploy 09/2026 — Onboarding-Pakete (Ablaufplan)

> **Stand:** Server `6124936` (Deploy vom 07.09.2026) → Ziel `7bc91ec` · 18 Commits
> **Server:** `fes-vm-ubuntudocker`, `/vol/container/HR_Portal_CREDO`, `https://hr.fes-credo.de`
> **Art:** Ablaufplan **vor** dem Deploy, erstellt am 24.09.2026. Nach dem Deploy
> wird er um Log und Ergebnisse ergänzt, wie das
> [Protokoll vom 07.09.](deploy-dokumentenpaket-2026-09-07.md).

Dieser Deploy ist größer als der letzte. Er bringt drei Stände auf einmal auf den
Server, die seit dem 07.09. auf `main` liegen: die Formular-Validierung, die
Rückmeldung des Personalbüros (Minijob) und die Onboarding-Pakete 1, 1b, 5 und 2.
Genau das warnte Lehre 4 aus dem letzten Protokoll
(`deploy-dokumentenpaket-2026-09-07.md:166-168`). Deshalb gibt es hier mehr
Prüfungen und zwei zusätzliche Sicherheitsnetze: eine Vorschau dessen, was
`db push` tun wird, und eine eigene Sicherung vor dem Start.

**Grundregel für alles Folgende:** Wo „an Claude“ steht, wird angehalten. Das
Portal läuft bis Schritt 3.4 unverändert weiter, Anhalten kostet also nichts.

---

## 0 · Auf einen Blick

### Was ausgerollt wird

| Bereich | Commits | Inhalt |
|---|---|---|
| Formular-Validierung | `b1d62f4`, `6592dee`, `300c019` | Fragebogen und Vorgesetzten-Formular blockierten stumm. Der Fehler besteht in Produktion noch und endet mit diesem Deploy. |
| Minijob-Rückmeldung Personalbüro | `29b4a30`, `c346263`, `89fa722`, `c6b7396`, `ae490ba` | Masernschutz-Pflicht, Kostenstellen-Aufteilung, Aufenthaltstitel und private KV mit Fristen-Ampel, neuer Cron `dokument-ablauf` |
| Paket 1 | `5a016ba` | Stellenbezeichnung, paralleler Zugriff beider Spuren, Knopf „Text auf Standard zurücksetzen“, Mail-Reparatur |
| Nachtrag „Neuer Vorgang“ | `3a23bc8` | Name und Führungskraft beim Anlegen, beide Links in einem Schritt |
| Paket 1b | `6584ca2` | Abteilungsaufgaben im Offboarding repariert (Kommentar, Erinnern, Erneut senden, Link erneuern) |
| Paket 5 | `db6fe2f` | Abteilungsaufgaben im Onboarding, vier neue Mailvorlagen |
| Paket 2 | `c565b01` | HR-Übersicht zeigt beide Spuren nebeneinander, HR-Mails sagen „bereit zur Prüfung“ nur mit Beleg |
| Code-Review-Fixes | `7bc91ec` | 8 Befunde, u. a. Freigabeliste auch für frei eingetippte Führungskraft-Adressen |
| Doku | `d29228a`, `891483e`, `c40f7fb`, `9a396e3` | nur `docs/` |

Vollständige Liste: `git log --oneline 6124936..7bc91ec`.

### Was sich an Datenbank und Betrieb ändert

- **Schema:** 23 neue Spalten (alle nullable), eine neue Tabelle
  `supervisor_kostenstellen`, 4 neue Enum-Werte, 3 Indizes und 2 Fremdschlüssel.
  Dazu wird eine Pflichtspalte gelockert (`offboarding_department_links."offboardingId"`).
  Es gibt kein DROP, kein RENAME und keinen Typwechsel. Das Delta lief zweimal
  fehlerfrei auf einer Wegwerf-Datenbank mit altem Schema. Danach meldete der
  Vergleich mit dem neuen Schema „No difference detected“.
- **Einmalige Migrationen:** fünf neue in `prisma/seed-check.js`. Sie laufen beim
  Start nach dem Schema-Abgleich (`seed-check.js:1819-1834`) und verschicken keine
  Mails, denn die Datei lädt nur `@prisma/client`, `fs`, `path` und `crypto`
  (`seed-check.js:5-8`).
- **Unverändert:** `docker-compose.yml`, `Dockerfile`, `entrypoint.sh`,
  `package.json`, `package-lock.json`, `.env.production.example`, `.dockerignore`
  und `next.config.ts`. Das belegt
  `git diff --stat 6124936 7bc91ec -- docker-compose.yml Dockerfile entrypoint.sh package.json package-lock.json .env.production.example .dockerignore next.config.ts`,
  die Ausgabe ist leer. (Ohne die Pfadangabe listet der Befehl alle 214 geänderten
  Dateien.) Es gibt also keine neue Umgebungsvariable und keine neue Abhängigkeit.

### Dauer (Schätzung, nicht gemessen)

| Abschnitt | Dauer | Portal |
|---|---|---|
| 1–2 Vorbereitung, VORHER-Prüfung, Freigabe durch Claude | 45–60 min | läuft |
| 3.1–3.3 Code holen, Image bauen, Vorschau | 10–20 min (Build-Dauer am 07.09. nicht protokolliert) | läuft |
| 3.4–3.6 eigene Sicherung, Start, Migrationen | wenige Minuten (am 07.09.: Push 484 ms, Ready 159 ms) | **offline** |
| 4 NACHHER-Prüfung und Smoke-Test | 15–20 min | läuft |
| 5.1 PFLICHT-Handschritte | 15 min, **sofort** nach dem Start (direkt nach 4.1) | läuft |
| 5.2–5.3 übrige Handschritte (Abteilungen, Checklisten) | 1–2 h, am selben Tag | läuft |

### Risiko in einem Satz

Der Start selbst ist risikoarm, weil das Delta rein additiv und zweimal geprobt ist;
die echten Risiken liegen danach in falschen Mails aus alten gespeicherten Vorlagen,
in einer Erinnerungswelle beim ersten Cron-Lauf, in Abteilungslinks des Offboardings,
deren Erinnerungen nach dem Deploy verstummen (B-B10, 5.2), und in einem Rückfall,
bei dem das alte Image mit dem normalen Entrypoint gegen die neue Datenbank startet.

### Termin

- **Nach dem täglichen n8n-Lauf um 08:00 deployen.** Den Zeitplan belegt nur der
  Repo-Export (`n8n/CREDO_Reminder_Cron_Workflow.json:9`); der Live-Stand in n8n ist
  ungeklärt.
- **An einem Tag, an dem HR erreichbar ist.** Die Handschritte aus 5.1 und 5.2
  müssen vor dem nächsten 08:00-Lauf erledigt sein.
- **HR bitten, von Schritt 3.4 bis zum Ende von 5.1 nicht im Portal zu arbeiten.**
  Dann löst niemand Mails aus, bevor die PFLICHT-Resets erledigt sind, und ein
  Rückfall nach Weg A (Abschnitt 7) verliert keine Arbeit von HR. Öffentliche Links
  (Fragebogen, Modalitäten) lassen sich nicht anhalten.

---

## 1 · Vorher auf dem Server (nur lesend)

Alle Befehle laufen im Projektordner. Ausnahme ist 1.6, das legt nur ein
zusätzliches Etikett an ein vorhandenes Image.

```bash
cd /vol/container/HR_Portal_CREDO
mkdir -p ~/deploy-7bc91ec
```

In `~/deploy-7bc91ec/` landen alle Arbeitsdateien, also **außerhalb** des Repos.

### 1.1 Stand des Repos

```bash
git log -1 --oneline
git status --short
ls docker-compose.override.yml 2>/dev/null || echo "kein Override"
```

| Erwartet | Wenn nicht |
|---|---|
| `6124936 docs: Spaltenname richtigstellen - camelCase, nicht snake_case` | **STOPP, an Claude.** Der Plan gilt nur für diesen Ausgangsstand. |
| `git status` leer oder nur `?? backups/` | Andere Zeilen (`M …`, `?? …`): **STOPP, an Claude.** `?? backups/` ist normal: `.gitignore:67` ignoriert nur `backups/*.dump`, die `.sql`-Sicherungen stehen als unversioniert da. |
| `kein Override` | Eine `docker-compose.override.yml` verändert den Start: **an Claude.** |

> Auf dem Server nie `git add -A`, `git stash -u` oder `git clean` ausführen. Die
> Sicherungen in `backups/` sind unversioniert, und diese Befehle würden sie
> einsammeln oder löschen.

### 1.2 Laufende Container

```bash
sudo docker compose ps
sudo docker inspect --format '{{.Created}} {{.Image}}' hr-portal-app
```

Erwartet: `app`, `db` und `gotenberg` laufen, `app` und `db` mit `(healthy)`. Das
Erstelldatum von `hr-portal-app` ist der 07.09.2026. Bei einem anderen Datum:
an Claude, vielleicht wurde seitdem neu gebaut.

### 1.3 Sicherungsverzeichnis (sonst bricht der Start ab)

```bash
grep -c "backups:/backups" docker-compose.yml
stat -c '%u %U %n' backups
sudo docker run --rm --user nextjs --entrypoint sh -v "$PWD/backups:/backups" "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)" -c 'id; touch /backups/.schreibtest && rm /backups/.schreibtest && echo OK'
```

| Erwartet | Wenn nicht |
|---|---|
| `2` (bei `app` Zeile 35 und `db` Zeile 65 in `docker-compose.yml`) | **STOPP, an Claude.** Ohne die Einhängung bricht der Entrypoint ab (`entrypoint.sh:76-85`). |
| `1001 … backups`. Der Name ist egal, auf diesem Server heißt er `n8n` (Protokoll 07.09.:72-74). | `sudo chown 1001 backups`, danach den Schreibtest wiederholen. |
| `uid=1001(nextjs) gid=65533(nogroup) …` und darunter `OK` | Kein `OK`: `sudo chown 1001 backups`, wiederholen. Bleibt es aus: **an Claude.** |

Der Schreibtest ist der aus CLAUDE.md („Docker / Deployment“), mit dem Image des
laufenden Containers. `sudo` vor `docker` ändert nichts an der Kennung im
Container, und `chgrp 1001` hilft nicht (CLAUDE.md, gleicher Abschnitt).

### 1.4 Plattenplatz

```bash
df -h . "$(sudo docker info --format '{{.DockerRootDir}}')"
sudo docker image ls
sudo du -sh backups
```

Der Build braucht ungefähr so viel Platz wie das jetzige Image (Spalte `SIZE`).
Dazu kommen zwei Sicherungen. Die vom 07.09. hatte 1 389 174 Bytes (Protokoll
07.09.:89). **Faustregel:** Ist weniger frei als die doppelte Image-Größe: an
Claude.

### 1.5 Werkzeug-Versionen und Link-Gültigkeit notieren

```bash
sudo docker exec hr-portal-app pg_dump --version
sudo docker exec hr-portal-db psql --version
sudo docker exec hr-portal-app printenv MAGIC_LINK_EXPIRY_HOURS || echo "nicht gesetzt (Standard 720 h)"
```

- **Die beiden Versionen** braucht nur ein Rückfall (Abschnitt 7). Die Sicherung des
  Entrypoints schreibt `pg_dump` aus dem App-Container, eingespielt wird mit `psql`
  aus dem DB-Container. Welche Versionen dort laufen, ist **ungeklärt**, deshalb
  notieren.
- **Der dritte Wert** wird für die Abfrage B-B2 gebraucht, die mit 720 h rechnet.
  Weicht er ab, ist B-B2 nur eine Näherung. Dann den Wert mit an Claude schicken.
  Er kommt aus dem laufenden Container, also genau der Wert, mit dem die heutigen
  Links erzeugt wurden (`env_file: .env`, `docker-compose.yml:19-20`; Standard 720 h,
  `src/lib/auth.ts:305`). Ein `grep` in `.env` meldete bei fehlendem Leserecht einen
  Fehler und zeigte trotzdem „nicht gesetzt“.

### 1.6 Altes Image aufheben (für den Rückfall)

```bash
sudo docker tag "$(sudo docker inspect --format '{{.Image}}' hr-portal-app)" hr-portal-app:6124936
sudo docker image ls hr-portal-app
```

Erwartet ist eine Zeile `hr-portal-app   6124936`. Ohne dieses Etikett wäre das alte
Image nach dem Deploy namenlos und könnte beim Aufräumen verschwinden.

### 1.7 Drift gegen das alte Schema (nur lesend)

```bash
sudo docker exec hr-portal-app sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
```

Erwartet ist `0`: Die Datenbank entspricht genau dem Schema von `6124936`. Bei `2`
wurde die Datenbank außerhalb des Deploys verändert, bei `1` gab es einen Fehler.
In beiden Fällen: **STOPP, an Claude.** Es ist derselbe Befehl, den der Entrypoint
bei jedem Start ausführt (`entrypoint.sh:60-63`). Auf dem Server selbst wurde er
nicht geprobt.

---

## 2 · SQL-Prüfungen VORHER (gegen das alte Schema `6124936`)

Es sind 39 Abfragen. Die ersten 37 sind die getestete Endfassung aus der SQL-Probe
vom 24.09.2026, byte-genau übernommen. Getestet wurde so:

- mit psql 16 und `ON_ERROR_STOP=1` gegen eine Wegwerf-Datenbank mit altem Schema:
  Exit 0, 37 von 37;
- gegen das neue Schema: ebenfalls Exit 0;
- lesend gegen die Dev-Datenbank.

Die letzten beiden, B-B10 und B-B11, kamen mit der Gegenprüfung dazu. Sie liefen mit
psql 16 lesend gegen die Dev-Datenbank (neues Schema): ganze Datei Exit 0, 39 von 39.
Gegen das alte Schema sind sie nur per Namensabgleich mit `schema.prisma` von
`6124936` geprüft, eine Wegwerf-Datenbank gab es dafür nicht mehr. Sie benutzen nur
Tabellen und Spalten, die es in beiden Ständen gibt. Die einzige neue Spalte,
`offboarding_processes."supervisorEmail"`, lesen sie über `to_jsonb(p) ->> …`: Fehlt
die Spalte, ergibt das NULL statt eines Fehlers. Die Logik von B-B10 ist mit
Testzeilen geprüft, die die echten Tabellen im selben Befehl überdecken (nur lesend).

**Namen:** Tabellen heißen `snake_case` (`@@map`), Spalten `"camelCase"` in
Anführungszeichen. Das Schema hat kein einziges Spalten-`@map`. Es wird `COUNT(1)`
verwendet (Lehren 1 und 2 aus dem Protokoll vom 07.09.:161-163).

**Nur lesend, doppelt gesichert:**
- Die Sitzung läuft mit `PGOPTIONS='-c default_transaction_read_only=on'`.
- Die Datei setzt in ihrer ersten Zeile noch einmal `SET default_transaction_read_only = on;`.

### 2.1 Datei auf dem Server anlegen

**Variante 1: ohne Einfügen.** Das geht nur, wenn dieses Dokument schon auf
`origin/main` liegt. `git fetch` holt dabei nur den Stand, der Arbeitsordner und
`HEAD` bleiben unverändert.

```bash
cd /vol/container/HR_Portal_CREDO && git fetch origin
git show origin/main:docs/historie/deploy-onboarding-pakete-2026-09.md \
  | awk '/^cat > ~\/deploy-7bc91ec\/vorher-alle.sql/{f=1;next} /^ENDE_SQL$/{f=0} f' > ~/deploy-7bc91ec/vorher-alle.sql
```

**Variante 2: Einfügen.** Den ganzen folgenden Block ins Terminal kopieren.
`set +H` schaltet die Verlaufsersetzung von `!` ab. Das Ende-Wort in
Anführungszeichen sorgt dafür, dass die Shell nichts ersetzt.

```bash
set +H
cat > ~/deploy-7bc91ec/vorher-alle.sql <<'ENDE_SQL'
-- =====================================================================
-- VORHER (Schema 6124936, VOR dem Deploy) - NUR LESEND.
-- Getestet am 24.09.2026 mit psql 16 (ON_ERROR_STOP=1) gegen eine Wegwerf-DB mit
-- altem Schema 6124936 und lesend gegen die Dev-DB.
-- B-B10 und B-B11 (am Ende) kamen mit der Gegenpruefung dazu: nur lesend gegen
-- die Dev-DB (neues Schema) getestet, Namen gegen schema.prisma von 6124936 geprueft.
-- Aufruf auf dem Server (Datei im Projektordner, Ausgabe in eine Datei):
--   sudo docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db \
--     psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 < vorher-alle.sql > vorher-ergebnis.txt 2>&1
-- Tabellen snake_case (@@map), Spalten "camelCase" (kein Spalten-@map im Schema).
-- =====================================================================
SET default_transaction_read_only = on;
\pset pager off
\x auto

-- ---------------------------------------------------------------------
-- Plan Abschnitt 8, Pruefung 1-5 (docs/module/onboarding/aenderungsplan-2026-09.html:1974-2029)
-- ---------------------------------------------------------------------
\echo '== VORHER P1'
SELECT "displayId", status, "submittedAt", "supervisorSubmittedAt",
       "supervisorToken" IS NOT NULL AS link
FROM onboarding_processes
WHERE ("submittedAt" IS NULL
       AND status IN ('SUBMITTED','SUPERVISOR_PENDING','SUPERVISOR_SUBMITTED','REVIEWED'))
   OR (status = 'SUBMITTED' AND "supervisorToken" IS NOT NULL
       AND "supervisorSubmittedAt" IS NULL);
\echo '== VORHER P2'
SELECT o.status, COUNT(1) AS anzahl,
       max(length(s.stellenbeschreibung)) AS max_zeichen,
       COUNT(1) FILTER (WHERE length(s.stellenbeschreibung) > 200) AS ueber_200
FROM supervisor_data s
JOIN onboarding_processes o ON o.id = s."onboardingId"
WHERE s.stellenbeschreibung IS NOT NULL
GROUP BY o.status;
\echo '== VORHER P3'
SELECT event, "updatedAt" FROM email_templates
WHERE event IN ('supervisor-link-created', 'contract-end-supervisor-link',
                'supervisor-reminder', 'employee-reminder', 'onboarding-created',
                'questionnaire-completed', 'supervisor-completed',
                'questionnaire-confirmation-employee', 'psi-deadline-warning')
   OR event LIKE 'offboarding-%';
\echo '== VORHER P4'
SELECT event, name, url, "isActive" FROM webhook_configs
WHERE event LIKE 'offboarding-%' ORDER BY event;
\echo '== VORHER P5'
SELECT "departmentKey", "departmentName", email,
       "organizationId" IS NULL AS zentral, "isActive"
FROM department_configs ORDER BY "departmentKey";

-- ---------------------------------------------------------------------
-- Schema-Delta: Drift-Pruefung (Analyse Schema, Abschnitt 3)
-- ---------------------------------------------------------------------
\echo '== VORHER S-V1'
SELECT current_setting('server_version') AS version;
\echo '== VORHER S-V2'
SELECT t.typname::text AS typ, e.enumlabel::text AS wert FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND ((t.typname = 'DocumentType' AND e.enumlabel IN ('AUFENTHALTSTITEL','ARBEITSERLAUBNIS','PKV_NACHWEIS')) OR (t.typname = 'DocumentStatus' AND e.enumlabel = 'EXPIRED'));
\echo '== VORHER S-V3'
SELECT table_name::text AS tabelle, column_name::text AS spalte FROM information_schema.columns WHERE table_schema = 'public' AND (table_name::text, column_name::text) IN (VALUES ('onboarding_processes','supervisorLinkSentAt'),('personal_data','arbeitserlaubnisGueltigBis'),('personal_data','aufenthaltstitelErforderlich'),('personal_data','aufenthaltstitelGueltigBis'),('personal_data','healthInsuranceMembership'),('supervisor_data','kostenstellenBemerkung'),('documents','ablaufErinnertAm'),('documents','ablaufErinnertStufe'),('documents','gueltigBis'),('checklist_template_items','description'),('checklist_items','abteilungKommentar'),('checklist_items','abteilungKommentarAm'),('checklist_items','description'),('checklist_items','relativeDueDays'),('offboarding_processes','supervisorEmail'),('offboarding_processes','supervisorName'),('offboarding_checklist_items','abteilungKommentar'),('offboarding_checklist_items','abteilungKommentarAm'),('offboarding_department_links','lastSendDetail'),('offboarding_department_links','lastSendStatus'),('offboarding_department_links','lastSentAt'),('offboarding_department_links','onboardingId'),('offboarding_department_links','zugestelltAn')) ORDER BY 1, 2;
\echo '== VORHER S-V4'
SELECT to_regclass('public.supervisor_kostenstellen')::text AS tabelle, to_regclass('public."supervisor_kostenstellen_supervisorDataId_bezeichnung_key"')::text AS uq_kst, to_regclass('public."documents_gueltigBis_idx"')::text AS idx_gueltig_bis, to_regclass('public."offboarding_department_links_onboardingId_departmentKey_key"')::text AS uq_onb_links, (SELECT conname::text FROM pg_constraint WHERE conname = 'offboarding_department_links_onboardingId_fkey') AS fk_onb;
\echo '== VORHER S-V5'
SELECT (SELECT is_nullable::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offboarding_department_links' AND column_name = 'offboardingId') AS offboarding_id_nullable, (SELECT COUNT(1) FROM offboarding_department_links) AS link_zeilen, (SELECT COUNT(1) FROM supervisor_data WHERE kostenstelle IS NOT NULL AND btrim(kostenstelle) <> '') AS kostenstellen_zu_migrieren;

-- ---------------------------------------------------------------------
-- Einmalige Migrationen: Vorschau (migrationen-vorher.sql)
-- ---------------------------------------------------------------------
\echo '== VORHER M-V0'
SELECT name, "appliedAt", details->>'changed' AS changed
FROM system_migrations
ORDER BY "appliedAt";
\echo '== VORHER M-V1a'
SELECT "questionnaireType",
       jsonb_typeof("stepsConfig") AS typ,
       CASE
         WHEN "stepsConfig" IS NULL OR jsonb_typeof("stepsConfig") <> 'array'
           THEN 'UEBERSPRUNGEN (keine Schrittliste) -> KEIN Merker'
         WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(
                        CASE WHEN jsonb_typeof("stepsConfig") = 'array' THEN "stepsConfig" ELSE '[]'::jsonb END) e
                      WHERE e->'step' = '9'::jsonb AND e->'enabled' = 'true'::jsonb)
           THEN 'bereits aktiv - unveraendert'
         WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(
                        CASE WHEN jsonb_typeof("stepsConfig") = 'array' THEN "stepsConfig" ELSE '[]'::jsonb END) e
                      WHERE e->'step' = '9'::jsonb)
           THEN 'Schritt 9 wird eingeschaltet'
         ELSE 'Schritt 9 wird ergaenzt'
       END AS aktion
FROM form_templates
ORDER BY 1;
\echo '== VORHER M-V1b'
SELECT "displayId", "questionnaireType", status, "createdAt"
FROM onboarding_processes
WHERE status IN ('INVITED', 'IN_PROGRESS')
  AND jsonb_typeof("formTemplateSnapshot") = 'array'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof("formTemplateSnapshot") = 'array' THEN "formTemplateSnapshot" ELSE '[]'::jsonb END) e
                  WHERE e->'step' = '9'::jsonb AND e->'enabled' = 'true'::jsonb)
ORDER BY 1;
\echo '== VORHER M-V2a'
WITH k AS (
  SELECT regexp_replace(kostenstelle, '^\s+|\s+$', '', 'g') AS bez,
         "kostenstelleAnteil" AS anteil
  FROM supervisor_data
  WHERE kostenstelle IS NOT NULL
)
SELECT count(1)                                                       AS geprueft,
       count(1) FILTER (WHERE bez = '')                               AS leere_bezeichnung,
       count(1) FILTER (WHERE bez <> '')                              AS migriert,
       count(1) FILTER (WHERE bez <> '' AND (anteil IS NULL OR anteil = 'NaN'::float8))
                                                                      AS ohne_anteil_auf_100,
       count(1) FILTER (WHERE bez <> '' AND anteil IS NOT NULL AND anteil <> 'NaN'::float8
                          AND round((anteil * 100)::numeric) <> 10000) AS anteil_ungleich_100,
       count(1) FILTER (WHERE length(bez) > 100)                      AS wird_auf_100_zeichen_gekuerzt
FROM k;
\echo '== VORHER M-V2b'
SELECT op."displayId", op.status, sd.kostenstelle, sd."kostenstelleAnteil",
       CASE
         WHEN regexp_replace(sd.kostenstelle, '^\s+|\s+$', '', 'g') = '' THEN 'leer - keine Zeile'
         WHEN sd."kostenstelleAnteil" IS NULL THEN 'ohne Anteil -> 100'
         ELSE 'Anteil bleibt, Summe <> 100 -> HR pflegt nach'
       END AS ergebnis
FROM supervisor_data sd
JOIN onboarding_processes op ON op.id = sd."onboardingId"
WHERE sd.kostenstelle IS NOT NULL
  AND (   regexp_replace(sd.kostenstelle, '^\s+|\s+$', '', 'g') = ''
       OR sd."kostenstelleAnteil" IS NULL
       OR round((sd."kostenstelleAnteil" * 100)::numeric) <> 10000)
ORDER BY 1;
\echo '== VORHER M-V3'
SELECT count(1) AS mandanten,
       count(1) FILTER (WHERE jsonb_typeof("contractEndFieldConfig") = 'array') AS mit_gespeicherter_konfig
FROM organizations;
\echo '== VORHER M-V3-2'
SELECT o."mandantNumber", o.name, e->>'label' AS label_heute,
       CASE
         WHEN regexp_replace(e->>'label', '^\s+|\s+$', '', 'g') = 'Stellenbeschreibung'
           THEN 'wird zu "Stellenbezeichnung"'
         WHEN regexp_replace(e->>'label', '^\s+|\s+$', '', 'g') IN ('', 'Stellenbezeichnung')
           THEN 'nichts zu tun'
         ELSE 'eigenes Label bleibt (nur Logzeile)'
       END AS aktion
FROM organizations o
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(o."contractEndFieldConfig") = 'array' THEN o."contractEndFieldConfig" ELSE '[]'::jsonb END) e
WHERE e->>'name' = 'stellenbeschreibung'
  AND jsonb_typeof(e->'label') = 'string'
ORDER BY 1;
\echo '== VORHER M-V4a'
WITH v AS (
  SELECT op."displayId", op.status::text AS status, op."questionnaireType"::text AS typ,
         op."createdAt", op."formTemplateSnapshot" AS snap,
         (op."submittedAt" IS NOT NULL OR COALESCE(pd."isComplete", false))           AS ma_abgesendet,
         (op."supervisorSubmittedAt" IS NOT NULL OR COALESCE(sd."isComplete", false)) AS vg_abgesendet,
         COALESCE(op."supervisorToken", '') <> ''                                     AS vg_link,
         COALESCE(pd."currentStep", 0)                                                AS schritt
  FROM onboarding_processes op
  LEFT JOIN personal_data   pd ON pd."onboardingId" = op.id
  LEFT JOIN supervisor_data sd ON sd."onboardingId" = op.id
), s AS (
  SELECT v.*,
         CASE
           WHEN status IN ('REVIEWED', 'COMPLETED', 'EXPIRED') THEN status
           WHEN ma_abgesendet AND vg_abgesendet THEN 'SUPERVISOR_SUBMITTED'
           WHEN ma_abgesendet AND vg_link       THEN 'SUPERVISOR_PENDING'
           WHEN ma_abgesendet                   THEN 'SUBMITTED'
           WHEN status = 'IN_PROGRESS' OR schritt > 0 THEN 'IN_PROGRESS'
           ELSE 'INVITED'
         END AS nach
  FROM v
)
SELECT "displayId", typ, status AS von, nach,
       (status IN ('SUBMITTED', 'SUPERVISOR_PENDING', 'SUPERVISOR_SUBMITTED') AND NOT ma_abgesendet) AS festhaengend,
       CASE
         WHEN snap IS NULL OR jsonb_typeof(snap) <> 'array' THEN 'kein Snapshot'
         WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(
                        CASE WHEN jsonb_typeof(snap) = 'array' THEN snap ELSE '[]'::jsonb END) e
                      WHERE e->'step' = '9'::jsonb AND e->'enabled' = 'true'::jsonb) THEN 'ja'
         ELSE 'nein'
       END AS masern_im_snapshot,
       "createdAt"
FROM s
WHERE status NOT IN ('REVIEWED', 'COMPLETED', 'EXPIRED')
  AND nach <> status
ORDER BY festhaengend DESC, 1;
\echo '== VORHER M-V4b'
SELECT op."displayId", op.status, op."reviewedAt", op."completedAt"
FROM onboarding_processes op
LEFT JOIN personal_data pd ON pd."onboardingId" = op.id
WHERE op.status IN ('REVIEWED', 'COMPLETED')
  AND op."submittedAt" IS NULL
  AND NOT COALESCE(pd."isComplete", false)
ORDER BY 1;
\echo '== VORHER M-V5-0'
SELECT datctype FROM pg_database WHERE datname = current_database();
\echo '== VORHER M-V5a'
WITH w AS (
  SELECT cti."defaultAssignee" AS alt, count(1) AS anzahl
  FROM checklist_template_items cti
  JOIN checklist_templates ct ON ct.id = cti."templateId"
  WHERE regexp_replace(ct.name, '^\s+', '') NOT LIKE 'Offboarding:%'
    AND cti."defaultAssignee" IS NOT NULL
  GROUP BY 1
), t AS (
  SELECT alt, anzahl, regexp_replace(alt, '^\s+|\s+$', '', 'g') AS roh FROM w
), n AS (
  SELECT alt, anzahl, roh,
         btrim(regexp_replace(replace(replace(replace(replace(lower(roh), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
                              '[^a-z0-9]+', ' ', 'g')) AS n
  FROM t
), m AS (
  SELECT alt, anzahl, roh,
         CASE
           WHEN roh = '' THEN NULL
           WHEN roh ~ '^[A-Z][A-Z0-9_]{1,29}$' THEN roh
           WHEN n = '' THEN NULL
           WHEN split_part(n, ' ', 1) = 'hr' OR n LIKE 'personal%' THEN 'HR'
           WHEN split_part(n, ' ', 1) = 'it' OR n LIKE 'edv%' THEN 'IT'
           WHEN n LIKE 'verw%' OR n LIKE '%sekretariat%' THEN 'VERWALTUNG'
           WHEN n LIKE 'vorgesetzt%' OR n LIKE '%fuehrungskraft%' OR n ~ 'leitung( |$)' THEN 'VORGESETZTER'
           WHEN n LIKE 'facility%' OR n LIKE '%hausmeister%' OR n LIKE '%haustechnik%' THEN 'FACILITY'
           WHEN n LIKE '%buchhaltung%' THEN 'BUCHHALTUNG'
           WHEN n LIKE 'datenschutz%' OR split_part(n, ' ', 1) = 'dsb' THEN 'DSB'
           WHEN n LIKE 'mitarbeit%' OR n LIKE 'beschaeftigt%' THEN 'MITARBEITER'
         END AS neu
  FROM n
)
SELECT '"' || alt || '"' AS heute, anzahl, neu,
       CASE
         WHEN roh = '' THEN 'leer - bleibt'
         WHEN neu IS NULL THEN 'UNBEKANNT - bleibt, Warnzeile'
         WHEN neu = alt AND neu IN ('HR','IT','VERWALTUNG','FACILITY','BUCHHALTUNG','VORGESETZTER','MITARBEITER','DSB')
           THEN 'schon Schluessel - bleibt'
         WHEN neu = alt THEN 'EIGENER Schluessel - bleibt (Eintrag unter Einstellungen > Abteilungen noetig)'
         ELSE 'wird umgestellt'
       END AS aktion
FROM m
ORDER BY aktion, heute;
\echo '== VORHER M-V5b'
WITH w AS (
  SELECT assignee AS alt, count(1) AS anzahl,
         count(1) FILTER (WHERE op.status NOT IN ('COMPLETED', 'EXPIRED')) AS davon_laufend
  FROM checklist_items ci
  JOIN onboarding_processes op ON op.id = ci."onboardingId"
  WHERE assignee IS NOT NULL
  GROUP BY 1
), t AS (
  SELECT alt, anzahl, davon_laufend, regexp_replace(alt, '^\s+|\s+$', '', 'g') AS roh FROM w
), n AS (
  SELECT alt, anzahl, davon_laufend, roh,
         btrim(regexp_replace(replace(replace(replace(replace(lower(roh), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
                              '[^a-z0-9]+', ' ', 'g')) AS n
  FROM t
), m AS (
  SELECT alt, anzahl, davon_laufend, roh,
         CASE
           WHEN roh = '' THEN NULL
           WHEN roh ~ '^[A-Z][A-Z0-9_]{1,29}$' THEN roh
           WHEN n = '' THEN NULL
           WHEN split_part(n, ' ', 1) = 'hr' OR n LIKE 'personal%' THEN 'HR'
           WHEN split_part(n, ' ', 1) = 'it' OR n LIKE 'edv%' THEN 'IT'
           WHEN n LIKE 'verw%' OR n LIKE '%sekretariat%' THEN 'VERWALTUNG'
           WHEN n LIKE 'vorgesetzt%' OR n LIKE '%fuehrungskraft%' OR n ~ 'leitung( |$)' THEN 'VORGESETZTER'
           WHEN n LIKE 'facility%' OR n LIKE '%hausmeister%' OR n LIKE '%haustechnik%' THEN 'FACILITY'
           WHEN n LIKE '%buchhaltung%' THEN 'BUCHHALTUNG'
           WHEN n LIKE 'datenschutz%' OR split_part(n, ' ', 1) = 'dsb' THEN 'DSB'
           WHEN n LIKE 'mitarbeit%' OR n LIKE 'beschaeftigt%' THEN 'MITARBEITER'
         END AS neu
  FROM n
)
SELECT '"' || alt || '"' AS heute, anzahl, davon_laufend, neu,
       CASE
         WHEN roh = '' THEN 'leer - bleibt'
         WHEN neu IS NULL THEN 'UNBEKANNT - bleibt, Warnzeile'
         WHEN neu = alt AND neu IN ('HR','IT','VERWALTUNG','FACILITY','BUCHHALTUNG','VORGESETZTER','MITARBEITER','DSB')
           THEN 'schon Schluessel - bleibt'
         WHEN neu = alt THEN 'EIGENER Schluessel - bleibt (Eintrag unter Einstellungen > Abteilungen noetig)'
         ELSE 'wird umgestellt'
       END AS aktion
FROM m
ORDER BY aktion, heute;
\echo '== VORHER M-V5c'
WITH ci AS (
  SELECT ci.id, ci."templateItemId", regexp_replace(ci.title, '^\s+|\s+$', '', 'g') AS titel,
         op."checklistTemplateId" AS vorlage
  FROM checklist_items ci
  JOIN onboarding_processes op ON op.id = ci."onboardingId"
)
SELECT CASE
         WHEN p.id IS NOT NULL AND p."defaultDueDays" IS NOT NULL THEN '1 ueber templateItemId'
         WHEN p.id IS NOT NULL THEN '2 Vorlagenpunkt ohne Tage -> bleibt NULL'
         WHEN ci.vorlage IS NOT NULL AND EXISTS (
                SELECT 1 FROM checklist_template_items q
                WHERE q."templateId" = ci.vorlage
                  AND regexp_replace(q.title, '^\s+|\s+$', '', 'g') = ci.titel
                  AND q."defaultDueDays" IS NOT NULL) THEN '3 ueber den Titel (Rueckfall)'
         ELSE '4 keine Quelle -> bleibt NULL (ohne Faelligkeit, keine Erinnerung)'
       END AS quelle,
       count(1) AS aufgaben
FROM ci
LEFT JOIN checklist_template_items p ON p.id = ci."templateItemId"
GROUP BY 1
ORDER BY 1;
\echo '== VORHER M-V5d'
SELECT "departmentKey", "departmentName", email,
       "organizationId" IS NULL AS zentral, "isActive"
FROM department_configs
ORDER BY "departmentKey", zentral DESC;
\echo '== VORHER M-V6'
SELECT op."displayId", op.status, ba.kategorie, count(1) AS zeilen
FROM beschaeftigungs_angaben ba
JOIN personal_data pd        ON pd.id = ba."personalDataId"
JOIN onboarding_processes op ON op.id = pd."onboardingId"
WHERE (ba.kategorie = 'WEITERE'           AND pd."hasOtherEmployment" = false)
   OR (ba.kategorie = 'VORBESCHAEFTIGUNG' AND pd."vorbeschaeftigungenVorhanden" = false)
   OR (ba.kategorie = 'AUSLAND'           AND pd."auslandsbeschaeftigungVorhanden" = false)
GROUP BY 1, 2, 3
ORDER BY 1;

-- ---------------------------------------------------------------------
-- Mail-Vorlagen (laeuft auch NACHHER)
-- ---------------------------------------------------------------------
\echo '== VORHER MAIL1'
WITH betroffen(event, einstufung, kennzeichen_neu) AS (
  VALUES
    ('supervisor-completed',                'PFLICHT-Reset',  '{{#fragebogen_eingereicht}}'),
    ('questionnaire-completed',             'PFLICHT-Reset',  '{{#modalitaeten_eingereicht}}'),
    ('supervisor-link-created',             'PFLICHT-Reset',  'Bitte ausfüllen bis'),
    ('contract-end-supervisor-link',        'PFLICHT-Reset',  'Jetzt entscheiden'),
    ('offboarding-completed',               'PFLICHT-Reset',  '{{#offene_aufgaben_beim_abschluss}}'),
    ('offboarding-department-assigned',     'EMPFOHLEN',      '{{aufgabenliste_html}}'),
    ('offboarding-reminder',                'EMPFOHLEN',      '{{#ist_ueberfaellig}}'),
    ('offboarding-task-completed',          'EMPFOHLEN',      '{{#kommentar}}'),
    ('offboarding-department-completed',    'EMPFOHLEN',      'Alle Ihre Aufgaben sind erledigt'),
    ('psi-deadline-warning',                'EMPFOHLEN',      '{{warnungen_liste_html}}'),
    ('onboarding-created',                  'EMPFOHLEN',      '{{#vorname}}'),
    ('employee-reminder',                   'EMPFOHLEN',      'Hallo{{#vorname}}'),
    ('supervisor-reminder',                 'egal',           'Einstellungsmodalitäten ausstehend'),
    ('offboarding-created',                 'egal',           'Für <strong>{{vorname}}'),
    ('questionnaire-confirmation-employee', 'Empfaenger/Aktiv pruefen', NULL),
    ('onboarding-department-assigned',      'NEU',            NULL),
    ('onboarding-department-reminder',      'NEU',            NULL),
    ('onboarding-task-completed',           'NEU (An-Feld!)', NULL),
    ('onboarding-department-completed',     'NEU',            NULL),
    ('dokument-ablauf-warnung',             'NEU (An-Feld!)', NULL),
    ('dokument-abgelaufen',                 'NEU (An-Feld!)', NULL)
)
SELECT b.event,
       b.einstufung,
       (t.id IS NOT NULL)                       AS gespeichert,
       t."isActive",
       t."recipientTo",
       t."recipientCc",
       t."recipientBcc",
       t."recipientReplyTo",
       t."updatedAt",
       CASE
         WHEN t.id IS NULL                            THEN 'keine Zeile: Code-Default gilt'
         WHEN b.kennzeichen_neu IS NULL               THEN '-'
         WHEN strpos(t."bodyHtml", b.kennzeichen_neu) > 0 THEN 'neuer Text schon drin'
         ELSE 'ALTER TEXT: nach Deploy zuruecksetzen'
       END                                      AS textstand,
       left(t.subject, 100)                     AS betreff_gespeichert
FROM betroffen b
LEFT JOIN email_templates t ON t.event = b.event
ORDER BY (t.id IS NULL), b.einstufung, b.event;

-- ---------------------------------------------------------------------
-- HR-interne Events ohne An-Feld (laeuft auch NACHHER)
-- ---------------------------------------------------------------------
\echo '== VORHER MAIL2'
WITH hr_intern(event, neu_im_deploy) AS (
  VALUES
    ('onboarding-task-completed', true), ('dokument-ablauf-warnung', true), ('dokument-abgelaufen', true),
    ('questionnaire-completed', false), ('supervisor-completed', false),
    ('offboarding-created', false), ('offboarding-task-completed', false),
    ('offboarding-task-overdue', false), ('offboarding-completed', false),
    ('psi-created', false), ('psi-phase-completed', false), ('psi-deadline-warning', false),
    ('psi-assessment-completed', false),
    ('elternzeit-angelegt', false), ('elternzeit-antrag-eingereicht', false),
    ('elternzeit-leiter-genehmigt', false), ('elternzeit-leiter-abgelehnt', false),
    ('elternzeit-vbl-generiert', false), ('elternzeit-ag-bescheinigung-generiert', false),
    ('elternzeit-br-detmold-generiert', false), ('elternzeit-br-genehmigung-eingegangen', false),
    ('elternzeit-frist-eskaliert', false),
    ('mutterschutz-angelegt', false), ('mutterschutz-bad-beauftragt', false),
    ('mutterschutz-bad-abgeschlossen', false), ('mutterschutz-aktiviert', false),
    ('mutterschutz-beendet', false),
    ('contract-end-created', false), ('contract-end-eskalation', false),
    ('contract-end-unbearbeitet', false)
),
skips AS (
  SELECT event, COUNT(1) AS skipped_90_tage, max("createdAt") AS letzter_skip
  FROM email_logs
  WHERE status = 'SKIPPED' AND "isTest" = false
    AND detail LIKE 'Kein Empfaenger konfiguriert%'
    AND "createdAt" > now() - interval '90 days'
  GROUP BY event
)
SELECT h.event,
       h.neu_im_deploy,
       (t.id IS NOT NULL)                              AS gespeichert,
       t."isActive",
       NULLIF(t."recipientTo", '')                     AS an_feld,
       CASE WHEN coalesce(t."recipientTo", '') = '' THEN 'KEIN AN-FELD -> SKIPPED'
            WHEN t."isActive" = false               THEN 'deaktiviert -> SKIPPED'
            ELSE 'ok' END                              AS ergebnis,
       coalesce(s.skipped_90_tage, 0)                  AS skipped_ohne_empfaenger_90_tage,
       s.letzter_skip
FROM hr_intern h
LEFT JOIN email_templates t ON t.event = h.event
LEFT JOIN skips s           ON s.event = h.event
ORDER BY h.neu_im_deploy DESC, (coalesce(t."recipientTo", '') = '') DESC, h.event;

-- ---------------------------------------------------------------------
-- Webhooks (laeuft auch NACHHER)
-- ---------------------------------------------------------------------
\echo '== VORHER MAIL3'
SELECT w.event,
       w.name,
       w.url,
       w."isActive",
       w."authType",
       w."updatedAt",
       CASE
         WHEN w.event = 'questionnaire-confirmation-employee'
           THEN 'NEU: lief bisher an triggerWebhooks vorbei (sendEmail direkt) -> feuert jetzt'
         WHEN w.event IN ('onboarding-department-assigned','onboarding-department-reminder',
                          'onboarding-task-completed','onboarding-department-completed')
           THEN 'NEU: Paket 5, Event gab es vorher nicht'
         WHEN w.event IN ('dokument-ablauf-warnung','dokument-abgelaufen')
           THEN 'NEU: Cron /api/cron/dokument-ablauf'
         WHEN w.event = 'supervisor-link-created'
           THEN 'ANDERS: auch beim Anlegen (Neuer Vorgang); gleiche Adresse = keine 2. Mail'
         WHEN w.event IN ('supervisor-reminder','employee-reminder')
           THEN 'ANDERS: Takt geaendert (FK auch bei offenem Fragebogen; MA nicht nach Linkablauf)'
         WHEN w.event IN ('offboarding-department-assigned','offboarding-reminder',
                          'offboarding-task-completed','offboarding-department-completed')
           THEN 'ANDERS: Paket 1b (Erinnern/Erneut senden, nur echte Wechsel, WEBHOOK-Regel)'
         WHEN w.event IN ('questionnaire-completed','supervisor-completed',
                          'offboarding-created','offboarding-completed','psi-deadline-warning')
           THEN 'Payload erweitert, alte Felder bleiben'
         ELSE '-'
       END AS aenderung,
       t."isActive" AS portal_vorlage_aktiv
FROM webhook_configs w
LEFT JOIN email_templates t ON t.event = w.event
ORDER BY (w."isActive") DESC, w.event;

-- ---------------------------------------------------------------------
-- Betrieb: erster Cron-Lauf, Konfiguration (betrieb-vorher.sql)
-- ---------------------------------------------------------------------
\echo '== VORHER B-B1'
SELECT o."displayId", o.status, o."invitedAt"::date AS eingeladen,
       o."tokenExpiresAt"::date AS link_bis, o."lastEmployeeReminderAt"::date AS zuletzt_erinnert,
       COALESCE(p."isComplete", false) AS altfall_fragebogen_complete
FROM onboarding_processes o
LEFT JOIN personal_data p ON p."onboardingId" = o.id
WHERE o."submittedAt" IS NULL
  AND o.status NOT IN ('REVIEWED', 'COMPLETED', 'EXPIRED')
  AND COALESCE(p."isComplete", false) = false
  AND o."tokenExpiresAt" > now()
  AND o."invitedAt" < now() - interval '7 days'
  AND (o."lastEmployeeReminderAt" IS NULL OR o."lastEmployeeReminderAt" < now() - interval '7 days')
ORDER BY o."invitedAt";
\echo '== VORHER B-B2'
SELECT o."displayId", o.status, o."supervisorEmail",
       GREATEST(o."invitedAt", o."supervisorTokenExpiresAt" - interval '720 hours')::date AS link_erzeugt_ca,
       o."lastSupervisorReminderAt"::date AS zuletzt_erinnert,
       (o."submittedAt" IS NULL) AS fragebogen_offen
FROM onboarding_processes o
LEFT JOIN supervisor_data s ON s."onboardingId" = o.id
WHERE o."supervisorToken" IS NOT NULL
  AND COALESCE(o."supervisorEmail", '') <> ''
  AND o."supervisorSubmittedAt" IS NULL
  AND COALESCE(s."isComplete", false) = false
  AND o."supervisorTokenExpiresAt" > now()
  AND o.status NOT IN ('REVIEWED', 'COMPLETED', 'EXPIRED')
  AND (o."lastSupervisorReminderAt" < now() - interval '7 days'
       OR (o."lastSupervisorReminderAt" IS NULL
           AND o."invitedAt" < now() - interval '7 days'
           AND o."supervisorTokenExpiresAt" < now() - interval '7 days' + interval '720 hours'))
ORDER BY 4;
\echo '== VORHER B-B3'
SELECT p."displayId", p.status, l."departmentKey", l.email,
       l."sentAt"::date AS informiert, l."lastReminderAt"::date AS zuletzt_erinnert,
       count(i.id) AS offen,
       count(i.id) FILTER (WHERE i."dueDate" <= now() - interval '1 day') AS ueberfaellig,
       max(i."dueDate")::date AS spaeteste_faelligkeit
FROM offboarding_department_links l
JOIN offboarding_processes p ON p.id = l."offboardingId"
JOIN offboarding_checklist_items i
  ON i."offboardingId" = p.id AND i."assigneeDepartment" = l."departmentKey" AND i."isCompleted" = false
WHERE l."sentAt" IS NOT NULL
  AND l."allTasksComplete" = false
  AND p.status NOT IN ('COMPLETED', 'CANCELLED')
  AND l."departmentKey" NOT IN ('HR', 'MITARBEITER')
  AND GREATEST(l."sentAt", COALESCE(l."lastReminderAt", l."sentAt")) < now() - interval '2 days'
GROUP BY 1, 2, 3, 4, 5, 6
HAVING max(i."dueDate") >= now() - interval '30 days'
   AND min(i."dueDate") <= now() + interval '3 days'
ORDER BY 1, 3;
\echo '== VORHER B-B4'
SELECT event, "isActive", "recipientTo", "recipientCc", "updatedAt"::date AS gespeichert
FROM email_templates
WHERE event IN ('employee-reminder', 'supervisor-reminder', 'offboarding-reminder',
                'offboarding-department-assigned', 'offboarding-task-completed',
                'offboarding-department-completed', 'psi-deadline-warning')
ORDER BY event;
\echo '== VORHER B-B5'
SELECT event, name, url, "isActive"
FROM webhook_configs
WHERE event IN ('employee-reminder', 'supervisor-reminder', 'psi-deadline-warning')
   OR event LIKE 'offboarding-%'
ORDER BY event;
\echo '== VORHER B-B6'
SELECT "allowedRecipientDomains", "replyToEmail", "isActive" FROM smtp_config;
\echo '== VORHER B-B7'
SELECT "departmentKey", "departmentName", email, "organizationId" IS NULL AS zentral, "isActive"
FROM department_configs ORDER BY "departmentKey", "organizationId" NULLS FIRST;
\echo '== VORHER B-B8'
SELECT domain, SUM(anzahl) AS anzahl, string_agg(DISTINCT quelle, ', ') AS quellen
FROM (
  SELECT lower(split_part("supervisorEmail", '@', 2)) AS domain, COUNT(1) AS anzahl, 'onboarding' AS quelle
  FROM onboarding_processes WHERE COALESCE("supervisorEmail", '') <> '' GROUP BY 1
  UNION ALL
  SELECT lower(split_part("supervisorEmail", '@', 2)), COUNT(1), 'vertragsende'
  FROM contract_end_processes WHERE COALESCE("supervisorEmail", '') <> '' GROUP BY 1
  UNION ALL
  SELECT lower(split_part("supervisorEmail", '@', 2)), COUNT(1), 'zeugnis'
  FROM zeugnis_bewertungen WHERE COALESCE("supervisorEmail", '') <> '' GROUP BY 1
) t
GROUP BY domain ORDER BY 2 DESC;
\echo '== VORHER B-B9'
SELECT role, COUNT(1) FILTER (WHERE "isActive") AS aktiv, COUNT(1) AS gesamt
FROM users GROUP BY role ORDER BY role;

-- ---------------------------------------------------------------------
-- Ergaenzung Gegenpruefung: Abteilungslinks, die nach dem Deploy verstummen;
-- Checklisten-Vorlagen je Fragebogentyp
-- ---------------------------------------------------------------------
\echo '== VORHER B-B10'
WITH basis AS (
  SELECT p."displayId", p.status::text AS status, l."departmentKey",
         btrim(l.email) AS link_adresse, l."sentAt",
         CASE
           WHEN l."departmentKey" = 'VORGESETZTER' THEN
             COALESCE(NULLIF(btrim(to_jsonb(p) ->> 'supervisorEmail'), ''),
                      NULLIF(btrim(z."supervisorEmail"), ''),
                      NULLIF(btrim(c."supervisorEmail"), ''))
           ELSE COALESCE(
             (SELECT btrim(d.email) FROM department_configs d
              WHERE d."departmentKey" = l."departmentKey" AND d."isActive"
                AND d."organizationId" = p."organizationId" LIMIT 1),
             (SELECT btrim(d.email) FROM department_configs d
              WHERE d."departmentKey" = l."departmentKey" AND d."isActive"
                AND d."organizationId" IS NULL LIMIT 1))
         END AS adresse_heute
  FROM offboarding_department_links l
  JOIN offboarding_processes p ON p.id = l."offboardingId"
  LEFT JOIN zeugnis_bewertungen z ON z."offboardingId" = p.id
  LEFT JOIN contract_end_processes c ON c."offboardingId" = p.id
  WHERE l."sentAt" IS NOT NULL
    AND l."allTasksComplete" = false
    AND p.status NOT IN ('COMPLETED', 'CANCELLED')
    AND l."departmentKey" NOT IN ('HR', 'MITARBEITER')
), bewertet AS (
  SELECT b.*,
         CASE
           WHEN lower(link_adresse) IN ('it@credo-gruppe.de', 'facility@credo-gruppe.de',
                                        'buchhaltung@credo-gruppe.de', 'dsb@credo-gruppe.de')
             THEN 'PLATZHALTER: nach dem Ersetzen "Erneut senden"'
           WHEN adresse_heute IS NULL
             THEN 'KEINE ADRESSE: Cron schweigt'
           WHEN lower(link_adresse) <> lower(adresse_heute)
             THEN 'ADRESSE WEICHT AB: Cron schweigt, "Erneut senden"'
         END AS nach_dem_deploy
  FROM basis b
)
SELECT "displayId", status, "departmentKey", link_adresse, adresse_heute,
       "sentAt"::date AS informiert, nach_dem_deploy
FROM bewertet
WHERE nach_dem_deploy IS NOT NULL
ORDER BY 1, 3;
\echo '== VORHER B-B11'
SELECT name, "questionnaireType", "isActive",
       regexp_replace(name, '^\s+', '') LIKE 'Offboarding:%' AS offboarding_name,
       count(1) FILTER (WHERE "isActive") OVER (PARTITION BY "questionnaireType") AS aktiv_je_typ
FROM checklist_templates
WHERE "questionnaireType" IS NOT NULL
ORDER BY 2, 1;
ENDE_SQL
```

**Danach, in beiden Varianten, die Prüfsumme kontrollieren:**

```bash
md5sum ~/deploy-7bc91ec/vorher-alle.sql
```

Erwartet: `4db0ff9691c3cdd12b73a8f7e869da02`. Steht dort etwas anderes, wurde beim
Kopieren etwas verändert. Dann die Datei neu anlegen und **nicht ausführen**.
Steht dort `28a87349c1180ea82d38917fcecb654d`, ist es die ältere Fassung ohne B-B10
und B-B11 (Commit `b403448`): `git fetch origin` wiederholen und Variante 1 erneut
ausführen.

### 2.2 Ausführen (einheitlicher Aufruf)

```bash
cd /vol/container/HR_Portal_CREDO
sudo docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db \
  psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 < ~/deploy-7bc91ec/vorher-alle.sql > ~/deploy-7bc91ec/vorher-ergebnis.txt 2>&1; echo "Exit: $?"
grep -c '^== VORHER' ~/deploy-7bc91ec/vorher-ergebnis.txt
grep -c 'ERROR' ~/deploy-7bc91ec/vorher-ergebnis.txt
less ~/deploy-7bc91ec/vorher-ergebnis.txt
```

**Erwartet:** `Exit: 0`, `39`, `0`. Jede Abfrage beginnt in der Ausgabe mit einer
Zeile `== VORHER <Nr>`.

- **Exit 3:** Eine Abfrage ist gescheitert. Die Datei an Claude schicken.
- **Leere Ergebnisse** erscheinen als `(0 rows)`.

> **Ergebnis an Claude schicken — immer.** Bitte die ganze Datei
> `vorher-ergebnis.txt` schicken, danach auf die Freigabe warten.
> - Sie enthält Vorgangsnummern, dienstliche Adressen von Führungskräften und
>   Abteilungen, Mandantennamen und Webhook-URLs.
> - Sie enthält keine IBAN, SV-Nummer und Steuer-ID.
> - Webhook-URLs dürfen hinter dem Hostnamen gekürzt werden.

### 2.3 Was jede Abfrage zeigt

In der Spalte „Art“ steht, was aus dem Ergebnis folgt:

- **STOPP:** Weicht das Ergebnis ab, wird nicht deployt.
- **ENTSCHEIDUNG:** Vor dem Deploy mit Claude klären.
- **INFO:** Nur merken, oft für die Handschritte.

#### A · Schema-Drift (STOPP-Prüfungen)

Keine Anweisung des Deltas kann an vorhandenen Daten scheitern. Scheitern kann
der Push nur, wenn Teile des neuen Schemas **schon da** sind.

| Nr | Zeigt | Erwartet | Art · wenn nicht |
|---|---|---|---|
| S-V1 | PostgreSQL-Version | `16.x` (`docker-compose.yml:60`) | STOPP · an Claude |
| S-V2 | Sind die neuen Enum-Werte schon da? | `(0 rows)` | STOPP · an Claude |
| S-V3 | Sind die 23 neuen Spalten schon da? | `(0 rows)` | STOPP · an Claude |
| S-V4 | Sind die neue Tabelle, die Indizes und der Fremdschlüssel schon da? | eine Zeile, alle fünf Felder leer | STOPP · an Claude |
| S-V5 | Ist `offboardingId` noch Pflicht? Dazu die Zahl der Link-Zeilen und der zu übernehmenden Kostenstellen | `NO` · Zahl · Zahl | `YES`: STOPP. Die beiden Zahlen sind INFO. `kostenstellen_zu_migrieren` taucht später im Log als „übernommen“ wieder auf. |
| M-V0 | Vorhandene Migrations-Merker | genau 5: `CURRENT_STEP_REGISTRY_V1`, `MINIJOB_TEMPLATE_STEPS_V1`, `MINIJOB_TEMPLATE_RENTE_V1`, `MINIJOB_TEMPLATE_STEP6_FELDER_V1`, `ORG_BETRIEBSNUMMERN_V1` (die Merker von `6124936`: `git show 6124936:prisma/seed-check.js`, Z. 107, 217, 229, 458, 582) | Einer der fünf **neuen** Namen ist schon da (siehe Abschnitt B): STOPP. Einer der alten fehlt: ENTSCHEIDUNG, dann läuft beim Start eine alte Migration mit. |

#### B · Vorschau der fünf neuen Migrationen

Die Migrationen laufen in dieser Reihenfolge (`seed-check.js:1819-1834`):
`FORMTEMPLATE_MASERNSCHUTZ_V1` → `KOSTENSTELLEN_AUFTEILUNG_V1` →
`VERTRAGSENDE_LABEL_STELLENBEZEICHNUNG_V1` → `ONBOARDING_PARALLELE_SPUREN_V1` →
`ONBOARDING_ABTEILUNGSAUFGABEN_V1`. Jede setzt ihren Merker in derselben
Transaktion wie ihre Änderung. Scheitert eine, wird das geloggt, der Start läuft
weiter, und beim nächsten Start versucht sie es erneut.

| Nr | Zeigt | Erwartet | Art · wenn nicht |
|---|---|---|---|
| M-V1a | Masernschutz-Schritt (Schritt 9) je Formularvorlage | „bereits aktiv“, „wird eingeschaltet“ oder „wird ergänzt“. Schritt 9 in **allen** Vorlagen ist so entschieden (07.09.2026, `seed-check.js:634-640`). | „UEBERSPRUNGEN“: ENTSCHEIDUNG, denn dann wird kein Merker gesetzt, und die Migration läuft bei jedem Start erneut (`seed-check.js:720-745`). Hatte HR Schritt 9 in einer Vorlage **bewusst** aus: merken, siehe 5.3. |
| M-V1b | Laufende Vorgänge (eingeladen/in Bearbeitung), deren Fragebogen den Schritt dazubekommt | beliebig | INFO: Diese Personen sehen einen Schritt mehr. |
| M-V2a | Kostenstellen-Übernahme in Zahlen | beliebig. `migriert` ist die spätere Log-Zahl. | INFO. Ist `anteil_ungleich_100` > 0, geht die Liste M-V2b an HR (5.3). |
| M-V2b | Einzelliste dieser Sonderfälle | beliebig | INFO für HR |
| M-V3, M-V3-2 | Beschriftung „Stellenbeschreibung“ beim Vertragsende je Mandant | „wird zu ‚Stellenbezeichnung‘“ oder „nichts zu tun“ | „eigenes Label bleibt“: INFO, dafür erscheint nur eine Logzeile. |
| M-V4a | Jeder Onboarding-Vorgang, dessen Status die Heil-Migration ändert (`von` → `nach`) | Zeilen mit `festhaengend = t` sind der Zweck der Reparatur: Diese Personen können danach weiter ausfüllen. | ENTSCHEIDUNG, sobald Zeilen da sind: an Claude. |
| M-V4b | Vorgänge, die geprüft oder abgeschlossen sind, obwohl der Fragebogen nie abgesendet wurde | `(0 rows)` | ENTSCHEIDUNG. Die Migration ändert diese Vorgänge nicht, sie meldet sie nur (`seed-check.js:1375-1377`). Jeder Fall wird einzeln mit HR geklärt. |
| M-V5-0 | Zeichenregel der Datenbank | `en_US.utf8` | INFO. Bei anderem Wert sind M-V5a/b nur ungefähr, maßgeblich ist die Migration selbst (JS). |
| M-V5a | Zuständigkeit in den Punkten der Onboarding-Checklisten-Vorlagen | „schon Schluessel“ oder „wird umgestellt“ | „UNBEKANNT“ oder „EIGENER Schluessel“: ENTSCHEIDUNG. Unbekannte bleiben stehen und gehen nie per Link hinaus. Ein eigener Schlüssel braucht einen Eintrag unter Einstellungen → Abteilungen. |
| M-V5b | Dasselbe für die Aufgaben in laufenden und alten Vorgängen | wie M-V5a | wie M-V5a |
| M-V5c | Woher die Tagesangabe einer Aufgabe kommt | Quelle 1 oder 3 | „4 keine Quelle“: INFO. Diese Aufgaben bekommen keine Fälligkeit und keine Erinnerung. |
| M-V5d | Abteilungsadressen | echte Postfächer | Aktive Platzhalter `…@credo-gruppe.de` machen den PFLICHT-Handschritt 5.2 nötig. Zeilen mit `HR`, `MITARBEITER` oder `VORGESETZTER` werden nach dem Deploy gelöscht (5.2). |
| M-V6 | Beschäftigungszeilen, die trotz „Nein“ stehen geblieben sind (Formular-Fix) | `(0 rows)` | ENTSCHEIDUNG: an Claude. Wie sich das korrigieren lässt, ist **ungeklärt**. |

#### C · Mailvorlagen und Webhooks

| Nr | Zeigt | Erwartet | Art · wenn nicht |
|---|---|---|---|
| MAIL1 | Die 21 betroffenen Vorlagen: gespeichert oder nicht, aktiv, Empfänger und Textstand | `gespeichert = f`: nichts zu tun, der neue Code-Text gilt. | „ALTER TEXT: nach Deploy zuruecksetzen“ kommt auf die Reset-Liste (5.4). Hat HR einen dieser Texte **bewusst** angepasst: ENTSCHEIDUNG. Bei `questionnaire-confirmation-employee` ist jede dieser Angaben eine ENTSCHEIDUNG, denn bisher schickte der Code die Bestätigung immer an die Person und ignorierte Aktiv-Schalter und Empfängerfelder (`git show 6124936:src/app/api/fragebogen/[token]/route.ts`, Z. 803-838). Ab jetzt wirken sie (`mailer.ts:519-528, 540-542`): `isActive = f` (die Bestätigung bleibt aus), ein nicht leeres `recipientTo` außer `{{email}}` (es **ersetzt** die Adresse der Person), ein gesetztes `recipientCc` oder `recipientBcc` (geht ab jetzt in Kopie mit). |
| MAIL2 | Die 30 HR-internen Vorlagen: An-Feld, Aktiv-Schalter, SKIPPED der letzten 90 Tage | beliebig | INFO für 5.1 und 5.3. Ohne An-Feld werden sie übersprungen (`mailer.ts:529-538`). |
| MAIL3 | Alle Webhooks, ohne Zugangsdaten | `(0 rows)` oder nur inaktive | Jede **aktive** Zeile: ENTSCHEIDUNG, möglicher Doppelversand (6.4). |

#### D · Betrieb und erster Cron-Lauf

| Nr | Zeigt | Erwartet | Art · wenn nicht |
|---|---|---|---|
| B-B1 | Mitarbeiter-Erinnerungen, die der erste Lauf nach dem Deploy verschickt | beliebig | INFO. Enthält auch Personen, die heute festhängen und nach der Heil-Migration wieder eingeladen sind. |
| B-B2 | Führungskraft-Erinnerungen im ersten Lauf. Neu: auch bei offenem Fragebogen (`cron/reminders/route.ts:195-222`) | beliebig | Jede Zeile ist eine Mail an eine Führungskraft. Soll eine davon nicht hinausgehen: ENTSCHEIDUNG, vor dem nächsten 08:00-Lauf. |
| B-B3 | Abteilungs-Erinnerungen im Offboarding im ersten Lauf (Näherung, zählt zu viel: Links aus B-B10 mit „Cron schweigt“ werden übersprungen) | beliebig | Der Cron erinnert nur an die Adresse, an die der Link ging (`email`), und nur, solange sie mit der heutigen Adresse übereinstimmt (`abteilungsaufgaben-dienst.ts:1174-1196`). Zeigt `email` einen Platzhalter, geht die Erinnerung an den Platzhalter. Nach dem Ersetzen (5.2) schweigt der Cron für diesen Link, bis HR „Erneut senden“ wählt. Welche Links das betrifft, zeigt B-B10. |
| B-B4 | Gespeicherte Erinnerungs-Vorlagen | – | INFO für 5.4 |
| B-B5 | Webhooks auf Erinnerungen und Offboarding | wie MAIL3 | wie MAIL3 |
| B-B6 | Freigabeliste (`allowedRecipientDomains`) und Reply-To | beliebig | Ist die Liste **nicht leer**, sperrt sie ab jetzt auch Führungskraft-Adressen. Dann mit B-B8 abgleichen (5.2). |
| B-B7 | Abteilungen | wie M-V5d | – |
| B-B8 | Domains der eingetragenen Führungskräfte | – | INFO, Grundlage für die Freigabeliste |
| B-B9 | Benutzer je Rolle | – | INFO (5.3) |
| B-B10 | Informierte, offene Offboarding-Abteilungslinks, deren Erinnerungen nach dem Deploy verstummen, und warum (Spalte `nach_dem_deploy`). `adresse_heute` ist die Adresse, die der neue Code auflöst: Einrichtung vor zentral, `VORGESETZTER` über die Führungskraft des Vorgangs (Zeugnis-Bewertung, dann Vertragsende; `abteilungsaufgaben-dienst.ts:259-269`, `abteilungsaufgaben.ts:441-469`). | `(0 rows)` | ENTSCHEIDUNG, sobald Zeilen da sind. `PLATZHALTER`: Nach dem Ersetzen in 5.2 schweigt der Cron. `ADRESSE WEICHT AB`: Der Cron schweigt ab dem Deploy, etwa weil `VORGESETZTER` jetzt an die Führungskraft geht statt an den Eintrag unter Abteilungen. `KEINE ADRESSE`: Es gibt keine aktive Abteilung oder keine Führungskraft. Jede Zeile braucht in 5.2 ein „Erneut senden“ mit **echter Mail und neuem Link**, oder HR entscheidet bewusst, den Link ruhen zu lassen. |
| B-B11 | Checklisten-Vorlagen mit Fragebogentyp: Name, aktiv, `offboarding_name`, `aktiv_je_typ` | Kein `offboarding_name = t`, `aktiv_je_typ` höchstens `1` | ENTSCHEIDUNG. `POST /api/onboarding` nimmt die erste aktive Vorlage zum Typ, ohne Reihenfolge und ohne Blick auf den Namen (`src/app/api/onboarding/route.ts:176-179`). Die Sperre für „Offboarding:“-Vorlagen aus Paket 5 greift erst, wenn die Vorlage gespeichert wird (`src/app/api/checklisten/[id]/route.ts:136-142, 262-272`, `src/app/api/checklisten/route.ts:88-92`). Eine solche Vorlage oder eine zweite aktive je Typ zöge sonst die falschen Aufgaben in neue Einstellungen, und mit Paket 5 gehen sie per Link an Abteilungen. Abhilfe nach dem Deploy: die Vorlage unter `/checklisten` öffnen und speichern, oder die überzählige deaktivieren. |

#### E · Prüfungen 1–5 aus dem Änderungsplan

Das sind die Prüfungen aus Abschnitt 8 von `docs/module/onboarding/aenderungsplan-2026-09.html`.
Sie decken sich teilweise mit den Abfragen oben.

| Nr | Zeigt | Erwartet | Art · wenn nicht |
|---|---|---|---|
| P1 | Vorgänge, die heute festhängen (Übersicht) | beliebig | INFO. Die genaue Wirkung zeigt M-V4a. |
| P2 | Stellenangaben über 200 Zeichen je Status | `ueber_200 = 0` | ENTSCHEIDUNG. Offene Formulare melden dann „Bitte maximal 200 Zeichen.“ |
| P3 | Gespeicherte Vorlagen (Kurzform) | – | Ausführlich in MAIL1 |
| P4 | Webhooks auf `offboarding-*` | – | Ausführlich in MAIL3 |
| P5 | Abteilungen | – | wie M-V5d |

### 2.4 Freigabe

Deployt wird erst, wenn **alle STOPP-Prüfungen** stimmen **und** Claude die
ENTSCHEIDUNGS-Punkte mit Ihnen durchgegangen ist.

---

## 3 · Deploy

Das ist der bewährte Ablauf vom 07.09. (`deploy-dokumentenpaket-2026-09-07.md:79-81`),
diesmal in Einzelschritte zerlegt. Dazwischen stehen zwei zusätzliche Netze: die
Vorschau in 3.3 und die eigene Sicherung in 3.4.

Wer beide Netze nicht will, kann 3.2 bis 3.5 durch den Befehl vom 07.09. ersetzen,
`sudo docker compose up -d --build`. Dann fehlen aber die Vorschau und die
Sicherung mit passender `psql`-Version für den Rückfall.

### 3.1 Code holen

```bash
cd /vol/container/HR_Portal_CREDO
git fetch origin && git checkout main && git pull
git log -1 --oneline
git diff --stat 7bc91ec HEAD -- . ':!docs'
```

**Erwartet:**
- `git log` zeigt `7bc91ec fix: Befunde der Code-Review vor dem Deploy`. Ein neuerer
  Commit ist auch in Ordnung, etwa der, der dieses Dokument enthält.
- Der letzte Befehl gibt **nichts** aus. Nach `7bc91ec` kam also nur Doku.

**Wenn nicht:** Meldet `git pull` einen Konflikt, oder gibt der letzte Befehl Dateien
außerhalb von `docs/` aus: **STOPP, an Claude.** Dieser Plan beschreibt dann nicht
mehr den Stand, der ausgerollt würde.

### 3.2 Image bauen (das Portal läuft weiter)

```bash
sudo docker compose build app
```

Erwartet: Der Build endet ohne `ERROR`. Der alte Container läuft dabei unverändert
weiter. Die `npm ci`-Schicht kommt aus dem Cache, weil sich `package*.json` nicht
geändert hat (`Dockerfile:9-10`). `prisma generate` läuft neu, weil sich `prisma/`
geändert hat (`Dockerfile:12-13`).

### 3.3 Vorschau: Was `db push` gleich tun wird (nur lesend)

```bash
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script' > ~/deploy-7bc91ec/vorschau-delta.sql
V=~/deploy-7bc91ec/vorschau-delta.sql
for m in 'ADD COLUMN' 'ADD VALUE' 'CREATE TABLE' 'INDEX' 'ADD CONSTRAINT'; do printf '%-15s %s\n' "$m" "$(grep -c "$m" "$V")"; done
grep -nE 'DROP|RENAME|ALTER COLUMN .* TYPE' "$V"
```

**Erwartet:**

```
ADD COLUMN      23
ADD VALUE       4
CREATE TABLE    1
INDEX           3
ADD CONSTRAINT  2
<Nr>:ALTER COLUMN "offboardingId" DROP NOT NULL;
```

Die letzte Zeile muss genau einmal kommen, ihre Nummer ist egal.

**Beleg:**
- Genau diese Zählung ergibt das Delta, das `prisma migrate diff` aus altem und neuem
  Schema erzeugt.
- Dieselbe Zählung ergibt der Vergleich einer Probedatenbank mit altem Schema gegen
  das neue Schema. Dort stehen die Anweisungen nur in anderer Reihenfolge, sortiert
  sind sie gleich.
- Der Befehl stammt aus der Schema-Analyse zu diesem Deploy. Auf dem Server wurde er
  **nicht geprobt**.

**Wenn nicht:**
- Weicht eine Zahl ab, oder erscheint eine weitere `DROP`/`RENAME`/`TYPE`-Zeile:
  **STOPP, nicht starten.** Die Datei `vorschau-delta.sql` an Claude schicken. Das
  Portal läuft ja noch mit dem alten Container.
- Scheitert der Befehl selbst, kommt also eine Fehlermeldung statt SQL: an Claude.
  Die Drift-Prüfungen S-V2 bis S-V5 und 1.7 decken dasselbe ab. Ohne Vorschau geht es
  aber nur nach Rücksprache weiter.

### 3.4 Portal anhalten, eigene Sicherung anlegen

```bash
sudo docker compose stop app
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-deploy-7bc91ec-manuell.sql'
sudo ls -l backups/vor-deploy-7bc91ec-manuell.sql
sudo grep -c 'PostgreSQL database dump complete' backups/vor-deploy-7bc91ec-manuell.sql
```

**Ab hier ist das Portal offline.** Warum diese zweite Sicherung neben der des
Entrypoints:

- **Gleiche Version:** Sie entsteht mit `pg_dump` aus dem DB-Container, also derselben
  Version wie das `psql`, das sie im Rückfall einspielt. Genau diese Kombination
  (postgres:16-alpine, `--schema=public`, einspielen nach `DROP SCHEMA public CASCADE`)
  wurde auf einer Wegwerf-Datenbank geprobt.
- **Kein Wegräumen:** Ihr Name fällt nicht unter die Rotation des Entrypoints. Die
  erfasst nur `vor-schema-abgleich-*.sql` (`entrypoint.sh:111`).

**Erwartet:**
- Die Größe liegt in der Gegend von 1,4 MB oder darüber (07.09.: 1 389 174 Bytes).
- `grep` meldet `1`.

**Wenn nicht:** Ist die Datei deutlich kleiner als 1 MB oder meldet `grep` `0`:
**STOPP.** Mit `sudo docker compose start app` läuft das alte Portal wieder, dann an
Claude.

### 3.5 Starten

```bash
sudo docker compose up -d
sudo docker compose logs -f app
```

`Strg+C` beendet nur die Anzeige, nicht den Container.

### 3.6 Was im Log erscheinen MUSS

In dieser Reihenfolge, `…` steht für Zahlen und Namen:

```
CREDO HR-Portal startet...
Umgebungsvariablen geprueft: OK
Schema-Unterschied erkannt — Sicherung wird angelegt...
Sicherung abgelegt: /backups/vor-schema-abgleich-JJJJMMTT-HHMMSS.sql (… Bytes)
Datenbank-Schema wird synchronisiert...
⚠️  There might be data loss when applying the changes:
  • A unique constraint covering the columns `[onboardingId,departmentKey]` on the table `offboarding_department_links` will be added. If there are existing duplicate values, this will fail.
🚀  Your database is now in sync with your Prisma schema. Done in …
Datenbank-Schema synchronisiert.
Pruefe ob Seed notwendig...
System-Vorlage (Fuehrungszeugnis) ist aktuell.
Masernschutz-Schritt aktiviert in: …; laufende Vorgaenge nachgezogen: ….
Kostenstellen-Migration: … von … uebernommen (ohne Anteil: …, Anteil ungleich 100: …, leere Bezeichnung uebersprungen: …).
Vertragsende-Label "Stellenbezeichnung": … von … Mandanten angepasst.
Onboarding parallele Spuren: … von … Vorgaengen korrigiert (davon festhaengend geheilt: …).
Onboarding-Abteilungsaufgaben (ONBOARDING_ABTEILUNGSAUFGABEN_V1): … Vorlagenpunkte und … Aufgaben auf Schluessel umgestellt, … Aufgaben mit Tagesangabe (davon ueber den Titel: …).
Datenbank bereits geseeded (… User vorhanden). Seed uebersprungen.
Next.js Server startet auf Port 3000...
✓ Ready in …
```

**Erläuterungen zu den Zeilen:**

- **Schema-Teil:** Die Zeilen stehen in `entrypoint.sh:9, 36, 71, 107, 118, 120, 124, 130`.
  Der Zeitstempel im Dateinamen der Sicherung ist UTC, denn der Container läuft in UTC.
- **Statt der dritten Zeile können zwei andere kommen**, beide gehören zu 3.7:
  - `Schema-Vergleich nicht moeglich (Status 1) — Sicherung vorsichtshalber.`
    (`entrypoint.sh:73`). Sicherung und Push laufen trotzdem weiter.
  - `Datenbank-Schema ist bereits deckungsgleich — kein Abgleich noetig.`
    (`entrypoint.sh:68`). Dann fehlen Sicherung und Push. Bei **jedem späteren**
    Neustart ist das die normale Zeile. Beim **ersten** Start des neuen Images darf
    sie nicht kommen, denn S-V2 bis S-V5 und 3.3 haben ein offenes Delta gezeigt.
- **Warnung:** Der Warnungstext stammt aus dem Probelauf, es ist **genau diese eine**
  Warnung. Sie ist der angekündigte Text von `--accept-data-loss` (wie am 07.09.,
  Protokoll :102-106). Entscheidend ist die Zeile darunter.
  - `onboardingId` ist neu und überall leer.
  - Leere Werte gelten im Unique-Index als verschieden, Duplikate sind also
    unmöglich.
- **Weitere Zeilen, die ohne Bedeutung sind:**
  - Prisma kann vor der Warnung eigene Zeilen ausgeben.
  - Möglich ist ein Kasten „Update available …“.
  - Gibt es mehr als zehn alte Sicherungen, kommt `Alte Sicherung entfernt: …`
    (`entrypoint.sh:111-116`).
- **Migrations-Zeilen:** Ihr Wortlaut steht in `seed-check.js:751-760, 1036, 1062-1074,
  1222-1225, 1504-1511, 1794-1799, 1844-1846`. Erlaubte Abweichungen:
  - Masernschutz: `Masernschutz-Schritt war bereits ueberall aktiv.`, auch mit dem
    Zusatz `Kein Merker wegen: …`, wenn M-V1a „UEBERSPRUNGEN“ zeigte.
  - Kostenstellen: `Kostenstellen-Migration: nichts zu tun, Merker gesetzt.`
  - Vertragsende-Label: davor Zeilen `Vertragsende-Label bleibt: …` für Mandanten mit
    eigenem Label.
- **Warnzeilen, die kommen dürfen**, dann aber an Claude gehen:
  - `Onboarding parallele Spuren: geprueft/abgeschlossen ohne abgesendeten Fragebogen (nicht geaendert): …`
    (`seed-check.js:1514-1517`)
  - `Onboarding-Abteilungsaufgaben: unbekannte Zustaendigkeiten (nicht geaendert, bitte unter Checklisten-Vorlagen zuordnen): …`
    (`seed-check.js:1801-1806`)
  - `Masernschutz uebersprungen: Vorlage … hat keine Schrittliste.` (`seed-check.js:681-685`)
    und `Masernschutz-Schritt: nichts zu tun, aber Vorlagen ohne Schrittliste (…)` (`:742-746`)
- **Stille alte Migrationen:** Die alten Migrationen und die Betriebsnummern bleiben
  stumm, denn ihre Merker sind gesetzt (M-V0).

**Log sichern und die Migrationszeilen herausziehen:** Der Filter stammt aus der
SQL-Probe und ist gegen das Probe-Log getestet.

```bash
sudo docker compose logs --no-log-prefix app > ~/deploy-7bc91ec/start-log.txt
sudo docker compose logs app | grep -E 'System-Vorlage|Masernschutz|Betriebsnummern|Kostenstellen|Vertragsende-Label|parallele Spuren|Abteilungsaufgaben|MINIJOB|currentStep|Fehler|fehlgeschlagen|geseeded|Seed'
```

> **Ergebnis an Claude schicken:** `start-log.txt`, bei jedem Deploy.

### 3.7 Woran man einen Fehlschlag erkennt, und was dann sofort zu tun ist

| Zeichen im Log | Bedeutung | Sofort |
|---|---|---|
| `Datenbank-Schema ist bereits deckungsgleich — kein Abgleich noetig.` beim **ersten** Start | Das gestartete Image kennt das neue Schema nicht, vermutlich läuft noch das alte Image, etwa weil der Build in 3.2 gescheitert ist (`entrypoint.sh:67-68`). Die Datenbank ist unverändert. | an Claude, mit `start-log.txt` und der Ausgabe von `sudo docker compose images app` |
| `Schema-Vergleich nicht moeglich (Status …) — Sicherung vorsichtshalber.` | `prisma migrate diff` konnte nicht vergleichen (`entrypoint.sh:72-74`). Der Entrypoint sichert und pusht trotzdem. | an Claude, mit `start-log.txt`. Solange keine Neustart-Schleife entsteht, nicht eingreifen. |
| `FATAL: Sicherungsverzeichnis /backups fehlt.` | Die Einhängung fehlt (`entrypoint.sh:76-85`). Die Datenbank ist unverändert. | an Claude |
| `FATAL: Sicherung nach … fehlgeschlagen.` | Rechte auf `backups/` (`entrypoint.sh:98-105`). Die Datenbank ist unverändert. | `sudo chown 1001 backups`. Der Container startet von selbst neu (`restart: unless-stopped`, `docker-compose.yml:15`). |
| Nach `Datenbank-Schema wird synchronisiert...` kommt eine Prisma-Fehlermeldung statt `…synchronisiert.`, und `sudo docker compose ps` zeigt `Restarting` | Der Push ist gescheitert, der Container hängt in einer Neustart-Schleife. | **Sofort** `sudo docker compose stop app`. Jeder Neustart legt eine neue Sicherung an, und nach zehn Neustarts ist die Sicherung vom Deploy weggeräumt (`entrypoint.sh:111-116`). Danach an Claude. |
| `… fehlgeschlagen: …` einer Migration, `Seed-Check Fehler:` oder `System-Vorlage-Seed Fehler` | Die Migration ist nicht gelaufen, der Start geht trotzdem weiter (`entrypoint.sh:125`). | an Claude. Ohne Merker läuft sie beim nächsten Start erneut. |
| `Seed-Check fehlgeschlagen (nicht kritisch).` | `node prisma/seed-check.js` ist mit Fehler ausgestiegen (`entrypoint.sh:125`). Fehler einzelner Migrationen fängt die Datei selbst ab (`seed-check.js:1848-1851`), diese Zeile heißt also: Das Skript selbst ist abgebrochen, womöglich lief **keine** der fünf Migrationen. Der Server startet trotzdem. | an Claude, mit `start-log.txt`. M-N0 zeigt, welche Merker fehlen. |
| Kein `✓ Ready`, oder der Health-Check (4.1) meldet einen Fehler | Die App startet nicht. | an Claude, mit `start-log.txt` |

### 3.8 Die Sicherung des Entrypoints aus der Rotation nehmen

Direkt nach dem Start:

```bash
sudo sh -c 'cd /vol/container/HR_Portal_CREDO/backups && cp -p "$(ls -1t vor-schema-abgleich-*.sql | head -1)" vor-deploy-7bc91ec-entrypoint.sql && ls -l vor-deploy-7bc91ec-*.sql'
```

Erwartet sind zwei Dateien, `…-entrypoint.sql` und `…-manuell.sql`, fast gleich groß.
Kleine Unterschiede können von verschiedenen `pg_dump`-Versionen kommen.

---

## 4 · NACHHER-Prüfungen

**Reihenfolge nach dem Start:** 3.8 → 4.1 Health → **5.1 PFLICHT-Handschritte** →
4.2 SQL NACHHER → 4.3 und 4.4 → 5.2 und 5.3. Die PFLICHT-Resets kommen vor die
SQL-Prüfung, weil die öffentlichen Links vom ersten Moment an Mails auslösen können
(5.1).

### 4.1 Health

```bash
sudo docker compose ps
sudo docker exec hr-portal-app curl -s http://localhost:3000/api/health
curl -s https://hr.fes-credo.de/api/health
```

Erwartet:
- `app` steht auf `(healthy)`. Das kann gut eine Minute dauern: 40 s Anlaufzeit,
  dann alle 30 s eine Prüfung (`docker-compose.yml:24-29`).
- Beide Aufrufe liefern `{"status":"ok","timestamp":"…"}` (`src/app/api/health/route.ts:13`).
- `{"status":"error",…}` mit 503 heißt: keine Verbindung zur Datenbank. Dann an Claude.

### 4.2 SQL NACHHER (gegen das neue Schema `7bc91ec`)

Die Datei hat 26 Abfragen. Die ersten 25 sind die getestete Endfassung. Sie liefen
gegen eine Probedatenbank mit neuem Schema, einmal vor und einmal nach
`seed-check.js`: jeweils Exit 0, 25 von 25. B-N6 am Ende kam mit der Gegenprüfung
dazu, ist dieselbe Abfrage wie B-B10 und lief lesend gegen die Dev-Datenbank: ganze
Datei Exit 0, 26 von 26.

**Vor dem Deploy ausgeführt bricht die Datei ab**, und zwar bei S-N2 mit Exit 3. Das
ist gewollt: Diese Abfragen kennen Spalten, die es vorher noch nicht gibt.

**Datei anlegen, Variante 1 (ohne Einfügen):**

```bash
cd /vol/container/HR_Portal_CREDO
git show HEAD:docs/historie/deploy-onboarding-pakete-2026-09.md \
  | awk '/^cat > ~\/deploy-7bc91ec\/nachher-alle.sql/{f=1;next} /^ENDE_SQL$/{f=0} f' > ~/deploy-7bc91ec/nachher-alle.sql
```

**Variante 2 (Einfügen):**

```bash
set +H
cat > ~/deploy-7bc91ec/nachher-alle.sql <<'ENDE_SQL'
-- =====================================================================
-- NACHHER (Schema 7bc91ec, NACH dem Start des neuen Containers) - NUR LESEND.
-- Getestet am 24.09.2026 mit psql 16 (ON_ERROR_STOP=1) gegen eine Wegwerf-DB mit
-- neuem Schema 7bc91ec (altes Schema + delta.sql) und lesend gegen die Dev-DB.
-- B-N6 (am Ende) kam mit der Gegenpruefung dazu: nur lesend gegen die Dev-DB getestet.
-- Aufruf auf dem Server (Datei im Projektordner, Ausgabe in eine Datei):
--   sudo docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db \
--     psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 < nachher-alle.sql > nachher-ergebnis.txt 2>&1
-- Tabellen snake_case (@@map), Spalten "camelCase" (kein Spalten-@map im Schema).
-- =====================================================================
SET default_transaction_read_only = on;
\pset pager off
\x auto

-- ---------------------------------------------------------------------
-- Schema-Delta: Kontrolle und Rueckfall-Zaehlung (abfragen.sql N1, N2, R1)
-- ---------------------------------------------------------------------
\echo '== NACHHER S-N1'
SELECT (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = 'public' AND (table_name::text, column_name::text) IN (VALUES ('onboarding_processes','supervisorLinkSentAt'),('personal_data','arbeitserlaubnisGueltigBis'),('personal_data','aufenthaltstitelErforderlich'),('personal_data','aufenthaltstitelGueltigBis'),('personal_data','healthInsuranceMembership'),('supervisor_data','kostenstellenBemerkung'),('documents','ablaufErinnertAm'),('documents','ablaufErinnertStufe'),('documents','gueltigBis'),('checklist_template_items','description'),('checklist_items','abteilungKommentar'),('checklist_items','abteilungKommentarAm'),('checklist_items','description'),('checklist_items','relativeDueDays'),('offboarding_processes','supervisorEmail'),('offboarding_processes','supervisorName'),('offboarding_checklist_items','abteilungKommentar'),('offboarding_checklist_items','abteilungKommentarAm'),('offboarding_department_links','lastSendDetail'),('offboarding_department_links','lastSendStatus'),('offboarding_department_links','lastSentAt'),('offboarding_department_links','onboardingId'),('offboarding_department_links','zugestelltAn'))) AS neue_spalten, (SELECT is_nullable::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offboarding_department_links' AND column_name = 'offboardingId') AS offboarding_id_nullable, (SELECT COUNT(1) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE (t.typname = 'DocumentType' AND e.enumlabel IN ('AUFENTHALTSTITEL','ARBEITSERLAUBNIS','PKV_NACHWEIS')) OR (t.typname = 'DocumentStatus' AND e.enumlabel = 'EXPIRED')) AS neue_enum_werte;
\echo '== NACHHER S-N2'
SELECT (SELECT COUNT(1) FROM offboarding_department_links WHERE ("offboardingId" IS NULL) = ("onboardingId" IS NULL)) AS verletzt_xor, (SELECT COUNT(1) FROM (SELECT "onboardingId", "departmentKey" FROM offboarding_department_links WHERE "onboardingId" IS NOT NULL GROUP BY 1, 2 HAVING COUNT(1) > 1) d) AS onboarding_duplikate;
\echo '== NACHHER S-R1'
SELECT 'onboarding_processes.supervisorLinkSentAt' AS was, COUNT(1) AS anzahl FROM onboarding_processes WHERE "supervisorLinkSentAt" IS NOT NULL UNION ALL SELECT 'personal_data.aufenthalt/arbeitserlaubnis/kk-mitgliedschaft', COUNT(1) FROM personal_data WHERE "aufenthaltstitelErforderlich" IS NOT NULL OR "aufenthaltstitelGueltigBis" IS NOT NULL OR "arbeitserlaubnisGueltigBis" IS NOT NULL OR "healthInsuranceMembership" IS NOT NULL UNION ALL SELECT 'supervisor_data.kostenstellenBemerkung', COUNT(1) FROM supervisor_data WHERE "kostenstellenBemerkung" IS NOT NULL UNION ALL SELECT 'supervisor_kostenstellen (Zeilen)', COUNT(1) FROM supervisor_kostenstellen UNION ALL SELECT 'documents.gueltigBis/ablaufErinnert*', COUNT(1) FROM documents WHERE "gueltigBis" IS NOT NULL OR "ablaufErinnertAm" IS NOT NULL OR "ablaufErinnertStufe" IS NOT NULL UNION ALL SELECT 'checklist_template_items.description', COUNT(1) FROM checklist_template_items WHERE description IS NOT NULL UNION ALL SELECT 'checklist_items.description/relativeDueDays/abteilungKommentar', COUNT(1) FROM checklist_items WHERE description IS NOT NULL OR "relativeDueDays" IS NOT NULL OR "abteilungKommentar" IS NOT NULL UNION ALL SELECT 'offboarding_processes.supervisorEmail/Name', COUNT(1) FROM offboarding_processes WHERE "supervisorEmail" IS NOT NULL OR "supervisorName" IS NOT NULL UNION ALL SELECT 'offboarding_checklist_items.abteilungKommentar', COUNT(1) FROM offboarding_checklist_items WHERE "abteilungKommentar" IS NOT NULL UNION ALL SELECT 'offboarding_department_links.lastSent*/zugestelltAn', COUNT(1) FROM offboarding_department_links WHERE "lastSentAt" IS NOT NULL OR "lastSendStatus" IS NOT NULL OR "zugestelltAn" IS NOT NULL UNION ALL SELECT 'BLOCKER: Onboarding-Links (offboardingId NULL)', COUNT(1) FROM offboarding_department_links WHERE "offboardingId" IS NULL UNION ALL SELECT 'BLOCKER: documents.type neu', COUNT(1) FROM documents WHERE type::text IN ('AUFENTHALTSTITEL','ARBEITSERLAUBNIS','PKV_NACHWEIS') UNION ALL SELECT 'BLOCKER: form_templates.requiredDocuments neu', COUNT(1) FROM form_templates WHERE "requiredDocuments"::text[] && ARRAY['AUFENTHALTSTITEL','ARBEITSERLAUBNIS','PKV_NACHWEIS'] UNION ALL SELECT 'BLOCKER: Status EXPIRED (documents + offboarding_documents)', (SELECT COUNT(1) FROM documents WHERE status::text = 'EXPIRED') + (SELECT COUNT(1) FROM offboarding_documents WHERE status::text = 'EXPIRED');

-- ---------------------------------------------------------------------
-- Einmalige Migrationen: Kontrolle (migrationen-nachher.sql)
-- ---------------------------------------------------------------------
\echo '== NACHHER M-N0'
SELECT name, "appliedAt"
FROM system_migrations
WHERE name IN ('FORMTEMPLATE_MASERNSCHUTZ_V1', 'KOSTENSTELLEN_AUFTEILUNG_V1',
               'VERTRAGSENDE_LABEL_STELLENBEZEICHNUNG_V1', 'ONBOARDING_PARALLELE_SPUREN_V1',
               'ONBOARDING_ABTEILUNGSAUFGABEN_V1')
ORDER BY "appliedAt";
\echo '== NACHHER M-N0b'
SELECT name, jsonb_pretty(details) AS details
FROM system_migrations
WHERE name IN ('FORMTEMPLATE_MASERNSCHUTZ_V1', 'KOSTENSTELLEN_AUFTEILUNG_V1',
               'VERTRAGSENDE_LABEL_STELLENBEZEICHNUNG_V1', 'ONBOARDING_PARALLELE_SPUREN_V1',
               'ONBOARDING_ABTEILUNGSAUFGABEN_V1')
ORDER BY "appliedAt";
\echo '== NACHHER M-N1'
SELECT "questionnaireType" AS vorlage_ohne_aktiven_schritt_9
FROM form_templates
WHERE "stepsConfig" IS NULL OR jsonb_typeof("stepsConfig") <> 'array'
   OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof("stepsConfig") = 'array' THEN "stepsConfig" ELSE '[]'::jsonb END) e
                  WHERE e->'step' = '9'::jsonb AND e->'enabled' = 'true'::jsonb);
\echo '== NACHHER M-N1-2'
SELECT "displayId" AS laufend_ohne_schritt_9, "questionnaireType", status
FROM onboarding_processes
WHERE status IN ('INVITED', 'IN_PROGRESS')
  AND jsonb_typeof("formTemplateSnapshot") = 'array'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof("formTemplateSnapshot") = 'array' THEN "formTemplateSnapshot" ELSE '[]'::jsonb END) e
                  WHERE e->'step' = '9'::jsonb AND e->'enabled' = 'true'::jsonb);
\echo '== NACHHER M-N2a'
SELECT count(1) AS ohne_aufteilung
FROM supervisor_data sd
WHERE regexp_replace(COALESCE(sd.kostenstelle, ''), '^\s+|\s+$', '', 'g') <> ''
  AND NOT EXISTS (SELECT 1 FROM supervisor_kostenstellen k WHERE k."supervisorDataId" = sd.id);
\echo '== NACHHER M-N2b'
SELECT op."displayId", op.status, count(1) AS zeilen,
       round(sum(round((k.anteil * 100)::numeric)) / 100, 2) AS summe_prozent
FROM supervisor_kostenstellen k
JOIN supervisor_data sd      ON sd.id = k."supervisorDataId"
JOIN onboarding_processes op ON op.id = sd."onboardingId"
GROUP BY 1, 2
HAVING sum(round((k.anteil * 100)::numeric)) <> 10000
ORDER BY 1;
\echo '== NACHHER M-N3'
SELECT o."mandantNumber", o.name, e->>'label' AS label
FROM organizations o
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(o."contractEndFieldConfig") = 'array' THEN o."contractEndFieldConfig" ELSE '[]'::jsonb END) e
WHERE e->>'name' = 'stellenbeschreibung'
  AND regexp_replace(e->>'label', '^\s+|\s+$', '', 'g') = 'Stellenbeschreibung';
\echo '== NACHHER M-N4'
WITH v AS (
  SELECT op."displayId", op.status::text AS status,
         (op."submittedAt" IS NOT NULL OR COALESCE(pd."isComplete", false))           AS ma_abgesendet,
         (op."supervisorSubmittedAt" IS NOT NULL OR COALESCE(sd."isComplete", false)) AS vg_abgesendet,
         COALESCE(op."supervisorToken", '') <> ''                                     AS vg_link,
         COALESCE(pd."currentStep", 0)                                                AS schritt
  FROM onboarding_processes op
  LEFT JOIN personal_data   pd ON pd."onboardingId" = op.id
  LEFT JOIN supervisor_data sd ON sd."onboardingId" = op.id
), s AS (
  SELECT v.*,
         CASE
           WHEN status IN ('REVIEWED', 'COMPLETED', 'EXPIRED') THEN status
           WHEN ma_abgesendet AND vg_abgesendet THEN 'SUPERVISOR_SUBMITTED'
           WHEN ma_abgesendet AND vg_link       THEN 'SUPERVISOR_PENDING'
           WHEN ma_abgesendet                   THEN 'SUBMITTED'
           WHEN status = 'IN_PROGRESS' OR schritt > 0 THEN 'IN_PROGRESS'
           ELSE 'INVITED'
         END AS soll
  FROM v
)
SELECT "displayId", status AS ist, soll
FROM s
WHERE status <> soll
ORDER BY 1;
\echo '== NACHHER M-N4b'
SELECT h->>'displayId' AS vorgang, h->>'status' AS status
FROM system_migrations, jsonb_array_elements(details->'hrOhneAbgabe') h
WHERE name = 'ONBOARDING_PARALLELE_SPUREN_V1';
\echo '== NACHHER M-N5a'
WITH w AS (
  SELECT 'Aufgabe' AS art, assignee AS alt FROM checklist_items WHERE assignee IS NOT NULL
  UNION ALL
  SELECT 'Vorlagenpunkt', cti."defaultAssignee"
  FROM checklist_template_items cti
  JOIN checklist_templates ct ON ct.id = cti."templateId"
  WHERE regexp_replace(ct.name, '^\s+', '') NOT LIKE 'Offboarding:%'
    AND cti."defaultAssignee" IS NOT NULL
), t AS (
  SELECT art, alt, regexp_replace(alt, '^\s+|\s+$', '', 'g') AS roh FROM w
), n AS (
  SELECT art, alt, roh,
         btrim(regexp_replace(replace(replace(replace(replace(lower(roh), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
                              '[^a-z0-9]+', ' ', 'g')) AS n
  FROM t
), m AS (
  SELECT art, alt,
         CASE
           WHEN roh = '' THEN NULL
           WHEN roh ~ '^[A-Z][A-Z0-9_]{1,29}$' THEN roh
           WHEN n = '' THEN NULL
           WHEN split_part(n, ' ', 1) = 'hr' OR n LIKE 'personal%' THEN 'HR'
           WHEN split_part(n, ' ', 1) = 'it' OR n LIKE 'edv%' THEN 'IT'
           WHEN n LIKE 'verw%' OR n LIKE '%sekretariat%' THEN 'VERWALTUNG'
           WHEN n LIKE 'vorgesetzt%' OR n LIKE '%fuehrungskraft%' OR n ~ 'leitung( |$)' THEN 'VORGESETZTER'
           WHEN n LIKE 'facility%' OR n LIKE '%hausmeister%' OR n LIKE '%haustechnik%' THEN 'FACILITY'
           WHEN n LIKE '%buchhaltung%' THEN 'BUCHHALTUNG'
           WHEN n LIKE 'datenschutz%' OR split_part(n, ' ', 1) = 'dsb' THEN 'DSB'
           WHEN n LIKE 'mitarbeit%' OR n LIKE 'beschaeftigt%' THEN 'MITARBEITER'
         END AS neu
  FROM n
)
SELECT art, '"' || alt || '"' AS noch_freitext, neu, count(1) AS anzahl
FROM m
WHERE neu IS NOT NULL AND neu <> alt
GROUP BY 1, 2, 3
ORDER BY 1, 2;
\echo '== NACHHER M-N5b'
SELECT assignee, count(1) AS aufgaben,
       assignee IN ('HR','IT','VERWALTUNG','FACILITY','BUCHHALTUNG','VORGESETZTER','MITARBEITER','DSB') AS standard
FROM checklist_items
GROUP BY 1
ORDER BY standard, 1;
\echo '== NACHHER M-N5c'
SELECT u->>'text' AS zustaendigkeit, u->>'vorlagenPunkte' AS vorlagenpunkte, u->>'aufgaben' AS aufgaben
FROM system_migrations, jsonb_array_elements(details->'unbekannt') u
WHERE name = 'ONBOARDING_ABTEILUNGSAUFGABEN_V1';
\echo '== NACHHER M-N5d'
SELECT count(1) AS ohne_tage_trotz_quelle
FROM checklist_items ci
JOIN onboarding_processes op ON op.id = ci."onboardingId"
LEFT JOIN checklist_template_items p ON p.id = ci."templateItemId"
WHERE ci."relativeDueDays" IS NULL
  AND (   (p.id IS NOT NULL AND p."defaultDueDays" IS NOT NULL)
       OR (p.id IS NULL AND op."checklistTemplateId" IS NOT NULL AND EXISTS (
             SELECT 1 FROM checklist_template_items q
             WHERE q."templateId" = op."checklistTemplateId"
               AND regexp_replace(q.title, '^\s+|\s+$', '', 'g') = regexp_replace(ci.title, '^\s+|\s+$', '', 'g')
               AND q."defaultDueDays" IS NOT NULL)));
\echo '== NACHHER M-N5e'
SELECT count(1) FILTER (WHERE "relativeDueDays" IS NOT NULL) AS mit_tagen,
       count(1) FILTER (WHERE "relativeDueDays" IS NOT NULL AND "dueDate" IS NULL) AS davon_noch_ohne_datum,
       count(1) FILTER (WHERE "relativeDueDays" IS NULL) AS ohne_tage
FROM checklist_items;

-- ---------------------------------------------------------------------
-- Mail-Vorlagen (wie VORHER)
-- ---------------------------------------------------------------------
\echo '== NACHHER MAIL1'
WITH betroffen(event, einstufung, kennzeichen_neu) AS (
  VALUES
    ('supervisor-completed',                'PFLICHT-Reset',  '{{#fragebogen_eingereicht}}'),
    ('questionnaire-completed',             'PFLICHT-Reset',  '{{#modalitaeten_eingereicht}}'),
    ('supervisor-link-created',             'PFLICHT-Reset',  'Bitte ausfüllen bis'),
    ('contract-end-supervisor-link',        'PFLICHT-Reset',  'Jetzt entscheiden'),
    ('offboarding-completed',               'PFLICHT-Reset',  '{{#offene_aufgaben_beim_abschluss}}'),
    ('offboarding-department-assigned',     'EMPFOHLEN',      '{{aufgabenliste_html}}'),
    ('offboarding-reminder',                'EMPFOHLEN',      '{{#ist_ueberfaellig}}'),
    ('offboarding-task-completed',          'EMPFOHLEN',      '{{#kommentar}}'),
    ('offboarding-department-completed',    'EMPFOHLEN',      'Alle Ihre Aufgaben sind erledigt'),
    ('psi-deadline-warning',                'EMPFOHLEN',      '{{warnungen_liste_html}}'),
    ('onboarding-created',                  'EMPFOHLEN',      '{{#vorname}}'),
    ('employee-reminder',                   'EMPFOHLEN',      'Hallo{{#vorname}}'),
    ('supervisor-reminder',                 'egal',           'Einstellungsmodalitäten ausstehend'),
    ('offboarding-created',                 'egal',           'Für <strong>{{vorname}}'),
    ('questionnaire-confirmation-employee', 'Empfaenger/Aktiv pruefen', NULL),
    ('onboarding-department-assigned',      'NEU',            NULL),
    ('onboarding-department-reminder',      'NEU',            NULL),
    ('onboarding-task-completed',           'NEU (An-Feld!)', NULL),
    ('onboarding-department-completed',     'NEU',            NULL),
    ('dokument-ablauf-warnung',             'NEU (An-Feld!)', NULL),
    ('dokument-abgelaufen',                 'NEU (An-Feld!)', NULL)
)
SELECT b.event,
       b.einstufung,
       (t.id IS NOT NULL)                       AS gespeichert,
       t."isActive",
       t."recipientTo",
       t."recipientCc",
       t."recipientBcc",
       t."recipientReplyTo",
       t."updatedAt",
       CASE
         WHEN t.id IS NULL                            THEN 'keine Zeile: Code-Default gilt'
         WHEN b.kennzeichen_neu IS NULL               THEN '-'
         WHEN strpos(t."bodyHtml", b.kennzeichen_neu) > 0 THEN 'neuer Text schon drin'
         ELSE 'ALTER TEXT: nach Deploy zuruecksetzen'
       END                                      AS textstand,
       left(t.subject, 100)                     AS betreff_gespeichert
FROM betroffen b
LEFT JOIN email_templates t ON t.event = b.event
ORDER BY (t.id IS NULL), b.einstufung, b.event;

-- ---------------------------------------------------------------------
-- HR-interne Events ohne An-Feld (wie VORHER)
-- ---------------------------------------------------------------------
\echo '== NACHHER MAIL2'
WITH hr_intern(event, neu_im_deploy) AS (
  VALUES
    ('onboarding-task-completed', true), ('dokument-ablauf-warnung', true), ('dokument-abgelaufen', true),
    ('questionnaire-completed', false), ('supervisor-completed', false),
    ('offboarding-created', false), ('offboarding-task-completed', false),
    ('offboarding-task-overdue', false), ('offboarding-completed', false),
    ('psi-created', false), ('psi-phase-completed', false), ('psi-deadline-warning', false),
    ('psi-assessment-completed', false),
    ('elternzeit-angelegt', false), ('elternzeit-antrag-eingereicht', false),
    ('elternzeit-leiter-genehmigt', false), ('elternzeit-leiter-abgelehnt', false),
    ('elternzeit-vbl-generiert', false), ('elternzeit-ag-bescheinigung-generiert', false),
    ('elternzeit-br-detmold-generiert', false), ('elternzeit-br-genehmigung-eingegangen', false),
    ('elternzeit-frist-eskaliert', false),
    ('mutterschutz-angelegt', false), ('mutterschutz-bad-beauftragt', false),
    ('mutterschutz-bad-abgeschlossen', false), ('mutterschutz-aktiviert', false),
    ('mutterschutz-beendet', false),
    ('contract-end-created', false), ('contract-end-eskalation', false),
    ('contract-end-unbearbeitet', false)
),
skips AS (
  SELECT event, COUNT(1) AS skipped_90_tage, max("createdAt") AS letzter_skip
  FROM email_logs
  WHERE status = 'SKIPPED' AND "isTest" = false
    AND detail LIKE 'Kein Empfaenger konfiguriert%'
    AND "createdAt" > now() - interval '90 days'
  GROUP BY event
)
SELECT h.event,
       h.neu_im_deploy,
       (t.id IS NOT NULL)                              AS gespeichert,
       t."isActive",
       NULLIF(t."recipientTo", '')                     AS an_feld,
       CASE WHEN coalesce(t."recipientTo", '') = '' THEN 'KEIN AN-FELD -> SKIPPED'
            WHEN t."isActive" = false               THEN 'deaktiviert -> SKIPPED'
            ELSE 'ok' END                              AS ergebnis,
       coalesce(s.skipped_90_tage, 0)                  AS skipped_ohne_empfaenger_90_tage,
       s.letzter_skip
FROM hr_intern h
LEFT JOIN email_templates t ON t.event = h.event
LEFT JOIN skips s           ON s.event = h.event
ORDER BY h.neu_im_deploy DESC, (coalesce(t."recipientTo", '') = '') DESC, h.event;

-- ---------------------------------------------------------------------
-- Webhooks (wie VORHER)
-- ---------------------------------------------------------------------
\echo '== NACHHER MAIL3'
SELECT w.event,
       w.name,
       w.url,
       w."isActive",
       w."authType",
       w."updatedAt",
       CASE
         WHEN w.event = 'questionnaire-confirmation-employee'
           THEN 'NEU: lief bisher an triggerWebhooks vorbei (sendEmail direkt) -> feuert jetzt'
         WHEN w.event IN ('onboarding-department-assigned','onboarding-department-reminder',
                          'onboarding-task-completed','onboarding-department-completed')
           THEN 'NEU: Paket 5, Event gab es vorher nicht'
         WHEN w.event IN ('dokument-ablauf-warnung','dokument-abgelaufen')
           THEN 'NEU: Cron /api/cron/dokument-ablauf'
         WHEN w.event = 'supervisor-link-created'
           THEN 'ANDERS: auch beim Anlegen (Neuer Vorgang); gleiche Adresse = keine 2. Mail'
         WHEN w.event IN ('supervisor-reminder','employee-reminder')
           THEN 'ANDERS: Takt geaendert (FK auch bei offenem Fragebogen; MA nicht nach Linkablauf)'
         WHEN w.event IN ('offboarding-department-assigned','offboarding-reminder',
                          'offboarding-task-completed','offboarding-department-completed')
           THEN 'ANDERS: Paket 1b (Erinnern/Erneut senden, nur echte Wechsel, WEBHOOK-Regel)'
         WHEN w.event IN ('questionnaire-completed','supervisor-completed',
                          'offboarding-created','offboarding-completed','psi-deadline-warning')
           THEN 'Payload erweitert, alte Felder bleiben'
         ELSE '-'
       END AS aenderung,
       t."isActive" AS portal_vorlage_aktiv
FROM webhook_configs w
LEFT JOIN email_templates t ON t.event = w.event
ORDER BY (w."isActive") DESC, w.event;

-- ---------------------------------------------------------------------
-- Betrieb: Merker, Fristen, Links, Versand (betrieb-nachher.sql)
-- ---------------------------------------------------------------------
\echo '== NACHHER B-N1'
SELECT name, "appliedAt"
FROM system_migrations
ORDER BY "appliedAt" DESC;
\echo '== NACHHER B-N2'
SELECT details -> 'geaendert'           AS geaendert,
       details -> 'festhaengendGeheilt' AS geheilt,
       details -> 'hrOhneAbgabe'        AS hr_ohne_abgabe
FROM system_migrations WHERE name = 'ONBOARDING_PARALLELE_SPUREN_V1';
\echo '== NACHHER B-N3'
SELECT COUNT(1) AS dokumente_mit_frist,
       COUNT(1) FILTER (WHERE "gueltigBis" <= (now() + interval '90 days')::date) AS im_horizont
FROM documents WHERE "gueltigBis" IS NOT NULL;
\echo '== NACHHER B-N4'
SELECT COUNT(1) AS onboarding_links,
       COUNT(1) FILTER (WHERE "sentAt" IS NOT NULL) AS informiert
FROM offboarding_department_links WHERE "onboardingId" IS NOT NULL;
\echo '== NACHHER B-N5'
SELECT event, status, COUNT(1) AS anzahl
FROM email_logs
WHERE "createdAt" > now() - interval '1 day' AND "isTest" = false
GROUP BY event, status ORDER BY event, status;

-- ---------------------------------------------------------------------
-- Ergaenzung Gegenpruefung: Abteilungslinks, deren Erinnerungen schweigen (wie B-B10)
-- ---------------------------------------------------------------------
\echo '== NACHHER B-N6'
WITH basis AS (
  SELECT p."displayId", p.status::text AS status, l."departmentKey",
         btrim(l.email) AS link_adresse, l."sentAt",
         CASE
           WHEN l."departmentKey" = 'VORGESETZTER' THEN
             COALESCE(NULLIF(btrim(to_jsonb(p) ->> 'supervisorEmail'), ''),
                      NULLIF(btrim(z."supervisorEmail"), ''),
                      NULLIF(btrim(c."supervisorEmail"), ''))
           ELSE COALESCE(
             (SELECT btrim(d.email) FROM department_configs d
              WHERE d."departmentKey" = l."departmentKey" AND d."isActive"
                AND d."organizationId" = p."organizationId" LIMIT 1),
             (SELECT btrim(d.email) FROM department_configs d
              WHERE d."departmentKey" = l."departmentKey" AND d."isActive"
                AND d."organizationId" IS NULL LIMIT 1))
         END AS adresse_heute
  FROM offboarding_department_links l
  JOIN offboarding_processes p ON p.id = l."offboardingId"
  LEFT JOIN zeugnis_bewertungen z ON z."offboardingId" = p.id
  LEFT JOIN contract_end_processes c ON c."offboardingId" = p.id
  WHERE l."sentAt" IS NOT NULL
    AND l."allTasksComplete" = false
    AND p.status NOT IN ('COMPLETED', 'CANCELLED')
    AND l."departmentKey" NOT IN ('HR', 'MITARBEITER')
), bewertet AS (
  SELECT b.*,
         CASE
           WHEN lower(link_adresse) IN ('it@credo-gruppe.de', 'facility@credo-gruppe.de',
                                        'buchhaltung@credo-gruppe.de', 'dsb@credo-gruppe.de')
             THEN 'PLATZHALTER: nach dem Ersetzen "Erneut senden"'
           WHEN adresse_heute IS NULL
             THEN 'KEINE ADRESSE: Cron schweigt'
           WHEN lower(link_adresse) <> lower(adresse_heute)
             THEN 'ADRESSE WEICHT AB: Cron schweigt, "Erneut senden"'
         END AS nach_dem_deploy
  FROM basis b
)
SELECT "displayId", status, "departmentKey", link_adresse, adresse_heute,
       "sentAt"::date AS informiert, nach_dem_deploy
FROM bewertet
WHERE nach_dem_deploy IS NOT NULL
ORDER BY 1, 3;
ENDE_SQL
```

**Prüfen und ausführen:**

```bash
md5sum ~/deploy-7bc91ec/nachher-alle.sql
sudo docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db \
  psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 < ~/deploy-7bc91ec/nachher-alle.sql > ~/deploy-7bc91ec/nachher-ergebnis.txt 2>&1; echo "Exit: $?"
grep -c '^== NACHHER' ~/deploy-7bc91ec/nachher-ergebnis.txt
grep -c 'ERROR' ~/deploy-7bc91ec/nachher-ergebnis.txt
```

**Erwartet:**
- md5 `39b9185b6004458876fde82e54234ffa` (die ältere Fassung ohne B-N6 hatte
  `4b326c1abf68d6d321cf98eb9129ddbc`)
- `Exit: 0`, `26`, `0`

> **Ergebnis an Claude schicken — immer:** `nachher-ergebnis.txt`.

| Nr | Zeigt | Erwartet | Wenn nicht |
|---|---|---|---|
| S-N1 | Neue Spalten, `offboardingId` nullable, neue Enum-Werte | `23` · `YES` · `4` | an Claude |
| S-N2 | Link-Tabelle: Ist je Zeile genau ein Modul gesetzt? Gibt es Onboarding-Duplikate? | `0` · `0` | an Claude |
| S-R1 | Was ein Rückfall verlieren würde, dazu die Blocker | Blocker-Zeilen `0`. Direkt nach dem Deploy liegen nur `supervisor_kostenstellen` (= `migriert` aus M-V2a) und `checklist_items…` (Tagesangaben aus der Migration) über 0. | Diese Zahlen **aufheben**: Sie sind die Grundlage jeder Rückfall-Entscheidung (Abschnitt 7). |
| M-N0 | Die neuen Merker | 5 Zeilen, `appliedAt` = Startzeit (UTC) | Nur 4 Zeilen, `FORMTEMPLATE_MASERNSCHUTZ_V1` fehlt: in Ordnung, **wenn** M-V1a „UEBERSPRUNGEN“ zeigte. Sonst an Claude. |
| M-N0b | Die Details der Merker, darin die alten Werte | – | Mitschicken, das ist das Protokoll der Umstellung. |
| M-N1, M-N1-2 | Vorlagen und laufende Snapshots ohne aktiven Schritt 9 | `(0 rows)` | an Claude, außer bei „UEBERSPRUNGEN“ in M-V1a |
| M-N2a | Kostenstellen ohne Aufteilung | `0` | an Claude |
| M-N2b | Aufteilungen, die nicht 100 % ergeben | genau die Zeilen aus M-V2b mit `ergebnis` „Anteil bleibt, Summe <> 100 -> HR pflegt nach“. Die Zeilen „ohne Anteil -> 100“ ergeben 100 %, und aus „leer - keine Zeile“ entsteht keine Aufteilung (`seed-check.js:962-979`); beide fehlen hier also. | Liste an HR (5.3) |
| M-N3 | Beschriftung „Stellenbeschreibung“ noch vorhanden | `(0 rows)` | an Claude |
| M-N4 | Status passt nicht zu den beiden Zeitstempeln | `(0 rows)` | an Claude |
| M-N4b | `hrOhneAbgabe` laut Merker | dieselben Fälle wie in M-V4b | einzeln mit HR klären (5.3) |
| M-N5a | Freitexte, die noch einen Schlüssel ergäben | `(0 rows)` | an Claude |
| M-N5b | Verteilung der Zuständigkeiten | – | INFO. `standard = f` heißt: eigener oder unbekannter Schlüssel. |
| M-N5c | Unbekannte Zuständigkeiten laut Merker | dieselben wie „UNBEKANNT“ in M-V5a/b | zuordnen (5.3) |
| M-N5d | Aufgaben ohne Tagesangabe, obwohl es eine Quelle gibt | `0` | an Claude |
| M-N5e | Tagesangaben und Fälligkeiten | `davon_noch_ohne_datum` = `mit_tagen` ist normal | INFO. Das Datum entsteht erst bei der Abgabe der Modalitäten oder beim ersten „Abteilungen informieren“. |
| MAIL1–MAIL3 | wie VORHER | Nach 5.1 zeigt keine PFLICHT-Zeile mehr „ALTER TEXT“, und die drei neuen An-Felder sind gesetzt. | an Claude. Nach 5.3 lohnt ein zweiter Lauf für die EMPFOHLEN-Zeilen. |
| B-N1 | Alle Merker | 10 Zeilen (9, wenn Masernschutz übersprungen wurde) | an Claude |
| B-N2 | Heil-Migration: geändert, geheilt, `hrOhneAbgabe` | – | INFO |
| B-N3 | Dokumente mit Ablaufdatum | `0` · `0`, denn keine Migration füllt `gueltigBis` | INFO |
| B-N4 | Onboarding-Links | `0` · `0` | an Claude, denn niemand hat bisher geklickt |
| B-N5 | Mailprotokoll der letzten 24 h | normaler Tagesverkehr. Der Start selbst verschickt nichts. | Nach dem ersten Cron-Lauf erneut ansehen |
| B-N6 | wie B-B10: Offboarding-Abteilungslinks, deren Erinnerungen schweigen | direkt nach dem Start dieselben Zeilen wie B-B10, nach 5.2 `(0 rows)` | Die Zeilen sind die Arbeitsliste für 5.2 Nr. 2. Nach 5.2 erneut ausführen. Bleibt eine Zeile stehen, ohne dass HR sie bewusst ruhen lässt: an Claude. |

### 4.3 Cron-Probe (ohne Mails)

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://hr.fes-credo.de/api/cron/dokument-ablauf
```

Erwartet `401`. Vor dem Deploy gab es die Route nicht (404). Die Middleware lässt
`/api/…` ohne Sitzung durch (`src/middleware.ts:89-116`), und die Route selbst lehnt
den fehlenden Schlüssel ab (`src/app/api/cron/dokument-ablauf/route.ts:145-147`).

**Nur wenn B-N3 = 0 ist, optional:**

```bash
sudo docker exec hr-portal-app sh -c 'curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/dokument-ablauf'
```

Erwartet `{"success":true,…,"geprueft":0,"erinnerungen":0,…}` (`route.ts:158-166, 440-444`).
Ohne Dokumente mit Ablaufdatum liest dieser Lauf nichts, schreibt nichts und mailt
nichts.

**Nicht mit dem Secret aufrufen:** `reminders` und `offboarding-reminders`. Beide
verschicken echte Erinnerungen.

### 4.4 Smoke-Test ohne Mails an Beschäftigte

**Gefahrlos:**

- Anmelden. Die Dashboard-Liste zeigt die Chips je Spur und gegebenenfalls „Bereit zur
  Prüfung“.
- Onboarding-Vorgang öffnen:
  - Übersicht: Laufen beide Spuren, stehen sie nebeneinander mit „Läuft parallel“.
  - Tab Checkliste mit der Karte „Aufgaben für Abteilungen“ (nur lesend).
  - Tab Dokumente.
- Offboarding-Vorgang öffnen: Tab Checkliste.
- Einstellungen, nur ansehen:
  - „Versand-Status“: Treffer unter „Kein Empfänger“ sind zu erwarten.
  - „E-Mail-Vorlagen“, „Abteilungen“, „SMTP“, „Webhooks“.
- Checklisten-Editor nur öffnen, nicht speichern.
- „Test senden“ an die **eigene** Adresse ist gefahrlos. Die Mail geht nur an die
  eingetippte Adresse, ohne CC/BCC und ohne Webhook
  (`src/app/api/settings/email-templates/test/route.ts:71`, `mailer.ts:515-516`).

**Nicht klicken, das verschickt Mails:**

| Aktion | Folge |
|---|---|
| „Neuer Vorgang“ | Einladung, mit Führungskraft zusätzlich der Vorgesetzten-Link (`src/app/api/onboarding/route.ts:307-316`) |
| „Vorgesetzten-Link erstellen“ / „Neuen Link erzeugen“ | Mail an die Führungskraft |
| „Abteilungen informieren…“, „Erneut senden“, „Erinnern“, „Link erneuern…“ (in beiden Modulen) | Mails an Abteilungen, zum Teil mit neuem Token |
| Dokumentenpaket „Versenden“ | Mail mit Anhängen |
| Offboarding auf „Abgeschlossen“ setzen | Mail an HR |
| Exit-Interview senden | Mail |
| Häkchen an einer Offboarding-Aufgabe einer Link-Abteilung | Mail an HR |
| Webhook „Testen“ | n8n kann mailen |

**Öffentliche Links nicht öffnen.** Abteilungslinks zählen das Öffnen mit, und
Fragebogen- und Modalitäten-Links speichern automatisch.

---

## 5 · Handschritte im Portal

Die Einstellungen und die Checklisten erreichen nur SUPER_ADMIN und HR_LEITUNG
(`src/middleware.ts:154-160`). Dasselbe gilt für „Text auf Standard zurücksetzen“
(`zuruecksetzen/route.ts:45`).

### 5.1 PFLICHT, sofort nach dem Start (direkt nach 4.1)

Ohne diese Schritte gehen falsche Mails hinaus, oder Mails fallen still aus.
`questionnaire-completed` und `supervisor-completed` feuern bei **jeder** Abgabe
über die öffentlichen Links, also ohne Zutun von HR. Deshalb gehören sie an den
Anfang.

1. **Text auf Standard zurücksetzen**, aber nur für Vorlagen, die in MAIL1
   `gespeichert = t` **und** „ALTER TEXT“ zeigen:

   | Vorlage (Anzeigename) | Event | Was der alte Text falsch sagt |
   |---|---|---|
   | Einstellungsmodalitäten eingereicht (HR-Benachrichtigung) | `supervisor-completed` | „Alle Daten eingegangen … kann jetzt abgeschlossen werden“, auch wenn der Fragebogen noch fehlt |
   | Fragebogen eingereicht (HR-Benachrichtigung) | `questionnaire-completed` | „jetzt im HR-Portal prüfen“, auch wenn die Modalitäten fehlen |
   | Einladung Vorgesetzter (Einstellungsmodalitäten) | `supervisor-link-created` | „Für die Einstellung von {{mitarbeiter_name}}“ wird ohne Namen zu „von die neue Mitarbeiterin …“. Das ist jetzt der Regelfall, weil der Link schon beim Anlegen hinausgeht. |
   | Einladung Vorgesetzter (Vertragsverlängerung) | `contract-end-supervisor-link` | behauptet „weiterbeschäftigt werden soll“, obwohl die Führungskraft erst entscheidet |
   | Offboarding abgeschlossen | `offboarding-completed` | „Alle Aufgaben sind erledigt“, auch bei offenen Aufgaben |

   Ausnahme: Hat HR einen dieser Texte bewusst angepasst, wurde das in 2.3 schon mit
   Claude entschieden. Der alte Text bleibt nach dem Reset im AuditLog
   (`EMAIL_TEMPLATE_RESET`, `zuruecksetzen/route.ts:107-124`).

2. **An-Feld mit dem HR-Postfach eintragen und speichern.** Das betrifft die drei
   neuen HR-internen Vorlagen, deren Katalog-Empfänger leer ist
   (`src/lib/events.ts:565, 622, 647`):
   - Onboarding-Aufgabe erledigt (`onboarding-task-completed`)
   - Befristeter Nachweis läuft ab (HR-Erinnerung) (`dokument-ablauf-warnung`)
   - Befristeter Nachweis ist abgelaufen (HR-Warnung) (`dokument-abgelaufen`)

   Ohne An-Feld werden sie übersprungen. Das Protokoll vermerkt dann „Kein Empfaenger
   konfiguriert“ (`mailer.ts:529-538`).

   **Welche Adresse, ist ungeklärt.** Die Vorlagen und der n8n-Bericht nennen
   `personalbuchhaltung@fes-minden.de` (`default-email-templates.ts:158`,
   `n8n/CREDO_Reminder_Cron_Workflow.json:53`). Bitte bestätigen.

3. **Eingangsbestätigung Mitarbeiter (Fragebogen eingereicht)**
   (`questionnaire-confirmation-employee`): Die Vorlage läuft jetzt über den normalen
   Versandweg (`fragebogen/[token]/route.ts:1144-1150`). Damit wirken drei
   Einstellungen, die bisher ohne Wirkung waren (MAIL1, 2.3):
   - **Aktiv-Schalter an.** Ausgeschaltet heißt ab jetzt wirklich: keine Bestätigung
     (`mailer.ts:663-664`). Früher wurde trotzdem gesendet.
   - **An-Feld leeren oder `{{email}}` eintragen.** Leer gilt der Katalog-Default
     `{{email}}` (`src/lib/events.ts:340`, `mailer.ts:519-528`). Jede andere Angabe
     **ersetzt** die Adresse der Person, die Bestätigung erreicht sie dann nicht mehr.
   - **CC und BCC** nur so stehen lassen, wie es in 2.3 entschieden wurde. Sie gehen
     ab jetzt wirklich in Kopie (`mailer.ts:540-542`).

4. **Webhooks:** Jede aktive Zeile aus MAIL3 so umsetzen, wie es in 2.3 entschieden
   wurde (6.4).

5. **Danach die NACHHER-Datei ausführen (4.2).** In MAIL1 darf keine Zeile mit
   PFLICHT-Reset mehr „ALTER TEXT“ zeigen, und die drei An-Felder aus Nr. 2 sind gesetzt.

### 5.2 PFLICHT vor dem nächsten 08:00-Lauf und vor dem ersten Klick auf „Abteilungen informieren…“

1. **Einstellungen → Abteilungen**
   - **Platzhalter ersetzen.** `it@`, `facility@`, `buchhaltung@` und
     `dsb@credo-gruppe.de` stammen aus dem Erst-Seed (`prisma/seed.ts:674-677`).
     Stand laut M-V5d/B-B7.
   - **Je Einrichtung einen Eintrag `VERWALTUNG` anlegen** („Verwaltung / Sekretariat“).
     Der Seed legt ihn bewusst nicht an (`seed.ts:665-666`). Ein Eintrag der
     Einrichtung geht dem zentralen vor.
   - **Altzeilen löschen:** `HR`, `MITARBEITER`, `VORGESETZTER`. Diese Schlüssel sind
     reserviert (`src/lib/constants.ts:301`) und werden nie angeschrieben.
   - **Warum vor 08:00:**
     - Der Offboarding-Cron erinnert informierte Links nur an die Adresse, an die der
       Link ging, und nur, solange sie mit der heutigen übereinstimmt
       (`abteilungsaufgaben-dienst.ts:1174-1196`). Steht der Platzhalter um 08:00
       noch, geht die Erinnerung an den Platzhalter (B-B3).
     - Wird die Adresse ersetzt, schweigt der Cron für die schon informierten Links.
       Er vermerkt am Link „Adresse geändert, bitte Link erneuern“ und schickt nichts,
       auch nicht an die neue Adresse (CLAUDE.md, Abteilungsaufgaben Regel 5). Erst
       „Erneut senden“ (Nr. 2) erreicht die neue Adresse.
     - Aufgaben ohne aktive Adresse bleiben gelb und gehen nicht hinaus.
2. **Schweigende Abteilungslinks im Offboarding**, Liste B-N6 (vorher B-B10), je Zeile
   so, wie es in 2.3 entschieden wurde. Das betrifft Links an ersetzte Platzhalter
   und Links an `VORGESETZTER`: Dieser Schlüssel geht jetzt an die Führungskraft des
   Vorgangs, nicht mehr an den Eintrag unter Abteilungen (CLAUDE.md, Abteilungsaufgaben
   Regel 6). Fehlt
   sie oder weicht ihre Adresse ab, schweigt der Cron ebenfalls.
   - Den Offboarding-Vorgang (`displayId`) öffnen, Tab Checkliste, Karte „Aufgaben
     für Abteilungen“. Die Zeile nennt „Adresse geändert (jetzt …)“ oder den Grund,
     warum es keine Adresse gibt (`abteilungsaufgaben.ts:1362-1372`).
   - Bei `VORGESETZTER` zuerst im Tab Übersicht die Führungskraft eintragen, wenn sie
     fehlt oder nicht stimmt. Ist B-B6 nicht leer, muss die Domain einer frei
     eingetippten Adresse freigegeben sein (Nr. 3), sonst lehnt das Portal mit 409 ab.
     Adressen aus Zeugnis-Bewertung oder Vertragsende sind immer erlaubt
     (`abteilungsaufgaben-dienst.ts:271-293`).
   - Bei `KEINE ADRESSE` einer Abteilung: unter Einstellungen → Abteilungen einen
     aktiven Eintrag anlegen (Nr. 1).
   - Dann **„Erneut senden“**. **Achtung, das verschickt eine echte Mail** an die neue
     Adresse, mit **neuem Link**. Der bisherige Link wird ungültig, erledigte Aufgaben
     bleiben erledigt (`abteilungsaufgaben-dienst.ts:575-588, 818-851`). Danach sind
     „Erneut senden“ und „Erinnern“ für diesen Link 10 Minuten gesperrt
     (`abteilungsaufgaben.ts:60`).
   - Zum Schluss die NACHHER-Datei erneut ausführen (4.2). B-N6 zeigt dann
     `(0 rows)`, außer Links, die HR bewusst ruhen lässt.
3. **Einstellungen → SMTP → Erlaubte Domains** (nur wenn B-B6 nicht leer ist):
   - Die Liste sperrt ab jetzt auch frei eingetippte Führungskraft-Adressen mit 409:
     - beim „Neuen Vorgang“ (`api/onboarding/route.ts:163-165`)
     - beim Vorgesetzten-Link (`…/supervisor-link/route.ts:134-137`)
     - im Offboarding (`api/offboarding/route.ts:197`, `…/[id]/route.ts:224-231`)
   - Alle dienstlichen Domains aus B-B8 müssen darin stehen.
   - Eine leere Liste bedeutet keine Einschränkung.
   - Der Hilfetext unter dem Feld ist veraltet: Er sagt „Gilt nur für den
     Dokumentenpaket-Versand“ (`einstellungen-content.tsx:849-855`). HR sollte das
     wissen.
4. **n8n:** URL, Timeout und Zeitplan prüfen (6.1). Soll der erste Lauf erst nach 5.2
   und 5.3 kommen, beide Workflows so lange pausieren (6.3).

### 5.3 EMPFOHLEN (am selben Tag oder zeitnah)

- **Weitere Vorlagen zurücksetzen**, wenn MAIL1 sie als gespeichert mit altem Text
  zeigt. Die Liste steht in 5.4, am dringendsten ist `offboarding-task-completed`:
  Sonst erreicht der Kommentar der Abteilung HR nicht.
- **An-Feld prüfen** bei den HR-internen Vorlagen, die dieser Deploy inhaltlich
  aufwertet, laut MAIL2:
  - `questionnaire-completed`
  - `supervisor-completed`
  - `offboarding-task-completed`
  - `offboarding-created`
  - `offboarding-completed`
  - `psi-deadline-warning`

  Hat eine davon bisher nie ein An-Feld gehabt, entscheidet HR, ob sie ab jetzt Mails
  will. Wer ein An-Feld speichert, legt eine Datenbank-Zeile an. Spätere Textänderungen
  aus dem Code brauchen dann wieder „Text auf Standard zurücksetzen“.
- **Checklisten-Vorlagen** (`/checklisten`), je Punkt pflegen:
  - Zuständigkeit (Schlüssel)
  - Tagesangabe
  - Hinweis (max. 500 Zeichen)

  Unbekannte Zuständigkeiten aus M-N5c zuordnen. Ohne Schlüssel geht eine Aufgabe an
  niemanden, ohne Tagesangabe gibt es keine Fälligkeit und keine Erinnerung. Der Seed
  fasst die Vorlagen in Produktion nicht an (`seed.ts:315-316`).
- **Kostenstellen** aus M-N2b an HR geben, damit sie auf 100 % gepflegt werden. Bei
  einer Aufteilung bleibt die LOGA-Positionsspalte leer. Die Absprache mit der
  Lohnbuchhaltung ist offen (Abschnitt 8).
- **`hrOhneAbgabe`-Fälle** (M-N4b) einzeln mit HR klären.
- **Masernschutz:** Hatte HR Schritt 9 in einer Vorlage bewusst aus (M-V1a), ihn jetzt
  im Vorlagen-Editor wieder ausschalten. Der Merker verhindert, dass die Migration ihn
  erneut einschaltet. Das gilt aber nur, wenn M-N0 den Merker
  `FORMTEMPLATE_MASERNSCHUTZ_V1` zeigt. Fehlt er, weil eine Vorlage übersprungen wurde,
  schaltet der nächste Start Schritt 9 wieder ein (`seed-check.js:727-729`). Dann erst
  an Claude.
- **„Test senden“** an die eigene Adresse, einmal je neuer Vorlage:
  - `onboarding-department-assigned`, `onboarding-department-reminder`,
    `onboarding-department-completed`, `onboarding-task-completed`
  - `dokument-ablauf-warnung`
  - `dokument-abgelaufen`
- **Rollen (B-B9):**
  - EINRICHTUNGSLEITUNG darf Vorgänge anlegen, aber keine Führungskraft eintragen.
    Das ergibt 403 (`src/lib/permissions.ts:33-36`).
  - Abteilungs-Aktionen dürfen nur `HR_EDIT_ROLES`.
  - Die Betroffenen sollten es wissen.
- **HR informieren:** Die Heil-Migration hat Status geändert (B-N2). Festhängende
  Personen können wieder ausfüllen und bekommen wieder Erinnerungen.

### 5.4 Vollständige Vorlagenliste

„Reset“ heißt „Text auf Standard zurücksetzen“, und zwar **nur**, wenn MAIL1 eine
gespeicherte Zeile mit altem Text zeigt. Ohne gespeicherte Zeile gilt der neue
Code-Text automatisch (`mailer.ts:383-415`).

| Vorlage (Anzeigename) | Event | Einstufung | Grund | Aktion |
|---|---|---|---|---|
| Einstellungsmodalitäten eingereicht (HR-Benachrichtigung) | `supervisor-completed` | PFLICHT | siehe 5.1 | Reset · An-Feld prüfen |
| Fragebogen eingereicht (HR-Benachrichtigung) | `questionnaire-completed` | PFLICHT | siehe 5.1 | Reset · An-Feld prüfen |
| Einladung Vorgesetzter (Einstellungsmodalitäten) | `supervisor-link-created` | PFLICHT | siehe 5.1. Dazu kommen „Stellenbezeichnung“, der Hinweis auf paralleles Ausfüllen und der Fristkasten. | Reset |
| Einladung Vorgesetzter (Vertragsverlängerung) | `contract-end-supervisor-link` | PFLICHT | siehe 5.1 | Reset |
| Offboarding abgeschlossen | `offboarding-completed` | PFLICHT | siehe 5.1 | Reset · An-Feld prüfen |
| Offboarding-Aufgaben für Abteilung zugewiesen | `offboarding-department-assigned` | EMPFOHLEN (dringend) | Die Führungskraft liest „Ihrer Abteilung“. Es fehlt die Aufgabenliste und der Hinweis „alter Link ungültig“. | Reset |
| Offboarding-Aufgabe erledigt | `offboarding-task-completed` | EMPFOHLEN (dringend) | Der Kommentar der Abteilung erreicht HR nicht. | Reset · An-Feld prüfen |
| Erinnerung: Offene Offboarding-Aufgaben | `offboarding-reminder` | EMPFOHLEN | Der alte Text ist allgemein, aber nicht falsch. | Reset |
| Offboarding: Abteilung abgeschlossen (Bestaetigung) | `offboarding-department-completed` | EMPFOHLEN | „Aufgaben der Abteilung Führungskraft“ | Reset |
| Verbeamtung: Fristen-Warnung (HR-Sammelmail) | `psi-deadline-warning` | EMPFOHLEN | zählt Hinweise als „Vorgänge“ und zeigt den Code „OVERDUE“ | Reset · An-Feld prüfen |
| Einladung Mitarbeiter (Personalfragebogen) | `onboarding-created` | EMPFOHLEN | Ohne Namen: „Herzlich willkommen, !“ | Reset |
| Erinnerung Mitarbeiter (Fragebogen ausstehend) | `employee-reminder` | EMPFOHLEN, **vor dem nächsten 08:00-Lauf** | Ohne Namen: „Hallo , …“ | Reset |
| Erinnerung Vorgesetzter (Modalitäten ausstehend) | `supervisor-reminder` | egal | nur Umlaute. Der Link-Fix (`/modalitaeten/`) steckt im Payload (`cron/reminders/route.ts:266`). | – |
| Neuer Offboarding-Vorgang erstellt | `offboarding-created` | egal | „Fuer“ wird „Für“ | An-Feld prüfen |
| Unterlagen zum Austritt (Offboarding) | `offboarding-documents-sent` | egal | Der Datumsfix sitzt im Mailer und wirkt auch mit alter Zeile. | – |
| Eingangsbestaetigung Mitarbeiter (Fragebogen eingereicht) | `questionnaire-confirmation-employee` | PFLICHT prüfen | Text unverändert, **Verhalten neu**: Aktiv-Schalter, An-Feld, CC und BCC wirken jetzt (5.1 Nr. 3) | Aktiv-Schalter und Empfängerfelder prüfen |
| Onboarding-Aufgaben für Abteilung zugewiesen | `onboarding-department-assigned` | NEU | Es gibt noch keine gespeicherte Zeile, der Code-Text gilt. | Test senden |
| Erinnerung: Offene Onboarding-Aufgaben | `onboarding-department-reminder` | NEU | wie oben | Test senden |
| Onboarding-Aufgabe erledigt | `onboarding-task-completed` | NEU, **PFLICHT An-Feld** | Katalog-Empfänger leer (`events.ts:565`). Nur über den Link, das Häkchen im Portal löst nichts aus. | An-Feld (5.1 Nr. 2) |
| Onboarding: Abteilung abgeschlossen (Bestaetigung) | `onboarding-department-completed` | NEU | wie oben | Test senden |
| Befristeter Nachweis läuft ab (HR-Erinnerung) | `dokument-ablauf-warnung` | NEU, **PFLICHT An-Feld** | Katalog-Empfänger leer (`events.ts:622`). Muss **vor** dem Einplanen des Crons stehen (6.2). | An-Feld (5.1 Nr. 2) |
| Befristeter Nachweis ist abgelaufen (HR-Warnung) | `dokument-abgelaufen` | NEU, **PFLICHT An-Feld** | wie oben (`events.ts:647`) | An-Feld (5.1 Nr. 2) |

Die Einstufungen und die Belege für den alten Text stammen aus der Mail-Analyse
zu diesem Deploy (Diff der Code-Defaults `6124936` gegen `7bc91ec`).

**Diese Änderungen wirken auch mit alter gespeicherter Zeile, ohne Reset:**

- Platzhalter werden in einem Durchgang ersetzt.
- Namen und Freitexte werden im HTML maskiert.
- `{{ablaufdatum}}` steht als TT.MM.JJJJ.
- Statt einer E-Mail-Adresse steht ohne Namen „die neue Mitarbeiterin / den neuen
  Mitarbeiter“. In alten Texten mit „von {{mitarbeiter_name}}“ zerbricht dadurch der
  Satz, deshalb die Resets oben.

**Word- und Briefvorlagen: kein Handschritt.**

- `{stellenbeschreibung}` bleibt der Platzhalter. Nur seine Beschriftung im Katalog
  heißt jetzt „Stellenbezeichnung“.
- **Den Platzhalter in Word nicht umbenennen**, sonst bleibt die Stelle leer.
- `public/system-dokumente` und `dokumentenpaket.ts` sind unverändert.

### 5.5 So geht „Text auf Standard zurücksetzen“

1. Einstellungen, Reiter „E-Mail-Vorlagen“ (`einstellungen-content.tsx:183`).
2. Filter: gespeicherte Vorlagen tragen den Chip „Angepasst“. Der Hinweis „Der
   Standardtext weicht von Ihrer gespeicherten Fassung ab.“ zeigt, wo sich der Reset
   lohnt (`:1722, 1747, 1772`).
3. Die Vorlage aufklappen, „Text auf Standard zurücksetzen“ wählen (`:1790`) und die
   Rückfrage bestätigen.

**Was der Reset ersetzt:** Betreff, HTML, Text und die Variablenliste.

**Was bleibt** (`zuruecksetzen/route.ts:97-106, 122`):
- `recipientTo/Cc/Bcc/ReplyTo`
- der Aktiv-Schalter
- der Anzeigename

Danach muss also kein Empfänger neu eingetragen werden.

**Vorsicht:** Ungespeicherte Änderungen im offenen Editor gehen verloren.

---

## 6 · n8n

Im Repo liegen nur drei alte Exporte vom 28.03. (`git ls-files n8n`, alle aus Commit
`48696a1`), und `/n8n/` steht inzwischen in `.gitignore:71`:

- `n8n/CREDO_Reminder_Cron_Workflow.json`: Zeitplan für `/api/cron/reminders`
- `n8n/CREDO_Offboarding_Reminder_Workflow.json`: Zeitplan für `/api/cron/offboarding-reminders`
- `n8n/CREDO_HR_Portal_Offboarding_Workflow.json`: **kein Zeitplan**, sondern fünf
  Webhook-Empfänger für `offboarding-created`, `offboarding-department-assigned`,
  `offboarding-task-completed`, `offboarding-department-completed` und
  `offboarding-completed` (Z. 7, 31, 55, 79, 103). Jeder verschickt per SMTP eine
  **eigene Mail**: an die Abteilung mit dem Link aus dem Payload (Z. 136) oder an
  `personal@credo-gruppe.de` (Z. 126, 146, 156, 166). Zur Bedeutung für den
  Doppelversand siehe 6.4.

**Der tatsächliche Stand in n8n ist ungeklärt** und nur in der n8n-Oberfläche prüfbar.

**Für alle Cron-Aufrufe gilt:**
- Methode `POST`
- Header `Authorization: Bearer <CRON_SECRET>`, den Wert aus `.env` eintragen, nicht hier
- Aufruf ohne Header oder mit falschem Secret: 401. Fehlt `CRON_SECRET` in der `.env`
  des Servers: 500 („CRON_SECRET nicht konfiguriert“). Belege:
  `dokument-ablauf/route.ts:141-147`, `reminders/route.ts:74-89`,
  `offboarding-reminders/route.ts:34-49`. Die 401 in 4.3 ist also der erwartete
  Fall „ohne Header“.

### 6.1 Bestehende Läufe prüfen

| Lauf | URL | Zeitplan (Export) | Prüfen |
|---|---|---|---|
| Onboarding-Erinnerungen | `https://hr.fes-credo.de/api/cron/reminders` | täglich 08:00 (`…Reminder_Cron_Workflow.json:9`) | Der Export nennt `hr.credo-schulen.de` (`:24`), `APP_URL` ist aber `hr.fes-credo.de`. Timeout im Export 30 s (`:37`), Empfehlung **mindestens 120 s**, weil der Lauf jetzt einen dritten Abschnitt hat. |
| Offboarding-Abteilungserinnerungen | `https://hr.fes-credo.de/api/cron/offboarding-reminders` | täglich 08:00 (`…Offboarding_Reminder_Workflow.json:9`) | wie oben (`:24`, `:37`) |

**Ob die Läufe heute überhaupt ankommen**, zeigt das Portal: Einstellungen →
Versandprotokoll, Einträge zu `employee-reminder` und `supervisor-reminder`.

**Neu in der Antwort von `reminders`:**
- Es gibt ein zusätzliches Feld `departmentReminders`.
- `total` bleibt Mitarbeiter plus Vorgesetzte (`cron/reminders/route.ts:339-347`).
- Der n8n-Bericht wertet nur `total` und `errors` aus (Export `:53`). Fehler der
  Abteilungs-Erinnerungen melden sich dort also nicht (Abschnitt 8).

**Neu in der Antwort von `offboarding-reminders`:** `details` führt jetzt jeden Versuch
mit Status. Ein Bericht „X versendet“ zählt also auch FAILED- und SKIPPED-Zeilen mit.

### 6.2 Neuer Lauf: `dokument-ablauf`

| URL | Zeitplan | Voraussetzung |
|---|---|---|
| `https://hr.fes-credo.de/api/cron/dokument-ablauf` | täglich, Empfehlung 07:30 | **Erst einplanen, wenn in beiden Vorlagen `dokument-ablauf-warnung` und `dokument-abgelaufen` das An-Feld steht** (5.1 Nr. 2) |

Warum die Reihenfolge zählt:
- Der Lauf setzt seinen Merker auch dann, wenn eine Mail übersprungen wurde
  (`dokument-ablauf/route.ts:389-398`).
- Fehlt das An-Feld, verschiebt sich die nächste Erinnerung darum um das Intervall der
  Stufe, also 30, 14 oder 3 Tage (`src/lib/dokument-fristen.ts:224-230`).

Die Antwort enthält `geprueft`, `erinnerungen`, `abgelaufenMarkiert`, `uebersprungen`,
`nichtZugestellt`, `mailUebersprungen` und `fehler` (`route.ts:158-166`).

### 6.3 Der erste Lauf nach dem Deploy

Was sich im ersten Lauf ändert:
- **Führungskräfte** werden jetzt auch bei offenem Fragebogen erinnert
  (`cron/reminders/route.ts:195-222`).
- **Mitarbeitende** werden nur noch mit gültigem Link erinnert (`:100-118`).
- **Festhängende Personen** sind nach der Heil-Migration wieder erinnerungsfähig.

Der erste Lauf verschickt ungefähr B-B1 + B-B2 Onboarding-Erinnerungen und B-B3
Offboarding-Erinnerungen. Von B-B3 gehen die Links ab, die B-B10 mit „Cron schweigt“
führt, und die Platzhalter-Links, deren Adresse vor 08:00 ersetzt wurde. Sie werden
übersprungen, nicht erinnert (5.2 Nr. 2).

- **Empfehlung:** nach dem 08:00-Lauf deployen, 5.1 und 5.2 am selben Tag erledigen.
- **Geht das nicht:** beide Workflows in n8n pausieren, bis 5.1 und 5.2 erledigt sind.
- **Am Tag danach:** Einstellungen → Versandprotokoll ansehen, oder B-N5 erneut ausführen.

### 6.4 Webhooks: Doppelversand

`triggerWebhooks` feuert jeden aktiven Eintrag, unabhängig vom Mailversand
(`src/lib/webhooks.ts:84-106`). Für jede aktive Zeile aus MAIL3 wird geklärt:
**Verschickt der n8n-Workflow dahinter eine eigene Mail?** Wenn ja, wird entweder der
Webhook deaktiviert oder die Portal-Vorlage. Das entscheidet Claude mit Ihnen.

**Für die fünf Offboarding-Ereignisse ist die Antwort sehr wahrscheinlich ja.** Der
Repo-Export `n8n/CREDO_HR_Portal_Offboarding_Workflow.json` empfängt genau
`offboarding-created`, `offboarding-department-assigned`, `offboarding-task-completed`,
`offboarding-department-completed` und `offboarding-completed` und mailt selbst
(Aufzählung am Anfang von Abschnitt 6). Das Portal mailt dieselben Ereignisse selbst
per SMTP, bevor es die Webhooks auslöst (CLAUDE.md, „E-Mail-Versand“). Jede aktive
Zeile auf eines dieser Ereignisse in MAIL3/B-B5/P4 heißt also voraussichtlich: zwei
Mails je Ereignis, solange auch die Portal-Vorlage aktiv ist, bei
`offboarding-department-assigned` zwei Mails an die Abteilung. Ob der Workflow live
noch so aussieht, zeigt nur n8n.

**Feuert neu:**
- `questionnaire-confirmation-employee`: Bisher lief der Versand an `triggerWebhooks`
  vorbei. Ein alter n8n-Workflow mit eigener Bestätigung ergäbe jetzt eine doppelte Mail.
- Die vier `onboarding-department-*`/`onboarding-task-completed`-Events.
- `dokument-ablauf-warnung` und `dokument-abgelaufen`.

**Feuert anders:**
- `supervisor-link-created`: jetzt auch beim Anlegen (`api/onboarding/route.ts:310-316`).
  Die Links erzeugt das Portal selbst, n8n muss hier keine Mail schicken.
- `supervisor-reminder` und `employee-reminder`: im neuen Takt (6.3).
- Die vier `offboarding-department*`-Events: über die neuen Knöpfe, und nur bei echten
  Wechseln.

**Sonderregel Offboarding-Abteilungen:** Ist die Portal-Vorlage deaktiviert und ein
Webhook aktiv, zählt der Link als zugestellt (`abteilungsaufgaben-dienst.ts:297-302`).
MAIL3 zeigt deshalb auch `portal_vorlage_aktiv`.

---

## 7 · Rückfall

### 7.1 Was man NICHT tun darf

**Das alte Image nie mit dem normalen Entrypoint gegen die neue Datenbank starten.**
Das gilt für jeden dieser Wege: `git checkout 6124936 && sudo docker compose up -d --build`
oder das Image `hr-portal-app:6124936` ohne vorheriges Einspielen der Sicherung.

Der Entrypoint vergleicht dann das alte Schema mit der Datenbank, stellt einen
Unterschied fest und schiebt das **alte** Schema mit `--accept-data-loss` darüber
(`entrypoint.sh:59-65, 119`). Auf einer Probedatenbank mit dem alten Image kamen drei
Fälle vor:

| Fall | Wann | Folge |
|---|---|---|
| A | Es gibt schon Onboarding-Links (`offboardingId` leer) | Prisma bricht vorher ab („Made the column `offboardingId` … required, but there are … existing NULL values“). Die Datenbank bleibt unverändert, aber der Container hängt in einer **Neustart-Schleife**. Jeder Durchgang legt eine neue Sicherung an, und nach zehn ist die vom Deploy weg. |
| B | Es gibt Dokumente mit neuen Typen oder dem Status `EXPIRED` | Fehler „invalid input value for enum …“, sonst wie A |
| C | Keiner der beiden Blocker | Exit 0 und **stiller Datenverlust**: 23 Spalten und die Tabelle `supervisor_kostenstellen` werden gelöscht, samt Aufenthaltstitel-Daten, KV-Mitgliedschaft, Kostenstellen-Aufteilung, Abteilungskommentaren, Fristen, Versandnachweisen und der Führungskraft im Offboarding. |

**Ebenso nicht:**
- `sudo docker compose down -v`: löscht die Volumes, also Datenbank und Uploads.
- `node prisma/seed.js`: überschreibt gepflegte Vorlagen, Checklisten und Mandantennamen
  (`seed.ts:142-144, 283-291, 337`; `docs/module/minijob/minijob-offene-punkte.md:115-123`),
  obwohl CLAUDE.md den Befehl unter den Server-Befehlen führt.
- `git clean` im Projektordner: löscht die Sicherungen (1.1).

### 7.2 Erst entscheiden: vorwärts oder zurück

**Vorwärts reparieren ist fast immer besser.** Ein Fehler im Code wird mit einem neuen
Commit behoben und neu deployt. Da sich das Schema dann nicht ändert, meldet der
Entrypoint „bereits deckungsgleich“ und macht weder Sicherung noch Push
(`entrypoint.sh:67-68`).

Zurück nur mit Claude. Vorher S-R1 aus 4.2 frisch ausführen, sie zählt, was verloren
ginge.

### 7.3 Weg A: Sicherung einspielen, dann altes Image (nur direkt nach dem Deploy)

**Wann:** Nur solange seit dem Start **niemand gearbeitet hat**. Weg A verwirft alles,
was seit 3.4 geschrieben wurde, in allen Tabellen. Dazu gehören auch Fragebögen, die
Beschäftigte über ihre Links ausgefüllt haben, und automatisches Zwischenspeichern
über die öffentlichen Links. B-N5 zeigt nur das Mailprotokoll und reicht dafür nicht.

**Vorher prüfen, ob gearbeitet wurde (nur lesend).** Der Befehl zählt je Tabelle die
Zeilen, die nach der ersten Zeile `✓ Ready` geschrieben wurden (`"updatedAt"`, bei
reinen Protokolltabellen wie `audit_logs` `"createdAt"`). Maßgeblich ist die
Ready-Zeit, nicht die Startzeit, denn die Migrationen setzen `updatedAt` schon während
des Starts. Der Zeitstempel aus `docker logs -t` ist UTC, die Spalten speichern UTC.

```bash
cd /vol/container/HR_Portal_CREDO
READY=$(sudo docker logs -t hr-portal-app 2>&1 | grep -m1 'Ready in' | cut -d' ' -f1)
echo "Ready (UTC): ${READY:-keine Ready-Zeile}"
[ -n "$READY" ] && sudo docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db \
  psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 -v ready="$READY" <<'ENDE_PRUEFUNG'
SELECT 'SELECT * FROM (' || string_agg(format(
         'SELECT %L::text AS tabelle, COUNT(1) AS zeilen FROM public.%I WHERE %I > (%L::timestamptz AT TIME ZONE ''UTC'')',
         table_name, table_name, spalte, :'ready'), ' UNION ALL ')
       || ') x WHERE zeilen > 0 ORDER BY 2 DESC, 1'
FROM (SELECT table_name::text AS table_name,
             CASE WHEN bool_or(column_name = 'updatedAt') THEN 'updatedAt' ELSE 'createdAt' END AS spalte
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name IN ('updatedAt', 'createdAt')
      GROUP BY table_name) t
\gexec
ENDE_PRUEFUNG
```

- **Keine Ready-Zeile:** Das Portal hat nie Anfragen angenommen, also kann niemand
  gearbeitet haben.
- **Erwartbar**, wenn nur die Handschritte liefen: `email_templates`,
  `department_configs`, `smtp_config`, `webhook_configs`, `users` (Anmeldung),
  `audit_logs` und `email_logs` (etwa „Test senden“). Diese Einstellungen gehen mit
  Weg A verloren und müssen nach einem späteren erneuten Deploy wiederholt werden.
- **Jede andere Tabelle**, besonders `personal_data`, `supervisor_data`,
  `onboarding_processes`, `checklist_items`, `offboarding_*` und `documents`, heißt:
  Es wurde gearbeitet. Dann **kein Weg A**, sondern an Claude (vorwärts reparieren
  oder Weg B).
- Geprobt: lesend gegen die Dev-Datenbank mit psql 16, Exit 0. **Lücke:** Acht
  Tabellen haben keine der beiden Spalten und fehlen deshalb: `bem_kommunikation`,
  `bem_zugriffe`, `elternzeit_checkliste`, `elternzeit_dokumente`,
  `mutterschutz_checkliste`, `mutterschutz_dokumente`, `offboarding_documents`,
  `system_migrations`. Arbeit, die nur dort landet, zeigt der Befehl nicht. HR
  zusätzlich fragen.

```bash
cd /vol/container/HR_Portal_CREDO
sudo docker compose stop app

# 1. Den jetzigen Stand sichern (neues Schema), falls der Rückfall selbst scheitert
sudo docker exec hr-portal-db sh -c 'pg_dump -U hrportal --schema=public hr_portal > /backups/vor-rueckfall-$(date +%Y%m%d-%H%M%S).sql'
sudo ls -l backups/

# 2. Quelle prüfen: die eigene Sicherung aus 3.4
sudo grep -c 'PostgreSQL database dump complete' backups/vor-deploy-7bc91ec-manuell.sql   # erwartet 1
sudo grep -n -m1 '^CREATE SCHEMA public' backups/vor-deploy-7bc91ec-manuell.sql          # erwartet ein Treffer

# 3. Schema leeren und den Stand von vor dem Deploy einspielen
sudo docker exec hr-portal-db psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE;'
sudo docker exec hr-portal-db psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 -1 -f /backups/vor-deploy-7bc91ec-manuell.sql

# 4. Das alte Image festlegen und VOR dem Start prüfen, dass es nichts pushen wird
cat > docker-compose.override.yml <<'EOF'
services:
  app:
    image: hr-portal-app:6124936
EOF
sudo docker compose run --rm -T --no-deps --entrypoint sh app -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?'
# erwartet: 0. Bei allem anderen NICHT starten: an Claude.

# 5. Starten
sudo docker compose up -d --no-build app
sudo docker compose logs -f app
# erwartet: "Datenbank-Schema ist bereits deckungsgleich — kein Abgleich noetig." (entrypoint.sh:68)
```

**Was davon geprüft ist:**
- Belegt ist das Einspielen einer `--schema=public`-Sicherung aus postgres:16-alpine
  mit `DROP SCHEMA public CASCADE` und anschließend `psql -1 -f`, auf einer
  Wegwerf-Datenbank. Die Sicherung enthält dabei selbst `CREATE SCHEMA public;`.
- Nicht auf dem Server geprobt sind die Prüfung in Schritt 4 und der Start über die
  Override-Datei.

**Wenn Schritt 3 scheitert**, ist das Schema leer. Dann **nicht** die App starten,
sondern die Sicherung aus Schritt 1 genauso einspielen und an Claude.

**Muss die Sicherung des Entrypoints eingespielt werden** (`vor-deploy-7bc91ec-entrypoint.sql`),
etwa weil 3.4 übersprungen wurde, dann zuerst an Claude. Sie stammt aus dem
`pg_dump` des App-Containers, und dessen Version ist ungeklärt (1.5).
- Neuere `pg_dump`-Versionen schreiben Zeilen wie `SET transaction_timeout` oder
  `\restrict`, die ein älteres `psql` 16 nicht kennt.
- Das ist Vorsicht aus dem Versionsunterschied und wurde **nicht geprobt**. Vor dem
  Einspielen gehört der Dateikopf geprüft.

### 7.4 Weg B: altes Image ohne Entrypoint, Schema bleibt (nur mit Claude)

**Wann:** Später, wenn schon gearbeitet wurde und die Daten bleiben sollen. Der alte
Prisma-Client ignoriert die zusätzlichen Spalten, die alle nullable sind.

```yaml
# docker-compose.override.yml, nur für die Dauer des Rückfalls
services:
  app:
    image: hr-portal-app:6124936
    entrypoint: ["node", "server.js"]
```

**Risiken:**
- Der Entrypoint muss bei **jedem** Start des alten Images umgangen sein, sonst tritt
  Fall A, B oder C ein.
- **Ungeklärt, nicht getestet:** Zeilen mit neuen Enum-Werten oder Onboarding-Links
  können im alten Client Lesefehler auslösen.
- Die Umstellungen der Migrationen bleiben stehen, nämlich geheilte Status und
  Zuständigkeiten als Schlüssel.

### 7.5 Nach einem Rückfall

- Die `docker-compose.override.yml` **löschen**, bevor wieder vorwärts deployt wird.
  Solange sie existiert, bekäme ein neuer Build das Etikett `hr-portal-app:6124936`.
- Der Repo-Stand auf dem Server bleibt `main`. Die Reparatur kommt als neuer Commit.
- Die Sicherungen `vor-deploy-7bc91ec-*.sql` und `vor-rueckfall-*.sql` aufheben.

---

## 8 · Offene Punkte nach dem Deploy

**Nicht Teil dieses Deploys:**
- **Paket 3**, die individuelle E-Mail, und **Paket 4**, „Unterlagen nachfordern“,
  sind offen. Mit Paket 4 kommt der Lauf `/api/cron/unterlagen-fristen`, den es noch
  nicht gibt.
- Die Korrektur der als `SONSTIGES` abgelegten Nachweise ist eine offene Entscheidung.

**Folgen, die dieser Deploy sichtbar macht:**
- **Kostenstellen:**
  - Die Altspalten `kostenstelle`/`kostenstelleAnteil` fallen erst im nächsten Release,
    wenn M-N0 den Merker `KOSTENSTELLEN_AUFTEILUNG_V1` auf dem Server zeigt
    (`schema.prisma:782-790`).
  - Die Absprache mit der Lohnbuchhaltung zum LOGA-Import bei Aufteilung ist offen.
- **Beschäftigungszeilen trotz „Nein“** (M-V6): Wie sie sich korrigieren lassen, ist
  ungeklärt. Stehen gebliebene Kinder lassen sich per SQL nicht erkennen.
- **Wieder geöffnete Altvorgänge** behalten ihren alten Fragebogen-Stand, jetzt auch
  beim Masernschutz (`minijob-offene-punkte.md:125-133`).

**Kosmetisch oder bekannt:**
- Ein abgeschlossener Vorgang ohne Vorgesetzten-Link zeigt unter „Kommende Schritte“
  „Einstellungsmodalitäten“ statt „Prozess abgeschlossen“.
- Der Hilfetext der Freigabeliste ist veraltet (`einstellungen-content.tsx:849-855`).
- Der n8n-Bericht wertet `departmentReminders` nicht aus (6.1).
- `offboarding-task-overdue` ist `wired: false` und feuert nie.

**Technische Schuld:**
- Die Versandsperren und Bremsen liegen im Speicher des Prozesses. Sie tragen nur,
  solange das Portal als **ein** Container läuft (CLAUDE.md, Abteilungsaufgaben
  Regel 10).
- CLAUDE.md führt `node prisma/seed.js` noch als normalen Server-Befehl. Der Eintrag
  sollte als „nur für eine frische Datenbank“ gekennzeichnet werden.

**Von früher noch offen, nicht an diesen Deploy gebunden:**
- Rest der SMTP-Gegenproben vom 07.09. (Protokoll :131-137).
- Freigabeliste pflegen, jetzt mit breiterer Wirkung (5.2).

**Nach dem Deploy:**
- Dieses Dokument um Log und Ergebnisse ergänzen.
- Claude setzt seine Memory-Einträge auf „deployt“: Änderungsplan,
  Formular-Validierung, Minijob-Rückmeldung.

---

## Anhang A · Rückmeldungen an Claude

| Wann | Was schicken | Weiter erst nach Antwort? |
|---|---|---|
| 1.1–1.7 | jede Abweichung vom Erwarteten, dazu die Versionen aus 1.5 | ja, bei STOPP |
| 2.2 | `vorher-ergebnis.txt`, **immer** | **ja** |
| 3.1 | Konflikt bei `git pull`, oder Dateien außerhalb von `docs/` nach `7bc91ec` | ja |
| 3.3 | `vorschau-delta.sql`, wenn Zählung oder DROP-Zeile abweichen oder der Befehl scheitert | ja |
| 3.4 | eigene Sicherung zu klein oder unvollständig | ja (vorher `sudo docker compose start app`, dann läuft das alte Portal wieder) |
| 3.6 | `start-log.txt`, **immer**, besonders bei Warnzeilen | nein, außer bei Fehlern |
| 3.7 | jeder Fehlschlag, nach `sudo docker compose stop app` bei einer Neustart-Schleife | ja |
| 4.2 | `nachher-ergebnis.txt`, **immer** | nein, außer bei Abweichungen |
| 5–6 | Entscheidungen zu angepassten Vorlagen, Empfängerfeldern der Eingangsbestätigung, aktiven Webhooks, Führungskraft-Erinnerungen, „Erneut senden“ je Zeile aus B-B10/B-N6, Checklisten-Vorlagen aus B-B11 | ja, je Punkt |
| 7 | vor **jedem** Rückfall, mit frischem S-R1 und, vor Weg A, der Ausgabe der Prüfung „ob gearbeitet wurde“ (7.3) | **ja** |

## Anhang B · Ungeklärt

- **n8n:** der Live-Stand, also URL (`hr.credo-schulen.de` im Export), Timeout,
  Zeitplan und welche Crons überhaupt eingeplant sind.
- **HR-Postfach** für die An-Felder: `personalbuchhaltung@fes-minden.de` laut Vorlagen
  und Reminder-Export, bestätigen. Der Offboarding-Export
  (`n8n/CREDO_HR_Portal_Offboarding_Workflow.json`) schreibt dagegen an
  `personal@credo-gruppe.de`.
- **n8n-Offboarding-Workflow:** ob er live noch aktiv ist und ob Webhooks im Portal
  auf ihn zeigen (MAIL3, 6.4). Davon hängt der Doppelversand ab.
- **Schweigende Abteilungslinks:** wie viele es auf dem Server gibt (B-B10) und ob HR
  jeden davon neu versenden will. Die Logik von B-B10 ist nur mit Testzeilen geprüft,
  auf der Dev-Datenbank gibt es keine informierten Offboarding-Links.
- **Versionen:** `pg_dump` im App-Container und `psql` im DB-Container (1.5). Das ist
  nur für einen Rückfall mit der Sicherung des Entrypoints wichtig.
- **Build-Dauer.** Sie wurde am 07.09. nicht protokolliert.
- **Server-Befehle nicht geprobt:** die Vorschau per `docker compose run` (3.3) und der
  Start über die Override-Datei (7.3). Die Befehle sind nur lesend bzw. vorgeschlagen.
- **Weg B:** Lesefehler des alten Clients bei neuen Enum-Werten und Onboarding-Links.
- **Vorlagentexte:** Ob HR gespeicherte Texte bewusst angepasst hat, zeigt MAIL1 nicht,
  nur ob sie gespeichert sind.
- **Beschäftigungszeilen trotz „Nein“:** wie sie sich korrigieren lassen (M-V6).
- **Link-Gültigkeit:** ob `MAGIC_LINK_EXPIRY_HOURS` auf dem Server von 720 abweicht
  (1.5, B-B2).
- **Nicht auf einer Wegwerf-Datenbank mit altem Schema geprobt:** B-B10 und B-B11 in
  der VORHER-Datei (nur Namensabgleich mit dem alten Schema, lesend gegen Dev mit
  neuem Schema). Die Prüfung „ob gearbeitet wurde“ in 7.3 lief nur gegen Dev, der
  Befehl `docker logs -t hr-portal-app` nicht auf dem Server.
