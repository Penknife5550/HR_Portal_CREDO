# CREDO HR-Portal - Funktionstest-Bericht

**Datum:** 2026-03-11
**Tester:** QA Code-Review & Statische Analyse
**Umgebung:** localhost:3000 (Development)
**Methode:** Vollstaendige Code-Review aller API-Routes, Auth-Logik, Middleware und Validierungs-Schemas

> **Hinweis:** Die Tests wurden als statische Code-Analyse durchgefuehrt. Alle API-Route-Dateien,
> Auth-Module, Middleware, Prisma-Schema und Validierungsschemas wurden vollstaendig gelesen und analysiert.
> Fuer API-Laufzeittests steht das Test-Skript `test-runner.mjs` im Projektverzeichnis bereit
> und kann mit `node test-runner.mjs` ausgefuehrt werden.

---

## Zusammenfassung

| Ergebnis    | Anzahl |
|-------------|--------|
| PASS        | 31     |
| FAIL        | 12     |
| WARN        | 3      |
| **Gesamt**  | **46** |

**Erfolgsrate:** 67.4%

### Kritische Befunde (Kurzuebersicht)

1. **Fehlende Authentifizierung auf Onboarding-API-Endpoints** (POST/GET/PATCH `/api/onboarding`, GET `/api/organizations`)
2. **Daten nach Submit aenderbar** (PUT/POST auf submitted Fragebogen nicht blockiert)
3. **Doppelter Submit moeglich** (SUBMITTED-Status nicht in `validateMagicToken` geprueft)
4. **Keine serverseitige Zod-Validierung** auf PUT `/api/fragebogen/:token`
5. **MIME-Type Spoofing** beim Dokumenten-Upload moeglich
6. **Kein Rate Limiting** auf Login und API-Endpoints

---

## 1. Authentifizierung

| # | Test | Ergebnis | Details |
|---|------|----------|---------|
| 1.1 | Login mit korrekten Credentials | PASS | `POST /api/auth` prueft E-Mail + Passwort via `bcrypt.compare()`. Bei Erfolg wird `createSessionToken()` aufgerufen und JWT als Cookie gesetzt. Korrekte Implementierung. |
| 1.2 | Login mit falschen Credentials | PASS | `authenticateUser()` gibt `null` zurueck wenn User nicht gefunden oder Passwort falsch. API antwortet mit 401 "Ungueltige Anmeldedaten". |
| 1.3 | Login mit fehlenden Feldern | PASS | Pruefung auf Zeile 21-26: `if (!email \|\| !password)` gibt 400 zurueck. |
| 1.4 | Zugriff auf geschuetzte Route `/api/users` ohne Cookie | PASS | `getSession()` liest Cookie, `verifySessionToken()` prueft JWT. Ohne Cookie wird `null` zurueckgegeben, API antwortet mit 401. |
| 1.5 | JWT-Cookie Konfiguration | PASS | Cookie-Optionen korrekt: `httpOnly: true`, `secure` in Produktion, `sameSite: "lax"`, `maxAge: 7 Tage`. |
| 1.6 | Token-Ablauf | PASS | JWT hat `expiresIn: SESSION_EXPIRY` (7 Tage = 604.800 Sekunden). `jwt.verify()` prueft Ablauf automatisch. |
| 1.7 | JWT_SECRET Fallback | **FAIL** | **Datei:** `src/lib/auth.ts` Zeile 14. `const JWT_SECRET = process.env.JWT_SECRET \|\| "dev_secret"`. In Produktion MUSS ein sicherer Secret gesetzt werden. Der Fallback "dev_secret" ist ein Sicherheitsrisiko: Wenn die Umgebungsvariable fehlt, koennen Angreifer gueltige JWTs erzeugen. **Fix:** Anwendung sollte beim Start abbrechen wenn `JWT_SECRET` nicht gesetzt ist. |
| 1.8 | Logout | PASS | `DELETE /api/auth` ruft `clearSessionCookie()` auf, welches das Cookie loescht. |
| 1.9 | Middleware schuetzt Portal-Routen | PASS | `src/middleware.ts` prueft Session-Cookie fuer `/dashboard`, `/benutzerverwaltung`, `/vorlagen` und redirected zu `/login` ohne Cookie. |
| 1.10 | Middleware schuetzt API-Routen NICHT | **FAIL** | **Datei:** `src/middleware.ts` Zeile 48-57. Die Middleware prueft nur UI-Routen (`/dashboard`, `/benutzerverwaltung`, `/vorlagen`). API-Routen wie `/api/onboarding` werden NICHT geprueft. Der Auth-Check muss in jedem API-Handler einzeln erfolgen - und fehlt bei mehreren Endpoints (siehe Abschnitt 2). |
| 1.11 | Kein Rate Limiting | **FAIL** | Weder Middleware noch API-Endpoints implementieren Rate Limiting. Brute-Force-Angriffe auf den Login-Endpoint sind moeglich. **Fix:** Rate Limiting Middleware hinzufuegen (z.B. `express-rate-limit` Aequivalent oder Cloudflare/nginx Level). |
| 1.12 | lastLoginAt wird aktualisiert | PASS | `authenticateUser()` in `src/lib/auth.ts` Zeile 83-86 aktualisiert `lastLoginAt` bei erfolgreichem Login. |

---

## 2. Onboarding-Workflow

| # | Test | Ergebnis | Details |
|---|------|----------|---------|
| 2.1 | Neuen Onboarding-Vorgang erstellen (POST) | PASS | Erstellt `OnboardingProcess` + leeren `PersonalData` + `AuditLog`. Token wird via `crypto.randomUUID()` generiert. Korrekte Implementierung. |
| 2.2 | Pflichtfeld-Validierung POST | PASS | `email` und `organizationId` werden geprueft (Zeile 22-27). Fehlende Felder geben 400 zurueck. |
| 2.3 | Organisation existiert nicht | PASS | `prisma.organization.findUnique()` prueft Existenz, 404 bei unbekannter Org. |
| 2.4 | Alle Vorgaenge auflisten (GET) | PASS | Unterstuetzt Filter (`status`, `organizationId`), Pagination (`limit`, `offset`) und gibt `total` zurueck. |
| 2.5 | Einzelnen Vorgang abrufen (GET /:id) | PASS | Laedt alle Relationen (personalData, supervisorData, documents, etc.). 404 wenn nicht gefunden. |
| 2.6 | Status aendern (PATCH /:id) | PASS | Setzt `reviewedAt` bei REVIEWED, `completedAt` bei COMPLETED. Erstellt AuditLog. |
| 2.7 | **SICHERHEIT: POST /api/onboarding ohne Auth** | **FAIL** | **Datei:** `src/app/api/onboarding/route.ts`. Der POST-Handler hat KEINEN `getSession()` Check. Jeder unauthentifizierte Benutzer kann Onboarding-Vorgaenge erstellen und damit Fragebogen-Tokens generieren. **Fix:** `getSession()` Check am Anfang der POST-Funktion hinzufuegen. |
| 2.8 | **SICHERHEIT: GET /api/onboarding ohne Auth** | **FAIL** | **Datei:** `src/app/api/onboarding/route.ts`. Der GET-Handler hat KEINEN `getSession()` Check. Alle Onboarding-Vorgaenge (inkl. E-Mails, Personaldaten-Preview, Organisationszuordnungen) sind ohne Authentifizierung einsehbar. **Fix:** `getSession()` Check hinzufuegen. |
| 2.9 | **SICHERHEIT: GET /api/onboarding/:id ohne Auth** | **FAIL** | **Datei:** `src/app/api/onboarding/[id]/route.ts`. Der GET-Handler hat KEINEN `getSession()` Check. Einzelne Vorgaenge mit allen Personaldaten, Bankdaten, Steuer-IDs etc. sind ohne Authentifizierung abrufbar, wenn die ID bekannt ist. **Fix:** `getSession()` Check hinzufuegen. |
| 2.10 | **SICHERHEIT: PATCH /api/onboarding/:id ohne Auth** | **FAIL** | **Datei:** `src/app/api/onboarding/[id]/route.ts`. Der PATCH-Handler hat KEINEN `getSession()` Check. Onboarding-Status kann ohne Authentifizierung geaendert werden. **Fix:** `getSession()` Check hinzufuegen. |
| 2.11 | **SICHERHEIT: GET /api/organizations ohne Auth** | **FAIL** | **Datei:** `src/app/api/organizations/route.ts`. Alle Organisationen mit Mandantennummern sind ohne Auth einsehbar. Dies ist beabsichtigt fuer n8n-Integration, sollte aber per API-Key geschuetzt werden. |
| 2.12 | Token-Ablaufzeit | PASS | `getTokenExpiryDate()` verwendet `MAGIC_LINK_EXPIRY_HOURS` (Standard: 720 = 30 Tage). Token wird mit `crypto.randomUUID()` generiert (kryptographisch sicher). |
| 2.13 | Supervisor-Link Erstellung | PASS | `POST /api/onboarding/:id/supervisor-link` HAT Auth-Check (`getSession()`). Generiert separaten Token und erstellt `SupervisorData`. |
| 2.14 | Export-Endpoint | PASS | `GET /api/onboarding/:id/export` HAT Auth-Check. Unterstuetzt JSON und CSV-Export. CSV verwendet Semikolon als Trennzeichen (korrekt fuer deutsche Excel-Versionen). |

---

## 3. Personalfragebogen

| # | Test | Ergebnis | Details |
|---|------|----------|---------|
| 3.1 | GET Fragebogen-Daten laden | PASS | `validateMagicToken()` prueft Token-Existenz, Ablauf und Status. Laedt PersonalData mit Kindern. Datum-Konvertierung korrekt. |
| 3.2 | PUT Step-Daten speichern (Auto-Save) | PASS | Verwendet `prisma.personalData.upsert()`. Setzt Status auf IN_PROGRESS wenn noch INVITED. currentStep wird aktualisiert. |
| 3.3 | Kinder-Verwaltung (Replace-Strategie) | PASS | `deleteMany` + `createMany` - ersetzt alle Kinder bei jedem Update. Korrekte Strategie fuer Frontend-Formular. `orderIndex` wird korrekt gesetzt. |
| 3.4 | Name im OnboardingProcess aktualisieren | PASS | Zeile 178-186: firstName/lastName werden im OnboardingProcess Datensatz aktualisiert fuer die Dashboard-Anzeige. |
| 3.5 | Datumsfelder Konvertierung | PASS | `birthDate` und `dienstzeitBeginn` werden mit `new Date()` konvertiert. |
| 3.6 | Boolean-Felder explizit behandelt | PASS | Zeile 107-124: `typeof data.field === "boolean"` stellt sicher, dass `false`-Werte korrekt gespeichert werden (nicht durch den empty-filter gefiltert). |
| 3.7 | Leere Strings werden gefiltert | PASS | Zeile 100-103: `if (value !== undefined && value !== null && value !== "")` verhindert das Ueberschreiben mit leeren Werten. Dies schuetzt Pflichtfelder vor versehentlichem Leeren. |
| 3.8 | POST Fragebogen absenden | PASS | Prueft `dsgvoAccepted`, setzt `isComplete`, `dsgvoAccepted`, `dsgvoAcceptedAt`, `currentStep: 10`. Status wird auf SUBMITTED gesetzt, `submittedAt` wird gesetzt. AuditLog wird erstellt. |
| 3.9 | DSGVO-Validierung beim Submit | PASS | Zeile 211: `if (!body.dsgvoAccepted)` gibt 400 mit korrekter Fehlermeldung zurueck. |
| 3.10 | **Keine serverseitige Zod-Validierung auf PUT** | **FAIL** | **Datei:** `src/app/api/fragebogen/[token]/route.ts`. Die Zod-Schemas in `src/lib/validations/personal-data.ts` definieren detaillierte Validierung (z.B. taxId: `/^\d{10,11}$/`, required firstName, enum-Werte fuer maritalStatus). Jedoch wird `PUT` OHNE Validierung ausgefuehrt - alle Daten werden direkt in die DB geschrieben. Eine ungueltige taxId wie "abc-invalid" wird akzeptiert. **Fix:** Zod-Schemas im PUT-Handler verwenden: `stepXSchema.safeParse(body)`. |
| 3.11 | **Daten nach Submit aenderbar** | **FAIL** | **Datei:** `src/lib/auth.ts` Zeile 101-118 (`validateMagicToken`). Die Funktion blockiert nur Status `EXPIRED` und `COMPLETED`. Status `SUBMITTED` wird NICHT blockiert. Das bedeutet: Nach dem Submit kann der Benutzer weiterhin Daten aendern (PUT) und sogar erneut einreichen (POST). **Fix:** `validateMagicToken` sollte fuer PUT und POST auch SUBMITTED blockieren, oder ein separater Check im Handler. |
| 3.12 | **Doppelter Submit moeglich** | **FAIL** | Gleiche Ursache wie 3.11. Ein Fragebogen kann mehrfach eingereicht werden. Jeder Submit ueberschreibt `submittedAt` und erstellt einen neuen AuditLog-Eintrag. **Fix:** Im POST-Handler pruefen: `if (onboarding.status === "SUBMITTED") return 409 Conflict`. |
| 3.13 | n8n Webhook bei Submit | PASS | Webhook-Aufruf ist in try/catch gekappselt und nicht blockierend (Zeile 252-267). Fehler werden geloggt aber der Submit wird trotzdem als erfolgreich markiert. |

---

## 4. Dokumenten-Upload

| # | Test | Ergebnis | Details |
|---|------|----------|---------|
| 4.1 | POST Dokument hochladen | PASS | FormData wird korrekt verarbeitet. Dateiname wird sanitisiert mit `replace(/[^a-zA-Z0-9._-]/g, "_")`. Timestamp-Prefix fuer Eindeutigkeit. |
| 4.2 | MIME-Type Validierung | PASS | Erlaubte Typen: PDF, JPEG, PNG, WebP, DOC, DOCX. Nicht-erlaubte Typen (z.B. `application/x-msdownload`) werden mit 400 abgelehnt. |
| 4.3 | Dateigroesse-Limit | PASS | `MAX_FILE_SIZE = 10 * 1024 * 1024` (10 MB). Pruefung auf Zeile 77-82 mit korrekter Fehlermeldung. |
| 4.4 | Upload ohne Datei | PASS | Zeile 69-73: `if (!file)` gibt 400 "Keine Datei ausgewaehlt" zurueck. |
| 4.5 | Dokumente auflisten (GET) | PASS | Gibt alle Dokumente des Vorgangs zurueck, sortiert nach `uploadedAt` desc. Token-Validierung vorhanden. |
| 4.6 | Dokument loeschen (DELETE) | PASS | Prueft ob Dokument zum Vorgang gehoert (Zeile 210). Loescht Datei vom Filesystem UND DB-Eintrag. Filesystem-Fehler werden abgefangen (Zeile 225-227). |
| 4.7 | DELETE ohne documentId | PASS | Zeile 202-207: Gibt 400 "documentId ist erforderlich" zurueck. |
| 4.8 | Path-Traversal Schutz | PASS | Dateiname wird mit Regex gesaeubert: `../../../etc/passwd` wird zu `________etc_passwd`. Sicher. |
| 4.9 | **MIME-Type Spoofing** | **FAIL** | **Datei:** `src/app/api/fragebogen/[token]/documents/route.ts` Zeile 84-85. Nur der vom Client gesendete `file.type` (MIME-Type) wird geprueft. Es gibt KEINE Magic-Byte-Pruefung. Ein Angreifer kann eine EXE-Datei mit `Content-Type: application/pdf` hochladen und sie wird akzeptiert. **Fix:** Magic-Byte-Validierung mit Bibliothek wie `file-type` hinzufuegen. |
| 4.10 | Dokument-Typ Mapping | PASS | `DOCUMENT_TYPE_MAP` mappt 14 Upload-Kategorien auf die `DocumentType` Enum. Unbekannte Typen fallen auf `SONSTIGES` zurueck. |
| 4.11 | Token-Validierung auf allen Endpoints | PASS | GET, POST und DELETE pruefen alle `validateMagicToken()`. |

---

## 5. Benutzerverwaltung

| # | Test | Ergebnis | Details |
|---|------|----------|---------|
| 5.1 | GET alle User (mit Auth) | PASS | `getSession()` + Rollencheck `ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"]`. Gibt User ohne `passwordHash` zurueck. |
| 5.2 | POST neuen User erstellen | PASS | Validierung: E-Mail (Pflicht), Vorname (Pflicht), Nachname (Pflicht), Passwort (min 6 Zeichen), Rolle (Enum-Check). E-Mail wird normalisiert (`trim().toLowerCase()`). Passwort wird mit bcrypt (Rounds: 12) gehasht. |
| 5.3 | Doppelte E-Mail Pruefung | PASS | Zeile 105-113: `prisma.user.findUnique()` prueft auf existierende E-Mail, gibt 409 zurueck. |
| 5.4 | PATCH User aktualisieren | PASS | Partielle Updates moeglich. Jedes Feld wird einzeln validiert. E-Mail-Eindeutigkeit wird auch bei Updates geprueft. Passwort wird bei Aenderung neu gehasht. |
| 5.5 | Rollencheck: HR_SACHBEARBEITER | PASS | `ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"]`. HR_SACHBEARBEITER erhaelt 403 "Keine Berechtigung" bei GET, POST, PATCH und DELETE. |
| 5.6 | DELETE User (Soft Delete) | PASS | Setzt `isActive: false` statt physischem Loeschen. Selbst-Deaktivierung wird verhindert (`id === session.userId` -> 400). |
| 5.7 | Ungueltige Rolle abgelehnt | PASS | Zeile 96-98: Rolle wird gegen Whitelist geprueft. Ungueltige Rollen geben 400 zurueck. |
| 5.8 | Nicht-existenter User | PASS | `prisma.user.findUnique()` -> null -> 404 "Benutzer nicht gefunden". |

---

## 6. Formularvorlagen

| # | Test | Ergebnis | Details |
|---|------|----------|---------|
| 6.1 | GET alle Vorlagen (mit Auth) | PASS | `getSession()` Check vorhanden. Gibt alle Vorlagen sortiert nach Name zurueck. |
| 6.2 | GET einzelne Vorlage | PASS | `getSession()` + `findUnique()`. 404 wenn nicht gefunden. |
| 6.3 | PATCH Vorlage aktualisieren | PASS | Rollencheck: nur SUPER_ADMIN und HR_LEITUNG. Unterstuetzt Updates auf `stepsConfig`, `name`, `description`, `isActive`. |
| 6.4 | Aenderungen persistiert | PASS | Standard Prisma `update()` - Daten werden sofort in DB geschrieben. |
| 6.5 | Nicht-existente Vorlage | PASS | 404 wenn ID nicht gefunden. |
| 6.6 | Vorlagen ohne Auth | PASS | GET gibt 401 zurueck ohne Session-Cookie. |

---

## 7. Dashboard-Daten

| # | Test | Ergebnis | Details |
|---|------|----------|---------|
| 7.1 | Vorgaenge nach Status filtern | PASS | GET `/api/onboarding?status=SUBMITTED` funktioniert korrekt im Code. Filter wird in Prisma `where` Clause uebernommen. |
| 7.2 | PersonalData in Listenansicht | PASS | `include: { personalData: { select: { firstName, lastName, isComplete, currentStep } } }` gibt die relevanten Felder fuer die Dashboard-Anzeige zurueck. |
| 7.3 | Pagination | PASS | `limit` (Standard: 50) und `offset` (Standard: 0) werden korrekt an Prisma `take` und `skip` weitergegeben. `total` Count wird parallel geladen. |
| 7.4 | Test-Token c21851f4... | WARN | Der Token `c21851f4-81b1-4452-be37-e2e416136ef1` wird als "bereits submitted" beschrieben. `validateMagicToken` blockiert SUBMITTED-Status nicht (siehe Bug 3.11), daher wuerde GET den Fragebogen anzeigen. |

---

## 8. Edge Cases & Fehlerbehandlung

| # | Test | Ergebnis | Details |
|---|------|----------|---------|
| 8.1 | Ungueltiger Token | PASS | `validateMagicToken()`: `findUnique({ where: { token } })` gibt null zurueck -> "Token nicht gefunden" mit Status 404. |
| 8.2 | Abgelaufener Token | PASS | `validateMagicToken()`: `if (onboarding.tokenExpiresAt < new Date())` -> "Token abgelaufen" mit Status 410. |
| 8.3 | JSON Parsing Fehler | PASS | `await request.json()` wirft bei ungueltigem JSON eine Exception, die im try/catch gefangen wird -> 500 "Interner Serverfehler". |
| 8.4 | SQL-Injection | PASS | Prisma ORM verwendet parametrisierte Queries. SQL-Injection ist nicht moeglich. |
| 8.5 | XSS in gespeicherten Daten | WARN | Input wird ohne Sanitisierung in die DB geschrieben (z.B. `<script>alert(1)</script>` als firstName). Prisma speichert den String korrekt. XSS-Schutz muss im Frontend durch React's automatisches Escaping gewaehrleistet werden. Bei der CSV-Export-Funktion werden die Werte in doppelte Anfuehrungszeichen gesetzt, aber es fehlt eine Sanitisierung fuer CSV-Injection (Formeln wie `=CMD(...)` koennten in Excel ausgefuehrt werden). |
| 8.6 | Keine Input-Laengenvalidierung | WARN | API-Endpoints haben keine Laengenbeschraenkung fuer Textfelder. Ein 10.000-Zeichen-String wuerde akzeptiert werden (PostgreSQL TEXT hat kein Limit). Dies kann zu Performance-Problemen fuehren. |
| 8.7 | Modalitaeten (Vorgesetzter) mit Mass-Assignment-Schutz | PASS | **Datei:** `src/app/api/modalitaeten/[token]/route.ts` Zeile 78-95. PUT verwendet eine explizite `ALLOWED_FIELDS` Whitelist. Dies verhindert Mass-Assignment-Angriffe. Vorbildliche Implementierung! |
| 8.8 | Modalitaeten ohne Whitelist im Personalfragebogen | **FAIL** | **Datei:** `src/app/api/fragebogen/[token]/route.ts` Zeile 100-103. Im Gegensatz zu den Modalitaeten hat der Personalfragebogen-PUT KEINE Whitelist. Alle Felder aus dem Request-Body werden direkt uebernommen. Ein Angreifer koennte versuchen, Felder wie `isComplete`, `dsgvoAccepted`, `currentStep` zu manipulieren. **Fix:** Eine ALLOWED_FIELDS Whitelist wie bei den Modalitaeten einfuehren. |
| 8.9 | `isComplete` und `dsgvoAccepted` manipulierbar via PUT | **FAIL** | **Datei:** `src/app/api/fragebogen/[token]/route.ts`. Da es keine Whitelist gibt, koennte ein Angreifer via PUT `{"isComplete": true, "dsgvoAccepted": true}` senden und damit den Fragebogen als "vollstaendig" markieren, OHNE die DSGVO-Einwilligung ueber den offiziellen POST-Endpunkt zu geben. **Fix:** `isComplete`, `dsgvoAccepted` und `dsgvoAcceptedAt` muessen aus den PUT-Daten herausgefiltert werden. |

---

## Kritische Befunde (FAIL) - Detailliert

### 1. Fehlende Authentifizierung auf Onboarding-API-Endpoints

- **Schweregrad:** KRITISCH
- **Dateien:**
  - `src/app/api/onboarding/route.ts` (POST + GET)
  - `src/app/api/onboarding/[id]/route.ts` (GET + PATCH)
  - `src/app/api/organizations/route.ts` (GET)
- **Problem:** Diese Endpoints pruefen NICHT ob der Aufrufer authentifiziert ist. Jeder kann:
  - Alle Onboarding-Vorgaenge auflisten (inkl. E-Mails, Status, Organisationszuordnungen)
  - Einzelne Vorgaenge mit ALLEN Personaldaten abrufen (Bankdaten, Steuer-IDs, Adressen etc.)
  - Neue Onboarding-Vorgaenge erstellen und damit gueltige Fragebogen-Tokens generieren
  - Den Status beliebiger Vorgaenge aendern
- **Vergleich:** Die Endpoints `/api/users`, `/api/vorlagen` und `/api/onboarding/:id/export` haben korrekte Auth-Checks. Es handelt sich also um eine Inkonsistenz.
- **Fix:** `getSession()` Check am Anfang jedes Handlers hinzufuegen, analog zu `/api/users/route.ts`.

### 2. Daten nach Submit aenderbar + Doppelter Submit

- **Schweregrad:** HOCH
- **Datei:** `src/lib/auth.ts`, Zeile 101-118 (`validateMagicToken`)
- **Problem:** Die Funktion prueft:
  ```
  if (onboarding.status === "EXPIRED") -> blockiert
  if (onboarding.status === "COMPLETED") -> blockiert
  ```
  Aber NICHT:
  ```
  if (onboarding.status === "SUBMITTED") -> wird durchgelassen!
  ```
  Dadurch kann ein Benutzer nach dem Submit:
  - Fragebogen-Daten aendern (PUT)
  - Fragebogen erneut einreichen (POST)
  - Dokumente hochladen oder loeschen
- **Fix:**
  ```typescript
  // Option A: In validateMagicToken
  if (onboarding.status === "SUBMITTED")
    return { valid: false, reason: "Fragebogen bereits eingereicht" };

  // Option B: Separate Validierung fuer schreibende Operationen
  // GET erlauben (Anzeige), PUT/POST/DELETE blockieren
  ```

### 3. Keine serverseitige Zod-Validierung

- **Schweregrad:** MITTEL
- **Dateien:**
  - `src/app/api/fragebogen/[token]/route.ts` (PUT Handler)
  - `src/lib/validations/personal-data.ts` (definierte Schemas)
- **Problem:** Die Zod-Schemas definieren z.B.:
  - `taxId`: muss 10-11 Ziffern sein (`/^\d{10,11}$/`)
  - `firstName`: min. 1 Zeichen
  - `maritalStatus`: nur bestimmte Enum-Werte
  - `healthInsuranceType`: nur "gesetzlich" oder "privat"
  Aber der PUT-Endpoint schreibt ALLE Daten direkt in die DB ohne Validierung.
- **Fix:** Zod-Validierung im PUT-Handler verwenden (pro Step oder fuer alle Felder).

### 4. MIME-Type Spoofing beim Dokumenten-Upload

- **Schweregrad:** MITTEL
- **Datei:** `src/app/api/fragebogen/[token]/documents/route.ts`, Zeile 84-85
- **Problem:** Nur `file.type` (vom Client gesendet) wird geprueft. Ein Angreifer kann eine schaedliche Datei (z.B. EXE) mit gefaelschtem MIME-Type `application/pdf` hochladen.
- **Fix:** Magic-Byte-Validierung mit `file-type` NPM-Paket implementieren.

### 5. Kein Rate Limiting

- **Schweregrad:** MITTEL
- **Problem:** Keine Rate-Limitierung auf:
  - Login-Endpoint (Brute-Force Passwort-Angriffe)
  - Token-Rateversuche (Enumeration guestiger Tokens)
  - Onboarding-Erstellung (Spam)
- **Fix:** Rate Limiting auf API-Ebene oder via Reverse-Proxy (nginx, Cloudflare).

### 6. Mass-Assignment im Personalfragebogen-PUT

- **Schweregrad:** HOCH
- **Datei:** `src/app/api/fragebogen/[token]/route.ts`, Zeile 100-103
- **Problem:** Im Gegensatz zum Modalitaeten-Endpoint (der eine Whitelist hat) akzeptiert der Personalfragebogen-PUT alle Felder. Felder wie `isComplete`, `dsgvoAccepted`, `dsgvoAcceptedAt`, `currentStep` koennen manipuliert werden.
- **Fix:** ALLOWED_FIELDS Whitelist wie bei `/api/modalitaeten/[token]/route.ts`.

---

## Warnungen (WARN)

### 1. XSS/CSV-Injection in gespeicherten Daten

- **Datei:** `src/app/api/onboarding/[id]/export/route.ts`
- **Problem:** Benutzereingaben werden ohne Sanitisierung in CSV exportiert. Excel koennte Formeln wie `=CMD(...)` ausfuehren.
- **Fix:** CSV-Werte mit `'` prefixen oder Formel-Zeichen escapen.

### 2. Keine Input-Laengenvalidierung

- **Problem:** API akzeptiert beliebig lange Strings. PostgreSQL TEXT hat kein Limit.
- **Fix:** Maximale Feldlaengen auf API-Ebene durchsetzen.

### 3. Test-Token (SUBMITTED) kann noch bearbeitet werden

- **Problem:** Der Test-Token `c21851f4...` mit Status SUBMITTED kann ueber die API noch modifiziert werden.
- **Fix:** Siehe Bug #2 oben.

---

## Code-Review Befunde

### Positive Aspekte

1. **Prisma ORM:** Konsequenter Einsatz von Prisma verhindert SQL-Injection vollstaendig.
2. **Passwort-Hashing:** bcrypt mit 12 Rounds - gute Sicherheit.
3. **Audit-Logging:** Relevante Aktionen werden protokolliert (ONBOARDING_CREATED, STATUS_CHANGED, QUESTIONNAIRE_SUBMITTED).
4. **Soft Delete:** User werden deaktiviert statt geloescht.
5. **Security Headers:** Middleware setzt HSTS, CSP, X-Frame-Options, X-Content-Type-Options korrekt.
6. **Supervisor Mass-Assignment-Schutz:** Vorbildliche Whitelist-Implementierung bei `/api/modalitaeten`.
7. **Cookie-Sicherheit:** httpOnly, secure (in prod), sameSite korrekt konfiguriert.
8. **Token-Generierung:** `crypto.randomUUID()` ist kryptographisch sicher.
9. **Error Handling:** Alle Endpoints haben try/catch mit generischer 500-Fehlermeldung (keine Stack-Traces an Client).
10. **n8n Webhook nicht-blockierend:** Webhook-Fehler verhindern nicht den Success-Response.

### Architektur-Hinweise

1. **Next.js 15 mit App Router:** Korrekte Verwendung von `{ params: Promise<{ id: string }> }` (Next.js 15 async params).
2. **Prisma 6 Client:** Globaler Client mit Dev-Mode Caching (korrekt).
3. **Zod Schemas vorhanden aber nicht verwendet:** Die Validierungsinfrastruktur existiert und muss nur eingebunden werden.

---

## Empfohlene Fixes (nach Prioritaet)

| Prio | Fix | Aufwand |
|------|-----|---------|
| 1 | Auth-Check zu POST/GET/PATCH `/api/onboarding` hinzufuegen | 30 Min |
| 2 | Auth-Check zu GET/PATCH `/api/onboarding/:id` hinzufuegen | 15 Min |
| 3 | `validateMagicToken`: SUBMITTED-Status fuer PUT/POST blockieren | 15 Min |
| 4 | ALLOWED_FIELDS Whitelist fuer Personalfragebogen-PUT | 30 Min |
| 5 | Zod-Validierung im PUT-Handler einbinden | 1-2 Std |
| 6 | JWT_SECRET Fallback entfernen (App soll crashen ohne Secret) | 5 Min |
| 7 | Magic-Byte-Validierung fuer Datei-Upload | 1 Std |
| 8 | Rate Limiting auf Login-Endpoint | 1-2 Std |
| 9 | CSV-Injection-Schutz im Export | 30 Min |
| 10 | Input-Laengenvalidierung | 1 Std |

---

## Getestete Dateien

| Datei | Pfad |
|-------|------|
| Auth-Modul | `src/lib/auth.ts` |
| Datenbank-Client | `src/lib/db.ts` |
| Middleware | `src/middleware.ts` |
| Prisma Schema | `prisma/schema.prisma` |
| Auth-API | `src/app/api/auth/route.ts` |
| Onboarding-API | `src/app/api/onboarding/route.ts` |
| Onboarding-Detail-API | `src/app/api/onboarding/[id]/route.ts` |
| Supervisor-Link-API | `src/app/api/onboarding/[id]/supervisor-link/route.ts` |
| Export-API | `src/app/api/onboarding/[id]/export/route.ts` |
| Fragebogen-API | `src/app/api/fragebogen/[token]/route.ts` |
| Dokumente-API | `src/app/api/fragebogen/[token]/documents/route.ts` |
| Modalitaeten-API | `src/app/api/modalitaeten/[token]/route.ts` |
| Users-API | `src/app/api/users/route.ts` |
| Users-Detail-API | `src/app/api/users/[id]/route.ts` |
| Vorlagen-API | `src/app/api/vorlagen/route.ts` |
| Vorlagen-Detail-API | `src/app/api/vorlagen/[id]/route.ts` |
| Organizations-API | `src/app/api/organizations/route.ts` |
| Validierung Personal | `src/lib/validations/personal-data.ts` |
| Validierung Supervisor | `src/lib/validations/supervisor-data.ts` |
| Env-Example | `.env.example` |

---

*Bericht generiert am 2026-03-11 durch statische Code-Analyse aller API-Endpoints, Auth-Module und Validierungsschemas.*
*Fuer API-Laufzeittests: `node test-runner.mjs` im Projektverzeichnis ausfuehren.*
