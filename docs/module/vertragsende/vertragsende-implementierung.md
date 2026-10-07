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
| UI Detail | Seite `src/app/(portal)/vorgaenge/vertragsende/[id]/page.tsx` (seit U1; Weiche alte/neue Ansicht über den Cookie `ansicht-vertragsende`, UX-Pilot). Alte Ansicht: `src/app/(portal)/dashboard/contract-end/[id]/contract-end-detail-content.tsx` (Tabs Übersicht/Vertragsdaten/Dokumente/E-Mails, Vorgabe). Neue Ansicht (Vorschau): `detail.tsx`, `reiter-*.tsx`, `dialoge.tsx`, `typen.ts`, `aufrufe.ts` neben der Seite – Prozessleiste aus `src/lib/prozess/vertragsende.ts`, Hinweise aus `src/lib/prozess/vertragsende-hinweise.ts`; Regeln in CLAUDE.md, Abschnitt „Oberfläche“, und `docs/module/ux-ui/pilot-feinplan.md` |
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

## 6. Versand an die Führungskraft und Sperre nach der Antwort (10/2026)

Zwei Befunde aus der Durchsicht des UX-Pilots vom 06.10.2026, behoben auf `main`.

**Gesendet ist nur, was hinausging.** `triggerWebhooks` meldet SENT, FAILED oder SKIPPED;
Anfrage und Erinnerung haben das Ergebnis früher verworfen (Oberfläche „gesendet“, Zähler
stieg, nach drei gescheiterten Erinnerungen falsche Eskalation an HR). Bewertung in
`src/lib/contract-end-versand.ts` (`versandBewerten`, dieselbe Regel wie bei den
Abteilungsaufgaben: SKIPPED wegen deaktivierter Vorlage zählt nur mit aktivem Webhook als
zugestellt).

| Weg | Zugestellt (SENT/WEBHOOK) | Gescheitert (FAILED) | Übersprungen (SKIPPED) |
|---|---|---|---|
| `POST …/supervisor-link` | 201, `mailStatus` | 502 + Meldung, „nicht zugestellt“ (s. u.) | 409 + Meldung, „nicht zugestellt“ (s. u.) |
| `POST …/reminder` (Knopf) | 200, Zähler +1, Verlauf | 502 + Meldung, nichts gezählt | 409 + Meldung, nichts gezählt |
| Täglicher Lauf | `reminders`, Zähler +1 | `erinnerungenNichtZugestellt`, morgen erneut | `erinnerungenUebersprungen`, nur `lastSupervisorReminderAt` (sonst täglich), Zähler bleibt |

- „Nicht zugestellt“ = `supervisorLinkSentAt = null`: keine Erinnerungen zu einem Link, den
  niemand hat; die alte Ansicht zeigt das rot und bietet wieder „Anfrage senden“ an. War es
  die erste Anfrage, geht auch der Status zurück auf `ANGELEGT` (Liste stimmt, Montags-Hinweis
  „unbearbeitet“ greift). Zurückgestellt wird nur für den eigenen Token
  (`updateMany … supervisorToken`).
- Eskaliert wird nur im selben Lauf wie eine gezählte Erinnerung.
- Der Bericht des Zeitplaners meldet beide neuen Zähler als Problem (`bericht.ts`).
- Mail-Texte unverändert: `contract-end-supervisor-link`, `contract-end-supervisor-reminder`,
  `contract-end-eskalation`. Keine Word-Vorlage betroffen.

**Nach der Antwort der Führungskraft keine neue Anfrage.** `RUECKMELDUNG_UEBERNAHME` und
`RUECKMELDUNG_KEINE_UEBERNAHME` stehen in der Sperrliste von `/supervisor-link` (400,
„bereits geantwortet – bitte Seite neu laden“). Vorher setzte eine neue Anfrage Entscheidung,
Begründung und Vorstand-Abstimmung zurück, nach „Ja“ blieb das Formular aber gesperrt
(`renewalData.isComplete`) — ein Link ohne Handlung, und der Vertrag konnte schon erzeugt sein.
Keine Ansicht bot den Knopf dort an; auslösbar war es aus einem veralteten Browserfenster.
Der Statuswechsel läuft jetzt in EINER Transaktion mit bedingtem `updateMany` (Status nicht
gesperrt): Antwortet die Führungskraft zwischen Prüfen und Speichern, gewinnt ihre Antwort (409).
Eine falsche Antwort korrigierbar zu machen wäre ein eigener Knopf mit Rückfrage (nicht gebaut).

**Für `ux-umbau` beim nächsten „`main` nachziehen“:** Konflikt in
`src/app/api/contract-end/[id]/supervisor-link/route.ts` und im Test dazu sicher. Dort steht
die Sperrliste in `src/lib/contract-end-status.ts` (`CONTRACT_END_ANFRAGE_GESPERRT`): die
beiden `RUECKMELDUNG_*` dort aufnehmen, den Import behalten, die lokale Liste aus `main`
streichen; im Test von `MOEGLICH` nach `GESPERRT` verschieben. Die Gegenprobe in
`src/__tests__/lib/prozess-vertragsende.test.ts` prüft dann, dass die neue Ansicht die Anfrage
dort nicht anbietet. Die neue Ansicht kann `mailStatus` lesen; Fehlerantworten (502/409) tragen
die fertige Meldung in `error`.
