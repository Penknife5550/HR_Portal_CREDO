# Verbeamtungs-Beurteilungen — Status

**Stand:** 2026-04-08 · **Plan:** `~/.claude/plans/shimmering-percolating-pizza.md`

Vollständig BRL-konforme, konfigurierbare Beurteilungs-Suite für die
Verbeamtung an Ersatzschulen NRW. **Alle sechs Phasen + Schritt 9 sind live.**

---

## Was erledigt ist

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Datenmodell + globales Template-System (BRL-Default + CREDO-Legacy) | ✅ |
| 2 | API + Admin-UI für Beurteilungs-Vorlagen (mit Mandanten-Override) | ✅ |
| 3 | Multi-Step-Form für Schulleitung (5 Steps, Status-Stepper, Auto-Save) | ✅ |
| 4 | HR-Workflow: Termin + 14-Tage-Frist + Webhook + Audit-Log | ✅ |
| 5 | Bekanntgabe + Gegenäußerung der Lehrkraft | ✅ |
| **Schritt 9** | „In Personalakte aufgenommen" — finaler Workflow-Abschluss | ✅ |
| **6** | Audit-Page für Bezirksregierung + Verify-QR im PDF + Bundle-Export | ✅ |

### Workflow-Stufen (`src/lib/beurteilung-status.ts`)

```
1 REQUESTED      HR hat angefordert
2 PREPARED       SL hat Befangenheit bestätigt
3 OBSERVED       SL bewertet Kriterien
4 RATED          Alle Kriterien bewertet
5 REVIEWED       Beurteilungsgespräch dokumentiert
6 SUBMITTED      SL hat eingereicht
7 RELEASED       HR hat zur Bekanntgabe freigegeben
8 ACKNOWLEDGED   Lehrkraft hat quittiert (mit/ohne Gegenäußerung)
9 COMPLETED      HR hat formal in Personalakte aufgenommen
```

Der Status wird **immer aus den DB-Feldern abgeleitet**, nicht persistiert,
über `deriveBeurteilungStatus()`. Single source of truth.

---

## Wichtige Files (zum Nachschlagen)

### Schema (`prisma/schema.prisma`)

- `CivilServiceAssessment` — erweitert um Workflow-Felder:
  - `templateId`, `scaleType`
  - `scheduledDate`, `announcedAt`, `fach`, `klasse`, `vertrauenslehrkraft`
  - `unbiasedConfirmed*`
  - `meetsRequirementsManual`, `overallReasoning`
  - `postReview*`, `beurteilungsgespraech*`
  - `employeeAckToken` (unique), `employeeAckExpiresAt`
  - `releasedToEmployeeAt`, `acknowledgedByEmployeeAt`, `acknowledgedByEmployeeIp`
  - `rebuttalText`, `rebuttalAt`
  - `archivedAt`, `archivedById`
  - `verifyToken` (unique) — für Phase 6 schon angelegt, noch ungenutzt
- `BeurteilungTemplate` / `BeurteilungTemplateCategory` / `BeurteilungTemplateCriterion` — neu, analog `ZeugnisBewertungTemplate`

### Lib

| File | Zweck |
|---|---|
| `src/lib/beurteilung-defaults.ts` | BRL- und CREDO-Schulnoten-Default-Vorlagen + Skala-Labels |
| `src/lib/legal-references.ts` | 19 Rechtsgrundlagen (BRL, BASS, GG, BeamtStG, LBG NRW) — single source of truth |
| `src/lib/beurteilung-status.ts` | `BeurteilungStatus`-Enum + `deriveBeurteilungStatus()` + `ALL_STATUS_STEPS` + `getStepStates()` |
| `src/lib/civil-service-phases.ts` | `recalculatePhaseStatus()` + `autoCheckAssessmentChecklistItems()` — Auto-Sync zwischen Beurteilungen und Phasen-Stepper |
| `src/lib/validations/beurteilung.ts` | Zod-Schemas für Templates, Submit, Auto-Save, Acknowledge |

### Components

| File | Zweck |
|---|---|
| `src/components/beurteilung-status-stepper.tsx` | Wiederverwendbarer 9-Stufen-Stepper (full / compact) |
| `src/app/(portal)/dashboard/civil-service/[id]/components/assessment-detail-modal.tsx` | HR Read-Only-Detail-Modal mit allen Bewertungen |
| `src/app/(portal)/dashboard/civil-service/[id]/components/release-link-modal.tsx` | Bekanntgabe-Link-Modal mit Auto-Clipboard |

### API-Routes (neu / erweitert)

| Route | Methoden | Zweck |
|---|---|---|
| `/api/beurteilung-templates` | GET, POST | Vorlagen-CRUD (HR) |
| `/api/beurteilung-templates/[id]` | GET, PUT, DELETE | Einzel-Vorlage |
| `/api/beurteilung-templates/[id]/set-default` | POST | Standard setzen pro Scope |
| `/api/civil-service/[id]/assessments` | POST | **Erweitert** — Termin, Fach, Klasse, Template-Auswahl, 14-Tage-Frist, Webhook + Audit |
| `/api/civil-service-assessment/[token]` | GET, PUT | **Erweitert** — alle Workflow-Felder |
| `/api/civil-service-assessment/[token]/submit` | POST | **Erweitert** — Vollständigkeitsprüfung BRL-konform, Auto-Checklist-Sync, Webhook + Audit |
| `/api/civil-service-assessment/[token]/release-to-employee` | POST | **Neu** — HR generiert Lehrkraft-Bekanntgabe-Link |
| `/api/civil-service-assessment/[token]/archive` | POST | **Neu (Schritt 9)** — In Personalakte aufnehmen |
| `/api/civil-service-acknowledgement/[token]` | GET, POST | **Neu** — Lehrkraft liest und quittiert |

### Frontend

| File | Zweck |
|---|---|
| `src/app/(portal)/beurteilungs-vorlagen/page.tsx` + `beurteilungs-vorlagen-content.tsx` | Admin-Editor für Vorlagen |
| `src/app/civil-service-assessment/[token]/assessment-form.tsx` | SL-Multi-Step-Wizard (5 Steps + Erfolgsbildschirm) |
| `src/app/civil-service-assessment/[token]/steps/` | Step1–5 + types + legal-box |
| `src/app/civil-service-assessment/[token]/reference-form.tsx` | REFERENZ-Single-Page (Legacy übernommen) |
| `src/app/civil-service-acknowledgement/[token]/page.tsx` + `acknowledgement-form.tsx` | Lehrkraft-Bekanntgabe-View |
| `src/app/(portal)/dashboard/civil-service/[id]/tabs/tab-assessments.tsx` | HR-Karten mit Status-Stepper, Anforderungs-Modal, Bekanntgabe-Box, Detail-Modal, Archiv-Button |

---

## Wichtige Bug-Fixes (im Repo bereits enthalten)

### `getBaseUrl()` defaultet im Dev auf `localhost:3000`

`src/lib/url.ts` — Zuvor fielen alle Magic-Links im Dev-Modus auf
`https://hr.fes-credo.de` zurück, weil keine `APP_URL`-Env gesetzt war.

```ts
if (process.env.NODE_ENV !== "production") {
  return "http://localhost:3000";
}
```

### Phase-Status-Auto-Update bei Item-Toggle

`src/app/api/civil-service/[id]/checklist/[itemId]/route.ts` — Nutzt jetzt
`recalculatePhaseStatus()`. Behebt drei Bugs auf einmal:
1. Phasen ohne Gatekeeper-Items (II_B Besoldung, II_E Beihilfe) konnten nie
   COMPLETED werden
2. Kein IN_PROGRESS-Wechsel beim ersten Item-Klick
3. Kein Rollback beim Wieder-Öffnen eines Items

Plus: `civil-service-checklist-template.ts` — `6.B.3` und `6.E.5` als
`isGatekeeper: true` markiert (saubere Intention für künftige Vorgänge).

### Auto-Sync Beurteilungen ↔ Checkliste

`src/lib/civil-service-phases.ts` → `autoCheckAssessmentChecklistItems()`.
Beim Submit einer Beurteilung werden die zugehörigen Checklisten-Items
(z. B. „1. Unterrichtsbesuch durchgeführt", „Dienstliche Beurteilung
ausgefüllt") automatisch abgehakt und die Phase neu berechnet.

### Pfad-Konflikt `[id]` vs `[token]` aufgelöst

Die `release-to-employee`-Route liegt unter `[token]` (HR-Auth, aber Token als
Lookup-Key) — Next.js erlaubt nur einen Param-Namen pro Verzeichnis-Ebene.

### Bekanntgabe-Link UX

- `ReleaseLinkModal` kopiert jetzt **automatisch beim Öffnen** in die
  Zwischenablage (`useEffect`)
- **Direkt in der Karte** sichtbarer `BekanntgabeLinkBox` mit Read-Only-Input +
  Copy-Button — verhindert die Verwechslung mit dem SL-Link aus dem
  Browser-Verlauf
- SL-Button umbenannt zu „Schulleitungs-Link kopieren" mit Tooltip „NICHT an
  die Lehrkraft weitergeben"

### Pfad `/assessment/{token}` → `/civil-service-assessment/{token}`

`civil-service-detail-content.tsx:287` — `handleCopyLink()` baute den falschen
Pfad. War ein vorhandener Bug, ist gefixt.

---

## Webhook-Events (alle aktiv im Backend, n8n-Konfiguration noch offen)

| Event | Trigger | Payload-Inhalt (Auszug) |
|---|---|---|
| `psi-assessment-requested` | HR fordert SL zur Beurteilung auf | `magicLink`, `displayId`, `employeeName`, Termin, Fach, Klasse |
| `psi-assessment-completed` | SL submitted | `assessmentNumber`, `meetsRequirementsManual`, `overallGrade` |
| `psi-assessment-released` | HR sendet zur Bekanntgabe | `ackLink`, `employeeEmail`, Token-Expiry |
| `psi-assessment-acknowledged` | LK quittiert | `acknowledgedAt`, `hasRebuttal` |
| `psi-assessment-archived` | HR übernimmt in Personalakte | `archivedAt`, `hadRebuttal` |

Alle Events sind in `src/app/(portal)/einstellungen/einstellungen-content.tsx`
in der UI sichtbar — dort kann ein n8n-Webhook hinterlegt werden.

**Empfohlene n8n-Workflows** (noch zu bauen):
1. `psi-assessment-requested` → Outlook-Mail an SL mit `magicLink` + Termin
2. `psi-assessment-completed` → interne HR-Benachrichtigung
3. `psi-assessment-released` → Outlook-Mail an Lehrkraft mit `ackLink`
4. `psi-assessment-acknowledged` → interne HR-Benachrichtigung
5. `psi-assessment-archived` → DMS-Trigger (Phase 6)

---

## Test-Daten in der Dev-DB (Stand 2026-04-08)

### PSI-2026-GSS-001 (Hauptvorgang für Tests)

Process-ID: `c91b23d5-a5fe-4ce9-8719-5c57926a04ce`

| Beurteilung | Status | Bemerkung |
|---|---|---|
| #1 BEURTEILUNG | submitted, released, **wartet auf Quittung** | „Bekanntgabe-Link" sichtbar in Karte |
| #2 BEURTEILUNG | submitted, released, **wartet auf Quittung** | „Bekanntgabe-Link" sichtbar in Karte |
| #3 BEURTEILUNG | submitted, released, quittiert, **archiviert (Schritt 9)** | grüner Border, „In Personalakte"-Badge |

Phasen-Status:
- I: COMPLETED
- II_A: COMPLETED, II_B: COMPLETED, II_C: COMPLETED
- II_D – II_H: PENDING
- III: IN_PROGRESS (durch Auto-Sync nach Reconcile)
- IV: PENDING

### PSI-2026-GSM-001

Process-ID: `a612590a-004c-4945-8be8-baa6d17c15ea`

- #1 BEURTEILUNG: submitted (vor Auto-Sync angelegt → 2 Items per Reconcile abgehakt)

### PSI-2026-GES-001

Process-ID: `75f79e18-11e5-4848-8da8-0cdfb8ed35ee`

- #1 BEURTEILUNG: angefordert aber noch nicht submitted (alter Test)

---

## Beurteilungs-Vorlagen in der DB

| Name | Skala | Scope | Default |
|---|---|---|---|
| BRL NRW — Dienstliche Beurteilung (Standard) | BRL_1_5 | global | ✓ |
| CREDO Schulnoten 1–6 (Legacy) | SCHULNOTEN_1_6 | global | – |

Pro Mandant kann ein eigener Override angelegt werden über
`/beurteilungs-vorlagen` (Sidebar → Vorlagen → Beurteilungs-Vorlagen).

---

## Phase 6 — Live im Repo

Detaillierter Plan in `~/.claude/plans/shimmering-percolating-pizza.md`,
Sektion „Phase 6 — Audit-Sichtbarkeit, Verifikations-QR & PDF-Bundle".

### 6.1 Public Verify-/Audit-Page ✅

- `src/app/verify/civil-service-assessment/[verifyToken]/page.tsx` — SSR-Page
  (force-dynamic), `metadata.robots = noindex, nofollow`, Rate-Limit (30/min/IP)
- `src/app/verify/civil-service-assessment/[verifyToken]/audit-view.tsx` —
  Read-Only-Komponente mit `BeurteilungStatusStepper`, Stammdaten, Vorbereitung
  (Befangenheit, Vertrauenslehrkraft), Bewertungen mit Skala-Snapshot,
  Gesamturteil (BRL Nr. 7.5), Gespräche (BRL 9.1/10.1), Bekanntgabe + Gegen-
  äußerung (§ 92 LBG NRW), Audit-Trail, CredoLinie, ohne Login
- `src/app/api/verify/civil-service-assessment/[verifyToken]/route.ts` — JSON-
  API für programmatische Verifikation, gleiche Rate-Limit-Logik, gleiche
  Headers (`Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`)
- `src/lib/verify-assessment.ts` — gemeinsamer Loader für Page + API mit
  Audit-Log bei jedem Aufruf (`VERIFY_PAGE_VIEWED`/`VERIFY_PAGE_NOT_FOUND`)
- `public/robots.txt` — `Disallow: /verify/`

### 6.2 Verifikations-QR im Beurteilungs-PDF ✅

- `src/lib/pdf-export.ts` — Beurteilungs-Sektion komplett erweitert:
  - Skala-Snapshot ("BRL 1–5 …")
  - Vorbereitung (Termin, Fach, Klasse, Vertrauenslehrkraft, Befangenheit)
  - Manuelles Gesamturteil + Begründung (BRL Nr. 7.5)
  - Gespräche (BRL Nr. 9.1 / 10.1)
  - Bekanntgabe + Gegenäußerung (§ 92 LBG NRW) inkl. Quittierungs-IP
  - Audit-Trail mit Akteurs-Namen
  - Verifikations-Block: zweiter QR-Code (grün, Verify-URL), 8-stelliger
    `CRD-XXXX-YYYY`-Code, Erklärtext "Echtheit prüfen"
- Helper `generateVerifyQR()` + Re-Use von `buildVerifyHash()`/`AUDIT_ACTION_LABELS`
  aus `src/lib/verify-assessment.ts`

### 6.3 PSI-Bundle-Export erweitert ✅

- `src/app/api/civil-service/[id]/export/route.ts`:
  - Lädt vorab alle relevanten Audit-Log-Einträge pro Beurteilung
  - Gibt im `ExportContext` alle neuen Workflow-Felder + `verifyToken` +
    `auditTrail` weiter
- Smoke-Test: `type=beurteilung&nr=3` (4 Seiten) und `type=gesamtakte`
  (18 Seiten) liefern beide 200 mit korrektem Inhalt.

### UI

- `src/app/(portal)/dashboard/civil-service/[id]/tabs/tab-assessments.tsx` —
  neuer Button **„Audit-Link kopieren"** auf jeder eingereichten
  BEURTEILUNG-Karte (sichtbar wenn `verifyToken` vorhanden)

### Verifikation

- ESLint + `npm run build` clean (keine neuen Warnungen)
- Manuelle End-to-End-Smoke-Tests gegen die Dev-DB:
  - `GET /verify/civil-service-assessment/<token>` → 200, Page rendert
  - `GET /api/verify/civil-service-assessment/<token>` → 200, Audit-Trail
    enthält alle 6 Workflow-Aktionen
  - 31. Aufruf in einer Minute → 429
  - Falscher Token → 404, Audit-Log enthält `VERIFY_PAGE_NOT_FOUND`
  - PDF-Export `type=beurteilung` → enthält Verifikations-Block, Audit-Trail,
    Bekanntgabe, Gegenäußerung
  - PDF-Export `type=gesamtakte` → 18-Seiten-Bundle, alle Beurteilungen mit
    Phase-6-Erweiterungen

### Offene Folgearbeiten (nicht Teil von Phase 6)

- Webhook `psi-assessment-archived` → DMS-Trigger (Swiss-QR-Export)
- Beim Archivieren automatisch das PDF generieren und als
  `CivilServiceDocument` ablegen
- n8n-Workflows konfigurieren (siehe Webhook-Tabelle oben)

---

## Dev-Umgebung für die nächste Session

```bash
cd HR_Portal_CREDO
docker start credo-hr-db-dev   # falls nicht läuft
export DATABASE_URL="postgresql://credo:credo_dev_2026@localhost:5433/hr_portal?schema=public"
export JWT_SECRET="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4"
export ENCRYPTION_KEY="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
export CRON_SECRET="cron-dev-secret-2026"
npx next dev -p 3000
```

Login: `dimitri@credo-gruppe.de` / `Test1234!Admin`

**Wichtig nach `git pull` oder Schema-Änderung:**
- `npx prisma generate` (Client refreshen)
- Bei Cache-Problemen: `rm -rf .next` und Server neu starten
