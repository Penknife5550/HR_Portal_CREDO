# CLAUDE.md — CREDO HR-Portal

## Projekt

Digitales HR-Portal der CREDO Schultraegergruppe (16 Mandanten). Verwaltet Onboarding, Offboarding, Verbeamtung (PSI), Exit-Interviews und Zeugnisse. Sprache der UI ist Deutsch.

## Tech Stack

- **Framework:** Next.js 15 (App Router, Standalone Output)
- **Frontend:** React 19, TypeScript 5.8, TailwindCSS 4, Radix UI
- **Backend:** Next.js API Routes (`src/app/api/`)
- **Datenbank:** PostgreSQL 16 + Prisma 6 ORM
- **Auth:** JWT (jose/jsonwebtoken) + bcryptjs, Magic Links
- **Verschluesselung:** AES-256-GCM fuer IBAN, SV-Nr, Steuer-ID (`src/lib/encryption.ts`)
- **E-Mail:** Nodemailer/SMTP (primaerer Kanal); Webhooks/n8n nur optionaler Zusatzkanal
- **PDF:** pdfkit, QR-Codes via qrcode
- **Tests:** Jest + ts-jest
- **Linting:** ESLint 9 (next/core-web-vitals)
- **Path Alias:** `@/*` → `src/*`

## Befehle

```bash
npm run dev          # Entwicklungsserver
npm run build        # Produktion-Build
npm run lint         # ESLint
npm run test         # Jest-Tests
npm run db:push      # Schema synchronisieren (kein Migrations-Ordner)
npm run db:seed      # Seed (tsx prisma/seed.ts)
npm run db:studio    # Prisma Studio
npm run db:generate  # Prisma Client generieren
```

## Docker / Deployment

### Eine einzige Compose-Datei: `docker-compose.yml`

- **DB-User:** `hrportal`
- **Container:** `hr-portal-app`, `hr-portal-db`
- **Env-Datei:** `.env` (alle Secrets)
- **Netzwerk:** `reverse_proxy` (extern, fuer Caddy) + `internal` (DB nur intern erreichbar)
- **Kein Port-Expose:** Caddy routet ueber das `reverse_proxy`-Netzwerk

```bash
sudo docker compose up -d --build
```

### Produktions-Server (fes-vm-ubuntudocker)

- **Pfad auf dem Server:** `/vol/container/HR_Portal_CREDO`
- **Domain:** `hr.fes-credo.de`
- **Reverse Proxy:** Caddy (externes Netzwerk `reverse_proxy`)
- **Env-Datei:** `.env` (basiert auf `.env.production.example`)

### Docker-Befehle auf dem Server

```bash
# Build & Start
sudo docker compose up -d --build

# Logs anzeigen
sudo docker compose logs -f app

# DB-Schema synchronisieren
sudo docker exec hr-portal-app npx prisma db push --skip-generate

# Seed ausfuehren (kompiliertes JS im Container!)
sudo docker exec hr-portal-app node prisma/seed.js

# Health-Check
sudo docker exec hr-portal-app curl -s http://localhost:3000/api/health
```

**Wichtig:** Im Docker-Container ist `tsx` NICHT verfuegbar. Das Seed-Script wird beim Build zu JS kompiliert (`prisma/seed.js`). Immer `node prisma/seed.js` statt `npx prisma db seed` verwenden.

### Entrypoint (`entrypoint.sh`)

Beim Container-Start passiert automatisch:
1. Pflicht-Umgebungsvariablen pruefen (JWT_SECRET, ENCRYPTION_KEY, BEM_ENCRYPTION_KEY, DATABASE_URL)
2. **Schema-Vergleich** (`prisma migrate diff --exit-code`) — nur wenn es einen Unterschied gibt, geht es weiter mit 3.
3. **Sicherung** (`pg_dump` nach `/backups/vor-schema-abgleich-<Zeitstempel>.sql`) — schlaegt sie fehl, **bricht der Start ab**
4. `prisma db push --skip-generate --accept-data-loss` (Schema synchronisieren)
5. Seed-Check (`prisma/seed-check.js`) — System-Vorlagen sicherstellen, **einmalige Datenmigrationen** ausfuehren, Admin-User anlegen falls noch keiner existiert
6. Next.js Server starten (`node server.js`)

**Warum die Sicherung den Start blockieren darf.** `db push` laeuft mit
`--accept-data-loss`, sonst startet der Container bei jeder neuen
Unique-Constraint nicht mehr. Das Flag heisst aber woertlich, was es tut: Eine in
`schema.prisma` umbenannte Spalte wird als „alte loeschen, neue anlegen"
ausgerollt — unbeaufsichtigt und ohne Rueckfrage. Ohne Migrationsordner gibt es
kein Netz darunter, also ist der `pg_dump` das Netz. Kein Dump, kein Push.

Voraussetzung dafuer: Der Dienst `app` muss `./backups:/backups` einhaengen
(steht in `docker-compose.yml`). Fehlt die Einhaengung, nennt die Fehlermeldung
beim Start genau diese Zeilen. Steuerbar ueber `DB_BACKUP_DIR` (Standard
`/backups`) und `DB_BACKUP_KEEP` (Standard 10 — aeltere eigene Dumps werden
aufgeraeumt, fremde Dateien im Verzeichnis bleiben unangetastet).

Die Einhaengung allein genuegt aber nicht. Der Container laeuft als **uid 1001**
(`nextjs`) mit der Primaergruppe **65533 (`nogroup`)** — das Dockerfile legt zwar
`nodejs` mit gid 1001 an, weist sie dem Benutzer aber nie zu. Bei einem
**Bind-Mount** uebernimmt Docker die Rechte des Host-Verzeichnisses unveraendert
(anders als beim benannten Volume `uploads_data`). Gehoert `./backups` auf dem Host
jemand anderem, scheitert schon das Anlegen der Dump-Datei, und der Start bricht mit
`FATAL: Sicherung ... fehlgeschlagen` ab. Einmal je Server:

```bash
sudo chown 1001 backups
```

Zwei Irrwege: `sudo` beim Docker-Aufruf aendert daran nichts — es regelt den Zugriff
auf den Daemon, nicht die Kennung des Prozesses im Container. Und `chgrp 1001`
greift nicht, weil 1001 die Gruppe `nodejs` ist, die dem Benutzer nicht gehoert.
Vorab pruefbar, ohne etwas zu veraendern:

```bash
sudo docker run --rm --user nextjs --entrypoint sh -v "$PWD/backups:/backups" <image> -c 'id; touch /backups/.schreibtest && rm /backups/.schreibtest && echo OK'
```

### Einmalige Datenmigrationen

Migrationen, die genau einmal laufen duerfen, stehen in `prisma/seed-check.js` und
merken sich ihren Lauf im Modell `SystemMigration` (Tabelle `system_migrations`).

- **Nicht** das `AuditLog` als Merker verwenden: Logs werden aufgeraeumt, und eine
  nicht idempotente Migration, die ein zweites Mal laeuft, verschiebt Daten erneut.
- Merker und Datenaenderung gehoeren in **dieselbe Transaktion** — entweder beides
  oder nichts.
- Fehler werden geloggt, brechen den Start aber nicht ab. Ohne Merker laeuft die
  Migration beim naechsten Start erneut.
- `prisma/seed-check.js` exportiert seine reinen Funktionen und ruft `main()` nur
  hinter `require.main === module` auf — so sind die Regeln ohne Datenbank testbar
  (`src/__tests__/lib/fragebogen-steps.test.ts`).

### Umgebungsvariablen (Pflicht)

| Variable | Beschreibung | Generieren mit |
|---|---|---|
| `DB_PASSWORD` | PostgreSQL-Passwort | frei waehlbar |
| `JWT_SECRET` | JWT-Signierung (kein "dev_secret"!) | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | 64 Hex-Zeichen fuer AES-256-GCM | `openssl rand -hex 32` |
| `BEM_ENCRYPTION_KEY` | 64 Hex-Zeichen, eigener Schluessel fuer BEM-Gesundheitsdaten (Art. 9 DSGVO). Der Entrypoint bricht ohne ihn ab — **nicht** derselbe Wert wie `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `CRON_SECRET` | Absicherung der Cron-Endpunkte | `openssl rand -base64 24` |
| `APP_URL` | Basis-URL | `https://hr.fes-credo.de` |
| `ADMIN_INITIAL_PASSWORD` | Initiales Admin-Passwort (optional, sonst zufaellig) | frei waehlbar |
| `DB_BACKUP_DIR` | Ablage der Sicherung vor dem Schema-Abgleich (optional, Standard `/backups`) | — |
| `DB_BACKUP_KEEP` | Wie viele eigene Sicherungen behalten werden (optional, Standard 10) | — |

## Projektstruktur

```
src/
├── app/
│   ├── (portal)/          # Geschuetzte Routen (JWT-Auth via Middleware)
│   │   ├── dashboard/     # Onboarding, Offboarding, Verbeamtung
│   │   ├── checklisten/
│   │   ├── einstellungen/
│   │   ├── mandanten/
│   │   └── ...
│   ├── api/               # REST-Endpunkte
│   ├── fragebogen/        # Oeffentliches Personalfragebogen-Formular (Magic Link)
│   ├── exit-interview/    # Oeffentliches Exit-Interview-Formular
│   └── ...
├── components/            # Wiederverwendbare UI-Komponenten
├── lib/                   # Shared Utilities (auth, encryption, mailer, validations)
└── __tests__/             # Jest-Tests
```

## Konventionen

- **Keine Umlaute** in Variablen-/Funktionsnamen (nur in UI-Strings)
- **ESLint:** Die Regel `@typescript-eslint/no-explicit-any` existiert NICHT in der aktuellen ESLint-Config. Keine `eslint-disable`-Kommentare dafuer verwenden.
- **Links:** Innerhalb der App immer `<Link>` von `next/link` statt `<a>` verwenden
- **Prisma:** Kein Migrations-Ordner — Schema wird mit `prisma db push` synchronisiert
- **API-Handler:** Zentrale Wrapper in `src/lib/api-handler.ts` (mit Auth + Error-Handling)
- **Validierung:** Zod-Schemas in `src/lib/validations/`
- **Berechtigungen:** Rollen-System in `src/lib/permissions.ts` (SUPER_ADMIN, ADMIN, HR_STAFF, VIEWER)

## Onboarding: zwei Spuren

Fragebogen (Mitarbeiter/in) und Einstellungsmodalitaeten (Fuehrungskraft) laufen seit 09/2026 **parallel, in beliebiger Reihenfolge**. Regeln und Begruendung: `src/lib/onboarding-spuren.ts` (rein, client-sicher) und `src/lib/onboarding-status-abgleich.ts`.

- **Gates an Zeitstempeln, nicht am Status.** Jede Spur hat ihren eigenen Zeitstempel (`submittedAt` bzw. `supervisorSubmittedAt`, Altfall `…Data.isComplete`). Lesen, Schreiben und Absenden eines Links haengen nur daran plus an den HR-Status `REVIEWED`/`COMPLETED`/`EXPIRED` — nie am Stand der anderen Spur (`darfMitarbeiterSchreiben`, `darfVorgesetzteSchreiben`, Gates in `auth.ts`).
- **Status NIE direkt setzen.** Er ist nur noch eine Zusammenfassung (`gesamtStatus`). Jeder Schreiber beansprucht in EINER interaktiven Transaktion zuerst seine Spur per bedingtem `updateMany` (WHERE eigener Zeitstempel `null`, `status notIn HR_STATUS`; count 0 → 409), ruft **danach** `statusAbgleichen(tx, id)` auf und schreibt das AuditLog im selben Commit. Nur so landen zwei gleichzeitige Abgaben korrekt auf „Bereit zur Prüfung". Ausnahmen: HR-PATCH (nur `REVIEWED` bei `bereitZurPruefung`, `COMPLETED` nur aus `REVIEWED`, `EXPIRED`) und der bedingte Wechsel `INVITED → IN_PROGRESS` beim ersten Speichern.
- **`SUPERVISOR_SUBMITTED` heisst „Bereit zur Prüfung"** (beides eingereicht). Solange der Fragebogen offen ist, folgt der Status der Fragebogen-Spur (`INVITED`/`IN_PROGRESS`), auch wenn die Modalitaeten schon da sind.
- **Vorgesetzten-Link** (`POST /api/onboarding/[id]/supervisor-link`) ist wiederholungssicher: gueltiger Link an dieselbe Adresse wird wiederverwendet (keine zweite Mail), andere Adresse **oder abgelaufener Link** = neuer Token (alter tot), nach Abgabe der Modalitaeten 409, Adresse der Person selbst 400 (`gleicheAdresse`, dieselbe Regel wie beim Anlegen). Die Karte „Vorgesetzten-Link" in der Uebersicht bietet „Neuen Link erzeugen" an, sobald der Link abgelaufen ist oder eine andere Adresse eingetragen wird — sonst blockierte `bereitZurPruefung` (wartet bei jedem Link auf die Modalitaeten) den Vorgang dauerhaft.
- **Anlegen mit beiden Links** (`POST /api/onboarding`, Dialog „Neuer Vorgang"): Vorname/Nachname und E-Mail der Fuehrungskraft sind optional. Der Name steht am Vorgang UND als Vorbelegung in `PersonalData` (Fragebogen zeigt ihn, die Person kann ihn korrigieren; `currentStep` bleibt 0, Status `INVITED`). Mit Fuehrungskraft setzt DIESELBE Transaktion den Link ueber `vorgesetztenLinkSetzen` (`src/lib/onboarding-einladung.ts`) — dieselbe Funktion wie `/supervisor-link`. Die Fuehrungskraft eintragen duerfen nur `HR_EDIT_ROLES` (sonst 403; das Anlegen selbst bleibt bei `PROCESS_CREATE_ROLES`), Mandant per `canAccessProcess` (404 „Organisation nicht gefunden"). Mails erst nach dem Commit; die Antwort meldet `mailVersand` je Link, ein Fehlschlag rollt nichts zurueck (kein automatischer neuer Versuch — HR gibt den Link dann selbst weiter).
- **Erinnerungs-Cron** (`/api/cron/reminders`): Anker der Vorgesetzten-Erinnerung ist `supervisorLinkSentAt`, fuer Bestandslinks ohne diesen Wert Ablauf minus Link-Gueltigkeit, nie vor `invitedAt` (`vorgesetztenLinkErzeugtAm`). Ohne Namen heisst die Person dort und in der Einladung `supervisor-link-created` `MITARBEITER_NEUTRAL`, nie ihre E-Mail-Adresse; die Payload-Bausteine (`vorgesetztenLinkMailFelder`) haben kein Feld `email`, Vorlagen setzen `{{mitarbeiter_name}}` nur nach „für" (Akkusativ). Merker `last…ReminderAt`: bei SENT **und SKIPPED** setzen (Vorlage aus → sonst taeglich Webhook + Protokolleintrag), bei FAILED nicht (naechster Lauf versucht es erneut).
- **Die Abteilungsaufgaben haengen an der Modalitaeten-Spur** (Paket 5, siehe Abschnitt „Abteilungsaufgaben"): „Abteilungen informieren" verlangt eingereichte Modalitaeten samt Vertragsbeginn (`onboardingVersandSperre`), weil die Faelligkeiten daran haengen. Das ist die EINZIGE Stelle, an der eine Funktion auf die andere Spur schaut — und sie liest den Zeitstempel, nicht den Status.
- **Die HR-Uebersicht zeigt beide Spuren nebeneinander** (Paket 2, 09/2026). `ProcessWorkflowStepper` rendert ALLE Schritte mit `status: "active"` (`filter` statt `find`) — frueher fiel der zweite gleichzeitig aktive Schritt aus allen drei Listen und war unsichtbar. Ab zwei aktiven Schritten stehen die Karten in einem Raster, tragen den Chip „Läuft parallel" statt „Aktueller Schritt" und bekommen die Zeile „Schritte X und Y laufen parallel, in beliebiger Reihenfolge"; die Nummern baut die Komponente selbst aus `steps.indexOf`, ein Prop mit festen Zahlen liefe beim naechsten eingeschobenen Schritt auseinander. Bei genau EINEM aktiven Schritt bleibt das Markup unveraendert (daran haengen bestehende Komponententests). Gilt fuer Onboarding **und** Offboarding (dort waren „Rückgaben einsammeln" und „Zeugnis erstellen" neben ihrem Nachbarn nie zu sehen).
- **Die Oberflaeche liest die Spuren-Funktionen, nie `isComplete`.** Die Schrittdaten des Onboardings stehen rein und getestet in `src/app/(portal)/dashboard/[id]/uebersicht-schritte.ts` (`onboardingWorkflowSchritte`, `spurenChips`, `onboardingKurzschritte`) mit eigener enger Eingabeschnittstelle `SchritteStand` — kein Import von `DetailData` (Zirkelbezug), `DetailData` erfuellt sie strukturell. Dort wie in Kopf-Chips, Karten, Reiter-Zaehlern und der Dashboard-Liste entscheiden `mitarbeiterAbgesendet`/`vorgesetzteAbgesendet`/`bereitZurPruefung`; sonst zeigte der Altfall „Zeitstempel gesetzt, `isComplete` fehlt" „in Bearbeitung", waehrend Server und Statuszeile „eingereicht" sagen. Der Modalitaeten-Schritt haengt an KEINER Stelle am Fragebogen (Knopf „Vorgesetzten-Link erstellen" auch bei offenem Fragebogen). Gleichzeitig aktiv sind nur die beiden SPUREN — „Daten prüfen" und „Checkliste abarbeiten" nicht (`checklisteFreigegeben = geprueft`), sonst stuende der Parallel-Satz bei jedem Vorgang und verwaesserte genau die Aussage, um die es geht. „Geprueft" ist `REVIEWED`/`COMPLETED`, **nicht** `istHrStatus`: `EXPIRED` gehoert dort dazu, wurde aber nie geprueft.
- **Modalitaeten-Fortschritt nur aus `modalitaetenFortschritt()`** (`src/lib/validations/supervisor-data.ts`, direkt neben `SUP_STEP_CONFIG`). `SupervisorData.currentStep` ist ein **0-basierter Index** (Schema-Default 0 = nie gespeichert); die Anzeige rechnet +1 und kappt am letzten Schritt. `0` heisst „noch nicht begonnen", nicht „Schritt 1 von 5". `formatModalitaetenFortschritt` liefert den fertigen Satz fuer Stepper, Karte „Vorgesetzten-Link" und Dashboard-Liste — drei Anzeigestellen, eine Rechnung, dieselbe Zahl, die auch die Fuehrungskraft sieht.
- **„Bereit zur Prüfung" duerfen die HR-Mails nur mit Beleg sagen.** `questionnaire-completed` und `supervisor-completed` bekommen ihre Aussage ueber die Gegenspur als Merker im Payload, und zwar aus `StatusAbgleich.nach` — dem Stand AUS der Transaktion, nicht aus dem Lesestand davor (der kennt eine gleichzeitige Abgabe der anderen Seite nicht). Fragebogen: genau einer von `modalitaeten_eingereicht` (`nach === "SUPERVISOR_SUBMITTED"`), `modalitaeten_offen` (`SUPERVISOR_PENDING`), `ohne_vorgesetzten_link` (`SUBMITTED`). Modalitaeten: `fragebogen_eingereicht` bzw. `fragebogen_offen`. Fehlt der Abgleich, bleiben die drei leer bzw. gilt „Fragebogen offen" — kein Satz ist besser als ein falscher. Merker sind **Zeichenketten** (`"ja"`/`""`): `renderTemplate` kennt nur „nicht leer", `String(false)` waere nicht leer und der Block bliebe stehen. `{{mitarbeiter_name}}` wird ausdruecklich gesetzt (`mitarbeiterName(...) ?? MITARBEITER_NEUTRAL`), sonst faellt `extractVariables` auf `payload.email` zurueck — die private Adresse im HR-Betreff; im Betreff steht der Name nur nach „für" (Akkusativ). Nach einem Deploy zeigen beide Vorlagen den neuen Text erst nach „Text auf Standard zurücksetzen" (eine DB-Zeile ueberschreibt den Code-Default vollstaendig).
- **Eingangsbestaetigung ueber den normalen Versandweg.** `questionnaire-confirmation-employee` laeuft seit Paket 2 ueber `triggerWebhooks` statt ueber `sendEmail` mit selbst geladener Vorlage; der Text ist unveraendert. Damit wirken Versandprotokoll, Aktiv-Schalter, `recipientTo/Cc/Bcc`, Reply-To, Bedingungsbloecke und die HTML-Maskierung der Namen — und ein Webhook auf dieses Ereignis feuert ab jetzt wirklich (alten n8n-Workflow gegenpruefen, sonst Doppelversand). Den Empfaenger traegt ohne gespeicherte Vorlage der Katalog-Default `{{email}}` (`events.ts`), nicht die Route.
- Die JS-Kopie von `gesamtStatus` in `prisma/seed-check.js` (Heil-Migration `ONBOARDING_PARALLELE_SPUREN_V1`) haelt ein Test gegen die TS-Fassung — beide gemeinsam aendern; dasselbe gilt fuer die Zuordnungstabelle der Migration `ONBOARDING_ABTEILUNGSAUFGABEN_V1`.

## E-Mail-Versand (SMTP primaer)

- **Dispatcher:** `triggerWebhooks(event, payload)` in `src/lib/webhooks.ts` — sendet IMMER zuerst die E-Mail per SMTP (`sendEventEmail` in `src/lib/mailer.ts`), Webhooks feuern nur zusaetzlich
- **Event-Katalog:** `src/lib/events.ts` — eine Definition je Event (Name, Gruppe, Empfaenger-Default, Beispiel-Payload). Neue Events MUESSEN hier eingetragen werden (Test erzwingt das)
- **Vorlagen:** `EmailTemplate` (DB, Admin-UI) mit Empfaenger-Feldern `recipientTo/Cc/Bcc` (kommagetrennt, `{{variablen}}`-faehig); Code-Defaults in `src/lib/default-email-templates.ts`
- **Antwort-Adresse (Reply-To):** global in `SmtpConfig.replyToEmail`, optional je Vorlage via `EmailTemplate.recipientReplyTo` (`{{variablen}}`-faehig) ueberschreibbar. Aufloesung: Vorlagen-Feld > globaler SMTP-Wert > kein Reply-To
- **Protokoll:** Jeder Versandversuch landet im `EmailLog` (SENT/FAILED/SKIPPED, 90 Tage Aufbewahrung)
- **Variablen:** `renderTemplate` maskiert NICHT (manche Variablen tragen fertiges HTML, z.B. `warnungen_liste_html`). Nur die Namensvariablen (`vorname`, `nachname`, `mitarbeiter_name`, `employeeName`, …) und die Freitexte `kommentar_text`/`aufgabenliste` (Abteilungsaufgaben) maskiert `renderEventEmail` im HTML-Teil (`mitMaskiertenNamen`); Betreff und Textteil bleiben roh. `{{ablaufdatum}}` kommt immer aus `formatDatumDE` (deutsche Zeit, TT.MM.JJJJ) — der Container laeuft in UTC.
- **Reporting-API:** Read-Only-Endpunkte unter `/api/reports/*`, Auth per API-Key (`ApiKey`-Modell, Verwaltung in Einstellungen → API-Zugang) oder Portal-Session. Keine sensiblen Felder (IBAN/SV-Nr/Steuer-ID) ausgeben!

## Dokumente & Starterpaket

- **Dokumente-Hub pro Vorgang:** Tab „Dokumente" der Onboarding-Detailseite buendelt Erstellen (Vorlagen + System-Dokumente), Versenden (Starterpaket), Hochgeladenes und PDF-Exporte — mit Prozessschritt-Anzeige („Sie sind hier"). Der **Versand** (Karte „Dokumentenpaket") sitzt seit 04.09.2026 auch im Dokumente-Tab von Offboarding, Verbeamtung und Vertragsverlaengerung; der uebrige Hub (Erstellen/Hochgeladenes/Exporte) bleibt dort Zukunft.
- **Platzhalter-Katalog/Resolver:** Verfuegbare `{variablen}` je Modul liegen client-sicher in `src/lib/placeholder-catalog.ts` (re-exportiert von `doc-template-resolvers.ts`). Der ONBOARDING-Resolver fuellt sie aus Personal-/Vorgesetzten-Daten; sensible Felder (IBAN/SV-Nr/Steuer-ID) werden NUR entschluesselt, wenn die Vorlage sie nutzt (Audit via `sensitiveFields`). Im Vorlagen-Editor zeigt `VariablenKatalog` die Variablen klickbar an.
- **System-Vorlagen:** Editierbare Standard-Vorlagen (z.B. Fuehrungszeugnis-Antrag, `DocumentTemplate.isSystem=true`, Modul ONBOARDING) liegen als Asset unter `public/system-dokumente/` und werden vom Entrypoint (`prisma/seed-check.js`) idempotent geseeded. Das amtliche **Masernschutz-NRW-Formular** wird als statisches PDF (`public/system-dokumente/masernschutz-nrw.pdf`) bereitgestellt — bewusst nicht nachgebaut (Layout-Treue).
- **Dokumentenpaket (Standardpaket + Versand):** Pro Mandant **und Modul** konfigurierbares Set aus zwei Quellen — feste Pool-PDFs (`StarterpaketDokument`, Scope GLOBAL/MANDANT) und Brief-Vorlagen (`DocumentTemplate`), gemeinsam geordnet in `StarterpaketAuswahl` (`dokumentId` ODER `templateId`, plus `modul`). Konfig unter `/mandanten/[id]/starterpaket`.
- **Versand:** `src/lib/dokumentenpaket.ts` (modulneutral) hinter drei Routen — `GET /api/dokumentenpaket` (Zusammenstellung fuer den Dialog), `POST .../pruefen` (Vorpruefung), `POST .../versenden`. Oberflaeche: `dokumentenpaket-section.tsx` + `dokumentenpaket-dialog.tsx`. Verdrahtet sind **alle vier Vorgangsmodule** (Onboarding, Vertragsverlaengerung, Verbeamtung, Offboarding) mit je eigener Mailvorlage; `modulVerdrahtet()` prueft beides, damit kein Modul ohne gelesenes Anschreiben versenden kann. Die abgeloeste `starterpaket.ts` und `POST /api/onboarding/[id]/starterpaket` gibt es nicht mehr.
- **Ausnahme vom Dispatcher-Gebot (mit Begruendung):** `dokumentenpaket.ts` ruft `sendEventEmail` DIREKT statt `triggerWebhooks`. Der Dispatcher reicht weder Anhaenge noch `overrideTo` durch; ihn dafuer zu erweitern hiesse, bis zu 15 MB Personalunterlagen an eine frei konfigurierbare Webhook-URL zu schicken. Die Regel „immer ueber `triggerWebhooks`" gilt unveraendert fuer alle anderen Events — hier ist sie bewusst und begruendet ausgesetzt. Preis: Ein Webhook auf eines der vier `*-sent`-Ereignisse wird angelegt, angezeigt und feuert nie. Das `EmailLog` schreibt `sendEventEmail` selbst, der Protokollteil geht also nicht verloren.
- **Fuenf Regeln, die beim Aendern gelten muessen:**
  1. **Mandant selbst pruefen.** Die Resolver fallen bei fehlendem Zugriff STILL auf die allgemeinen Platzhalter zurueck — ohne eigene `canAccessProcess`-Pruefung ginge ein leeres Schreiben an eine echte Adresse.
  2. **Sensible Vorlagen brauchen eine Bestaetigung je Versand** (Entscheidung 02.09.2026). Serverseitig erzwungen (409); zusaetzlich bekommt der Resolver die sensiblen Platzhalter ohne Bestaetigung gar nicht erst — die Schranke sitzt im Datenfluss, nicht nur in der Abfrage.
  3. **Nachweis nur nach echtem SENT**, in EINER Transaktion (`DokumentenVersand` + `GeneratedDocument.versandId` + AuditLog + Zeitstempel). Scheitert sie nach dem Versand, bleibt das Ergebnis SENT mit lauter Warnung — ein Fehlschlag wuerde zum Doppelversand verleiten.
  4. **Vorlagen NUR aus `uploads/` und `public/system-dokumente/` lesen** (`leseVorlagenDatei`). `dateipfad` steht in der Datenbank; `readUploadedFile` allein weist System-Vorlagen ab, ungeprueftes `readFile` waere ein Scheunentor.
  5. **Abweichende Empfaengeradressen brauchen eine Freigabe** (`src/lib/empfaenger-allowlist.ts`). Die im Vorgang hinterlegte Adresse ist IMMER erlaubt — beim Onboarding ist eine private Freemail-Adresse der Regelfall, eine Allowlist ueber alle Adressen blockierte also genau ihn. Nur bei Abweichung muss die Domain in `SmtpConfig.allowedRecipientDomains` stehen (Vergleich exakt, nicht per `endsWith`); **leere Liste = keine Einschraenkung** (Auslieferungszustand). Die Pruefung sitzt VOR dem Bauen der Anhaenge — danach ist die Mail samt IBAN unterwegs. Dazu bremst die Versandroute je Benutzerkonto: **10 pro Minute, 60 pro Stunde**, auch fuer abgewiesene Versuche; die Vorpruefung bewusst ohne Limit (sie laeuft nach jeder Aenderung im Dialog und persistiert nichts).
- **Statuscodes:** 404 (Vorgang unbekannt **oder** fremder Mandant — gleicher Text, damit der Code nichts verraet), 409 (leere Auswahl, fehlende Bestaetigung, fehlende Datei, fehlerhafte Vorlage, nicht freigegebene Empfaengeradresse, laufender Versand), 413 (zu gross), 429 (Rate-Limit der Versandroute), 502 (PDF-Dienst oder SMTP). Zentral in `statusFuerFehler()`.
- **Doppelversand-Sperre:** prozesslokal (`laufendeVersendungen`) — ebenso das Rate-Limit der Versandroute. Beide tragen nur, solange das Portal als EIN Container laeuft; beim waagerechten Skalieren durch eine gemeinsame Ablage (Datenbank/Redis) ersetzen.

## Abteilungsaufgaben (Offboarding und Onboarding)

Checklisten-Aufgaben mit zustaendiger Abteilung (IT, Verwaltung / Sekretariat, Facility, Buchhaltung, DSB, eigene Schluessel) oder der Zustaendigkeit Fuehrungskraft (`VORGESETZTER`) gehen per Link an diese Stelle. Sie hakt ohne Anmeldung ab und kann HR einen Kommentar hinterlassen. HR steuert das ueber die Karte „Aufgaben für Abteilungen" im Tab Checkliste (Paket 1b, 09/2026).

Seit Paket 5 (09/2026) gilt das fuer **beide Module**: Offboarding und Onboarding teilen Kern, Karte, Dialog und Link-Seite. Was sich unterscheidet, steht an EINER Stelle (`AbteilungsModul`, `MODUL_TEXTE` in `abteilungsaufgaben.ts`: Titel, Personen-Label, Bezugsdatum, API-Basis, Seitenpfad); der Onboarding-Teil des Servers liegt in `src/lib/abteilungsaufgaben-onboarding.ts`, die Mailfelder des Vorgangs in `src/lib/onboarding-abteilung-mail.ts`. Die Abweichungen sind unten unter „Onboarding (Paket 5)" aufgezaehlt — sonst gilt alles Folgende unveraendert fuer beide.

- **Wo die Regeln liegen:**
  - `src/lib/abteilungsaufgaben.ts` — rein, client-sicher, ohne Uhr (jede Funktion bekommt `jetzt`), vollstaendig getestet: Empfaenger, Versandentscheidung, Gueltigkeit, Erinnerungsstufen, Mailfelder, Versandbericht und Statuscode, Zeilen der Karte samt erlaubter Aktionen (`abteilungsZeilenBauen`), `MELDUNGEN`, `ABTEILUNGS_AUDIT`/`_LABELS`. Spricht bewusst nicht von „Offboarding", damit Paket 5 sie unveraendert nutzt.
  - `src/lib/abteilungsaufgaben-dienst.ts` (Server) — die vier Aktionen, Uebersicht fuer die Detailseite, taeglicher Lauf, Fristen verschieben, Fuehrungskraft.
  - `src/lib/abteilungsaufgaben-uebergaenge.ts` (Server) — Abhaken und Kommentar ueber den Link und im Portal, Abteilungsstatus, Mails nach dem Commit.
  - Zod in `src/lib/validations/abteilungsaufgaben.ts`. Oberflaeche modulneutral in `src/components/abteilungsaufgaben/` (`abteilungen-karte.tsx`, `aufgaben-seite.tsx`). Client-Code importiert Werte nur aus der reinen Datei, aus `-dienst`/`-uebergaenge` nur `import type`.
- **Routen** sind duenn (Session, Body, EINE Dienstfunktion, Antwort 1:1 — kein zweites Pruefen oder Protokollieren):
  - `POST /api/offboarding/[id]/department-links` — Body leer/`{}` = informieren, sonst `{ aktion: "erneut-senden"|"erinnern"|"link-erneuern", departmentKey }` (Alias `{ action: "remind" }`). Kaputtes JSON = 400, nie „informieren".
  - `GET /api/offboarding/[id]` liefert `abteilungen` (einzige Quelle der Karte), `fuehrungskraft` und `departmentLinks[].url` (vom Server aus APP_URL, nie `window.location`). `PATCH` nimmt Fuehrungskraft und letzten Arbeitstag an.
  - `PATCH /api/offboarding/[id]/checklist/[itemId]` (Portal), oeffentlich `GET /api/offboarding-tasks/[token]` und `PATCH …/[itemId]`, `POST /api/cron/offboarding-reminders` (n8n, `CRON_SECRET`), `/api/settings/departments[/id]` (`adminHandler`).
  - Onboarding (Paket 5, gleiche Form): `POST /api/onboarding/[id]/abteilungen` (Aktionen) und `GET …/abteilungen` (Uebersicht, schreibt nichts und entschluesselt nichts), `PATCH /api/onboarding/[id]/checklist/[itemId]` (Portal, Antwort `{ item, progress }`), oeffentlich `GET /api/onboarding-tasks/[token]` und `PATCH …/[itemId]`. Die Erinnerungen haengen am bestehenden `POST /api/cron/reminders` (Abschnitt 3), NICHT an einem eigenen Cron. `GET /api/onboarding/[id]` liefert zusaetzlich `abteilungen`, `fuehrungskraft`, `departmentLinks[].url` und je Aufgabe `erledigtVon`/`faelligAm`.
- **Zehn Regeln, die beim Aendern gelten muessen:**
  1. **Token nur einmal.** Ein verschickter Link bleibt gueltig; „Abteilungen informieren" schreibt nur an, wer noch keinen zugestellten Link hat (`versandEntscheidung`). Einen neuen Token gibt es NUR ueber „Link erneuern…" (mit Rueckfrage) oder wenn HR nach einer Adressaenderung „Erneut senden"/„Erinnern" waehlt — beides mit AuditLog `DEPARTMENT_LINK_RENEWED`. Der Cron erzeugt nie einen Token und verlaengert nur mit GLEICHEM Token. Der Link wird VOR dem Versand geschrieben (Anlage per `upsert`), damit keine Mail einen Token enthaelt, den es nicht gibt.
  2. **Nachweis nur bei echtem Versand.** `sentAt` (einmalig) und `lastSentAt` nur bei SENT oder WEBHOOK; FAILED/SKIPPED landen nur in `lastSendStatus`/`lastSendDetail` (nie zugestellt = Zeile rot, sonst Hinweis „Letzte E-Mail nicht zugestellt"). **WEBHOOK-Regel:** SKIPPED wegen deaktivierter Portal-Vorlage (Wortlaut `VORLAGE_DEAKTIVIERT_DETAIL`, ein Test haelt ihn gegen `mailer.ts`) zaehlt als zugestellt, wenn fuer das Event ein aktiver Webhook existiert — `triggerWebhooks` sagt das nicht, der Dienst fragt `webhookConfig.count` selbst. Sonst stuende der Link fuer immer auf „nicht informiert", und jeder Klick feuerte n8n erneut. Scheitert die Mail zu einem NEUEN Token, geht `sentAt` zurueck auf `null` (alter Link tot, neuer nie angekommen); die naechste Mail traegt dann `neuer_link`. Scheitert die Datenbank NACH dem Versand (`ergebnisSpeichern`): 201 mit Warnung `meldungNachweisFehlt` („… bitte nicht erneut senden"), nie 500 — wie Regel 3 beim Dokumentenpaket; im Cron zaehlt das als `errors`.
  3. **409 oder 502** (`httpStatusAusBericht`): 201, sobald eine Mail hinausging; 502 nur, wenn nichts hinausging und ALLE Versuche am Mailserver scheiterten; sonst 409 (fachlich nichts zu tun). Jede Antwort traegt den Bericht je Abteilung mit Grund (`versendet`/`uebersprungen`) und fertige `meldung`/`hinweis` — die Karte erfindet keine Texte und bietet nur Aktionen an, die der Server auch ausfuehrt (`einzelPruefung` ist das Netz darunter). Davor: 403 (nicht `HR_EDIT_ROLES`), 404 (unbekannt ODER fremder Mandant, gleicher Text), 409 bei COMPLETED/CANCELLED und bei laufendem Versand.
  4. **Mails nur bei echtem Wechsel, mit Zeilensperre.** `offboarding-task-completed` (an HR, nur mit An-Feld in der Vorlage) genau einmal je Wechsel offen → erledigt, im Portal nur fuer Aufgaben einer Link-Abteilung bei laufendem Vorgang. `offboarding-department-completed` genau einmal beim Wechsel der Abteilung auf fertig, nur ueber den Link. Dafuer sperrt jede Transaktion ZUERST die Link-Zeile(n) (`linksSperren`: UPDATE, nach Schluessel sortiert), aendert dann die Aufgabe per bedingtem `updateMany`, zaehlt und setzt `allTasksComplete` bedingt — sonst verpassen zwei gleichzeitige Haken auf die letzten beiden Aufgaben den Abschluss. **Sperrreihenfolge ueberall Vorgang → Links → Aufgaben** (`letztenArbeitstagSperren`, `faelligkeitenVerschieben`, Link- und Portal-Weg), sonst droht eine Verklemmung. Mails erst nach dem Commit (`nachDemCommit`: Fehler loggen, Antwort bleibt 200). Nur-Kommentar = keine Mail.
  5. **Erinnerungen** (`erinnerungsStufe`): nur Links mit `sentAt` und offenen Aufgaben, nie bei COMPLETED/CANCELLED. Abstand ab `max(lastSentAt ?? sentAt, lastReminderAt)` (INFO 3, WARNING 2, ESCALATION 5 Tage), Ende 30 Tage nach der spaetesten offenen Faelligkeit. Die Adresse wird je Lauf neu aufgeloest; weicht sie ab oder fehlt sie, ueberspringt der Cron und vermerkt SKIPPED mit Grund am Link (keine Mail, kein Token). Merker `lastReminderAt`/`reminderCount` bei SENT, WEBHOOK und SKIPPED, bei FAILED nicht (naechster Lauf versucht es erneut). Der Knopf „Erinnern" ignoriert Abstand und Ende, nicht aber die **Sperrzeit von 10 Minuten** je Link (gilt auch fuer „Erneut senden"). Der Cron nimmt je Vorgang dieselbe Sperre wie die HR-Aktionen, laesst einen gerade gesperrten Vorgang fuer heute aus und liest danach frisch.
  6. **`VORGESETZTER` geht an die Fuehrungskraft des Vorgangs, nie an `DepartmentConfig`** — ein zentraler Eintrag schickte sonst die Fuehrungsaufgaben aller Einrichtungen an ein Postfach. Quelle: `OffboardingProcess.supervisorEmail/Name` → Zeugnis-Bewertung → Vertragsende (`fuehrungskraftErmitteln`). Eine frei eingetippte Adresse (Neuer Austritt, Tab Übersicht) prueft `fuehrungskraftAdresseFreigegeben` gegen `SmtpConfig.allowedRecipientDomains` (dieselbe Freigabeliste wie beim Dokumentenpaket; leer = keine Einschraenkung, dem Portal bekannte Adressen immer erlaubt) → sonst 409 `FUEHRUNGSKRAFT_NICHT_FREIGEGEBEN`. Fehlt die Fuehrungskraft, bleibt ihre Zeile gelb; die uebrigen Abteilungen werden trotzdem informiert.
  7. **Reservierte Schluessel** `HR`, `MITARBEITER`, `VORGESETZTER` (`RESERVIERTE_ABTEILUNGSSCHLUESSEL`) lassen sich unter Einstellungen → Abteilungen nicht anlegen (400). HR und MITARBEITER arbeiten im Portal und bekommen nie einen Link; Altzeilen bleiben sichtbar und loeschbar, werden aber nie angeschrieben. Sonst gilt der aktive Eintrag der Einrichtung vor dem aktiven zentralen (`empfaengerAufloesen`); eigene Schluessel nach `ABTEILUNGS_SCHLUESSEL_MUSTER`. Der Seed legt Abteilungen nur in einer leeren Tabelle an und ueberschreibt nie gepflegte Adressen.
  8. **Datenzuschnitt der oeffentlichen Seite:** nur die eigenen Aufgaben (Titel, Kategorie, Faelligkeit, Status, eigener Kommentar, seit Paket 5 auch der **Hinweis aus der Vorlage** — `description`, in Mail und Link-Seite sichtbar) plus Name, Vorgangsnummer, Einrichtung, Bezugsdatum (letzter Arbeitstag bzw. Vertragsbeginn) und Gueltigkeit — ohne interne Notiz (`notes`, NIE), Urheber, Fortschritt anderer Abteilungen und Vorgangsstatus (nur `readOnly`). Im Onboarding kommt je Schluessel `zusatz` dazu (siehe unten). COMPLETED = nur lesen (PATCH 409), CANCELLED bzw. Onboarding EXPIRED = 410 mit Hinweis. Zwei Bremsen: je IP (20/min, vor dem Token-Lookup) und je Link (60/min, danach). Der Link-PATCH prueft nach der Sperre erneut, ob die Aufgabe noch seiner Abteilung gehoert (HR kann sie umgehaengt haben → 404).
  9. **Kommentar maskiert, Rohtext `kommentar_text`.** Der Kommentar der Abteilung steht in einem eigenen Feld (`abteilungKommentar`, max. 1000) und ist NIE die interne HR-Notiz. Im Payload ist `kommentar` schon maskiert (`<br>`), der Rohtext `kommentar_text` gehoert nur in Betreff und Textteil. `mailer.ts` maskiert `kommentar_text` und `aufgabenliste` im HTML trotzdem (`FREITEXT_VARIABLEN`), falls ein Admin sie in die HTML-Vorlage schreibt; `renderTemplate` setzt in einem Durchgang ein, Platzhalter im Kommentar bleiben Text. Im AuditLog steht nur die Laenge.
  10. **Prozesslokale Sperren tragen nur bei EINEM Container.** Versandsperre je Vorgang (`laufendeAbteilungsVersendungen`, fuer HR-Aktionen UND Cron, Freigabe im `finally`) und Bremse je Link liegen im Speicher des Prozesses — beim waagerechten Skalieren durch eine gemeinsame Ablage ersetzen (wie beim Dokumentenpaket).
- **Letzter Arbeitstag:** Ein PATCH mit neuem Datum verschiebt in EINER Transaktion die Faelligkeiten aller offenen Aufgaben um dieselbe Spanne und verlaengert betroffene Links (gleicher Token, nur bei laufendem Vorgang). Datum streng `YYYY-MM-DD` mit Rueckprobe (Anlage und PATCH). Schon informierte Abteilungen erfahren davon nichts (bewusst offen).
- **Onboarding (Paket 5) — die acht Unterschiede:**
  1. **EINE Link-Tabelle fuer beide Module.** `OffboardingDepartmentLink` (Map `offboarding_department_links`) traegt `offboardingId?` UND `onboardingId?`, je Modul ein `@@unique([…, departmentKey])`. Der Modellname bleibt bewusst falsch benannt: Umbenennen hiesse Tabelle tauschen, und die laufenden Tokens der informierten Abteilungen haengen daran. Genau EINES der beiden Felder ist gesetzt; Prisma kennt keine CHECK-Constraints, deshalb ist `zuweisungSenden` der einzige Schreiber und jede Abfrage laeuft ueber `LinkBereich`/`linkBereichWhere` (`abteilungsaufgaben-uebergaenge.ts`). Wer eine neue Link-Abfrage schreibt, filtert das Modul mit — `GET /api/offboarding/analytics` zaehlte sonst Onboarding-Links mit (dort steht darum `offboardingId: { not: null }`).
  2. **Ausloeser ist NUR der Knopf von HR.** Kein Versand beim Anlegen, bei der Abgabe der Modalitaeten oder bei einem Statuswechsel — eine Mail an ein externes Postfach faellt nicht als Nebenwirkung an.
  3. **Voraussetzung: eingereichte Modalitaeten** (`onboardingVersandSperre` → 409 mit `grund: "MODALITAETEN_FEHLEN"` / `"VERTRAGSBEGINN_FEHLT"`). Geprueft wird `vorgesetzteAbgesendet` (`supervisorSubmittedAt`, Altfall `supervisorData.isComplete`) UND ein Vertragsbeginn. Ein nur zwischengespeicherter Vertragsbeginn zaehlt NICHT — der Autosave des Modalitaeten-Links schreibt ihn schon vor der Abgabe, und er kann sich noch aendern. Ohne Modalitaeten (z.B. Ehrenamt) bleibt der Knopf gesperrt; ein Ersatzdatum gibt es nicht (Entscheidung 22.09.2026). Die Karte zeigt den Grund im Klartext und die Zeilen trotzdem als Vorschau.
  4. **Faelligkeiten genau einmal** (`faelligkeitenSetzen`): Vertragsbeginn + `relativeDueDays` (Kopie von `ChecklistTemplateItem.defaultDueDays`), `WHERE dueDate: null AND relativeDueDays != null`. Angestossen nach dem Commit der Modalitaeten-Abgabe (`POST /api/modalitaeten/[token]`, Fehler wird nur geloggt) und sonst beim ersten „Abteilungen informieren". Nachgerechnet wird nie — nach der Abgabe ist der Vertragsbeginn eingefroren (anders als der letzte Arbeitstag im Offboarding). Ohne Tagesangabe bleibt die Aufgabe **ohne** Faelligkeit und loest keine Erinnerung aus (null heisst nicht 0). Setzt der Portal-PATCH `dueDate: null`, raeumt er `relativeDueDays` mit ab — sonst stellte der naechste Lauf die von Hand geloeschte Frist wieder her.
  5. **`assignee` SELBST traegt den Schluessel** (kein zweites Feld): Die Migration `ONBOARDING_ABTEILUNGSAUFGABEN_V1` in `prisma/seed-check.js` stellt Freitext („Verwaltung", „Vorgesetzter") einmalig auf Schluessel um; unbekannte Texte bleiben stehen, gehen NIE per Link hinaus (`istLinkAbteilung` verlangt Schluesselform) und stehen in `unbekannteZustaendigkeiten`, damit sie nicht einfach fehlen. Die Zuordnungstabelle gibt es zweimal (TS `abteilungAusZustaendigkeit`, JS-Kopie in `seed-check.js`) — ein Test haelt sie gegeneinander, beide gemeinsam aendern. **Angezeigt wird nie der Rohschluessel:** Name aus `abteilungen.zeilen`, sonst `abteilungLabel()`; im Checklisten-Editor und im PDF-Export zusaetzlich die Namen selbst angelegter Schluessel aus `DepartmentConfig` (`abteilungLabel` ist rein und darf die Einstellungen nicht kennen).
  6. **Datenzuschnitt je Schluessel** (`ONBOARDING_ZUSATZFELDER`, `zusatzWerte`, `sichtbarkeitsHinweis`): IT sieht zusaetzlich Stellenbezeichnung, Betriebsstaette und Adresse der Fuehrungskraft; VERWALTUNG/FACILITY Betriebsstaette und Adresse der Fuehrungskraft; DSB die Stellenbezeichnung; VORGESETZTER Stellenbezeichnung und Betriebsstaette; BUCHHALTUNG und eigene Schluessel nichts. Nicht erlaubte Felder fehlen im Payload GANZ (auch nicht als `""`) — so steht in keinem Webhook mehr als erlaubt. Angaben aus dem Personalfragebogen, die private Adresse der Person und der Fortschritt anderer Abteilungen gehen an niemanden. Dialog und Payload lesen dieselbe Tabelle; zwei Texte ueber dieselbe Sache gehen auseinander, einer nicht.
  7. **Vier eigene Events** (Gruppe „Onboarding", `wired: true`): `onboarding-department-assigned`, `onboarding-department-reminder`, `onboarding-task-completed` (nur ueber den Link — das HR-Haekchen im Portal loest im Onboarding NICHTS aus; `defaultRecipients.to` ist leer, ohne An-Feld in der Vorlage also SKIPPED), `onboarding-department-completed`. Kein `token` im Payload (anders als im Offboarding, bewusst). Ohne die Vorlagen in `default-email-templates.ts` meldet `sendEventEmail` SKIPPED → `sentAt` bleibt null → 409; der Versand haengt also an den Vorlagen.
  8. **Erinnerungen im BESTEHENDEN Cron.** `onboardingErinnerungenSenden` laeuft als Abschnitt 3 in `POST /api/cron/reminders`; die Antwort bekommt `departmentReminders`, `total` bleibt Mitarbeiter + Vorgesetzte (Abwaertskompatibilitaet fuer n8n, kein neuer Workflow). Ein Fehler dort laesst Abschnitt 1 und 2 unberuehrt.
- **Checklisten-Vorlagen (Quelle der Zustaendigkeit):** `ChecklistTemplateItem` traegt `defaultAssignee` (Schluessel, Auswahl statt Freitext), `defaultDueDays` und seit Paket 5 `description` (Hinweis fuer die zustaendige Stelle, max. 500). `POST /api/onboarding` kopiert alle drei in die Aufgabe (`assignee`, `relativeDueDays`, `description`), `dueDate` bleibt null. **`PUT /api/checklisten/[id]`** ersetzt Metadaten und Punkte in EINER Transaktion und behaelt vorhandene Punkt-IDs (`ChecklistItem.templateItemId` laufender Vorgaenge zeigte sonst ins Leere); der Editor nutzt nur noch diesen Weg und verwirft keinen unvollstaendigen Punkt mehr still. Beginnt der Vorlagenname mit „Offboarding:", setzen POST, PUT und PATCH `questionnaireType` auf null — sonst zoege `POST /api/onboarding` (sucht `questionnaireType` + `isActive`) eine Austritts-Checkliste in einen Einstellungsvorgang.
- **Mailvorlagen:** `offboarding-department-assigned` (Aufgabenliste, Gueltigkeit, `erneut_gesendet`, `neuer_link`), `offboarding-reminder` (Knopf und Cron gleicher Aufbau; Stufen ueber die Merker `ist_info`/`ist_warnung`/`ist_eskalation`/`ist_ueberfaellig`, weil `renderTemplate` nicht vergleichen kann), `offboarding-task-completed` (`erledigt_ueber`, Kommentar), `offboarding-department-completed` (Text unveraendert, `ist_fuehrungskraft` im Payload). Alle alten Payload-Felder bleiben fuer Webhook-Abnehmer. Nach einem Deploy mit geaendertem Text: „Text auf Standard zurücksetzen". Im Onboarding dieselbe Reihe mit eigenen Texten („Dienstbeginn" statt „Austrittsdatum"). Dort steht `{{abteilung}}` NIE im Satzsubjekt oder hinter einer artikellosen Praeposition, sondern in Klammern („zuständig: {{abteilung}}") oder in einer Label-Zeile — der Wert ist ein frei gepflegter Anzeigename („Datenschutzbeauftragte/r", „Verwaltung / Sekretariat"), an dem jeder vorformulierte Satz mit Artikel zerbricht; der Empfaenger wird stattdessen mit „Sie" angesprochen. `FREITEXT_VARIABLEN` in `mailer.ts` maskiert zusaetzlich `stellenbezeichnung`, `betriebsstaette` und `aufgabe` im HTML-Teil (getippt ueber den Modalitaeten-Link bzw. aus einer Vorlage).

## Admin-Zugang

- **E-Mail:** `dimitri@credo-gruppe.de`
- **Passwort:** Wird beim Seed generiert und in der Konsole ausgegeben (oder via `ADMIN_INITIAL_PASSWORD` gesetzt)
- **Rolle:** SUPER_ADMIN
