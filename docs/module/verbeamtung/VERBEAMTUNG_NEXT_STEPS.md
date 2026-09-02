# Verbeamtung — Next Steps

Stand: 2026-04-07

> **Korrigiert nach Dokumentations-Audit am 2026-04-07.** Die ursprüngliche
> Version dieser Doku enthielt eine falsche Behauptung über eine fehlende
> Submit-Route. Tatsächlich existiert sie bereits — Phase C ist daher viel
> kleiner als ursprünglich beschrieben.

---

## Phase A — Erledigt

Vier Webhook-Trigger sind im Backend eingebaut, getestet und mit dem n8n-Workflow integriert (Commit `a65cc0a`):

| Event | Datei | Status |
|---|---|---|
| `psi-created` | `src/app/api/civil-service/route.ts` | ✅ |
| `psi-phase-completed` | `src/app/api/civil-service/[id]/phases/route.ts` | ✅ (mit Idempotenz-Check) |
| `psi-completed` | `src/app/api/civil-service/[id]/board-decision/route.ts` | ✅ (nur LIFETIME + POSITIVE) |
| `psi-deadline-warning` | `src/app/api/cron/civil-service-deadlines/route.ts` | ✅ (Sammelmail mit `truncated`-Flag) |

Tests: `src/__tests__/api/civil-service*.test.ts` und `src/__tests__/api/cron-civil-service-deadlines.test.ts`.

Außerdem in Phase A enthalten:
- `src/lib/webhooks.ts` defensiv abgehärtet (wirft nie, parallel via `Promise.allSettled`, SSRF-Schutz, URL-Logging redactiert)
- `src/lib/url.ts` mit zentralem `getBaseUrl()`, `isPublicHostname()`, `redactUrlForLog()`
- `src/lib/format.ts` mit `formatEmployeeName()`
- 3 Files auf zentralen `getBaseUrl()` migriert
- Idempotenz-Bug im Phasen-Update behoben (Doppel-Trigger und Überschreiben von `completedAt` verhindert)
- Fire-and-forget Pattern für alle PSI-Webhooks (User-Response wird nicht mehr blockiert)

---

## Aktueller Stand der 3 Beurteilungen (BEURTEILUNG_1 / 2 / 3)

Im Verbeamtungsverfahren gibt es drei dienstliche Beurteilungen plus zwei schriftliche Referenzen plus optional eine Gemeinde-Referenz. Insgesamt also bis zu 6 `CivilServiceAssessment`-Datensätze pro Vorgang.

| Beurteilung | Wann fällig | Phase | Cron-Eskalation |
|---|---|---|---|
| **1.** | Vor Probezeit, bei Antragstellung | Phase I — Antrag & Beurteilung | — (Voraussetzung für Beirats-Probeentscheidung, Gating über Checkliste) |
| **2.** | Nach 1 Jahr Probezeit | Phase III — Probezeit | T+9 Monate (WARNING) → T+11 (URGENT) → T+12 (OVERDUE) |
| **3.** | Ende der Probezeit, vor Lebenszeit | Phase III — Probezeit | T+30 Monate (WARNING) → T+33 (URGENT) |

### Vorhandene Bausteine

| Baustein | Status | Wo |
|---|---|---|
| Datenmodell | ✅ Vollständig | `prisma/schema.prisma:1474` `CivilServiceAssessment` mit `assessmentNumber: 1\|2\|3`, `assessmentType: BEURTEILUNG\|REFERENZ`, Token (90 Tage), `templateSnapshot`, `ratingsData`, `overallGrade`, `meetsRequirements`, Reminder-Counter, Unique-Constraint `(processId, assessmentNumber, assessmentType)` |
| Beurteilung anlegen (HR fordert SL auf) | ✅ Funktional | `POST /api/civil-service/[id]/assessments` (`route.ts:87`). Auth ✅, Validierung 1\|2\|3 ✅, Duplikat-Check ✅, Token-Erzeugung ✅, Template-Snapshot ✅ |
| Frontend-Formular für SL | ✅ Vorhanden | `src/app/civil-service-assessment/[token]/page.tsx` + `assessment-form.tsx`. Öffentlich, kein Login |
| Auto-Save während des Ausfüllens | ✅ Vorhanden | `PATCH /api/civil-service-assessment/[token]/route.ts` speichert `ratingsData`, `overallGrade`, `referenceData`, `gemeindeReferenz` zwischen |
| **Submit durch SL** | ✅ **Existiert vollständig** | `POST /api/civil-service-assessment/[token]/submit/route.ts`. Vollständigkeitsprüfung pro Typ (alle Kriterien bei BEURTEILUNG / Pflichtfelder bei REFERENZ), Rate-Limiting, Token-Validierung, `submittedAt` wird gesetzt |
| HR-Dashboard-Tab | ✅ Vorhanden | `src/app/(portal)/dashboard/civil-service/[id]/tabs/tab-assessments.tsx` |
| Cron-Fristenüberwachung 2./3. Beurteilung | ✅ Vorhanden | `cron/civil-service-deadlines/route.ts:167-240` mit 3-Stufen-Eskalation, geht seit Phase A in die `psi-deadline-warning` Sammelmail |
| Checklisten-Items als Gating | ✅ Vorhanden | Phase I Schritt 3 (1. Beurteilung), Phase III Schritt 8 (2.) und Schritt 9 (3.+ 2. Referenz) — alle als `isGatekeeper: true` |
| PDF-Export | ✅ Vollständig | `src/lib/pdf-export.ts` rendert alle Beurteilungen + Referenzen sauber |

### Fehlende Stellen (zwei kleine Edits)

| # | Lücke | Datei | Aufwand |
|---|---|---|---|
| **1** | Magic-Link-Mail an SL beim Anlegen einer Beurteilungs-Anforderung | `src/app/api/civil-service/[id]/assessments/route.ts:174` | ~15 Zeilen |
| **2** | Webhook + Audit-Log nach erfolgreichem Submit | `src/app/api/civil-service-assessment/[token]/submit/route.ts:123` | ~25 Zeilen |

Ohne diese beiden Stellen gilt aktuell:
- Wenn HR im Portal eine Beurteilung anfordert, **passiert nichts mehr automatisch** — die SL bekommt keine Mail mit dem Magic-Link. HR muss den Link manuell aus dem Portal kopieren und versenden.
- Wenn die SL die Beurteilung digital einreicht, **erfährt HR nichts via n8n** und es gibt **keinen Audit-Log-Eintrag**. HR sieht den Status nur, wenn sie den Vorgang im Dashboard aufruft.

---

## Phase B — Magic-Link-Mail an SL beim Anfordern (klein)

### Was zu tun ist

**Datei:** `src/app/api/civil-service/[id]/assessments/route.ts`
**Stelle:** Direkt nach `prisma.civilServiceAssessment.create(...)` (Zeile 174)

### Konkreter Patch

1. **Imports ergänzen:**
   ```ts
   import { triggerWebhooks } from "@/lib/webhooks";
   import { getBaseUrl } from "@/lib/url";
   import { formatEmployeeName } from "@/lib/format";
   ```

2. **`findUnique` erweitern**, um die für den Webhook-Payload nötigen Felder zu laden (aktuell wird nur `id, status, employeeFirstName, employeeLastName` geladen — `displayId` und `organization` fehlen):
   ```ts
   const process = await prisma.civilServiceProcess.findUnique({
     where: { id },
     select: {
       id: true,
       status: true,
       displayId: true,
       employeeFirstName: true,
       employeeLastName: true,
       organization: { select: { name: true, mandantNumber: true } },
     },
   });
   ```

3. **Trigger nach `assessment.create`** (fire-and-forget Pattern wie in Phase A):
   ```ts
   triggerWebhooks("psi-assessment-requested", {
     civilServiceId: id,
     assessmentId: assessment.id,
     displayId: process.displayId,
     employeeName: formatEmployeeName(process),
     organization: process.organization.name,
     mandantNumber: process.organization.mandantNumber,
     assessmentNumber: assessment.assessmentNumber,
     assessmentType: assessment.assessmentType,
     recipientEmail: assessment.recipientEmail,
     recipientName: assessment.recipientName,
     magicLink: `${getBaseUrl()}/civil-service-assessment/${assessment.token}`,
     tokenExpiresAt: assessment.tokenExpiresAt.toISOString(),
   }).catch((err) =>
     console.error("[psi-assessment-requested] Webhook-Fehler:", err instanceof Error ? err.message : err)
   );
   ```

4. **Tests** in `src/__tests__/api/civil-service-assessments.test.ts` (neue Datei):
   - 401 ohne Auth, 403 für Nicht-HR-Rolle
   - 400 bei `assessmentNumber` außerhalb 1/2/3
   - 409 bei Duplikat
   - **Webhook-Payload** enthält `magicLink`, `civilServiceId`, korrekte `assessmentNumber`
   - **201 auch wenn `triggerWebhooks` rejectet** (Defensiv-Test)

5. **n8n-Workflow** `CREDO HR-Portal — Workflow-3.json` um eine neue Reihe (Webhook + Code + Outlook) erweitern. Webhook-Pfad: `psi-assessment-requested`, Node-Name: **„Beurteilung angefordert"** (UI-Label aus `einstellungen-content.tsx:102`). Empfänger: `recipientEmail` aus dem Payload. CTA-Button → `magicLink`. Subject z. B. „Beurteilung angefordert — {assessmentNumber}. Beurteilung ({assessmentType}) — {employeeName}".

---

## Phase C — Webhook + Audit-Log nach Submit (klein)

### Was zu tun ist

**Datei:** `src/app/api/civil-service-assessment/[token]/submit/route.ts`
**Stelle:** Nach `prisma.civilServiceAssessment.update({…submittedAt…})` (Zeile 123)

### Konkreter Patch

1. **Imports ergänzen:**
   ```ts
   import { triggerWebhooks } from "@/lib/webhooks";
   import { formatEmployeeName } from "@/lib/format";
   ```

2. **Initial-`findUnique` erweitern**, um die Process-Daten direkt mitzunehmen (aktuell wird nur das Assessment geladen, ohne Process):
   ```ts
   const assessment = await prisma.civilServiceAssessment.findUnique({
     where: { token },
     include: {
       process: {
         select: {
           id: true,
           displayId: true,
           employeeFirstName: true,
           employeeLastName: true,
           organization: { select: { name: true, mandantNumber: true } },
         },
       },
     },
   });
   ```

3. **Audit-Log-Eintrag** und **Webhook-Trigger** nach dem Update:
   ```ts
   // Audit-Log (wichtig fuer DSGVO + Nachweisbarkeit)
   await prisma.auditLog.create({
     data: {
       civilServiceId: assessment.process.id,
       userId: null, // oeffentliche Route, kein Session-User
       processType: "CIVIL_SERVICE",
       action: "ASSESSMENT_SUBMITTED",
       details: {
         assessmentId: assessment.id,
         assessmentNumber: assessment.assessmentNumber,
         assessmentType: assessment.assessmentType,
         recipientEmail: assessment.recipientEmail,
         submittedAt: new Date().toISOString(),
       },
     },
   });

   // Webhook fire-and-forget
   triggerWebhooks("psi-assessment-completed", {
     civilServiceId: assessment.process.id,
     assessmentId: assessment.id,
     displayId: assessment.process.displayId,
     employeeName: formatEmployeeName(assessment.process),
     organization: assessment.process.organization.name,
     mandantNumber: assessment.process.organization.mandantNumber,
     assessmentNumber: assessment.assessmentNumber,
     assessmentType: assessment.assessmentType,
     recipientEmail: assessment.recipientEmail,
     submittedAt: new Date().toISOString(),
     overallGrade: assessment.overallGrade,
     meetsRequirements: assessment.meetsRequirements,
   }).catch((err) =>
     console.error("[psi-assessment-completed] Webhook-Fehler:", err instanceof Error ? err.message : err)
   );
   ```

4. **`auditLog.userId`-Schema prüfen**: Eventuell muss das Feld auf `optional` sein, da die Submit-Route öffentlich ist. Falls nicht, einen Service-User wie `"PUBLIC_ASSESSMENT_SUBMIT"` als String anlegen oder die Spalte nullable machen (Migration nötig).

5. **Tests** in `src/__tests__/api/civil-service-assessment-submit.test.ts` (neue Datei):
   - 404 bei ungültigem Token
   - 410 bei abgelaufenem Token
   - 410 bei bereits eingereichter Beurteilung
   - 400 bei unvollständiger BEURTEILUNG (fehlende Kriterien)
   - 400 bei unvollständiger REFERENZ (fehlende Pflichtfelder)
   - **200 + Webhook gefeuert** bei vollständiger Beurteilung
   - **200 + Audit-Log geschrieben**

6. **n8n-Workflow** um Reihe für `psi-assessment-completed` erweitern. Node-Name: **„Beurteilung eingegangen"** (UI-Label aus `einstellungen-content.tsx:103`). Empfänger: HR. Subject z. B. „Beurteilung eingegangen — {assessmentNumber}. {assessmentType} für {employeeName} ({displayId})".

---

## Optionale Verbesserungen (kein Blocker)

### O1 — Cron-Differenzierung BEURTEILUNG vs REFERENZ
**Datei:** `src/app/api/cron/civil-service-deadlines/route.ts:168-213`
**Aktueller Stand:** Der Cron prüft `assessmentNumber === 2` bzw. `=== 3` ohne `assessmentType`-Filter. Folge: Wenn die `BEURTEILUNG_2` da ist aber die `REFERENZ_2` fehlt, feuert die Warnung trotzdem nicht — und umgekehrt. Aktuell werden also nur Beurteilungen, aber keine Referenzen überwacht.
**Fix:** Zwei separate Checks pro `assessmentNumber`, einer für `assessmentType: "BEURTEILUNG"` und einer für `"REFERENZ"`. Oder Filter im `.some(...)` ergänzen.

### O2 — Reminder-Cron für SL bei offener Beurteilung
**Aktuell:** Im DB-Modell sind `lastReminderAt` und `reminderCount` definiert, aber **kein Code aktualisiert sie**. Es gibt keinen Reminder-Cron, der die SL erinnert wenn sie die Beurteilung nicht innerhalb von z. B. 7 Tagen einreicht.
**Pattern:** Analog zu `cron/offboarding-reminders/route.ts` einen neuen Cron `cron/civil-service-assessment-reminders/route.ts` bauen, der nicht eingereichte Beurteilungen mit fortgeschrittenem Reminder-Counter neu pingt. Eigenes n8n-Cron-Workflow nötig.
**Aufwand:** Mittel, eigenständiges Mini-Feature.

### O3 — `1. Beurteilung` Cron-Überwachung
Aktuell wird die 1. Beurteilung nicht im Cron überwacht — das ist konzeptionell OK weil sie Voraussetzung für die Beirats-Probeentscheidung ist (Gating über Checkliste). Falls gewünscht, könnte ein zeitliches Fenster ab `psi-created` definiert werden (z. B. WARNING ab 14 Tage ohne 1. Beurteilung).

---

## Backlog aus dem Code Review (sessionsübergreifend)

Diese Findings sind nicht spezifisch zu Beurteilungen, gehören aber zum Webhook-Stack und sollten in einem späteren Sprint adressiert werden.

### MAJOR — Token-Leakage über Webhook-Kanal (Offboarding)
**Problem:** `offboarding/[id]/department-links/route.ts` sendet den `token` und den vollen `magicLink` im Webhook-Payload. Wer Schreibrechte auf `WebhookConfig` hat (`SUPER_ADMIN`/`HR_LEITUNG`), kann die URL umbiegen und 90-Tage-Tokens sammeln.

**Möglichkeiten:**
- TTL des Department-Tokens deutlich verkürzen (90 → 14 Tage)
- Token nach erstem erfolgreichen Zugriff invalidieren (one-time-use)
- Token serverseitig in der Mail-Template-Schicht einbauen statt im Webhook-Payload

**Hinweis:** Mit Phase B + C wird das gleiche Problem bei `psi-assessment-requested` entstehen — der Magic-Link wandert auch dort durch den Webhook-Payload. Empfehlung: Vor Phase B eine Architektur-Entscheidung treffen, ob das Pattern so bleibt oder eine andere Lösung etabliert wird.

### MAJOR — HMAC-Signing für Webhook-Empfänger fehlt
**Problem:** `triggerWebhooks` sendet POST-Calls ohne `X-CREDO-Signature` Header. Empfänger (n8n) kann nicht verifizieren, dass der Request wirklich vom HR-Portal stammt. Replay/Forgery möglich, falls die URL bekannt wird.

**Lösung:** HMAC-SHA256 über den Body mit einem dedizierten `WEBHOOK_SIGNING_SECRET` aus den Env-Variablen. n8n-Workflows müssten ihrerseits die Signatur prüfen.

### MAJOR — DSGVO-Audit-Log für externe Daten-Outflows
**Problem:** Wenn `psi-completed`, `offboarding-department-assigned` etc. PII (employeeEmail, employeeName, mandantNumber) an externe Systeme senden, gibt es **keinen** dedizierten Audit-Log-Eintrag dafür. Für Artikel 30 DSGVO wäre das wertvoll.

**Lösung:** In `triggerWebhooks` einen `webhookDeliveryLog`-Eintrag pro Versand schreiben (Empfänger, Event, Zeitstempel, Erfolg/Fehlschlag). Eigene Tabelle, da unabhängig von Geschäftsaktionen.

### MINOR — Code-Quality im Onboarding/Offboarding-Stack
Der `formatEmployeeName()`-Helper aus `src/lib/format.ts` sollte auch in den existierenden Files verwendet werden, die noch inline `${firstName} ${lastName}` bauen:
- `src/app/api/onboarding/route.ts:185`
- `src/app/api/offboarding/route.ts:306`, `:322`
- `src/app/api/offboarding/[id]/route.ts:316`
- `src/app/api/offboarding-tasks/[token]/[itemId]/route.ts:98`, `:131`
- `src/app/api/offboarding-tasks/[token]/route.ts:120`
- `src/app/api/offboarding/[id]/checklist/[itemId]/route.ts:93`
- `src/app/api/cron/offboarding-reminders/route.ts:145`
- `src/app/api/civil-service/[id]/application/route.ts:108`
- `src/app/api/civil-service-application/[token]/route.ts:77`
- `src/app/api/civil-service-assessment/[token]/route.ts:171`
- `src/app/api/zeugnis-bewertung/[token]/route.ts:159`

Mechanischer Refactor, sicher zu machen, lohnt einen eigenen kleinen Patch.

### MINOR — Naming-Konsistenz `<domain>Id`
Die Webhook-Payload-Felder sind im Repo aktuell uneinheitlich:
- Onboarding: `onboardingId`
- Offboarding: `offboardingId`
- Verbeamtung (seit Phase A): `civilServiceId`

Folge der Konvention bei zukünftigen Triggern.

---

## Status-Übersicht für die nächste Session

| Bereich | Status |
|---|---|
| Phase A (4 PSI-Trigger + Härtung) | ✅ Erledigt, gepusht in Commit `a65cc0a` |
| Phase B (psi-assessment-requested) | 📋 Vorbereitet, ~15 LOC + Test + n8n-Node |
| Phase C (psi-assessment-completed + Audit) | 📋 Vorbereitet, ~25 LOC + Test + n8n-Node |
| Phase B+C zusammen | **~40 Backend-LOC, 2 Test-Files, 2 n8n-Nodes** |
| Optionale Verbesserung O1 (Cron BEURTEILUNG/REFERENZ) | 📋 Klein, ~10 LOC |
| Optionale Verbesserung O2 (SL-Reminder-Cron) | 📋 Mittel, eigenständiges Mini-Feature |
| Code-Review-Backlog (Token-Leakage, HMAC, DSGVO-Audit) | 📋 Eigene größere Tickets |

---

## Verweise

- Code Review: 2026-04-07 (synthetisiert aus 7 Spezial-Agenten — `claude-code-review` Skill)
- Phase A Commit: `a65cc0a` (auf `main`, gepusht zu `Penknife5550/HR_Portal_CREDO`)
- n8n-Workflow: `n8n/CREDO HR-Portal — Workflow-3.json` (nicht im Repo, lokal verwaltet)
- Schema-Referenz: `prisma/schema.prisma:1474` (`CivilServiceAssessment`)
- Cron-Logik: `src/app/api/cron/civil-service-deadlines/route.ts:167-240`
