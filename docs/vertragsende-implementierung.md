# Modul „Vertragsende" — Implementierungsstand

**Branch:** `feat/vertragsende` · **Stand:** Phase 1 komplett, getestet und live verifiziert
**Konzept + Mockups:** [`docs/vertragsende-prozess.html`](./vertragsende-prozess.html)

> ⚠ **Prozess ab 2026-06 überarbeitet** (jetzt entscheidet die **Führungskraft** über die Übernahme, nicht HR) + HR-Schutzbausteine + Phase-2-Automatik. Aktueller Prozess, Status-Flow und Fortschritt: **[`vertragsende-phase2-plan.md`](./vertragsende-phase2-plan.md)**. Dieses Dokument beschreibt den ursprünglichen Phase-1-Stand.

---

## 1. Idee

Läuft ein **befristeter Vertrag** aus, entsteht ein **Vertragsende-Vorgang** (eigener
Vorgangstyp wie Onboarding/Offboarding). HR trifft eine von zwei Entscheidungen:

- **Strang A — übernehmen:** HR löst MANUELL (wie im Onboarding) einen Vorgesetzten-
  Magic-Link aus. Der/die Vorgesetzte füllt die neuen Vertragsdaten aus; daraus wird
  der Verlängerungsvertrag aus einer Vorlage erzeugt. **Kein** Rückschreiben ins System.
- **Strang B — nicht übernehmen:** Ein HR-Klick legt halbautomatisch ein **Offboarding**
  (`ExitType.BEFRISTUNGSENDE`) an, mit übernommenen Daten und `lastWorkingDay = Vertragsende`.

**Datenquelle (Phase 2):** dauerhaft über **n8n** (liest MS-SQL `DokuBit`), kein
Portal-Direktzugriff. Fristen-Ampel **KRITISCH 1–2 / WARNUNG 3–6 / BEOBACHTEN 7–12 Monate**
(Vorlauf 12 Monate), live aus dem Vertragsende abgeleitet.

## 2. Architektur / Dateien

| Bereich | Datei(en) |
|---|---|
| Datenmodell | `prisma/schema.prisma` — `ContractEndProcess`, `ContractRenewalData`, Enums `ContractEndStatus`/`ContractEndDecision`; `AuditLog.contractEndId`; Relationen in Organization/Employee/Offboarding/User |
| Service (Anlage) | `src/lib/contract-end.ts` — `createContractEndProcess()` (displayId `VE-{Jahr}-{Kürzel}-{lfd}`, AuditLog, Event) |
| Offboarding-Service | `src/lib/offboarding.ts` — `createOffboardingProcess()` (aus der Route extrahiert; Basis für Strang B) |
| Fristen-Ampel | `src/lib/contract-end-fristen.ts` — `getContractEndCategory()` + `CONTRACT_END_CATEGORY_META` |
| Validierungen | `src/lib/validations/contract-end.ts` — create/update/renewal/n8n-Webhook |
| API CRUD | `src/app/api/contract-end/route.ts` (GET/POST), `.../[id]/route.ts` (GET/PATCH) |
| API Strang B | `src/app/api/contract-end/[id]/nicht-uebernehmen/route.ts` (atomarer Doppelklick-Schutz) |
| API Strang A | `src/app/api/contract-end/[id]/supervisor-link/route.ts` + öffentlich `src/app/api/vertrag-formular/[token]/route.ts` (GET/PUT/POST, Rate-Limit) |
| Dokumentenmodul | Modul `VERTRAGSVERLAENGERUNG` in `src/lib/doc-template-resolvers.ts` + `placeholder-catalog.ts`; generische `src/components/template-generation-section.tsx` (Onboarding nutzt sie ebenfalls) |
| Events / Mail | `src/lib/events.ts` (Gruppe „Vertragsende"); `src/lib/default-email-templates.ts` (`contract-end-supervisor-link`, `contract-end-created`) — **SMTP** über `triggerWebhooks`→`sendEventEmail` |
| UI Liste | `src/app/(portal)/dashboard/contract-end-config.tsx` + `contract-end-dashboard-new.tsx` + Tab in `dashboard/page.tsx`; Labels in `src/lib/constants.ts` |
| UI Anlegen | `src/components/neuer-vertragsende-modal.tsx` |
| UI Detail | `src/app/(portal)/dashboard/contract-end/[id]/page.tsx` + `contract-end-detail-content.tsx` (Weiche A/B, Tabs Übersicht/Vertragsdaten/Dokumente) |
| UI Formular (öffentlich) | `src/app/vertrag-formular/[token]/page.tsx` |
| Tests | `src/__tests__/api/contract-end.test.ts`, `contract-end-nicht-uebernehmen.test.ts`, `src/__tests__/lib/contract-end-fristen.test.ts` |

**Status-Flow:** `ANGELEGT` → (`ENTSCHEIDUNG_UEBERNAHME` → `VERTRAG_ERSTELLT`) **oder**
(`ENTSCHEIDUNG_KEINE_UEBERNAHME`) → `ABGESCHLOSSEN` / `STORNIERT`.

## 3. Qualität / Verifikation

- **tsc + ESLint sauber, 285 Jest-Tests grün, Production-Build grün.**
- `credo-check`: einziger Befund A11 (Rate-Limit Public-Token) → gefixt. Bewusst belassen
  (Bestandskonsistenz mit Offboarding): `window.confirm` für kritische Aktionen, `403`
  statt `404` bei fehlendem Org-Scope.
- **Live im Browser durchgeklickt** (Dev-Server + DB 5433): beide Stränge end-to-end
  (Anlegen, Ampel, Detailseite, Strang A inkl. öffentlichem Formular bis VERTRAG_ERSTELLT,
  Strang B legt OFF-…-Offboarding mit BEFRISTUNGSENDE an).

## 4. Offene Punkte

- ~~**Phase 2:** n8n-Webhook-Eingang + Erinnerungs-Cron~~ → **beide umgesetzt**
  (Webhook 2026-07-09, Cron 2026-06-19), Details in [`vertragsende-phase2-plan.md`](./vertragsende-phase2-plan.md).
- **Word-Vorlagen** für „Verlängerung"/„Entfristung" (Modul Vertragsverlängerung) vom Nutzer
  bereitstellen — dann erscheinen sie im Dokumente-Tab.
- **n8n-Umstellung:** Flow „Email-Vertragsende-Personal 2.0" auf
  `POST /api/webhooks/contract-end` zeigen lassen + täglicher Aufruf von
  `/api/cron/contract-end-reminders` (beides Bearer `CRON_SECRET`).

## 5. Lokal verifizieren

```bash
npm run dev            # Dev-Server (nutzt .env.local -> DB 5433)
# Schema in die Dev-DB: prisma db push gegen DATABASE_URL aus .env.local (Port 5433)
```

Test-Admin für die lokale Verifikation: `scripts/create-test-admin.ts`
(`npx tsx scripts/create-test-admin.ts` / `--delete`; gitignored). Der frühere Docker-Dev-
Container läuft aus einem separaten, veralteten Downloads-Klon und ist nicht der Branch-Code.
