# Verbeamtung — Next Steps

Stand: 2026-04-07

## Phase A — Erledigt

Vier Webhook-Trigger sind im Backend eingebaut, getestet und mit dem n8n-Workflow integriert:

| Event | Datei | Status |
|---|---|---|
| `psi-created` | `src/app/api/civil-service/route.ts` | ✅ |
| `psi-phase-completed` | `src/app/api/civil-service/[id]/phases/route.ts` | ✅ (mit Idempotenz-Check) |
| `psi-completed` | `src/app/api/civil-service/[id]/board-decision/route.ts` | ✅ (nur LIFETIME + POSITIVE) |
| `psi-deadline-warning` | `src/app/api/cron/civil-service-deadlines/route.ts` | ✅ (Sammelmail mit `truncated`-Flag) |

Tests: `src/__tests__/api/civil-service*.test.ts` und `src/__tests__/api/cron-civil-service-deadlines.test.ts`.

---

## Phase B — Beurteilungs-Magic-Link (offen)

### Was fehlt
Webhook-Event `psi-assessment-requested` (UI-Label „Beurteilung angefordert") soll feuern, wenn HR im Portal eine Beurteilung bei der Schulleitung anfordert. Die Schulleitung muss dafür einen Magic-Link bekommen, über den sie die Beurteilung ohne Login einreichen kann.

### Trigger-Stelle
`src/app/api/civil-service/[id]/assessments/route.ts:174` — direkt nach `prisma.civilServiceAssessment.create(...)`.

### Was vorhanden ist
- Token wird bereits erzeugt (`token: crypto.randomUUID()` ist im Code)
- `tokenExpiresAt` ist gesetzt
- `recipientEmail`, `recipientName`, `assessmentNumber`, `assessmentType` (BEURTEILUNG / REFERENZ) sind bekannt
- Die Process-Daten (displayId, employeeName, organization) müssen vor dem Trigger nachgeladen werden — analog zu `phases/route.ts` mit `select`

### Konkrete Aufgabe
1. Import in `assessments/route.ts` ergänzen:
   ```ts
   import { triggerWebhooks } from "@/lib/webhooks";
   import { getBaseUrl } from "@/lib/url";
   import { formatEmployeeName } from "@/lib/format";
   ```
2. Vor dem `triggerWebhooks`-Aufruf den Process laden mit `select: { displayId, employeeFirstName, employeeLastName, organization: { select: { name, mandantNumber } } }`
3. Trigger mit fire-and-forget Pattern (siehe `civil-service/route.ts` als Vorlage):
   ```ts
   triggerWebhooks("psi-assessment-requested", {
     civilServiceId: id,
     assessmentId: assessment.id,
     displayId: process.displayId,
     employeeName: formatEmployeeName(process),
     organization: process.organization.name,
     assessmentNumber: assessment.assessmentNumber,
     assessmentType: assessment.assessmentType,
     recipientEmail: assessment.recipientEmail,
     recipientName: assessment.recipientName,
     magicLink: `${getBaseUrl()}/civil-service-assessment/${assessment.token}`,
     tokenExpiresAt: assessment.tokenExpiresAt.toISOString(),
   }).catch((err) => console.error("[psi-assessment-requested] Webhook-Fehler:", err));
   ```
4. Tests in `src/__tests__/api/civil-service-assessments.test.ts` ergänzen
5. n8n-Workflow `CREDO HR-Portal — Workflow-3.json` um eine neue Reihe (Webhook + Code + Outlook) für `psi-assessment-requested` mit deutschem UI-Label „Beurteilung angefordert" erweitern

### Klärungsbedarf vor dem Bau
- **Pfad des öffentlichen Beurteilungs-Formulars im Frontend** — gibt es bereits `/civil-service-assessment/[token]/page.tsx`? Wenn nein, wäre das ein Frontend-Mini-Projekt parallel
- **Mail-Inhalt** — soll der Mail-Body Hinweise auf erforderliche Anlagen geben?

---

## Phase C — Beurteilung einreichen (offen, größerer Umfang)

### Was fehlt komplett
1. **API-Route** `src/app/api/civil-service-assessment/[token]/submit/route.ts` — existiert nicht. Es gibt im Repo nur `src/app/api/civil-service-application/[token]/submit/route.ts` (für den LK-Antrag).
2. **Frontend-Formular** `src/app/civil-service-assessment/[token]/page.tsx` — Status unklar, muss geprüft werden
3. **Validation-Schema** `src/lib/validations/civil-service.ts` — Submit-Schema ergänzen (welche Felder hat eine Beurteilung?)
4. **Webhook-Trigger** `psi-assessment-completed` direkt in der neuen Submit-Route nach erfolgreichem Insert

### Klärungsbedarf vor dem Bau
- **Welche Felder erwartet eine Beurteilung?** Im Prisma-Schema gibt es `templateSnapshot` als JSON-Field — also ist die Struktur dynamisch. Vermutlich ein Fragebogen mit Bewertungsskala. Vorlagen-Definition prüfen unter `DEFAULT_BEURTEILUNG_TEMPLATE`.
- **Soll der Submit das `submittedAt` setzen oder einen separaten Status?**
- **Was passiert nach dem Submit mit der Phase?** Wird automatisch eine Phase im `CivilServicePhase`-Modell als COMPLETED markiert?

### Konkrete Aufgabe (wenn die Klärungen durch sind)
1. `validations/civil-service.ts` um `submitAssessmentSchema` erweitern (alle erlaubten Felder, ggf. dynamisch über `templateSnapshot`)
2. Submit-Route bauen mit:
   - Token-Validierung (Existenz, nicht abgelaufen, noch nicht eingereicht)
   - Speicherung der Antworten (vermutlich als JSON-Feld oder über separate Tabelle `CivilServiceAssessmentAnswer`)
   - `submittedAt`-Timestamp setzen
   - Audit-Log
   - `triggerWebhooks("psi-assessment-completed", ...)` fire-and-forget
3. Tests dafür
4. n8n-Workflow um `psi-assessment-completed` erweitern

---

## Backlog aus dem Code Review

Diese Findings aus dem Code Review (2026-04-07) sind nicht direkt mit der Verbeamtung verbunden, betreffen aber den Webhook-Stack und sollten in einem späteren Sprint adressiert werden.

### MAJOR — Token-Leakage über Webhook-Kanal (Offboarding)
**Problem:** `offboarding/[id]/department-links/route.ts` sendet den `token` und den vollen `magicLink` im Webhook-Payload. Wer Schreibrechte auf `WebhookConfig` hat (`SUPER_ADMIN`/`HR_LEITUNG`), kann die URL umbiegen und sammelt 90 Tage gültige Tokens.

**Möglichkeiten:**
- TTL des Department-Tokens deutlich verkürzen (90 → 14 Tage)
- Token nach erstem erfolgreichen Zugriff invalidieren (one-time-use)
- Token serverseitig in der Mail-Template-Schicht einbauen statt im Webhook-Payload

### MAJOR — HMAC-Signing für Webhook-Empfänger fehlt
**Problem:** `triggerWebhooks` sendet POST-Calls ohne `X-CREDO-Signature` Header. Empfänger (n8n) kann nicht verifizieren, dass der Request wirklich vom HR-Portal stammt — Replay/Forgery möglich, falls die Webhook-URL bekannt wird.

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
- `src/app/api/civil-service/[id]/application/route.ts:108` (recipientName mit Fallback-Logik)
- `src/app/api/civil-service-application/[token]/route.ts:77`
- `src/app/api/civil-service-assessment/[token]/route.ts:171`
- `src/app/api/zeugnis-bewertung/[token]/route.ts:159`

Mechanischer Refactor, sicher zu machen, lohnt einen eigenen kleinen Patch.

### MINOR — Naming-Konsistenz `<domain>Id`
Die Webhook-Payload-Felder sind im Repo aktuell uneinheitlich:
- Onboarding: `onboardingId`
- Offboarding: `offboardingId`
- Verbeamtung (neu): `civilServiceId` (in diesem Patch korrigiert von `processId`)

Folge der Konvention bei zukünftigen Triggern.

---

## Verweise

- Code Review: 2026-04-07 (synthetisiert aus 7 Spezial-Agenten)
- Phase A Implementation: dieser Patch
- n8n-Workflow: `n8n/CREDO HR-Portal — Workflow-3.json` (nicht im Repo, lokal verwaltet)
