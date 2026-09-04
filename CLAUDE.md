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

## E-Mail-Versand (SMTP primaer)

- **Dispatcher:** `triggerWebhooks(event, payload)` in `src/lib/webhooks.ts` — sendet IMMER zuerst die E-Mail per SMTP (`sendEventEmail` in `src/lib/mailer.ts`), Webhooks feuern nur zusaetzlich
- **Event-Katalog:** `src/lib/events.ts` — eine Definition je Event (Name, Gruppe, Empfaenger-Default, Beispiel-Payload). Neue Events MUESSEN hier eingetragen werden (Test erzwingt das)
- **Vorlagen:** `EmailTemplate` (DB, Admin-UI) mit Empfaenger-Feldern `recipientTo/Cc/Bcc` (kommagetrennt, `{{variablen}}`-faehig); Code-Defaults in `src/lib/default-email-templates.ts`
- **Antwort-Adresse (Reply-To):** global in `SmtpConfig.replyToEmail`, optional je Vorlage via `EmailTemplate.recipientReplyTo` (`{{variablen}}`-faehig) ueberschreibbar. Aufloesung: Vorlagen-Feld > globaler SMTP-Wert > kein Reply-To
- **Protokoll:** Jeder Versandversuch landet im `EmailLog` (SENT/FAILED/SKIPPED, 90 Tage Aufbewahrung)
- **Reporting-API:** Read-Only-Endpunkte unter `/api/reports/*`, Auth per API-Key (`ApiKey`-Modell, Verwaltung in Einstellungen → API-Zugang) oder Portal-Session. Keine sensiblen Felder (IBAN/SV-Nr/Steuer-ID) ausgeben!

## Dokumente & Starterpaket

- **Dokumente-Hub pro Vorgang:** Tab „Dokumente" der Onboarding-Detailseite buendelt Erstellen (Vorlagen + System-Dokumente), Versenden (Starterpaket), Hochgeladenes und PDF-Exporte — mit Prozessschritt-Anzeige („Sie sind hier"). Der **Versand** (Karte „Dokumentenpaket") sitzt seit 04.09.2026 auch im Dokumente-Tab von Offboarding, Verbeamtung und Vertragsverlaengerung; der uebrige Hub (Erstellen/Hochgeladenes/Exporte) bleibt dort Zukunft.
- **Platzhalter-Katalog/Resolver:** Verfuegbare `{variablen}` je Modul liegen client-sicher in `src/lib/placeholder-catalog.ts` (re-exportiert von `doc-template-resolvers.ts`). Der ONBOARDING-Resolver fuellt sie aus Personal-/Vorgesetzten-Daten; sensible Felder (IBAN/SV-Nr/Steuer-ID) werden NUR entschluesselt, wenn die Vorlage sie nutzt (Audit via `sensitiveFields`). Im Vorlagen-Editor zeigt `VariablenKatalog` die Variablen klickbar an.
- **System-Vorlagen:** Editierbare Standard-Vorlagen (z.B. Fuehrungszeugnis-Antrag, `DocumentTemplate.isSystem=true`, Modul ONBOARDING) liegen als Asset unter `public/system-dokumente/` und werden vom Entrypoint (`prisma/seed-check.js`) idempotent geseeded. Das amtliche **Masernschutz-NRW-Formular** wird als statisches PDF (`public/system-dokumente/masernschutz-nrw.pdf`) bereitgestellt — bewusst nicht nachgebaut (Layout-Treue).
- **Dokumentenpaket (Standardpaket + Versand):** Pro Mandant **und Modul** konfigurierbares Set aus zwei Quellen — feste Pool-PDFs (`StarterpaketDokument`, Scope GLOBAL/MANDANT) und Brief-Vorlagen (`DocumentTemplate`), gemeinsam geordnet in `StarterpaketAuswahl` (`dokumentId` ODER `templateId`, plus `modul`). Konfig unter `/mandanten/[id]/starterpaket`.
- **Versand:** `src/lib/dokumentenpaket.ts` (modulneutral) hinter drei Routen — `GET /api/dokumentenpaket` (Zusammenstellung fuer den Dialog), `POST .../pruefen` (Vorpruefung), `POST .../versenden`. Oberflaeche: `dokumentenpaket-section.tsx` + `dokumentenpaket-dialog.tsx`. Verdrahtet sind **alle vier Vorgangsmodule** (Onboarding, Vertragsverlaengerung, Verbeamtung, Offboarding) mit je eigener Mailvorlage; `modulVerdrahtet()` prueft beides, damit kein Modul ohne gelesenes Anschreiben versenden kann. Die abgeloeste `starterpaket.ts` und `POST /api/onboarding/[id]/starterpaket` gibt es nicht mehr.
- **Vier Regeln, die beim Aendern gelten muessen:**
  1. **Mandant selbst pruefen.** Die Resolver fallen bei fehlendem Zugriff STILL auf die allgemeinen Platzhalter zurueck — ohne eigene `canAccessProcess`-Pruefung ginge ein leeres Schreiben an eine echte Adresse.
  2. **Sensible Vorlagen brauchen eine Bestaetigung je Versand** (Entscheidung 02.09.2026). Serverseitig erzwungen (409); zusaetzlich bekommt der Resolver die sensiblen Platzhalter ohne Bestaetigung gar nicht erst — die Schranke sitzt im Datenfluss, nicht nur in der Abfrage.
  3. **Nachweis nur nach echtem SENT**, in EINER Transaktion (`DokumentenVersand` + `GeneratedDocument.versandId` + AuditLog + Zeitstempel). Scheitert sie nach dem Versand, bleibt das Ergebnis SENT mit lauter Warnung — ein Fehlschlag wuerde zum Doppelversand verleiten.
  4. **Vorlagen NUR aus `uploads/` und `public/system-dokumente/` lesen** (`leseVorlagenDatei`). `dateipfad` steht in der Datenbank; `readUploadedFile` allein weist System-Vorlagen ab, ungeprueftes `readFile` waere ein Scheunentor.
- **Statuscodes:** 404 (Vorgang unbekannt **oder** fremder Mandant — gleicher Text, damit der Code nichts verraet), 409 (leere Auswahl, fehlende Bestaetigung, fehlende Datei, laufender Versand), 413 (zu gross), 502 (PDF-Dienst oder SMTP). Zentral in `statusFuerFehler()`.
- **Doppelversand-Sperre:** prozesslokal (`laufendeVersendungen`). Traegt nur, solange das Portal als EIN Container laeuft — beim waagerechten Skalieren durch eine Datenbanksperre ersetzen.

## Admin-Zugang

- **E-Mail:** `dimitri@credo-gruppe.de`
- **Passwort:** Wird beim Seed generiert und in der Konsole ausgegeben (oder via `ADMIN_INITIAL_PASSWORD` gesetzt)
- **Rolle:** SUPER_ADMIN
