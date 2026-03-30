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
- **E-Mail:** Nodemailer + optionale n8n-Integration
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

### Drei Compose-Dateien

| Datei | Zweck | DB-User | Container-Namen | Netzwerk |
|---|---|---|---|---|
| `docker-compose.yml` | **Produktion mit Caddy Reverse Proxy** | `credo` | `credo-hr-app`, `credo-hr-db` | `reverse_proxy` (extern) + `internal` |
| `docker-compose.prod.yml` | **Produktion eigenstaendig** (Port 3000 exposed) | `hrportal` | `hr-portal-app`, `hr-portal-db` | `internal` only |
| `docker-compose.dev.yml` | Lokales Dev/Test (Port 3000 + DB 5433) | `credo` | `credo-hr-app-dev`, `credo-hr-db-dev` | default |

### Wichtige Unterschiede

- **`docker-compose.yml`** (Caddy): Kein Port-Expose, Env-Variablen direkt in `environment:`, Caddy routet ueber das externe `reverse_proxy`-Netzwerk
- **`docker-compose.prod.yml`** (eigenstaendig): Port `3000:3000` exposed, liest Secrets aus `env_file: .env`, NODE_ENV ist auskommentiert (wird in .env gesetzt)
- **`docker-compose.dev.yml`**: DB-Port `5433:5432` fuer lokalen Zugriff, APP_URL=`http://localhost:3000`

### Welche Datei auf dem Server?

```bash
# MIT Caddy Reverse Proxy (hr.fes-credo.de):
sudo docker compose up -d --build

# OHNE Reverse Proxy (direkt Port 3000):
sudo docker compose -f docker-compose.prod.yml up -d --build
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
1. Pflicht-Umgebungsvariablen pruefen (JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL)
2. `prisma db push --skip-generate` (Schema synchronisieren)
3. Seed-Check (`prisma/seed-check.js`) — legt Admin-User an falls noch keiner existiert
4. Next.js Server starten (`node server.js`)

### Umgebungsvariablen (Pflicht)

| Variable | Beschreibung | Generieren mit |
|---|---|---|
| `DB_PASSWORD` | PostgreSQL-Passwort | frei waehlbar |
| `JWT_SECRET` | JWT-Signierung (kein "dev_secret"!) | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | 64 Hex-Zeichen fuer AES-256-GCM | `openssl rand -hex 32` |
| `CRON_SECRET` | Absicherung der Cron-Endpunkte | `openssl rand -base64 24` |
| `APP_URL` | Basis-URL | `https://hr.fes-credo.de` |
| `ADMIN_INITIAL_PASSWORD` | Initiales Admin-Passwort (optional, sonst zufaellig) | frei waehlbar |

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

## Admin-Zugang

- **E-Mail:** `dimitri@credo-gruppe.de`
- **Passwort:** Wird beim Seed generiert und in der Konsole ausgegeben (oder via `ADMIN_INITIAL_PASSWORD` gesetzt)
- **Rolle:** SUPER_ADMIN
