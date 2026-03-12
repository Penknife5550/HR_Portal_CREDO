# CREDO HR-Portal -- Vollstaendige Projektdokumentation

**Erstellt:** 2026-03-12
**Autor:** Dimitri Riesen + Claude Opus 4.6
**Status:** MVP fertig, Security-gehärtet, deployment-bereit
**GitHub:** https://github.com/Penknife5550/HR_Portal_CREDO.git

---

## 1. Projektuebersicht

### Was ist das HR-Portal?
Ein webbasiertes Onboarding-System fuer die CREDO Gruppe (Freie Evangelische Schulen Minden, Kitas, Verwaltung). Es digitalisiert den Einstellungsprozess neuer Mitarbeiter:

1. **HR erstellt einen Onboarding-Vorgang** im Portal (Dashboard)
2. **Neuer Mitarbeiter** erhaelt einen Magic-Link per E-Mail und fuellt den **Personalfragebogen** (10 Schritte) online aus
3. **Vorgesetzter** erhaelt einen separaten Magic-Link und gibt **Einstellungsmodalitaeten** ein (Vertrag, Gehalt, Arbeitszeit)
4. **HR prueft** alles, hakt die Checkliste ab und exportiert die Daten fuer LOGA (Gehaltsabrechnung)

### Warum dieses Projekt?
Bisher lief alles per Excel, E-Mail und Papier. Das Portal:
- Eliminiert Medienbrueche (kein Papier-Fragebogen mehr)
- Zentralisiert alle 16 Mandanten in einem System
- Automatisiert Checklisten und Benachrichtigungen
- Schuetzt sensible Personaldaten (DSGVO)

---

## 2. Tech-Stack

| Komponente | Technologie | Version |
|------------|-------------|---------|
| **Frontend** | Next.js (App Router) | 15.3.2 |
| **UI-Library** | React + Tailwind CSS 4 | React 19.1 |
| **UI-Komponenten** | Radix UI (Dialog, Select, Tabs, Toast, Checkbox, Dropdown) | diverse |
| **Icons** | Lucide React | 0.511 |
| **Formulare** | React Hook Form + Zod-Validierung | RHF 7.56, Zod 3.25 |
| **Backend** | Next.js API Routes (App Router) | 15.3.2 |
| **Datenbank** | PostgreSQL | 16 (Alpine) |
| **ORM** | Prisma | 6.9 |
| **Auth** | JWT (HS256) + bcrypt + Magic Links | jsonwebtoken 9, jose 6.2 |
| **Sprache** | TypeScript | 5.8 |
| **Container** | Docker (Multi-Stage Build, node:20-alpine) | - |
| **Reverse Proxy** | Caddy | v2 |
| **Linting** | ESLint (Next.js Config) | 9.27 |

---

## 3. Projektstruktur

### 3.1 Haupt-Repository (`credo-hr-portal/`)

```
credo-hr-portal/
|-- .dockerignore              # Build-Context-Optimierung
|-- .env                       # Lokale Entwicklungsumgebung (NICHT im Git)
|-- .env.example               # Vorlage fuer Umgebungsvariablen
|-- .gitignore                 # .env, node_modules, uploads, .next
|-- API_REVIEW.md              # API-Endpunkt-Review (30+ Endpoints)
|-- Caddyfile.hr-portal        # Caddy-Config fuer hr.fes-credo.de
|-- Dockerfile                 # Multi-Stage Build (deps -> builder -> runner)
|-- SECURITY_REVIEW.md         # Security-Audit (18 Findings)
|-- deploy.sh                  # Deployment-Script (git pull, build, up)
|-- docker-compose.prod.yml    # Produktion (reverse_proxy + internal Netzwerke)
|-- docker-compose.yml         # Entwicklung (mit exposed Ports)
|-- entrypoint.sh              # Container-Start: prisma migrate + node server.js
|-- package.json               # Dependencies und Scripts
|-- prisma/
|   |-- schema.prisma          # Datenmodell (13 Models, 7 Enums)
|   |-- seed.ts                # Initial-Daten (16 Mandanten, Admin-User, Vorlagen)
|   +-- migrations/            # Datenbank-Migrationen
|-- public/
|   |-- robots.txt             # Suchmaschinen-Ausschluss
|   +-- ...
+-- src/
    |-- middleware.ts           # Security Headers + JWT-Validierung (jose)
    |-- lib/
    |   |-- auth.ts            # JWT + Magic-Link + Supervisor-Token Auth
    |   |-- db.ts              # Prisma Client Singleton
    |   |-- encryption.ts      # AES-256-GCM fuer IBAN/SV-Nr/Steuer-ID
    |   |-- rate-limit.ts      # Token-Bucket Rate Limiting (In-Memory)
    |   |-- utils.ts           # cn() Utility (clsx + tailwind-merge)
    |   +-- validations/       # Zod-Schemas
    |-- app/
    |   |-- layout.tsx         # Root Layout
    |   |-- page.tsx           # Redirect zu /login
    |   |-- not-found.tsx      # 404-Seite
    |   |-- (portal)/          # Geschuetzter Bereich (HR-Team)
    |   |   |-- layout.tsx     # Portal-Layout mit Header + Navigation
    |   |   |-- login/page.tsx # Login-Seite
    |   |   |-- dashboard/     # Dashboard + Detail-Ansicht
    |   |   |   |-- page.tsx + dashboard-content.tsx
    |   |   |   +-- [id]/      # Vollbild-Detail mit Tabs
    |   |   |       |-- page.tsx + detail-content.tsx
    |   |   |-- benutzerverwaltung/  # User-Management
    |   |   |-- checklisten/   # Checklisten-Vorlagen
    |   |   |-- vorlagen/      # Formular-Vorlagen
    |   |   +-- mandanten/     # Einrichtungen/Mandanten
    |   |-- fragebogen/[token]/     # MA-Personalfragebogen (10 Steps)
    |   |   |-- page.tsx + fragebogen-form.tsx
    |   |   +-- steps/         # step1-personal.tsx bis step10-summary.tsx
    |   |-- modalitaeten/[token]/   # Vorgesetzten-Formular
    |   +-- api/               # API-Routes (siehe Abschnitt 5)
    +-- components/
        |-- portal-header.tsx  # Header mit Navigation + User-Dropdown
        |-- neuer-vorgang-modal.tsx  # Dialog fuer neuen Onboarding-Vorgang
        +-- credo-linie.tsx    # CREDO CI-Farbstreifen-Komponente
```

### 3.2 Projekt-Ordner (Dokumentation & Agenten)

```
Projekt_Personal_Einstellung_Prozessübersicht_Einstellungen/
|-- FORTSCHRITT.md             # Fortschrittsdokumentation
|-- PROJEKT_DOKUMENTATION.md   # <-- DIESE DATEI
|-- 01_Agenten/                # Agenten-Definitionen
|-- 02_Projektdokumentation/   # Projektspezifikationen
|-- 03_Quelldokumente/         # Input-Dokumente (Mandantenuebersicht etc.)
|-- 04_Ergebnisse/             # Generierte Ergebnisse
|-- 05_CI/                     # CREDO Corporate Design Vorgaben
|-- 06_Handbuchagenten/        # Handbuch-Pipeline (5 Agenten)
|   |-- content_map_hr.md      # Inhaltsverzeichnis HR-Handbuch
|   |-- content_map_it.md      # Inhaltsverzeichnis IT-Handbuch
|   |-- generate_hr_handbook.js  # HR-Handbuch Generator (mit Screenshots)
|   |-- generate_it_handbook.js  # IT-Handbuch Generator
|   |-- hr_benutzerhandbuch.docx   # Fertiges HR-Handbuch (1.044 KB)
|   |-- it_technisches_handbuch.docx  # Fertiges IT-Handbuch (85 KB)
|   |-- screenshots/           # 19 automatisch erfasste Screenshots
|   |-- review_report.md       # CI-Qualitaetspruefung
|   +-- UEBERGABE_PROTOKOLL.md # Uebergabe-Dokumentation
|-- 07_yml_docker/             # Bestehende Docker-Infrastruktur (Kassenbuch-App)
|   |-- Caddyfile              # Caddy-Config fuer kb-fv.fes-credo.de
|   |-- docker-compose.yml     # Docker-Setup der Kassenbuch-App
|   +-- ATT46962.env           # Produktions-Credentials
+-- credo-hr-portal/           # Kopie des Repos (Arbeitsverzeichnis)
```

---

## 4. Datenmodell (Prisma Schema)

### 4.1 Modelle (13 Stueck)

| Modell | Tabelle | Beschreibung |
|--------|---------|-------------|
| `Organization` | organizations | 16 CREDO-Mandanten (Gymnasium, Kitas, etc.) |
| `OnboardingProcess` | onboarding_processes | Zentrales Objekt: ein Vorgang pro Einstellung |
| `PersonalData` | personal_data | Personalfragebogen-Daten (vom MA ausgefuellt) |
| `Child` | children | Kinder des Mitarbeiters |
| `SupervisorData` | supervisor_data | Einstellungsmodalitaeten (vom Vorgesetzten) |
| `Document` | documents | Hochgeladene Dokumente (Vertraege, Zeugnisse) |
| `User` | users | HR-Team-Benutzer (mit Rollen) |
| `AuditLog` | audit_logs | Protokollierung aller Aenderungen |
| `OnboardingNote` | onboarding_notes | Notizen pro Vorgang |
| `ChecklistTemplate` | checklist_templates | Checklisten-Vorlagen |
| `ChecklistTemplateItem` | checklist_template_items | Punkte einer Vorlage |
| `ChecklistItem` | checklist_items | Instanzierte Checklist pro Onboarding |
| `FormTemplate` | form_templates | Konfigurierbarer Fragebogen pro Typ |

### 4.2 Enums (7 Stueck)

| Enum | Werte |
|------|-------|
| `OrganizationType` | GYMNASIUM, GESAMTSCHULE, GRUNDSCHULE, BERUFSKOLLEG, KITA, VERWALTUNG, GMBH, VEREIN |
| `OnboardingStatus` | INVITED → IN_PROGRESS → SUBMITTED → SUPERVISOR_PENDING → SUPERVISOR_SUBMITTED → REVIEWED → COMPLETED / EXPIRED |
| `QuestionnaireType` | STANDARD, BEAMTE, ERZIEHER, MINIJOB, EHRENAMT |
| `DocumentType` | ARBEITSVERTRAG, FUEHRUNGSZEUGNIS, KK_BESCHEINIGUNG, GEBURTSURKUNDE_KIND, SV_AUSWEIS, ZEUGNIS, ABSCHLUSSZEUGNIS, MASERNSCHUTZ, INFEKTIONSSCHUTZ, RV_BEFREIUNG, SB_AUSWEIS, VL_VERTRAG, BAV_VERTRAG, SONSTIGES |
| `DocumentStatus` | UPLOADED, REVIEWED, APPROVED, REJECTED |
| `UserRole` | SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER |
| `ChecklistTemplate` | (via QuestionnaireType zugeordnet) |

### 4.3 Seed-Daten

- **16 Mandanten** (aus Mandantenuebersicht.xlsx): GS Haddenhausen (712), GS Stemwede (719), Gesamtschule (721), GS Minderheide (728), SFV-FES (734), SFV-MI (735), Maranatha GmbH (736), Gymnasium (737), KiTa Minden (742), KiTa Espelkamp (743), helex.it GmbH (747), FES Objekt Service GmbH (764), KiTa Herford (766), Berufskolleg (767), CFH (768), KiTa PW (769)
- **1 Admin-User**: dimitri@credo-gruppe.de (SUPER_ADMIN), Passwort wird jetzt per Zufall generiert
- **5 Formularvorlagen**: Standard, Beamte, Erzieher, Minijob, Ehrenamt
- **2 Checklisten-Vorlagen**: Standard-Einstellung (13 Punkte), Minijob (4 Punkte)

---

## 5. API-Endpunkte

### 5.1 Authentifizierung

| Methode | Pfad | Auth | Beschreibung |
|---------|------|------|-------------|
| POST | /api/auth | Nein | Login (E-Mail + Passwort) → JWT Cookie |
| (Logout) | /api/auth | Ja | Cookie loeschen (clientseitig) |

### 5.2 Onboarding-Vorgaenge

| Methode | Pfad | Auth | Beschreibung |
|---------|------|------|-------------|
| GET | /api/onboarding | HR | Alle Vorgaenge auflisten (mit Filtern) |
| POST | /api/onboarding | HR | Neuen Vorgang anlegen |
| GET | /api/onboarding/:id | HR | Einzelnen Vorgang mit allen Details |
| PATCH | /api/onboarding/:id | HR | Vorgang aktualisieren (Status, Daten) |
| POST | /api/onboarding/:id/supervisor-link | HR | Vorgesetzten-Link generieren |
| GET | /api/onboarding/:id/export | HR | CSV-Export |

### 5.3 Dokumente

| Methode | Pfad | Auth | Beschreibung |
|---------|------|------|-------------|
| POST | /api/fragebogen/:token/documents | Token | Dokument hochladen (Magic-Bytes-Pruefung) |
| GET | /api/onboarding/:id/documents/:docId | HR | Dokument herunterladen |

### 5.4 Personalfragebogen (Magic Link)

| Methode | Pfad | Auth | Beschreibung |
|---------|------|------|-------------|
| GET | /api/fragebogen/:token | Token | Fragebogen-Daten laden |
| PUT | /api/fragebogen/:token | Token | Auto-Save (Step-Daten) |
| POST | /api/fragebogen/:token | Token | Fragebogen endgueltig absenden |

### 5.5 Einstellungsmodalitaeten (Supervisor Magic Link)

| Methode | Pfad | Auth | Beschreibung |
|---------|------|------|-------------|
| GET | /api/modalitaeten/:token | Token | Modalitaeten-Daten laden |
| PUT | /api/modalitaeten/:token | Token | Auto-Save |
| POST | /api/modalitaeten/:token | Token | Modalitaeten absenden |

### 5.6 Verwaltung

| Methode | Pfad | Auth | Beschreibung |
|---------|------|------|-------------|
| GET/POST | /api/users | Admin | Benutzer auflisten / anlegen |
| PATCH/DELETE | /api/users/:id | Admin | Benutzer aendern / deaktivieren |
| GET | /api/organizations | HR | Mandanten auflisten |
| PATCH | /api/organizations/:id | Admin | Mandant aendern |
| GET/POST | /api/checklisten | HR | Checklisten-Vorlagen |
| PATCH/DELETE | /api/checklisten/:id | Admin | Vorlage aendern / loeschen |
| POST | /api/checklisten/:id/items | Admin | Vorlage-Punkte verwalten |
| PATCH | /api/onboarding/:id/checklist/:itemId | HR | Checklisten-Punkt abhaken |
| POST/PATCH/DELETE | /api/onboarding/:id/notes | HR | Notizen CRUD |
| GET/POST | /api/vorlagen | HR | Formularvorlagen |
| PATCH | /api/vorlagen/:id | Admin | Vorlage aendern |

---

## 6. Sicherheitsarchitektur

### 6.1 Authentifizierung

- **HR-Login:** E-Mail + Passwort → bcrypt(12) → JWT Cookie (`credo_session`, httpOnly, SameSite: lax, 7 Tage)
- **JWT:** HS256, explizit festgelegt (Algorithm Confusion Prevention)
- **Middleware:** Validiert JWT kryptographisch mit `jose` (Edge-Runtime-kompatibel)
- **Magic Links:** UUID v4 Tokens, konfigurierbare Laufzeit (Standard: 720h = 30 Tage)
- **Supervisor-Token:** Separater UUID v4 Token pro Vorgesetztem

### 6.2 Passwort-Policy (nach Security-Review verschaerft)

- Mindestens 12 Zeichen
- Muss Grossbuchstaben, Kleinbuchstaben UND Ziffern enthalten
- Seed generiert jetzt Zufallspasswort statt hartkodiertem "admin2026"

### 6.3 Rate Limiting

| Limiter | Limit | Window | Scope |
|---------|-------|--------|-------|
| loginRateLimiter | 5 Versuche | 1 Minute | Per IP |
| emailRateLimiter | 10 Versuche | 15 Minuten | Per E-Mail |
| tokenRateLimiter | 20 Anfragen | 1 Minute | Per IP |
| apiRateLimiter | 60 Anfragen | 1 Minute | Per IP |

### 6.4 Datei-Upload Sicherheit

- **Magic-Bytes-Validierung:** Serverseite Pruefung der ersten 4 Bytes
- **MIME-Type-Whitelist:** PDF, JPEG, PNG, WebP, HEIC
- **Dateigroessen-Limit:** 10 MB
- **Path-Traversal-Schutz:** `path.resolve()` + `startsWith(uploadsDir)` Pruefung
- **Content-Disposition:** Filename sanitisiert gegen Header-Injection

### 6.5 Verschluesselung (NEU nach Security-Review)

- **Modul:** `src/lib/encryption.ts` (AES-256-GCM)
- **Geschuetzte Felder:** IBAN, Sozialversicherungsnummer, Steuer-ID
- **Format:** `iv:authTag:ciphertext` (Base64-kodiert)
- **Schluessel:** `ENCRYPTION_KEY` als 64-Zeichen Hex-String in .env

### 6.6 Security Headers (Middleware)

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
```

### 6.7 Security-Review Zusammenfassung

| Schweregrad | Anzahl | Gefixt |
|-------------|--------|--------|
| CRITICAL | 2 | 2 (Encryption, Seed-Passwort) |
| HIGH | 5 | 4 (Passwort-Policy, JWT-Algorithm, Middleware-JWT, Content-Disposition) |
| MEDIUM | 6 | 2 (parsed.data, DB-Port) |
| LOW | 5 | 1 (robots.txt) |

**Vollstaendiger Bericht:** `SECURITY_REVIEW.md` im Repository

---

## 7. CREDO Corporate Design

### 7.1 Farben

| Farbe | Hex | Verwendung |
|-------|-----|-----------|
| Grau | #DADADA | Hintergrund, Verwaltung |
| Gruen | #6BAA24 | Erfolg, Bestaetigung |
| Blau | #009AC6 | Links, Primaerfarbe Gymnasium |
| Gelb | #FBC900 | Warnungen, Hinweise |
| Rot | #E2001A | Fehler, kritische Aktionen |
| Akzent | #575756 | Text, Rahmen |

### 7.2 Typografie

- **Schriftart:** Arial (KEINE andere!)
- **Claim:** "lebensnah - wegweisend - christlich"
- **KEINE Farbverlaeufe** (nur Vollflaechenfarben)

---

## 8. Deployment

### 8.1 Infrastruktur

```
Internet → Caddy (TLS, Reverse Proxy)
           |-- kb-fv.fes-credo.de → Kassenbuch-App
           +-- hr.fes-credo.de → CREDO HR-Portal (NEU)
                |
                +-- Docker Compose
                    |-- credo-hr-app (Next.js, Port 3000)
                    |   |-- reverse_proxy Network (extern, shared mit Caddy)
                    |   +-- internal Network
                    +-- credo-hr-db (PostgreSQL 16)
                        +-- internal Network (nur intern erreichbar)
```

### 8.2 Dateien

| Datei | Zweck |
|-------|-------|
| `docker-compose.prod.yml` | Produktions-Docker-Compose (keine exponierten Ports) |
| `docker-compose.yml` | Entwicklungs-Version (Ports 3000 + 5432 exposed) |
| `Dockerfile` | Multi-Stage Build: deps → builder → runner (node:20-alpine) |
| `entrypoint.sh` | Container-Start: `prisma migrate deploy` + `node server.js` |
| `Caddyfile.hr-portal` | Caddy-Config fuer hr.fes-credo.de |
| `deploy.sh` | Automatisches Deployment-Script |
| `.env.production` | Produktions-Credentials (NUR auf Server, NICHT im Git!) |
| `.dockerignore` | Ausschluss von node_modules, .git, .env, uploads etc. |

### 8.3 Deployment-Befehl

```bash
# Auf dem Server:
cd /opt/credo-hr-portal
chmod +x deploy.sh
./deploy.sh

# Oder manuell:
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### 8.4 Seed ausfuehren (Erstinstallation)

```bash
docker exec -it credo-hr-app npx prisma db seed
# Passwort wird in der Konsole angezeigt!
# ODER:
docker exec -it credo-hr-app sh -c "ADMIN_INITIAL_PASSWORD=MeinSicheresPasswort npx prisma db seed"
```

### 8.5 .env.production Vorlage

```env
DB_PASSWORD=<sicheres-passwort>
JWT_SECRET=<openssl rand -base64 48>
ENCRYPTION_KEY=<openssl rand -hex 32>
MAGIC_LINK_EXPIRY_HOURS=720
N8N_WEBHOOK_BASE_URL=https://n8n.credo-intern.de/webhook
APP_URL=https://hr.fes-credo.de
NODE_ENV=production
```

---

## 9. Git-Historie

| Commit | Datum | Beschreibung |
|--------|-------|-------------|
| `a0fe84f` | 2026-03-11 10:04 | **MVP-Implementierung:** Vollstaendiges Portal mit Login, Dashboard, Fragebogen (10 Steps), Modalitaeten, Benutzerverwaltung, Checklisten, Vorlagen, Mandanten, Dokument-Upload, CSV-Export, Magic Links, Rate Limiting |
| `bb94592` | 2026-03-11 10:30 | **CSP-Fix:** `unsafe-eval` fuer Dev-Modus (Next.js HMR), fehlende Portal-Routen in Middleware geschuetzt |
| `a4e3d09` | 2026-03-11 14:30 | **Features:** Detail-Vollbild-Seite mit 5 Tabs (Uebersicht, Dokumente, Checkliste, Vorgesetzter, Notizen), Notizen-System (CRUD), Dokument-Download, Vorgesetzter-Daten-Anzeige |
| `2b6828d` | 2026-03-11 17:06 | **Security-Hardening + Deployment:** AES-256-GCM Encryption, Seed-Randomisierung, Passwort-Policy 12+, JWT-Algorithm explizit HS256, Middleware-JWT-Validierung (jose), Content-Disposition Fix, parsed.data Fix, robots.txt, docker-compose.prod.yml, Caddyfile, deploy.sh, .dockerignore, Security-Review, API-Review |

---

## 10. Handbuecher

### 10.1 HR-Benutzerhandbuch (`hr_benutzerhandbuch.docx`, 1.044 KB)

5-Agenten-Pipeline generiert mit 35 eingebetteten Screenshots:
- Login-Prozess, Dashboard-Uebersicht, Neuer Vorgang, Detail-Tabs
- Benutzerverwaltung, Checklisten, Formularvorlagen, Mandanten
- Im CREDO CI: Arial, Farbstreifen, Claim "lebensnah - wegweisend - christlich"

### 10.2 IT-Technisches Handbuch (`it_technisches_handbuch.docx`, 85 KB)

9 Kapitel + 3 Anhänge:
- Architektur, Installation, API-Referenz (37 Endpoints), Datenmodell
- Datenbankschema (13 Models, 7 Enums, Indizes)
- Security Headers & Middleware, Audit-Log Events
- n8n-Integration, Glossar

### 10.3 Handbuch-Pipeline

```
Agent 01 (Analyst)    → content_map_hr.md + content_map_it.md
Agent 02 (HR-Writer)  → generate_hr_handbook.js → hr_benutzerhandbuch.docx
Agent 03 (IT-Writer)  → generate_it_handbook.js → it_technisches_handbuch.docx
Agent 04 (Critic)     → review_report.md (CI-Pruefung, 4 Fehler gefunden + gefixt)
Agent 05 (Assembly)   → UEBERGABE_PROTOKOLL.md
```

**Screenshots** (19 Stueck, automatisch mit Puppeteer-Core erfasst):
```
01_login_leer.png, 02_login_email_eingegeben.png, 03_login_bereit.png,
04_dashboard_uebersicht.png, 05_dashboard_vorgaenge.png, 06_neuer_vorgang_modal.png,
07_detail_uebersicht.png, 08_detail_dokumente.png, 09_detail_checkliste.png,
10_detail_vorgesetzter.png, 11_detail_notizen.png, 12_benutzerverwaltung.png,
13_benutzer_neu_modal.png, 14_checklisten_vorlagen.png, 15_formularvorlagen.png,
16_mandanten.png, 17_dashboard_header.png, 18_dashboard_status.png,
20_dashboard_notiz_badge.png
```

---

## 11. Umgebungsvariablen

| Variable | Pflicht | Beschreibung | Beispiel |
|----------|---------|-------------|---------|
| `DATABASE_URL` | Ja | PostgreSQL Connection String | `postgresql://credo:pw@db:5432/hr_portal?schema=public` |
| `JWT_SECRET` | Ja | JWT-Signatur-Schluessel (min. 32 Zeichen) | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | Ja (Prod) | AES-256 Schluessel (64 Hex-Zeichen) | `openssl rand -hex 32` |
| `MAGIC_LINK_EXPIRY_HOURS` | Nein | Token-Laufzeit in Stunden | `720` (30 Tage) |
| `N8N_WEBHOOK_BASE_URL` | Nein | n8n Webhook-URL fuer Benachrichtigungen | `https://n8n.credo-intern.de/webhook` |
| `APP_URL` | Ja | Oeffentliche URL der App | `https://hr.fes-credo.de` |
| `NODE_ENV` | Ja | Umgebung | `production` / `development` |
| `ADMIN_INITIAL_PASSWORD` | Nein | Admin-Passwort bei Seed (sonst Zufall) | `MeinSicheresPasswort2026!` |
| `UPLOAD_DIR` | Nein | Upload-Verzeichnis | `./uploads` |
| `MAX_FILE_SIZE_MB` | Nein | Max. Dateigroesse | `10` |

---

## 12. Lokale Entwicklung

### 12.1 Setup

```bash
# Repository klonen
git clone https://github.com/Penknife5550/HR_Portal_CREDO.git
cd HR_Portal_CREDO

# Dependencies installieren
npm install

# .env erstellen
cp .env.example .env
# Werte in .env anpassen

# Datenbank starten (Docker)
docker compose up -d db

# Prisma-Migrationen ausfuehren
npx prisma migrate dev

# Seed-Daten laden
npm run db:seed

# Dev-Server starten
npm run dev
# → http://localhost:3000
```

### 12.2 Nützliche Commands

```bash
npm run dev            # Next.js Dev-Server (HMR)
npm run build          # Produktions-Build
npm run db:studio      # Prisma Studio (DB-Browser)
npm run db:migrate     # Neue Migration erstellen
npm run db:seed        # Seed-Daten laden
npm run db:generate    # Prisma Client regenerieren
npm run docker:build   # Docker Container bauen + starten
```

### 12.3 Login-Daten (Entwicklung)

- **URL:** http://localhost:3000/login
- **E-Mail:** dimitri@credo-gruppe.de
- **Passwort:** Wird beim Seed in der Konsole angezeigt (oder via ADMIN_INITIAL_PASSWORD gesetzt)

---

## 13. Offene Punkte / Naechste Schritte

### 13.1 Vor Go-Live (Pflicht)

- [ ] ENCRYPTION_KEY generieren und in .env.production setzen
- [ ] Caddyfile.hr-portal in die globale Caddy-Config einbinden
- [ ] DNS-Eintrag fuer hr.fes-credo.de erstellen
- [ ] Deployment mit deploy.sh durchfuehren
- [ ] Admin-Passwort nach Erstanmeldung aendern
- [ ] Marina Neufeld als HR_LEITUNG User anlegen
- [ ] Erste Test-Einstellung mit echten Daten durchfuehren

### 13.2 Kurzfristig (erste Wochen)

- [ ] n8n-Workflows einrichten (E-Mail-Benachrichtigungen bei Submit)
- [ ] Audit-Log erweitern (Benutzer-Management, fehlgeschlagene Logins)
- [ ] Active-User-Check bei jedem API-Request (deaktivierte User sofort sperren)
- [ ] IBAN/SV-Nr/Steuer-ID tatsaechlich mit encryption.ts verschluesseln

### 13.3 Mittelfristig

- [ ] Verbeamtungs-Prozess implementieren
- [ ] Offboarding-Prozess implementieren
- [ ] LOGA-Schnittstelle (direkter Datenexport)
- [ ] E-Mail-Templates fuer Magic Links
- [ ] Redis-basiertes Rate Limiting (wenn Scale-Out geplant)
- [ ] CSP-Nonces statt unsafe-inline

### 13.4 Langfristig

- [ ] Mehrsprachigkeit (Englisch fuer internationale MA)
- [ ] Stellenplan-Integration
- [ ] Digitale Signatur fuer Arbeitsvertraege
- [ ] Reporting-Dashboard (Statistiken, KPIs)

---

## 14. Kontakt & Verantwortlichkeiten

| Rolle | Person | Aufgabe |
|-------|--------|---------|
| **Projektleitung & IT** | Dimitri Riesen | Gesamtverantwortung, Deployment, Technik |
| **HR-Leitung** | Marina Neufeld | Ersteinrichtung, Portal-Konfiguration, Team-Schulung |
| **Entwicklung** | Claude Opus 4.6 | Vollstaendige MVP-Entwicklung, Security-Hardening, Dokumentation |

---

*Letzte Aktualisierung: 2026-03-12*
*Generiert von Claude Opus 4.6 (Anthropic)*
