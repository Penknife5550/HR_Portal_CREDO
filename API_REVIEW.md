# API & Code Review -- CREDO HR-Portal

**Datum:** 2026-03-11
**Reviewer:** Claude Code (Agent)
**Quellcode-Verzeichnis:** `C:\Users\driesen.FES\Desktop\Claude_Projekte\credo-hr-portal\`
**Tech-Stack:** Next.js 15 / React 19 / Prisma 6 / PostgreSQL 16 / TypeScript / Zod

---

## 1. API-Endpoints Status

### 1.1 Auth-Endpoints

| Endpoint | Methode | Status | Auth | Validierung | Anmerkung |
|----------|---------|--------|------|-------------|-----------|
| `/api/auth` | POST | VORHANDEN | Rate-Limit (IP + Email) | E-Mail + Passwort Pflichtfeld-Check | Login mit bcrypt, JWT Cookie. Gut implementiert |
| `/api/auth` | DELETE | VORHANDEN | Keine (nur Cookie loeschen) | Keine noetig | Logout: Cookie loeschen. Korrekt |
| `/api/auth/me` | GET | FEHLT | -- | -- | **Kein Endpoint fuer aktuellen User**. Der Client nutzt stattdessen `getSession()` serverseitig im Dashboard. Empfehlung: Fuer SPA-Szenarien nachholen |
| `/api/auth/logout` | POST | ABWEICHEND | -- | -- | Logout ist als DELETE auf `/api/auth` implementiert, nicht als POST auf `/api/auth/logout`. Funktional korrekt, aber abweichend von Spezifikation |

### 1.2 Onboarding-Endpoints

| Endpoint | Methode | Status | Auth | Validierung | Anmerkung |
|----------|---------|--------|------|-------------|-----------|
| `/api/onboarding` | POST | VORHANDEN | Session (getSession) | email + organizationId Pflichtfelder, Org-Existenz | Legt Vorgang an, generiert displayId, erstellt PersonalData + Checkliste. Sehr gut |
| `/api/onboarding` | GET | VORHANDEN | Session | Query-Params: status, organizationId, limit, offset | Pagination mit Validierung (NaN, max 200). Prisma select optimiert |
| `/api/onboarding/:id` | GET | VORHANDEN | Session | ID-Existenz-Check | Vollstaendiges Include (personalData, supervisorData, documents, notes, checklist). Korrekt |
| `/api/onboarding/:id` | PATCH | VORHANDEN | Session | Status-Whitelist (8 gueltige Werte) | Status-Aenderung mit Audit-Log. HINWEIS: Kein separater `PATCH /api/onboarding/:id/status` -- beides auf PATCH /:id |
| `/api/onboarding/:id` | DELETE | FEHLT | -- | -- | **Kein DELETE-Endpoint fuer Vorgaenge**. Sollte implementiert werden (Soft-Delete oder mit Bedingung: nur INVITED/EXPIRED) |
| `/api/onboarding/:id/status` | PATCH | FEHLT (in /:id integriert) | -- | -- | Status-Aenderung erfolgt ueber PATCH /:id mit `{status: "..."}`. Kein separater Endpoint |
| `/api/onboarding/:id/supervisor-link` | POST | VORHANDEN | Session | supervisorEmail Pflichtfeld | Generiert Supervisor-Token, erstellt SupervisorData per upsert. Audit-Log vorhanden |
| `/api/onboarding/:id/export` | GET | VORHANDEN | Session | format Query-Param (json/csv) | CSV-Export fuer LOGA mit Semikolon-Trennung. Dateiname sanitisiert. Gut |
| `/api/onboarding/:id/notes` | GET | VORHANDEN | Session | Onboarding-Existenz-Check | Alle Notizen mit createdBy laden. Korrekt |
| `/api/onboarding/:id/notes` | POST | VORHANDEN | Session | content Pflichtfeld (String, nicht leer) | Notiz erstellen mit Audit-Log. Korrekt |
| `/api/onboarding/:id/checklist` | GET | VORHANDEN | Session | Onboarding-Existenz-Check | Checklist-Items gruppiert nach category/orderIndex |
| `/api/onboarding/:id/checklist` | POST | VORHANDEN | Session | templateId Pflichtfeld | Erstellt Items aus Template mit Audit-Log |
| `/api/onboarding/:id/checklist/:itemId` | PATCH | VORHANDEN | Session | Item-Existenz + Zugehoerigkeit | isCompleted, notes, dueDate, assignee. Audit-Log |
| `/api/onboarding/:id/documents/:docId` | GET | VORHANDEN | Session | Dokument-Zugehoerigkeit zum Vorgang | Path-Traversal-Schutz (doppelt: String-Check + resolve-Check). Gut |

### 1.3 Fragebogen-Endpoints (Magic-Link-basiert)

| Endpoint | Methode | Status | Auth | Validierung | Anmerkung |
|----------|---------|--------|------|-------------|-----------|
| `/api/fragebogen/:token` | GET | VORHANDEN | Magic Token + Rate-Limit | Token-Validierung (Ablauf, Status) | Daten laden inkl. Kinder. allowSubmitted fuer GET |
| `/api/fragebogen/:token` | PUT | VORHANDEN | Magic Token | Zod-Schema + Whitelist (ALLOWED_FIELDS) | Auto-Save mit Mass-Assignment-Schutz. Doppelte Sicherheit (Zod + Whitelist) |
| `/api/fragebogen/:token` | POST | VORHANDEN | Magic Token | dsgvoAccepted Pflichtfeld, Doppel-Submit-Schutz | Finales Absenden. n8n Webhook (non-blocking). Audit-Log |
| `/api/fragebogen/:token/documents` | POST | VORHANDEN | Magic Token + Rate-Limit | Dateityp (MIME + Magic Bytes), Groesse (10MB), Path-Traversal | Upload mit umfassender Sicherheit. Sehr gut |
| `/api/fragebogen/:token/documents` | GET | VORHANDEN | Magic Token | allowSubmitted | Dokumente auflisten mit select (kein filePath exponiert) |
| `/api/fragebogen/:token/documents` | DELETE | VORHANDEN | Magic Token | documentId + Zugehoerigkeit | Datei + DB-Eintrag loeschen |

**Hinweis zur Spezifikation:** Die Spezifikation erwartet separate Endpoints `POST/GET/PATCH /api/questionnaire/:token`. Die Implementierung nutzt stattdessen `/api/fragebogen/:token` mit GET/PUT/POST. Funktional gleichwertig, nur andere Benennung (deutsch statt englisch).

### 1.4 Supervisor-Endpoints (Vorgesetzter)

| Endpoint | Methode | Status | Auth | Validierung | Anmerkung |
|----------|---------|--------|------|-------------|-----------|
| `/api/modalitaeten/:token` | GET | VORHANDEN | Supervisor Token + Rate-Limit | Token-Validierung (Ablauf, Status) | Laedt auch alle aktiven Organizations fuer Dropdown |
| `/api/modalitaeten/:token` | PUT | VORHANDEN | Supervisor Token | Zod-Schema + Whitelist | Auto-Save mit Mass-Assignment-Schutz |
| `/api/modalitaeten/:token` | POST | VORHANDEN | Supervisor Token | Doppel-Submit-Schutz | n8n Webhook (non-blocking). Audit-Log |

**Hinweis:** Spezifikation erwartet `/api/supervisor/:token`, Implementierung nutzt `/api/modalitaeten/:token`.

### 1.5 Dokument-Endpoints

| Endpoint | Methode | Status | Auth | Validierung | Anmerkung |
|----------|---------|--------|------|-------------|-----------|
| `/api/documents/upload` | POST | ABWEICHEND | -- | -- | Upload erfolgt ueber `/api/fragebogen/:token/documents` (Magic-Token-basiert). Kein separater Upload-Endpoint |
| `/api/documents/:id` | GET | ABWEICHEND | -- | -- | Download erfolgt ueber `/api/onboarding/:id/documents/:docId` (Session-basiert). Korrektere Zuordnung |
| `/api/documents/:id` | DELETE | ABWEICHEND | -- | -- | Loeschen erfolgt ueber `/api/fragebogen/:token/documents?documentId=...`. Funktional vorhanden |

### 1.6 Benutzerverwaltung

| Endpoint | Methode | Status | Auth | Validierung | Anmerkung |
|----------|---------|--------|------|-------------|-----------|
| `/api/users` | GET | VORHANDEN | Session + Rolle (SUPER_ADMIN, HR_LEITUNG) | -- | Benutzer auflisten mit select (kein passwordHash). Korrekt |
| `/api/users` | POST | VORHANDEN | Session + Rolle | E-Mail, Name, Passwort (min 6), Rolle Validierung | Duplikat-Check. bcrypt hash (12 rounds) |
| `/api/users/:id` | PATCH | VORHANDEN | Session + Rolle | Feld-weise Validierung, E-Mail-Eindeutigkeit | Passwort-Aenderung moeglich (neu gehasht) |
| `/api/users/:id` | DELETE | VORHANDEN | Session + Rolle | Existenz-Check, Self-Delete-Schutz | Soft-Delete (isActive = false). Korrekt |

### 1.7 Organisationen / Mandanten

| Endpoint | Methode | Status | Auth | Validierung | Anmerkung |
|----------|---------|--------|------|-------------|-----------|
| `/api/organizations` | GET | VORHANDEN | Session | -- | Alle Mandanten mit Onboarding-Count |
| `/api/organizations` | POST | VORHANDEN | Session + Rolle (SUPER_ADMIN) | mandantNumber + name + type Pflicht, Typ-Whitelist | Duplikat-Check auf mandantNumber |
| `/api/organizations/:id` | GET | VORHANDEN | Session | Existenz-Check | Einzelner Mandant |
| `/api/organizations/:id` | PATCH | VORHANDEN | Session + Rolle (SUPER_ADMIN) | name, type Validierung | mandantNumber ist readonly. Korrekt |

### 1.8 Checklisten-Vorlagen

| Endpoint | Methode | Status | Auth | Validierung | Anmerkung |
|----------|---------|--------|------|-------------|-----------|
| `/api/checklisten` | GET | VORHANDEN | Session | -- | Alle Vorlagen mit Items und Counts |
| `/api/checklisten` | POST | VORHANDEN | Session + Rolle (SUPER_ADMIN, HR_LEITUNG) | name + items Pflicht, Transaktion | Items werden inline erstellt. Korrekt |
| `/api/checklisten/:id` | GET | VORHANDEN | Session | Existenz-Check | Einzelne Vorlage mit Items |
| `/api/checklisten/:id` | PATCH | VORHANDEN | Session + Rolle | name, description, questionnaireType, isActive | Vorlage bearbeiten |
| `/api/checklisten/:id` | DELETE | VORHANDEN | Session + Rolle | Existenz + Verwendungs-Check | Nur loeschen wenn nicht in Verwendung (409) |
| `/api/checklisten/:id/items` | POST | VORHANDEN | Session + Rolle | title + category Pflicht | Item hinzufuegen mit Auto-OrderIndex |
| `/api/checklisten/:id/items` | PATCH | VORHANDEN | Session + Rolle | itemId + Zugehoerigkeit | Item bearbeiten |
| `/api/checklisten/:id/items` | DELETE | VORHANDEN | Session + Rolle | itemId als Query-Param | Item entfernen |

### 1.9 Formularvorlagen

| Endpoint | Methode | Status | Auth | Validierung | Anmerkung |
|----------|---------|--------|------|-------------|-----------|
| `/api/vorlagen` | GET | VORHANDEN | Session | -- | Alle FormTemplates auflisten |
| `/api/vorlagen/:id` | GET | VORHANDEN | Session | Existenz-Check | Einzelne Vorlage |
| `/api/vorlagen/:id` | PATCH | VORHANDEN | Session + Rolle (SUPER_ADMIN, HR_LEITUNG) | stepsConfig, name, description, isActive | Vorlage aktualisieren |

### 1.10 Webhooks

| Endpoint | Methode | Status | Auth | Validierung | Anmerkung |
|----------|---------|--------|------|-------------|-----------|
| `/api/webhook/questionnaire-completed` | POST | NICHT ALS ENDPOINT | -- | -- | Wird als ausgehender Webhook in `/api/fragebogen/:token` POST aufgerufen (n8n). Kein eingehender Endpoint noetig |
| `/api/webhook/supervisor-completed` | POST | NICHT ALS ENDPOINT | -- | -- | Wird als ausgehender Webhook in `/api/modalitaeten/:token` POST aufgerufen (n8n). Kein eingehender Endpoint noetig |

### 1.11 Fehlende Endpoints (Zusammenfassung)

| Endpoint | Prioritaet | Empfehlung |
|----------|-----------|------------|
| `GET /api/auth/me` | Mittel | Aktuellen User per API abfragen (fuer SPA/Client-Kontext). Derzeit ueber serverseitige `getSession()` geloest |
| `DELETE /api/onboarding/:id` | Hoch | Vorgang loeschen (nur INVITED/EXPIRED). Wichtig fuer Datenbereinigung |
| `PATCH /api/onboarding/:id/status` | Niedrig | Separater Status-Endpoint. Derzeit in PATCH /:id integriert -- funktional OK |
| `PATCH /api/notes/:id` | Mittel | Notiz bearbeiten. Derzeit nur Erstellen moeglich |
| `DELETE /api/notes/:id` | Mittel | Notiz loeschen. Derzeit nicht moeglich |

---

## 2. Code-Qualitaet

### 2.1 TypeScript-Typen

| Bereich | Bewertung | Details |
|---------|-----------|--------|
| API-Route Parameter | GUT | Korrekte Verwendung von `Promise<{ id: string }>` fuer Next.js 15 params |
| Prisma-Typen | GUT | Prisma generiert Typen automatisch. Kein manueller `any` in DB-Queries |
| Component Props | GUT | Interfaces fuer User, Organization, Onboarding korrekt definiert |
| `Record<string, unknown>` | AKZEPTABEL | Verwendet statt `any` fuer dynamische Update-Daten. Besser waere ein typisierter Partial-Typ |
| Zod-Validierung | SEHR GUT | Umfangreiche Schemas fuer Fragebogen und Modalitaeten mit `.strip()` |
| Type Assertion | AKZEPTABEL | `as never` bei DocumentType-Cast (Zeile 168, documents/route.ts). Sollte Prisma-Enum nutzen |

**Keine `any`-Types gefunden.** Alle dynamischen Objekte verwenden `Record<string, unknown>`.

### 2.2 Error-Handling

| Aspekt | Bewertung | Details |
|--------|-----------|--------|
| Try-Catch | KONSISTENT | Alle API-Handler in try-catch gewrappt |
| HTTP Status Codes | KORREKT | 400 (Validierung), 401 (Auth), 403 (Berechtigung), 404 (Nicht gefunden), 409 (Konflikt), 429 (Rate Limit), 500 (Server) |
| Error-Logging | GUT | `console.error()` mit beschreibenden Nachrichten (deutsch) |
| Client-Fehler | GUT | Fehlermeldungen auf Deutsch, keine internen Details exponiert |
| n8n Webhook | GUT | Non-blocking: Fehler werden geloggt, blockieren aber nicht den Response |

### 2.3 Prisma-Queries

| Aspekt | Bewertung | Details |
|--------|-----------|--------|
| Select-Nutzung | GUT | `select` bei Users (kein passwordHash exponiert), Documents, Notes |
| Include-Nutzung | GUT | Gezielte Includes statt globales `findMany()` ohne Filter |
| Pagination | VORHANDEN | limit/offset mit Validierung und Maximum (200) |
| Transaktionen | VORHANDEN | ChecklistTemplate-Erstellung mit `$transaction` |
| N+1 Queries | AKZEPTABEL | Onboarding POST erstellt ChecklistItems in einer Schleife (nicht `createMany`). Fuer 10-20 Items akzeptabel |
| DB-Singleton | KORREKT | `globalForPrisma` Pattern in `lib/db.ts` verhindert Connection-Leak in Dev |

### 2.4 React Components

| Aspekt | Bewertung | Details |
|--------|-----------|--------|
| Server vs Client | KORREKT | Server Components fuer Pages (`page.tsx`), Client Components fuer interaktive Inhalte (`"use client"`) |
| Loading States | VORHANDEN | `loading` State in Dashboard, Fragebogen-Form |
| Error States | TEILWEISE | API-Fehler werden in Console geloggt. Einige Componenten zeigen keine User-Fehlermeldungen |
| useCallback/useEffect | KORREKT | `loadOnboardings` ist korrekt in useCallback gewrappt |
| Prop-Types | GUT | TypeScript Interfaces fuer alle Component-Props |

### 2.5 Sicherheit

| Aspekt | Bewertung | Details |
|--------|-----------|--------|
| JWT | SEHR GUT | Lazy-Init, Secret-Laengencheck, Dev-Secret-Erkennung in Prod |
| Rate Limiting | SEHR GUT | 4 vorkonfigurierte Limiter (Login/IP, Login/Email, Token, API). Token-Bucket-Algorithmus |
| CSRF | GUT | SameSite=lax Cookie, form-action='self' in CSP |
| XSS | GUT | CSP-Header, X-XSS-Protection, Content-Type-Options |
| Path Traversal | SEHR GUT | Doppelte Pruefung bei Datei-Uploads und -Downloads (String + resolve) |
| Mass Assignment | SEHR GUT | Whitelist (ALLOWED_FIELDS) + Zod-Schema mit `.strip()` |
| Magic Bytes | SEHR GUT | Datei-Typ wird per Magic-Bytes validiert (nicht nur MIME-Header) |
| Security Headers | SEHR GUT | HSTS, CSP, X-Frame-Options, Permissions-Policy in Middleware |
| Session Cookie | GUT | httpOnly, secure (Prod), SameSite=lax, 7 Tage Ablauf |
| Doppel-Submit | GUT | Status-Check verhindert mehrfaches Absenden |
| Audit-Log | GUT | Alle wesentlichen Aktionen werden protokolliert |

---

## 3. Fehlende Features (gegenueber Spezifikation)

| Feature | Status | Prioritaet | Anmerkung |
|---------|--------|-----------|-----------|
| GET /api/auth/me | FEHLT | Mittel | Client-seitige User-Abfrage. Workaround: Server Component mit getSession() |
| DELETE /api/onboarding/:id | FEHLT | Hoch | Vorgang loeschen -- wichtig fuer Datenbereinigung |
| PATCH/DELETE /api/notes/:id | FEHLT | Mittel | Notizen bearbeiten/loeschen |
| Onboarding-Vorgang Suche | TEILWEISE | Mittel | displayId-Suche nur clientseitig. Serverseitige Suche waere effizienter |
| E-Mail-Benachrichtigungen | FEHLT | Niedrig | n8n uebernimmt das extern. Kein internes Mail-System noetig |
| Batch-Export | FEHLT | Niedrig | Mehrere Vorgaenge gleichzeitig exportieren |

---

## 4. Empfehlungen

### 4.1 Kurzfristig (vor Go-Live)

1. **DELETE /api/onboarding/:id implementieren** -- mit Bedingung: Nur loeschbar wenn Status INVITED oder EXPIRED. Soft-Delete empfohlen.

2. **`.env.production` aus credo-hr-portal Deployment-Ordner entfernen oder in .gitignore aufnehmen** -- Diese Datei enthaelt echte Credentials (DB-Passwort, JWT-Secret). Sie liegt aktuell im Deployment-Unterordner unter `Projekt_Personal_Einstellung_Prozessübersicht_Einstellungen/credo-hr-portal/`.

3. **Onboarding DELETE im Prisma-Schema mit Cascade vorbereiten** -- PersonalData, SupervisorData, Documents haben bereits `onDelete: Cascade`. Korrekt.

### 4.2 Mittelfristig

4. **Notizen-CRUD vervollstaendigen** -- PATCH und DELETE fuer `/api/notes/:id` (oder `/api/onboarding/:id/notes/:noteId`).

5. **GET /api/auth/me** -- Fuer Client-seitige Auth-Checks ohne serverseitige Page-Logik.

6. **Serverseitige Suche** -- Query-Parameter `search` auf GET /api/onboarding fuer displayId/Name/Email-Suche.

7. **Prisma createMany statt Schleife** -- In POST /api/onboarding bei Checklist-Item-Erstellung.

### 4.3 Langfristig

8. **Redis Rate Limiting** -- Aktuell In-Memory (faellt bei Restart zurueck). Fuer Single-Instance akzeptabel.

9. **API-Versionierung** -- z.B. `/api/v1/onboarding` fuer Zukunftssicherheit.

10. **OpenAPI/Swagger-Dokumentation** -- Automatisch aus Zod-Schemas generierbar.

---

## 5. Gesamtbewertung

| Kategorie | Note | Kommentar |
|-----------|------|-----------|
| **API-Vollstaendigkeit** | 85% | 30+ Endpoints implementiert. 3 fehlende Endpoints (auth/me, onboarding DELETE, notes CRUD) |
| **Authentifizierung** | 95% | JWT + Magic Links + Rollen + Rate Limiting. Sehr gut |
| **Input-Validierung** | 95% | Zod-Schemas + Whitelists + serverseitige Checks. Vorbildlich |
| **Error-Handling** | 90% | Konsistentes try-catch, korrekte Status-Codes, deutsche Fehlermeldungen |
| **Sicherheit** | 95% | CSP, HSTS, Path-Traversal-Schutz, Magic-Bytes, Mass-Assignment-Schutz |
| **Code-Qualitaet** | 90% | Kein `any`, gute Typisierung, konsistente Struktur |
| **Prisma/DB** | 90% | Optimierte Queries, Indices, Cascade-Deletes, DB-Singleton |
| **Gesamt** | **91%** | **Produktionsreifes MVP mit hoher Code-Qualitaet und umfassender Sicherheit** |

---

*Review erstellt am 2026-03-11 durch Claude Code Agent.*
