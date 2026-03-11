# Security Review -- CREDO HR-Portal

**Datum:** 2026-03-11
**Reviewer:** Claude Opus 4.6 (automatisierter Security-Audit)
**Projektverzeichnis:** `C:\Users\driesen.FES\Desktop\Claude_Projekte\credo-hr-portal\`
**Scope:** Vollstaendiger Quellcode-Review aller sicherheitsrelevanten Dateien

---

## Zusammenfassung

| Schweregrad | Anzahl |
|-------------|--------|
| CRITICAL    | 2      |
| HIGH        | 5      |
| MEDIUM      | 6      |
| LOW         | 5      |
| **Gesamt**  | **18** |

**Gesamtbewertung:** Das CREDO HR-Portal zeigt ein solides Sicherheitsfundament mit guter Implementierung in vielen Bereichen (Zod-Validierung, Magic-Bytes-Pruefung, Path-Traversal-Schutz, Rate Limiting, RBAC). Es gibt jedoch kritische Luecken bei der Verschluesselung sensibler Personaldaten und der Passwort-Policy, die vor einem Produktiveinsatz behoben werden muessen.

---

## Kritische Findings (CRITICAL -- sofort beheben)

### C-1: Sensible Personaldaten im Klartext in der Datenbank gespeichert

**Schweregrad:** CRITICAL
**Betroffene Datei:** `prisma/schema.prisma` (PersonalData-Modell, Zeilen 126-211)
**Betroffene Felder:**
- `iban` -- Bankverbindung (IBAN)
- `socialSecurityNumber` -- Sozialversicherungsnummer
- `taxId` -- Steuer-Identifikationsnummer

**Beschreibung:**
Hochsensible personenbezogene Daten (IBAN, Sozialversicherungsnummer, Steuer-ID) werden als einfache `String?`-Felder in der PostgreSQL-Datenbank gespeichert -- im Klartext, ohne jegliche Verschluesselung. Bei einem Datenbankzugriff (SQL-Dump, Backup-Diebstahl, kompromittierter DB-Server) sind alle Finanzdaten und Sozialversicherungsnummern sofort lesbar.

Nach DSGVO Art. 32 besteht die Pflicht, angemessene technische und organisatorische Massnahmen zu treffen, um ein dem Risiko angemessenes Schutzniveau zu gewaehrleisten. Fuer Finanzdaten und Sozialversicherungsnummern ist Application-Level-Encryption (ALE) der angemessene Standard.

**Fix (muss implementiert werden):**

1. Erstelle eine neue Datei `src/lib/encryption.ts`:
```typescript
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 64) {
    throw new Error(
      "FATAL: ENCRYPTION_KEY muss als 64-stelliger Hex-String (32 Bytes) konfiguriert sein."
    );
  }
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (alles Base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 3) throw new Error("Ungueltiges verschluesseltes Format");
  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const encrypted = Buffer.from(parts[2], "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
```

2. IBAN, SV-Nummer und Steuer-ID vor dem Speichern verschluesseln und beim Lesen entschluesseln.
3. `ENCRYPTION_KEY` als 64-Zeichen-Hex-String in `.env` generieren: `openssl rand -hex 32`
4. `.env.example` um `ENCRYPTION_KEY` ergaenzen.

---

### C-2: Schwaches Default-Admin-Passwort "admin2026" im Seed

**Schweregrad:** CRITICAL
**Betroffene Datei:** `prisma/seed.ts` (Zeile 138)
**Code:**
```typescript
passwordHash: hashSync("admin2026", 12),
```

**Beschreibung:**
Das Default-Admin-Passwort `admin2026` ist extrem schwach und leicht zu erraten. Es steht im Klartext im Quellcode (Git-History!) und wird bei jedem `db:seed` auf dem Admin-Account gesetzt. Ein Angreifer, der den Quellcode oder die Git-History kennt, kann sich sofort als SUPER_ADMIN anmelden.

**Fix:**
```typescript
// Seed soll kein fixes Passwort verwenden. Stattdessen:
const randomPassword = crypto.randomBytes(16).toString("hex");
console.log(`\n   INITIALES PASSWORT: ${randomPassword}`);
console.log(`   BITTE SOFORT AENDERN!\n`);
passwordHash: hashSync(randomPassword, 12),
```

---

## Hohe Findings (HIGH)

### H-1: Passwort-Policy zu schwach (Minimum 6 Zeichen)

**Schweregrad:** HIGH
**Betroffene Dateien:**
- `src/app/api/users/route.ts` (Zeile 93)
- `src/app/api/users/[id]/route.ts` (Zeile 115)

**Code:**
```typescript
if (!password || typeof password !== "string" || password.length < 6) {
```

**Beschreibung:**
Die minimale Passwortlaenge betraegt nur 6 Zeichen. Fuer ein HR-System mit hochsensiblen Personaldaten (IBAN, SV-Nummer, Steuer-ID) ist das unzureichend. OWASP empfiehlt mindestens 12 Zeichen plus Komplexitaetsanforderungen.

**Fix:**
Aendere in beiden Dateien auf `password.length < 12` und fuege Komplexitaetspruefungen hinzu (Gross-/Kleinbuchstaben, Ziffern).

---

### H-2: JWT verwendet HS256 mit geteiltem Secret

**Schweregrad:** HIGH
**Betroffene Datei:** `src/lib/auth.ts` (Zeile 69)

**Beschreibung:**
JWT wird mit dem symmetrischen HS256-Algorithmus signiert (Standard bei `jsonwebtoken`). Das ist funktional, hat aber ein Risiko: Wenn der `JWT_SECRET` kompromittiert wird, kann ein Angreifer beliebige gueltige Tokens erzeugen. Bei asymmetrischen Algorithmen (RS256/ES256) waere nur der oeffentliche Schluessel exponiert, mit dem keine Tokens erzeugt werden koennen.

Zudem gibt es kein Token-Revocation-Mechanism: Deaktivierte Benutzer koennen bis zu 7 Tage lang weiter auf das System zugreifen, wenn ihre Session-Cookies nicht ablaufen.

**Fix:**
1. `algorithm: "HS256"` explizit in der jwt.sign/verify-Konfiguration angeben (Defense in Depth gegen Algorithm Confusion Attacks).
2. Bei jedem API-Request pruefen, ob der Benutzer noch aktiv ist (DB-Lookup auf `isActive`). Alternativ: Kurzlebigere Tokens (z.B. 1 Stunde) mit Refresh-Token-Mechanismus.

---

### H-3: Middleware validiert Session-Cookie nicht kryptographisch

**Schweregrad:** HIGH
**Betroffene Datei:** `src/middleware.ts` (Zeilen 66-71)

**Code:**
```typescript
if (isPortalRoute) {
  const sessionCookie = request.cookies.get("credo_session");
  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
```

**Beschreibung:**
Die Middleware prueft nur, ob ein `credo_session`-Cookie *existiert*, nicht ob er einen gueltigen JWT enthaelt. Ein Angreifer kann einen beliebigen Wert als Cookie setzen und die Middleware passieren. Die tatsaechliche JWT-Validierung erfolgt erst in den API-Routes via `getSession()`.

Fuer Seiten-Routen (Server-Side-Rendered Pages) bedeutet das: Die Seite wird gerendert und an den Client geliefert, auch wenn der Cookie ungueltig ist. Die Daten kommen zwar nicht aus der API (dort wird korrekt geprueft), aber die Seitenstruktur und UI werden uebertragen.

**Fix:**
```typescript
import { jwtVerify } from "jose"; // jose laeuft in Edge Runtime (Middleware)

if (isPortalRoute) {
  const sessionCookie = request.cookies.get("credo_session");
  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(sessionCookie.value, secret);
  } catch {
    // Ungueltiger/abgelaufener Token -> Redirect zu Login
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("credo_session");
    return response;
  }
}
```
Hinweis: Die Middleware muss dafuer als `async function middleware()` deklariert werden. `jose` laeuft im Edge-Runtime von Next.js, `jsonwebtoken` nicht.

---

### H-4: Rate Limiting nur In-Memory (kein Schutz bei Neustart/Scale-Out)

**Schweregrad:** HIGH
**Betroffene Datei:** `src/lib/rate-limit.ts`

**Beschreibung:**
Der Rate Limiter speichert alle Zaehler im Arbeitsspeicher (`Map<string, Map<string, RateLimitEntry>>`). Das hat zwei Probleme:
1. **Neustart:** Bei jedem Server-Neustart werden alle Rate-Limit-Zaehler zurueckgesetzt. Ein Angreifer kann den Schutz umgehen, indem er den Server zum Neustart zwingt (z.B. durch hohe Last).
2. **Scale-Out:** Bei mehreren Instanzen (Docker Compose Scale, Kubernetes) hat jede Instanz ihren eigenen Zaehler. Ein Angreifer kann die Limits umgehen, indem er Requests an verschiedene Instanzen verteilt.

**Fix:**
Fuer die aktuelle Single-Instance-Architektur ist In-Memory akzeptabel. Sobald ein Scale-Out geplant ist, muss auf Redis-basiertes Rate Limiting gewechselt werden (z.B. `@upstash/ratelimit` oder `rate-limiter-flexible` mit Redis-Backend).

---

### H-5: Content-Disposition Header-Injection bei Dokument-Download

**Schweregrad:** HIGH
**Betroffene Datei:** `src/app/api/onboarding/[id]/documents/[docId]/route.ts` (Zeile 93)

**Code:**
```typescript
"Content-Disposition": `attachment; filename="${document.fileName}"`,
```

**Beschreibung:**
Der Original-Dateiname (`document.fileName`) wird direkt in den `Content-Disposition`-Header eingebettet, ohne Sanitisierung. Wenn ein Benutzer beim Upload einen Dateinamen mit Sonderzeichen (z.B. `"` oder `\r\n`) waehlt, kann dies zu Header-Injection fuehren.

Beim CSV-Export (`export/route.ts`, Zeile 162) wird der Dateiname korrekt sanitisiert. Beim Dokument-Download fehlt diese Sanitisierung.

**Fix:**
```typescript
const safeFileName = document.fileName.replace(/[^a-zA-Z0-9._\- \u00C0-\u024F]/g, "_");
"Content-Disposition": `attachment; filename="${safeFileName}"`,
```

---

## Mittlere Findings (MEDIUM)

### M-1: `unsafe-inline` in CSP fuer script-src (Produktion)

**Schweregrad:** MEDIUM
**Betroffene Datei:** `src/middleware.ts` (Zeile 34)

**Code:**
```typescript
: "script-src 'self' 'unsafe-inline'";
```

**Beschreibung:**
In der Produktion wird `unsafe-inline` fuer `script-src` verwendet. Dies schwaecht den XSS-Schutz der CSP erheblich, da Inline-Skripte zugelassen werden. Next.js benoetigt dies standardmaessig fuer Inline-Skripte, aber die beste Praxis waere die Verwendung von Nonces.

**Fix:**
Next.js 15 unterstuetzt `nonce`-basierte CSP. Konfiguriere einen dynamisch generierten Nonce pro Request. Alternativ: Die aktuelle Konfiguration ist akzeptabel, da React standardmaessig gegen XSS schuetzt (JSX-Escaping).

---

### M-2: Keine CSRF-Token-Validierung

**Schweregrad:** MEDIUM
**Betroffene Dateien:** Alle API-Routes mit POST/PUT/PATCH/DELETE

**Beschreibung:**
Es gibt keinen CSRF-Schutz (kein CSRF-Token, kein Double-Submit-Cookie-Pattern). Die API verlasst sich auf:
1. `SameSite: "lax"` auf dem Session-Cookie (schuetzt gegen einfache Cross-Site-Angriffe)
2. `Content-Type: application/json` (Browsers senden JSON nicht bei einfachen Form-Submits)

Diese Kombination bietet guten Basis-Schutz, ist aber nicht vollstaendig:
- `SameSite: "lax"` erlaubt GET-Requests von anderen Origins (GET-Requests auf Portal-Routes sind auth-geschuetzt, also OK)
- Custom `Content-Type`-Header bei `fetch()` triggern einen CORS-Preflight, was Cross-Origin-POST-Requests blockiert

**Bewertung:** Das aktuelle Schutzniveau ist fuer die Anwendung akzeptabel, da:
- Session-Cookie ist `httpOnly` + `SameSite: "lax"`
- API akzeptiert nur JSON (`Content-Type: application/json`)
- Magic-Link-Endpunkte verwenden Token-basierte Auth (kein Session-Cookie)

**Empfehlung:** Fuege ein CSRF-Token-Pattern hinzu, wenn die Anwendung in einem Umfeld mit hoeheren Sicherheitsanforderungen eingesetzt wird.

---

### M-3: PUT-Endpunkte (Fragebogen/Modalitaeten) verwenden `body` statt `parsed.data` nach Zod-Validierung

**Schweregrad:** MEDIUM
**Betroffene Dateien:**
- `src/app/api/fragebogen/[token]/route.ts` (Zeile 172)
- `src/app/api/modalitaeten/[token]/route.ts` (Zeile 142)

**Code:**
```typescript
const parsed = fragebogenFieldsSchema.safeParse(body);
if (!parsed.success) { return error; }
const { currentStep, children, ...data } = body; // <-- body statt parsed.data!
```

**Beschreibung:**
Obwohl eine Zod-Validierung durchgefuehrt wird, werden anschliessend die Daten aus dem rohen `body`-Objekt weiterverwendet statt aus `parsed.data`. Das bedeutet:
- Die Whitelist-Feldfiltierung (ALLOWED_FIELDS Set) faengt dies teilweise auf
- `.strip()` im Zod-Schema entfernt unbekannte Felder nur in `parsed.data`, nicht in `body`
- Ein Angreifer koennte Felder senden, die Zod entfernt haette, die aber durch die manuelle ALLOWED_FIELDS-Pruefung durchgelassen werden

Der Schutz ist durch die zusaetzliche ALLOWED_FIELDS-Whitelist vorhanden (Defense in Depth), aber der Code sollte konsistent `parsed.data` verwenden.

**Fix:**
```typescript
const { currentStep, children, ...data } = parsed.data; // statt body
```

---

### M-4: Fehlende Audit-Log-Eintraege fuer sicherheitsrelevante Aktionen

**Schweregrad:** MEDIUM
**Betroffene Dateien:**
- `src/app/api/users/route.ts` -- Benutzer-Erstellung wird nicht geloggt
- `src/app/api/users/[id]/route.ts` -- Benutzer-Aenderung/Deaktivierung wird nicht geloggt
- `src/app/api/auth/route.ts` -- Fehlgeschlagene Login-Versuche werden nicht geloggt

**Beschreibung:**
Sicherheitsrelevante Aktionen wie Benutzer-Erstellung, Rollenveraenderung und fehlgeschlagene Login-Versuche werden nicht im Audit-Log erfasst. Fuer die DSGVO-Compliance und Forensik ist ein lueckenloses Audit-Log essenziell.

**Fix:**
Audit-Log-Eintraege fuer alle Benutzer-Management-Aktionen und fehlgeschlagene Logins hinzufuegen.

---

### M-5: IP-Adresse im Rate Limiter via `x-forwarded-for` Header (Spoofing-Risiko)

**Schweregrad:** MEDIUM
**Betroffene Datei:** `src/lib/rate-limit.ts` (Zeilen 127-134)

**Code:**
```typescript
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}
```

**Beschreibung:**
Der `x-forwarded-for`-Header kann von Clients manipuliert werden, wenn kein vertrauenswuerdiger Reverse Proxy davor steht. Ein Angreifer kann bei jedem Request eine andere IP setzen und so das Rate Limiting umgehen.

Zudem: Der Fallback `"unknown"` bedeutet, dass alle Requests ohne `x-forwarded-for` den gleichen Rate-Limit-Bucket teilen, was bei direktem Zugriff (ohne Proxy) zu unbeabsichtigtem Blocking fuehren kann.

**Fix:**
- Konfiguriere den Reverse Proxy (Caddy) so, dass er den `x-forwarded-for`-Header ueberschreibt (nicht anhaengt)
- Verwende `request.headers.get("x-real-ip")` als zusaetzlichen Fallback
- In der Caddy-Konfiguration: `header_up X-Forwarded-For {remote_host}` setzen

---

### M-6: Docker-Compose exponiert DB-Port 5432 nach aussen

**Schweregrad:** MEDIUM
**Betroffene Datei:** `docker-compose.yml` (Zeile 14)

**Code:**
```yaml
ports:
  - "5432:5432"
```

**Beschreibung:**
Der PostgreSQL-Port wird auf dem Host exponiert. In einer Produktionsumgebung sollte die Datenbank nur intern erreichbar sein (ueber das Docker-Netzwerk).

**Fix:**
```yaml
ports:
  - "127.0.0.1:5432:5432"  # Nur localhost, nicht 0.0.0.0
```
Oder den Port-Mapping komplett entfernen und nur ueber den Service-Namen `db` zugreifen.

---

## Niedrige Findings (LOW)

### L-1: Keine Account-Lockout-Policy

**Schweregrad:** LOW
**Betroffene Datei:** `src/app/api/auth/route.ts`

**Beschreibung:**
Nach wiederholten fehlgeschlagenen Login-Versuchen wird zwar Rate-Limiting angewendet (5 Versuche pro Minute per IP, 10 pro 15 Min per E-Mail), aber es gibt kein dauerhaftes Account-Lockout. Ein geduldiger Angreifer kann langsam Passwoerter durchprobieren (z.B. 5 pro Minute).

**Empfehlung:**
Nach 10 aufeinanderfolgenden Fehlversuchen den Account fuer 15-30 Minuten sperren (in der DB `lockedUntil`-Feld).

---

### L-2: Error-Logging gibt interne Details preis

**Schweregrad:** LOW
**Betroffene Dateien:** Alle API-Routes

**Code:**
```typescript
console.error("Login-Fehler:", error);
```

**Beschreibung:**
Interne Fehlerdetails werden in die Server-Logs geschrieben. In einer Container-Umgebung koennten diese Logs ueber Docker-Logs oder Monitoring-Tools zugaenglich sein und Stack-Traces, Datenbankverbindungsdetails oder andere sensible Informationen enthalten.

**Empfehlung:**
- Produktions-Logger verwenden (z.B. `pino`) mit konfiguriertem Log-Level
- Stack-Traces nur in Development loggen
- Sensible Felder aus Error-Objekten filtern

---

### L-3: Magic-Link Token-Expiry von 30 Tagen ist sehr lang

**Schweregrad:** LOW
**Betroffene Datei:** `.env` (Zeile 3: `MAGIC_LINK_EXPIRY_HOURS=720`)

**Beschreibung:**
Magic-Link-Tokens sind 30 Tage lang gueltig. Das ist fuer einen Onboarding-Prozess verstaendlich (neuer MA braucht Zeit), aber ergibt ein laengeres Angriffsfenster fuer Token-Enumeration oder E-Mail-Kompromittierung.

**Empfehlung:**
- Standardmaessig 14 Tage (336 Stunden)
- Verlaengerung nur auf explizite Anfrage

---

### L-4: Kein robots.txt oder X-Robots-Tag fuer API-Routes

**Schweregrad:** LOW
**Betroffene Datei:** nicht vorhanden

**Beschreibung:**
Es gibt keine `robots.txt` oder `X-Robots-Tag`-Header, die Suchmaschinen davon abhalten, API-Endpunkte oder Magic-Link-Seiten zu indizieren.

**Fix:**
Erstelle `public/robots.txt`:
```
User-agent: *
Disallow: /api/
Disallow: /fragebogen/
Disallow: /modalitaeten/
Disallow: /dashboard/
```

---

### L-5: WebP Magic-Bytes-Pruefung unvollstaendig

**Schweregrad:** LOW
**Betroffene Datei:** `src/app/api/fragebogen/[token]/documents/route.ts` (Zeile 33)

**Code:**
```typescript
"image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF
```

**Beschreibung:**
Die Magic-Bytes-Pruefung fuer WebP validiert nur die RIFF-Signatur, nicht den WebP-spezifischen Teil (`WEBP` an Offset 8). Ein RIFF-Container kann auch andere Formate enthalten (z.B. WAV, AVI). Ein Angreifer koennte eine WAV-Datei als WebP hochladen.

**Fix:**
```typescript
"image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF Header
// Zusaetzlich pruefen: buffer[8..11] === "WEBP"
```
Die `validateMagicBytes`-Funktion erweitern, um bei WebP auch die Bytes 8-11 zu pruefen.

---

## Positive Sicherheitsaspekte (was gut gemacht wurde)

1. **bcrypt mit 12 Salt Rounds:** Korrekte Passwort-Hashing-Implementierung.
2. **Path-Traversal-Schutz:** Sowohl beim Upload als auch beim Download korrekt implementiert mit `path.resolve()` + `startsWith()`-Pruefung.
3. **Magic-Bytes-Validierung:** Server-seitige Pruefung der Dateiinhalte (nicht nur MIME-Type).
4. **Zod-Schema-Validierung:** Umfassende serverseitige Validierung aller Eingabefelder.
5. **Mass-Assignment-Schutz:** Whitelist erlaubter Felder + Zod `.strip()`.
6. **Security Headers:** Umfassende Security-Header-Konfiguration in der Middleware (HSTS, X-Frame-Options, CSP, Permissions-Policy).
7. **httpOnly + SameSite Cookies:** Korrekte Cookie-Konfiguration.
8. **JWT-Secret-Validierung:** Laenge-Check und Dev-Secret-Erkennung in Produktion.
9. **Rollenbasierte Zugriffskontrolle (RBAC):** Konsistente Rollenspruefung in allen Admin-Endpunkten.
10. **Soft Delete:** Benutzer werden deaktiviert, nicht geloescht.
11. **Audit-Log:** Grundlegende Audit-Logging-Implementierung fuer wichtige Aktionen.
12. **Docker Non-Root User:** Container laeuft als `nextjs:nodejs` (UID 1001).
13. **Rate Limiting:** Differenzierte Rate Limiter fuer Login (IP + E-Mail), Token-Endpunkte und API.
14. **Token-Generierung:** `crypto.randomUUID()` fuer kryptographisch sichere Token.
15. **Prisma ORM:** Parameterisierte Queries verhindern SQL-Injection.
16. **.gitignore:** `.env`-Dateien und Uploads korrekt ausgeschlossen.
17. **CSV-Export Filename-Sanitisierung:** Korrekte Behandlung im Export-Endpunkt.
18. **Doppel-Submit-Schutz:** Fragebogen und Modalitaeten pruefen auf bereits eingereichten Status.

---

## Empfehlungen (nach Prioritaet)

### Sofort (vor Produktivstart):

1. **ENCRYPTION_KEY konfigurieren und sensible Felder verschluesseln** (IBAN, SV-Nr, Steuer-ID) -- siehe Finding C-1
2. **Admin-Passwort im Seed randomisieren** -- siehe Finding C-2
3. **Passwort-Policy auf 12 Zeichen + Komplexitaet erhoehen** -- siehe Finding H-1
4. **Middleware JWT-Validierung implementieren** (mit `jose`-Library) -- siehe Finding H-3
5. **Content-Disposition Filename sanitisieren** -- siehe Finding H-5
6. **`parsed.data` statt `body` nach Zod-Validierung verwenden** -- siehe Finding M-3
7. **DB-Port in docker-compose.yml nur auf localhost binden** -- siehe Finding M-6

### Kurzfristig (erste Wochen nach Launch):

8. **Audit-Log erweitern** (Benutzer-Mgmt, fehlgeschlagene Logins) -- siehe Finding M-4
9. **robots.txt erstellen** -- siehe Finding L-4
10. **JWT Algorithm explizit angeben** (`algorithm: "HS256"`) -- siehe Finding H-2
11. **Active-User-Check bei jedem API-Request** -- siehe Finding H-2

### Mittelfristig:

12. **Redis-basiertes Rate Limiting** fuer Scale-Out -- siehe Finding H-4
13. **CSP-Nonces** statt `unsafe-inline` -- siehe Finding M-1
14. **Account-Lockout-Policy** -- siehe Finding L-1
15. **Strukturiertes Logging** (pino) -- siehe Finding L-2
16. **WebP Magic-Bytes vervollstaendigen** -- siehe Finding L-5

### Langfristig:

17. **Asymmetrische JWT-Signierung** (RS256/ES256) evaluieren -- siehe Finding H-2
18. **CSRF-Token-Pattern** implementieren -- siehe Finding M-2
19. **Penetrationstest** durch externen Dienstleister

---

## Gepruefte Dateien

### Authentifizierung & Autorisierung
| Datei | Bewertung |
|-------|-----------|
| `src/lib/auth.ts` | Gut (JWT-Secret-Pruefung, bcrypt, Token-Validierung) |
| `src/app/api/auth/route.ts` | Gut (Rate Limiting per IP + E-Mail, korrekte Fehlerbehandlung) |
| `src/middleware.ts` | Mangelhaft (Cookie-Existenz-Pruefung ohne JWT-Validierung) |

### API-Routen
| Datei | Bewertung |
|-------|-----------|
| `src/app/api/onboarding/route.ts` | Gut (Auth-Check, Validierung, Audit-Log) |
| `src/app/api/onboarding/[id]/route.ts` | Gut (Auth-Check, Status-Whitelist) |
| `src/app/api/onboarding/[id]/supervisor-link/route.ts` | Gut (Auth-Check, Audit-Log) |
| `src/app/api/onboarding/[id]/export/route.ts` | Gut (Auth-Check, CSV-Filename-Sanitisierung) |
| `src/app/api/onboarding/[id]/documents/[docId]/route.ts` | Verbesserungswuerdig (Content-Disposition) |
| `src/app/api/onboarding/[id]/notes/route.ts` | Gut (Auth-Check, Validierung, Audit-Log) |
| `src/app/api/onboarding/[id]/checklist/route.ts` | Gut (Auth-Check, Audit-Log) |
| `src/app/api/onboarding/[id]/checklist/[itemId]/route.ts` | Gut (Auth-Check, Zugehoerigkeitspruefung) |
| `src/app/api/fragebogen/[token]/route.ts` | Verbesserungswuerdig (body statt parsed.data) |
| `src/app/api/fragebogen/[token]/documents/route.ts` | Gut (Magic-Bytes, Path-Traversal, Rate Limiting) |
| `src/app/api/modalitaeten/[token]/route.ts` | Verbesserungswuerdig (body statt parsed.data) |
| `src/app/api/users/route.ts` | Verbesserungswuerdig (Passwort-Policy, kein Audit-Log) |
| `src/app/api/users/[id]/route.ts` | Verbesserungswuerdig (Passwort-Policy, kein Audit-Log) |
| `src/app/api/organizations/route.ts` | Gut (Auth + RBAC, Validierung) |
| `src/app/api/organizations/[id]/route.ts` | Gut (Auth + RBAC, Whitelist-Update) |
| `src/app/api/checklisten/route.ts` | Gut (Auth + RBAC, Validierung) |
| `src/app/api/checklisten/[id]/route.ts` | Gut (Auth + RBAC, Verwendungspruefung vor Delete) |
| `src/app/api/checklisten/[id]/items/route.ts` | Gut (Auth + RBAC, Zugehoerigkeitspruefung) |
| `src/app/api/vorlagen/route.ts` | Gut (Auth-Check) |
| `src/app/api/vorlagen/[id]/route.ts` | Gut (Auth + RBAC) |

### Datei-Upload
| Datei | Bewertung |
|-------|-----------|
| `src/app/api/fragebogen/[token]/documents/route.ts` | Gut (Magic-Bytes, MIME, Groesse, Path-Traversal) |

### Infrastruktur
| Datei | Bewertung |
|-------|-----------|
| `src/lib/rate-limit.ts` | Akzeptabel (In-Memory, fuer Single-Instance OK) |
| `src/lib/db.ts` | Gut (Singleton-Pattern, Standard-Prisma-Setup) |
| `prisma/schema.prisma` | Mangelhaft (sensible Felder unverschluesselt) |
| `prisma/seed.ts` | Mangelhaft (festes Admin-Passwort) |
| `Dockerfile` | Gut (Multi-Stage, Non-Root, Alpine) |
| `docker-compose.yml` | Verbesserungswuerdig (DB-Port exponiert, Default-Credentials) |
| `entrypoint.sh` | Gut (Prisma Migration + exec) |
| `.env` | Entwicklung (Dev-Credentials, Git-geschuetzt) |
| `.env.example` | Gut (Platzhalter statt echte Werte) |
| `.gitignore` | Gut (.env, uploads, cookies ausgeschlossen) |
| `next.config.ts` | Neutral (standalone output, keine Security-Issues) |

### Frontend
| Datei | Bewertung |
|-------|-----------|
| `src/app/(portal)/login/page.tsx` | Gut (React-JSX-Escaping schuetzt gegen XSS) |

---

## Hinweise

- Dieser Review wurde durch statische Code-Analyse durchgefuehrt. Ein dynamischer Penetrationstest (DAST) ist zusaetzlich empfohlen.
- Die Bewertung bezieht sich auf den Stand 2026-03-11 des Quellcodes.
- Das Projekt befindet sich im MVP-Stadium und viele Sicherheitsmassnahmen sind bereits gut implementiert.
- DSGVO-konforme Verarbeitung erfordert zusaetzlich: Datenschutzerklaerung, Verarbeitungsverzeichnis, AVV mit Hosting-Provider.
