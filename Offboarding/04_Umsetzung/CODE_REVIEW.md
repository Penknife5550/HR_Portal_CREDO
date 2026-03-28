# Code Review: Offboarding-Modul CREDO HR-Portal

**Reviewer:** Claude Opus 4.6 (Senior Code Review)
**Datum:** 2026-03-27
**Scope:** Alle neuen Offboarding-Dateien (Schema, API Routes, Lib)
**Commit-Stand:** Aktueller Stand auf `main`

---

## Zusammenfassung

Das Offboarding-Modul ist insgesamt solide implementiert und folgt konsequent den
Patterns des bestehenden Onboarding-Codes. Die Architektur (Prisma-Schema,
API-Routes, Webhook-Integration, Magic-Link-System) ist durchdacht und
produktionsreif. Es gibt jedoch einige kritische Punkte, die vor einem Go-Live
behoben werden muessen.

---

## KRITISCH (muss vor Go-Live gefixt werden)

### K1: Race Condition bei displayId-Generierung

**Datei:** `/src/app/api/offboarding/route.ts` (Zeilen 180-197)

Die displayId wird ausserhalb der Transaktion generiert. Bei parallelen Requests
zaehlt `count()` den gleichen Wert, und zwei Vorgaenge erhalten dieselbe
displayId. Der Retry-Mechanismus (3 Versuche mit `attempt`-Offset) mildert das
Problem, loest es aber nicht zuverlaessig.

```typescript
// PROBLEM: count() + findUnique() sind NICHT atomar
const countThisYear = await prisma.offboardingProcess.count({ ... });
sequentialNumber = countThisYear + 1 + attempt;
displayId = `OFF-${currentYear}-${shortName}-${sequentialNumber...}`;
const exists = await prisma.offboardingProcess.findUnique({ ... });
```

**Fix:** Die gesamte displayId-Generierung muss innerhalb der `$transaction`
stattfinden, idealerweise mit einer dedizierten Sequenz-Tabelle oder
`SELECT ... FOR UPDATE`. Alternativ: Unique-Constraint-Violation abfangen und
mit exponentiellem Backoff retry.

### K2: Template-Name-Mismatch -- Checklisten werden nie zugeordnet

**Datei:** `/src/app/api/offboarding/route.ts` (Zeilen 14-29 vs. Seed)

Die Funktion `getTemplateNameForOrgType()` sucht nach Templates mit den Namen:
- `"Offboarding: Bildungseinrichtung"` (fuer Schulen/Kitas)
- `"Offboarding: Standard"` (fuer Verwaltung/GmbH/Verein)

Im Seed (`prisma/seed.ts` Zeile 363/370) heisst das Standard-Template aber
`"Offboarding: Standard-Offboarding"` (mit Suffix). Die Suche nach
`"Offboarding: Standard"` wird deshalb NIE ein Template finden. Neue
Offboarding-Vorgaenge fuer Verwaltung/GmbH/Verein erhalten keine
Checklisten-Items.

**Fix:** Entweder den Seed-Namen anpassen auf `"Offboarding: Standard"` oder
`getTemplateNameForOrgType()` auf `"Offboarding: Standard-Offboarding"` aendern.

### K3: Token im Webhook-Payload exponiert

**Datei:** `/src/app/api/offboarding/[id]/department-links/route.ts` (Zeile 186)

Der Magic-Link-Token wird im Webhook-Payload mitgesendet:
```typescript
token: link.token,
```

Jeder konfigurierte Webhook-Empfaenger erhaelt damit den Token, mit dem
Checklisten-Items ohne Authentifizierung abgehakt werden koennen. Wenn ein
Webhook-Empfaenger kompromittiert wird, koennen Offboarding-Aufgaben manipuliert
werden.

**Fix:** Den Token NICHT im Webhook-Payload mitschicken. Stattdessen nur die
vollstaendige URL oder einen separaten, nicht-authentifizierenden Identifier
senden. Der Webhook-Consumer sollte nicht den rohen Token erhalten.

### K4: Fehlende Rollenbasierte Zugriffskontrolle auf Offboarding-Routes

**Dateien:** Alle `/src/app/api/offboarding/` Routes

Im Gegensatz zu den Settings-Routes (`/api/settings/departments/`) pruefen die
Offboarding-Routes nur `getSession()` (ob eingeloggt), aber NICHT die Rolle.
Jeder authentifizierte Benutzer -- auch ein `HR_SACHBEARBEITER` -- kann:
- Offboarding-Vorgaenge anlegen, aendern, abschliessen
- Status-Uebergaenge durchfuehren
- Dokumente hochladen/herunterladen
- Department-Links generieren

Im Onboarding-Modul mag das gewollt sein, aber fuer sensible Offboarding-Daten
(Abfindungen, Kuendigungsgruende) sollte mindestens ein Rollen-Check auf
`HR_LEITUNG` oder hoeher fuer Status-Uebergaenge und Erstellung existieren.

**Fix:** Rollenbasierte Checks einfuegen, mindestens fuer:
- `POST /api/offboarding` (Erstellen)
- `PATCH /api/offboarding/:id` (Status-Uebergaenge)
- Department-Links generieren

---

## WICHTIG (sollte gefixt werden)

### W1: Kein Rate Limiting auf Magic-Link-Endpunkte

**Dateien:**
- `/src/app/api/offboarding-tasks/[token]/route.ts`
- `/src/app/api/offboarding-tasks/[token]/[itemId]/route.ts`

Die oeffentlichen Endpunkte (kein Auth) haben kein Rate Limiting. Ein Angreifer
kann Token brute-forcen (UUIDs sind 128 Bit, also theoretisch sicher, aber
ohne Rate Limiting ist Enumeration moeglich) oder Denial-of-Service-Angriffe
durchfuehren, indem der `openCount` hochgetrieben wird.

**Fix:** Rate Limiting auf IP-Ebene implementieren (z.B. via Middleware oder
`next-rate-limit`). Empfehlung: Max 30 Requests/Minute pro IP.

### W2: Fehlende Email-Validierung bei Offboarding-Erstellung

**Datei:** `/src/app/api/offboarding/route.ts`

Die `employeeEmail` wird nicht auf Gueltigkeit geprueft. Im
`/api/settings/departments/` wird `isValidEmail()` verwendet, in der
Offboarding-Erstellung fehlt diese Validierung.

**Fix:** `isValidEmail()` aus `constants.ts` fuer `employeeEmail` und
`employeePrivateEmail` verwenden.

### W3: Abfindungsbetrag (severancePay) nur als String verschluesselt

**Datei:** `prisma/schema.prisma` (Zeile 749)

Das Feld `severancePay` ist als `String?` deklariert und laut Kommentar
verschluesselt. Beim Lesen (GET `/api/offboarding/:id`, Zeile 77-79) wird
`decrypt()` aufgerufen. Aber:

1. Beim **Schreiben** gibt es keinen API-Endpunkt fuer `exitData`-Updates.
   Wie werden Abfindungsdaten geschrieben? Es fehlt ein PATCH-Endpunkt fuer
   `OffboardingExitData`.
2. Es gibt keine Validierung, ob `encrypt()` beim Speichern aufgerufen wird.

**Fix:** Einen PATCH-Endpunkt fuer `/api/offboarding/:id/exit-data` erstellen,
der `severancePay` vor dem Speichern verschluesselt.

### W4: Toter Code -- adjustedCompleted-Variable

**Datei:** `/src/app/api/offboarding-tasks/[token]/[itemId]/route.ts` (Zeilen 129-132)

```typescript
const adjustedCompleted = isCompleted
  ? departmentCompleted
  : departmentCompleted;
```

Beide Zweige des Ternary-Operators geben denselben Wert zurueck. Das sieht
nach einem Copy-Paste-Fehler aus. Vermutlich sollte im `false`-Fall der Wert
angepasst werden.

**Fix:** Entweder die Logik korrigieren oder die Variable durch
`departmentCompleted` ersetzen.

### W5: Webhook-Cast auf `as never`

**Datei:** `/src/app/api/offboarding/[id]/checklist/[itemId]/route.ts` (Zeile 90)

```typescript
await triggerWebhooks("offboarding-task-completed" as never, { ... });
```

Der Cast auf `as never` unterdrueckt den TypeScript-Fehler. Das Event
`"offboarding-task-completed"` ist aber bereits in `WebhookEvent` definiert
(webhooks.ts Zeile 30). Der Cast ist unnoetig und verbirgt potentielle Fehler.

**Fix:** Den `as never`-Cast entfernen.

### W6: Enum-Cast auf `as never` bei Prisma

**Dateien:**
- `/src/app/api/offboarding/[id]/return-items/route.ts` (Zeile 119)
- `/src/app/api/offboarding/[id]/documents/route.ts` (Zeile 200)

```typescript
category: category as never,
type: upperDocType as never,
```

Diese Casts umgehen die Prisma-Enum-Typisierung. Das bedeutet, dass ungueltige
Werte ohne Compilerfehler in die Datenbank geschrieben werden koennten.

**Fix:** Die Prisma-generierten Enum-Typen importieren und korrekt casten:
```typescript
import { ReturnCategory } from "@prisma/client";
category: category as ReturnCategory,
```

### W7: Fehlende DELETE-Endpunkte fuer Dokumente und Return-Items

Dokumente und Rueckgabe-Items koennen erstellt, aber nicht geloescht werden.
Das ist problematisch, wenn falsche Dokumente hochgeladen oder Items
versehentlich angelegt werden.

**Fix:** DELETE-Endpunkte fuer:
- `/api/offboarding/:id/documents/:docId`
- `/api/offboarding/:id/return-items` (mit itemId im Body oder als Pfad-Param)

### W8: Fehlende Content-Length-Limits fuer JSON-Bodies

**Alle API Routes**

Es gibt kein Limit fuer die Groesse von JSON-Payloads. Ein Angreifer koennte
sehr grosse JSON-Bodies senden und den Server ueberlasten.

**Fix:** Next.js `bodyParser`-Config oder Middleware mit Body-Size-Limit.

---

## MINOR (Nice-to-have)

### M1: N+1-Query-Potential in der Offboarding-Liste

**Datei:** `/src/app/api/offboarding/route.ts` (Zeilen 66-88)

Die `checklistItems` werden mit `select: { isCompleted: true }` geladen und
dann im JavaScript gefiltert. Bei vielen Vorgaengen mit vielen Items wird das
ineffizient. Besser waere ein aggregiertes Query.

**Fix:** Statt alle Items zu laden und im JS zu zaehlen:
```typescript
// Prisma groupBy oder raw query fuer Aggregation
```

### M2: Magic Link Expiration (90 Tage) ohne Konfigurierbarkeit

**Datei:** `/src/app/api/offboarding/[id]/department-links/route.ts` (Zeile 127)

Die Token-Gueltigkeit von 90 Tagen ist hardcoded. Fuer verschiedene
Organisationen oder Sicherheitsrichtlinien koennte ein kuerzerer Zeitraum
gewuenscht sein.

**Fix:** Konfigurierbar machen (z.B. ueber Umgebungsvariable oder DB-Setting).

### M3: Seed-Daten: ChecklistTemplate Items werden per Loop erstellt

**Datei:** `prisma/seed.ts` (Zeilen 408-411, 448-451, 502-505, 549-552)

Items werden in einer Schleife einzeln erstellt statt mit `createMany()`.
Bei 18-22 Items pro Template sind das viele einzelne Queries.

**Fix:** `createMany()` verwenden:
```typescript
await prisma.checklistTemplateItem.createMany({
  data: offboardingStandardItems.map(item => ({
    templateId: offboardingStandard.id,
    ...item,
  })),
});
```

### M4: Inkonsistente Response-Formate

Die API-Responses verwenden unterschiedliche Wrapper:
- `/offboarding` -> `{ data, total, page, ... }` (paginiert)
- `/offboarding/:id/notes` -> `{ data: notes }` (gewrapped)
- `/offboarding/:id/checklist` -> `{ items }` (nicht "data")
- `/offboarding/:id/return-items` -> `{ items }` (nicht "data")
- `/offboarding/:id/documents` -> `{ documents }` (nicht "data")

**Fix:** Einheitliches Format nutzen: immer `{ data: ... }` fuer Konsistenz.

### M5: Fehlende Pagination auf Sub-Ressourcen

Die Endpunkte fuer Notizen, Checklist-Items, Dokumente und Return-Items haben
keine Pagination. Bei sehr langen Offboarding-Prozessen mit vielen Notizen
koennte das problematisch werden.

### M6: Fehlender Index auf OffboardingDocument

**Datei:** `prisma/schema.prisma` (Zeilen 831-849)

Die `OffboardingDocument`-Tabelle hat keinen Index auf `offboardingId`, obwohl
haeufig nach `offboardingId` gefiltert wird.

**Fix:**
```prisma
@@index([offboardingId])
```

### M7: DepartmentConfig Unique-Constraint mit Nullable

**Datei:** `prisma/schema.prisma` (Zeile 887)

```prisma
@@unique([departmentKey, organizationId])
```

`organizationId` kann `null` sein. In PostgreSQL bedeutet `UNIQUE(a, NULL)`,
dass mehrere Rows mit `(a, NULL)` erlaubt sind (NULL != NULL). Der Code in
`/api/settings/departments/route.ts` macht einen manuellen Unique-Check (Zeile
71-78), was korrekt ist, aber der DB-Constraint schuetzt nicht davor.

### M8: Keine Audit-Logs fuer Return-Item-Aenderungen

Return-Item-Erstellung und -Updates werden nicht im Audit-Log erfasst, obwohl
die Rueckgabe von Firmeneigentum (Laptop, Schluessel) dokumentiert werden sollte.

---

## POSITIV (was gut gemacht wurde)

### P1: Robuste Sicherheitsmassnahmen fuer Datei-Uploads
Die Document-Upload-Route implementiert:
- Magic-Bytes-Validierung (nicht nur MIME-Type)
- Path-Traversal-Schutz (doppelte Pruefung: Sanitisierung + resolve-Check)
- Dateigroessen-Limit (10 MB)
- Whitelist fuer erlaubte Dateitypen

### P2: Saubere Status-Uebergangs-Validierung
Die `VALID_TRANSITIONS`-Map in `/api/offboarding/[id]/route.ts` stellt sicher,
dass nur gueltige Status-Uebergaenge moeglich sind. COMPLETED und CANCELLED
sind Endzustaende.

### P3: Konsequentes Auth-Pattern
Alle internen Endpunkte pruefen `getSession()` als erstes. Die oeffentlichen
Magic-Link-Endpunkte sind klar getrennt und pruefen Token + Expiration.

### P4: DSGVO-bewusste Datenexposition
Der Magic-Link-Endpunkt (`/api/offboarding-tasks/[token]`) exponiert nur
die minimal notwendigen Daten (Name, letzter Arbeitstag, Aufgaben). Sensible
Felder wie E-Mail, Abfindung, Kuendigungsgrund werden nicht preisgegeben.

### P5: Webhook-Architektur
- Retry-Mechanismus (3 Versuche mit steigendem Delay)
- Timeout (10s)
- SMTP-Fallback wenn kein Webhook erfolgreich
- Webhooks werden ausserhalb der DB-Transaktion getriggert (kein Blockieren)

### P6: Transaktionale Konsistenz
Die Erstellung eines Offboarding-Vorgangs (Prozess + ExitData + Checkliste +
AuditLog) geschieht in einer einzigen `$transaction()`.

### P7: Gute Department-Link-Architektur
- Upsert statt Insert (idempotent)
- Tracking (openCount, firstOpenedAt, lastOpenedAt)
- Reminder-Mechanismus mit Zaehler
- Einrichtungsspezifische und zentrale Konfigurationen (Fallback-Kette)

### P8: Konsistenz mit bestehendem Onboarding-Code
Die Offboarding-API folgt den gleichen Patterns wie das Onboarding:
- Gleiche Error-Response-Struktur (`{ error: "..." }`)
- Gleiche Auth-Pruefung
- Gleiche Prisma-Usage-Patterns
- Gleiche Webhook-Integration

### P9: Durchgaengiges Audit-Logging
Alle wichtigen Aktionen (Erstellung, Status-Aenderungen, Notizen,
Department-Links) werden im AuditLog erfasst.

### P10: Defensive Programmierung
- `body.action === "remind"` Pattern fuer Multi-Action-Endpunkte
- Null-Checks vor Zugriffen auf optionale Felder
- `Math.min`/`Math.max` fuer Pagination-Parameter

---

## Prioritaets-Matrix

| # | Schwere | Aufwand | Empfehlung |
|---|---------|---------|------------|
| K1 | Kritisch | Mittel | Sprint einplanen |
| K2 | Kritisch | Gering | Sofort fixen (1 Zeile) |
| K3 | Kritisch | Gering | Token aus Payload entfernen |
| K4 | Kritisch | Gering | Rollen-Checks einfuegen |
| W1 | Hoch | Mittel | Vor Go-Live |
| W2 | Hoch | Gering | Sofort fixen |
| W3 | Hoch | Mittel | Endpunkt erstellen |
| W4 | Mittel | Gering | Sofort fixen |
| W5 | Gering | Gering | Sofort fixen |
| W6 | Mittel | Gering | Sofort fixen |
| W7 | Mittel | Mittel | Sprint einplanen |
| W8 | Mittel | Mittel | Vor Go-Live |

---

*Review erstellt am 2026-03-27 von Claude Opus 4.6 (1M context)*
