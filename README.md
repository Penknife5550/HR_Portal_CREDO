# CREDO HR-Portal

Digitales Einstellungsmanagement-Portal fuer die CREDO Schultraegergruppe. Das System bildet den gesamten Onboarding-Prozess neuer Mitarbeiter ab -- vom Personalfragebogen ueber die Einstellungsmodalitaeten durch den Vorgesetzten bis zur finalen Pruefung durch die HR-Abteilung.

---

## Inhaltsverzeichnis

1. [Projektuebersicht](#projektuebersicht)
2. [Technologie-Stack](#technologie-stack)
3. [Architektur](#architektur)
4. [Schnellstart (Entwicklung)](#schnellstart-entwicklung)
5. [Deployment (Produktion)](#deployment-produktion)
6. [Admin-Login](#admin-login)
7. [Features](#features)
8. [Webhook-Integration (n8n)](#webhook-integration-n8n)
9. [E-Mail-System](#e-mail-system)
10. [Sicherheit](#sicherheit)
11. [Datenbank](#datenbank)
12. [Rollen und Berechtigungen](#rollen-und-berechtigungen)
13. [Troubleshooting](#troubleshooting)

---

## Projektuebersicht

Das CREDO HR-Portal digitalisiert den Einstellungsprozess fuer alle 16 Mandanten der CREDO-Gruppe (Gymnasien, Gesamtschulen, Grundschulen, Berufskollegs, Kitas, Verwaltung). Es ersetzt papierbasierte Personalbogen und manuelle Abstimmungsprozesse durch einen strukturierten, webbasierten Workflow.

**Kernfunktionen:**

- HR erstellt einen Onboarding-Vorgang und laedt den neuen Mitarbeiter per Magic Link ein.
- Der Mitarbeiter fuellt den Personalfragebogen online aus (persoenliche Daten, Bankverbindung, Sozialversicherung, Steuer).
- Der Vorgesetzte ergaenzt die Einstellungsmodalitaeten (Vertragsdaten, Verguetung, Arbeitszeiten).
- HR prueft, exportiert und schliesst den Vorgang ab.
- Alle sensiblen Daten (IBAN, SV-Nummer, Steuer-ID) werden AES-256-GCM-verschluesselt gespeichert.

---

## Technologie-Stack

| Komponente       | Technologie                          |
|------------------|--------------------------------------|
| Framework        | Next.js 15 (App Router)              |
| Frontend         | React 19, TailwindCSS 4              |
| UI-Komponenten   | Radix UI, Lucide Icons               |
| Formulare        | React Hook Form + Zod-Validierung    |
| Backend/API      | Next.js API Routes (Route Handlers)  |
| Datenbank        | PostgreSQL 16                        |
| ORM              | Prisma 6                             |
| Authentifizierung| JWT (jose + jsonwebtoken), bcryptjs  |
| E-Mail           | Nodemailer (SMTP-Fallback)           |
| Containerisierung| Docker, Docker Compose               |
| Reverse Proxy    | Caddy (extern)                       |
| Sprache          | TypeScript 5                         |

---

## Architektur

```
credo-hr-portal/
├── prisma/
│   ├── schema.prisma          # Datenmodell (16 Models)
│   ├── seed.ts                # Initial-Seed (Admin-User, Mandanten)
│   └── seed-check.js          # Pruefen ob Seed noetig ist
├── src/
│   ├── app/
│   │   ├── (portal)/          # Geschuetzte Portal-Routen (JWT-Auth)
│   │   │   ├── dashboard/     # Uebersicht aller Onboarding-Vorgaenge
│   │   │   ├── benutzerverwaltung/  # User-Management
│   │   │   ├── vorlagen/      # Formular-Templates konfigurieren
│   │   │   ├── checklisten/   # Checklisten-Vorlagen
│   │   │   ├── mandanten/     # Einrichtungen/Mandanten verwalten
│   │   │   └── einstellungen/ # Webhooks, SMTP, E-Mail-Vorlagen
│   │   ├── api/               # REST API (Route Handlers)
│   │   │   ├── auth/          # Login/Logout/Session
│   │   │   ├── onboarding/    # Onboarding-CRUD
│   │   │   ├── fragebogen/    # Personalfragebogen-API
│   │   │   ├── modalitaeten/  # Vorgesetzten-Eingaben
│   │   │   ├── settings/      # Webhooks, SMTP, Templates
│   │   │   └── ...
│   │   ├── fragebogen/        # Oeffentliche Seite: Personalfragebogen (Magic Link)
│   │   └── modalitaeten/      # Oeffentliche Seite: Vorgesetzten-Formular
│   ├── components/            # Wiederverwendbare UI-Komponenten
│   ├── lib/                   # Utilities (DB, Encryption, Mailer, Webhooks)
│   └── middleware.ts          # Security Headers + JWT-Validierung
├── docker-compose.prod.yml    # Produktions-Setup (PostgreSQL + App)
├── Dockerfile                 # Multi-Stage Build
├── entrypoint.sh              # DB-Migration + Seed + Start
└── .env.example               # Vorlage fuer Umgebungsvariablen
```

---

## Schnellstart (Entwicklung)

### Voraussetzungen

- Node.js >= 18
- PostgreSQL 16 (lokal oder Docker)
- npm

### Installation

```bash
# Repository klonen
git clone <repository-url>
cd credo-hr-portal

# Abhaengigkeiten installieren
npm install

# Umgebungsvariablen konfigurieren
cp .env.example .env
# .env anpassen: DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY setzen

# Prisma Client generieren und Datenbank-Schema anlegen
npx prisma generate
npx prisma db push

# Seed ausfuehren (Admin-User und Mandanten anlegen)
npm run db:seed

# Entwicklungsserver starten
npm run dev
```

Das Portal ist dann unter `http://localhost:3000` erreichbar.

### Hilfreiche Befehle

| Befehl              | Beschreibung                                |
|---------------------|---------------------------------------------|
| `npm run dev`       | Entwicklungsserver starten                  |
| `npm run build`     | Produktions-Build erstellen                 |
| `npm run db:push`   | Datenbank-Schema synchronisieren            |
| `npm run db:seed`   | Seed ausfuehren (Admin + Mandanten)         |
| `npm run db:studio` | Prisma Studio oeffnen (Datenbank-Browser)   |
| `npm run db:migrate`| Prisma Migration erstellen                  |
| `npm run lint`      | ESLint ausfuehren                           |

---

## Deployment (Produktion)

### 1. Umgebungsvariablen erstellen

Erstelle eine Datei `.env.production` im Projektverzeichnis:

```bash
# Datenbank
DB_PASSWORD=ein_sicheres_db_passwort

# Auth – Mindestens 32 Zeichen, zufaellig generiert
JWT_SECRET=ein_langes_zufaelliges_geheimnis_min_32_zeichen

# Verschluesselung – Generieren mit: openssl rand -hex 32
ENCRYPTION_KEY=64_zeichen_hex_string

# Admin-Passwort beim ersten Start
ADMIN_INITIAL_PASSWORD=Credo2026!HR

# App-URL (Domain mit HTTPS)
APP_URL=https://hr.fes-credo.de

# Magic Link Gueltigkeit in Stunden (Standard: 720 = 30 Tage)
MAGIC_LINK_EXPIRY_HOURS=720

# Optional: n8n API-Key fuer Service-Aufrufe
N8N_API_KEY=
```

### 2. Wichtige Umgebungsvariablen erklaert

| Variable                  | Pflicht | Beschreibung                                                                 |
|---------------------------|---------|------------------------------------------------------------------------------|
| `DATABASE_URL`            | Ja      | PostgreSQL-Verbindungsstring. Wird in Docker automatisch zusammengesetzt.    |
| `DB_PASSWORD`             | Ja      | Passwort fuer den PostgreSQL-Benutzer `credo`.                               |
| `JWT_SECRET`              | Ja      | Geheimnis fuer JWT-Token-Signierung. Mindestens 32 Zeichen. Darf nicht `dev_secret` enthalten. |
| `ENCRYPTION_KEY`          | Ja      | 64 Hex-Zeichen fuer AES-256-GCM-Verschluesselung sensibler Felder. Generieren: `openssl rand -hex 32` |
| `ADMIN_INITIAL_PASSWORD`  | Nein    | Passwort des initialen Admin-Accounts. Standard: `Credo2026!HR`              |
| `APP_URL`                 | Ja      | Oeffentliche URL des Portals. Wird fuer Magic Links in E-Mails verwendet.   |
| `MAGIC_LINK_EXPIRY_HOURS` | Nein   | Gueltigkeit der Magic Links in Stunden (Standard: 720 = 30 Tage).           |
| `N8N_API_KEY`             | Nein    | Optionaler API-Key fuer n8n-Service-Aufrufe.                                 |

### 3. Docker Compose starten

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Das Entrypoint-Skript fuehrt automatisch aus:
1. Pflicht-Umgebungsvariablen pruefen (JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL)
2. Datenbank-Schema synchronisieren (`prisma db push`)
3. Seed ausfuehren falls noch kein Admin-User existiert
4. Next.js-Server starten

### 4. Netzwerk-Voraussetzungen

Das Produktions-Setup erwartet ein externes Docker-Netzwerk `reverse_proxy`, ueber das Caddy als Reverse Proxy die Anfragen an den Container weiterleitet. Die Domain `hr.fes-credo.de` muss auf den Server zeigen.

```bash
# Falls das Netzwerk noch nicht existiert:
docker network create reverse_proxy
```

---

## Admin-Login

Nach dem ersten Start wird automatisch ein Admin-Account angelegt:

| Feld      | Wert                                                       |
|-----------|------------------------------------------------------------|
| E-Mail    | `dimitri@credo-gruppe.de`                                  |
| Passwort  | Wert von `ADMIN_INITIAL_PASSWORD` (Standard: `Credo2026!HR`) |
| Rolle     | `SUPER_ADMIN`                                              |

Login-URL: `https://<APP_URL>/login`

Es wird dringend empfohlen, das Passwort nach dem ersten Login zu aendern.

---

## Features

### Dashboard

- Uebersicht aller Onboarding-Vorgaenge mit Status-Filtern
- Neuen Onboarding-Vorgang erstellen (Mandant waehlen, E-Mail eingeben)
- Detail-Ansicht pro Vorgang mit Fortschrittsanzeige
- Anzeige-IDs im Format `2026-GYM-001`

### Onboarding-Prozess (4 Schritte)

| Schritt | Beschreibung                                | Akteur         |
|---------|---------------------------------------------|----------------|
| 1       | HR erstellt Vorgang und versendet Magic Link | HR-Mitarbeiter |
| 2       | Mitarbeiter fuellt Personalfragebogen aus    | Neuer MA       |
| 3       | Vorgesetzter ergaenzt Einstellungsmodalitaeten | Vorgesetzter |
| 4       | HR prueft und schliesst Vorgang ab           | HR-Mitarbeiter |

### Personalfragebogen

Mehrstufiges Formular mit folgenden Bereichen:
- Persoenliche Angaben (Name, Geburtsdaten, Familienstand)
- Adresse und Kontaktdaten
- Bankverbindung (verschluesselt gespeichert)
- Sozialversicherung (verschluesselt gespeichert)
- Steuerdaten (verschluesselt gespeichert)
- Bildung und Beruf
- DSGVO-Einwilligung

Fragebogentypen: Standard (TV-L), Beamte, Erzieher (TV-L S), Minijob, Ehrenamt

### Vorgesetzten-Modalitaeten

Der Vorgesetzte erhaelt einen separaten Magic Link und ergaenzt:
- Betriebsstaette und Stellenbeschreibung
- Vertragsdaten (Beginn, Befristung, Umfang)
- Haupt-/Nebenarbeitgeber-Zuordnung
- Verguetungsmodell (TV-L, TV-L S, Haustarif)
- Probezeit, Urlaub, Zulagen
- Zeiterfassung und Zusatzvereinbarungen

### Weitere Features

- **Export**: Daten fuer die Weiterverarbeitung exportieren
- **Checklisten**: Konfigurierbare Checklisten-Vorlagen pro Fragebogentyp
- **Mandantenverwaltung**: 16 Einrichtungen (Schulen, Kitas, Verwaltung) verwalten
- **Vorlagen-Konfiguration**: Formularfelder und -schritte pro Fragebogentyp anpassen (versioniert)
- **Einstellungen**: Webhooks, SMTP, E-Mail-Vorlagen ueber das Admin-Portal konfigurieren
- **Benutzerverwaltung**: Portal-Benutzer anlegen und Rollen zuweisen
- **Notizen**: Freie Notizen pro Onboarding-Vorgang
- **Audit-Log**: Alle Aktionen werden protokolliert (wer, wann, was)

---

## Webhook-Integration (n8n)

### Funktionsweise

Das Portal versendet bei bestimmten Ereignissen HTTP-POST-Requests an konfigurierte Webhook-URLs. Der primaere Anwendungsfall ist die Integration mit n8n-Workflows, z.B. zum E-Mail-Versand oder zur Synchronisation mit Drittsystemen.

Der Dispatcher arbeitet wie folgt:
1. Aktive Webhooks fuer das ausgeloeste Event aus der Datenbank laden
2. Jeden Webhook mit Retry-Logik ausfuehren (max. 3 Versuche, 10s Timeout)
3. Falls kein Webhook erfolgreich war: SMTP-Fallback aktivieren

### Events

| Event                      | Beschreibung                                           | Payload (Auswahl)                      |
|----------------------------|--------------------------------------------------------|----------------------------------------|
| `onboarding-created`       | Neuer Onboarding-Vorgang erstellt                      | email, firstName, lastName, fragebogenLink, organization |
| `questionnaire-completed`  | Mitarbeiter hat Personalfragebogen abgeschickt          | email, displayId, organization         |
| `supervisor-link-created`  | Magic Link fuer Vorgesetzten generiert                  | supervisorEmail, modalitaetenLink      |
| `supervisor-completed`     | Vorgesetzter hat Modalitaeten ausgefuellt               | email, displayId, supervisorEmail      |

### Konfiguration

Webhooks werden ausschliesslich ueber das Admin-Portal konfiguriert:

**Einstellungen** > **Webhooks** > **Neuen Webhook hinzufuegen**

Pro Webhook wird konfiguriert:
- **Event**: Welches Ereignis den Webhook ausloest
- **Name**: Anzeigename (z.B. "n8n Onboarding Workflow")
- **URL**: Ziel-URL (z.B. `https://n8n.example.com/webhook/abc123`)
- **Authentifizierung**: Optionale Absicherung des Webhooks

### Authentifizierungsoptionen

| Typ       | Beschreibung                                                   |
|-----------|----------------------------------------------------------------|
| `none`    | Kein Auth-Header (Webhook-URL ist das einzige Geheimnis)       |
| `api_key` | Benutzerdefinierter Header + Wert (z.B. `X-API-Key: geheim`)  |
| `bearer`  | Authorization-Header mit Bearer-Token                          |
| `basic`   | HTTP Basic Auth (Benutzername + Passwort)                      |

Auth-Werte werden AES-256-GCM-verschluesselt in der Datenbank gespeichert.

Ein **Test-Button** im Admin-Portal ermoeglicht das Versenden eines Test-Payloads an den konfigurierten Webhook.

---

## E-Mail-System

### Zweistufiges System

| Prioritaet | Kanal              | Beschreibung                                              |
|------------|--------------------|-----------------------------------------------------------|
| 1 (primaer)| n8n via Webhooks   | E-Mails werden durch n8n-Workflows versendet              |
| 2 (Fallback)| SMTP direkt       | Nur wenn kein Webhook erfolgreich war                     |

### SMTP-Konfiguration

Unter **Einstellungen** > **SMTP** konfigurierbar:
- Host, Port, Verschluesselung (SSL/STARTTLS)
- Benutzername und Passwort (verschluesselt gespeichert)
- Absender-Name und E-Mail-Adresse
- Verbindungstest mit Test-E-Mail

### E-Mail-Vorlagen

Unter **Einstellungen** > **E-Mail-Vorlagen** editierbar. Jedes Webhook-Event hat eine korrespondierende E-Mail-Vorlage mit:
- Betreff (mit Variablen)
- HTML-Body (mit Variablen)
- Plaintext-Fallback

Verfuegbare Variablen (Auswahl): `{{vorname}}`, `{{nachname}}`, `{{email}}`, `{{einrichtung}}`, `{{vorgangsnummer}}`, `{{link}}`, `{{ablaufdatum}}`, `{{supervisor_email}}`

---

## Sicherheit

### Verschluesselung

- Sensible Personaldaten (IBAN, Sozialversicherungsnummer, Steuer-ID) werden mit **AES-256-GCM** verschluesselt in der Datenbank gespeichert.
- Der Verschluesselungsschluessel wird ueber `ENCRYPTION_KEY` konfiguriert (64 Hex-Zeichen = 256 Bit).
- Webhook-Auth-Werte und SMTP-Passwoerter werden ebenfalls verschluesselt gespeichert.

### Authentifizierung

- Portal-Benutzer melden sich mit E-Mail und Passwort an.
- Passwoerter werden mit **bcrypt** gehasht.
- Sessions basieren auf **JWT-Token** (HS256, signiert mit `JWT_SECRET`).
- Die Middleware validiert JWT-Token kryptographisch bei jedem Request auf geschuetzte Routen.
- Neue Mitarbeiter und Vorgesetzte erhalten zeitlich begrenzte **Magic Links** (Standard: 30 Tage).

### Security Headers

Die Middleware setzt automatisch:
- `Content-Security-Policy` (restriktiv, frame-ancestors: none)
- `Strict-Transport-Security` (HSTS, 1 Jahr)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (Kamera, Mikrofon, Geolocation deaktiviert)

### DSGVO-Konformitaet

- Einwilligung zur Datenverarbeitung wird im Fragebogen abgefragt und mit Zeitstempel protokolliert.
- Alle Aenderungen werden im Audit-Log festgehalten.
- Sensible Daten werden verschluesselt gespeichert.

---

## Datenbank

### Prisma Schema

Das Datenmodell umfasst 16 Models. Die wichtigsten:

| Model                | Beschreibung                                                      |
|----------------------|-------------------------------------------------------------------|
| `Organization`       | Mandant/Einrichtung (z.B. Gymnasium, Kita). 16 Mandanten bei CREDO. |
| `OnboardingProcess`  | Zentraler Vorgang pro Einstellung. Enthaelt Status, Magic Links, Referenzen. |
| `PersonalData`       | Personalfragebogen-Daten (vom Mitarbeiter ausgefuellt). Sensible Felder verschluesselt. |
| `SupervisorData`     | Einstellungsmodalitaeten (vom Vorgesetzten ausgefuellt).          |
| `Child`              | Kinder des Mitarbeiters (fuer Kinderfreibetrag).                  |
| `Document`           | Hochgeladene Dokumente (Arbeitsvertrag, Fuehrungszeugnis etc.).   |
| `User`               | Portal-Benutzer (HR-Team) mit Rolle und Passwort-Hash.           |
| `AuditLog`           | Protokoll aller Aktionen mit User-Referenz und Zeitstempel.      |
| `OnboardingNote`     | Freie Notizen pro Onboarding-Vorgang.                            |
| `ChecklistTemplate`  | Checklisten-Vorlagen mit Items und Kategorien.                   |
| `ChecklistItem`      | Checklisten-Eintraege (Instanzen pro Onboarding).                |
| `WebhookConfig`      | Webhook-Konfigurationen (URL, Auth, Event).                      |
| `SmtpConfig`         | SMTP-Einstellungen (Singleton, ID = "default").                  |
| `EmailTemplate`      | E-Mail-Vorlagen pro Event mit Variablen.                         |
| `FormTemplate`       | Konfigurierbare Fragebogen-Templates pro Typ (versioniert).      |

### Onboarding-Status-Uebergaenge

```
INVITED -> IN_PROGRESS -> SUBMITTED -> SUPERVISOR_PENDING -> SUPERVISOR_SUBMITTED -> REVIEWED -> COMPLETED
                                                                                              -> EXPIRED
```

### Fragebogentypen

| Typ          | Beschreibung                  |
|--------------|-------------------------------|
| `STANDARD`   | Angestellte (TV-L)            |
| `BEAMTE`     | Planstelleninhaber            |
| `ERZIEHER`   | Kita-Personal (TV-L S)        |
| `MINIJOB`    | Geringfuegig Beschaeftigte   |
| `EHRENAMT`   | Ehrenamtliche                 |

---

## Rollen und Berechtigungen

### Rollenmodell

| Rolle              | Beschreibung                                  |
|--------------------|-----------------------------------------------|
| `SUPER_ADMIN`      | Vollzugriff auf alle Funktionen               |
| `HR_LEITUNG`       | Wie SUPER_ADMIN, aber ohne Mandantenverwaltung|
| `HR_SACHBEARBEITER`| Operativer Zugriff auf Dashboard und Vorlagen |

### Berechtigungsmatrix

| Funktion                | SUPER_ADMIN | HR_LEITUNG | HR_SACHBEARBEITER |
|-------------------------|:-----------:|:----------:|:-----------------:|
| Dashboard               | Ja          | Ja         | Ja                |
| Onboarding erstellen    | Ja          | Ja         | Ja                |
| Onboarding pruefen      | Ja          | Ja         | Ja                |
| Vorlagen bearbeiten     | Ja          | Ja         | Ja                |
| Benutzerverwaltung      | Ja          | Ja         | Nein              |
| Checklisten verwalten   | Ja          | Ja         | Nein              |
| Einstellungen (Webhooks, SMTP) | Ja   | Ja         | Nein              |
| Mandanten verwalten     | Ja          | Nein       | Nein              |

---

## Troubleshooting

### 502 Bad Gateway nach Deployment

**Ursache:** Der Next.js-Server ist noch nicht bereit oder der Healthcheck schlaegt fehl.

**Loesung:**
```bash
# Container-Logs pruefen
docker logs credo-hr-app

# Healthcheck-Status pruefen
docker inspect --format='{{.State.Health.Status}}' credo-hr-app

# Container neustarten
docker compose -f docker-compose.prod.yml --env-file .env.production restart app
```

Der Container hat eine `start_period` von 30 Sekunden. Warten Sie nach dem Start mindestens 30-60 Sekunden.

### Tabellen fehlen / Datenbank leer

**Ursache:** `prisma db push` im Entrypoint konnte die Tabellen nicht anlegen.

**Loesung:**
```bash
# In den Container einsteigen
docker exec -it credo-hr-app sh

# Schema manuell synchronisieren
npx prisma db push

# Seed manuell ausfuehren
node prisma/seed-check.js
```

### Migration-Fehler / Schema-Aenderungen

**Ursache:** Das Prisma-Schema wurde geaendert, aber die Datenbank ist nicht aktualisiert.

**Loesung:**
```bash
# Entwicklung: Schema direkt pushen (ohne Migration)
npx prisma db push

# Oder: Migration erstellen und ausfuehren
npx prisma migrate dev --name beschreibung_der_aenderung
```

In Produktion wird `prisma db push` beim Container-Start automatisch ausgefuehrt.

### FATAL: JWT_SECRET fehlt oder enthaelt 'dev_secret'

**Ursache:** Der Entrypoint prueft, dass `JWT_SECRET` gesetzt ist und nicht den Wert `dev_secret` enthaelt.

**Loesung:** In `.env.production` ein sicheres, zufaelliges Secret setzen (mindestens 32 Zeichen).

### FATAL: ENCRYPTION_KEY fehlt oder ist zu kurz

**Ursache:** `ENCRYPTION_KEY` muss genau 64 Hex-Zeichen lang sein (256 Bit).

**Loesung:**
```bash
# Schluessel generieren
openssl rand -hex 32
# Ergebnis in .env.production als ENCRYPTION_KEY eintragen
```

### Webhooks werden nicht ausgeloest

**Ursache:** Keine aktiven Webhooks fuer das Event konfiguriert.

**Loesung:**
1. Im Admin-Portal unter **Einstellungen** > **Webhooks** pruefen
2. Sicherstellen, dass der Webhook aktiv ist und die URL erreichbar
3. Test-Button nutzen, um die Verbindung zu pruefen
4. Container-Logs auf Fehlermeldungen pruefen: `docker logs credo-hr-app | grep Webhooks`

### E-Mails kommen nicht an

**Loesung:**
1. Pruefen, ob mindestens ein Webhook oder SMTP konfiguriert und aktiv ist
2. SMTP-Verbindungstest unter **Einstellungen** > **SMTP** ausfuehren
3. Container-Logs pruefen: `docker logs credo-hr-app | grep Mailer`

---

## Lizenz

Internes Projekt der CREDO Schultraegergruppe. Nicht fuer den oeffentlichen Gebrauch bestimmt.
