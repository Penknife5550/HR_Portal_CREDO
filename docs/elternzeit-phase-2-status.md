# Elternzeit & Mutterschutz — Phase 2 Vollstaendig (umgesetzt)

> **Stand:** April 2026
> **Vorgehen:** Phase 2 in 4 Bloecken (2A Fundament, 2B Endg. Antrag, 2C Briefe, 2D Fristen+UI)
> **TypeScript-Check:** sauber
> **Lint:** sauber (keine neuen Warnings)
> **Voraussetzung:** Phase 1 muss umgesetzt sein (siehe `elternzeit-phase-1-status.md`)

---

## Block 2A — Fundament

### Schema (`prisma/schema.prisma`)

**Organization-Erweiterung** — Mandanten-Konfiguration fuer Briefvorlagen:

| Feld | Typ | Zweck |
|---|---|---|
| `ezGfFirstName/LastName/Title` | `String?` | Geschaeftsfuehrung als Briefunterzeichner |
| `ezSignaturePath` | `String?` | optional: Pfad zu Unterschrifts-PNG |
| `ezDefaultLeiterFirstName/LastName/Email` | `String?` | Default-Einrichtungsleiter |
| `ezBrDetmoldName/Email/Phone/AktenPrefix` | `String?` | BR Detmold Kontakt |
| `ezTokenValidityDays` | `Int @default(30)` | Token-Gueltigkeit pro Mandant |

**Neues Modell `ElternzeitFrist`:**

```prisma
model ElternzeitFrist {
  id              String @id @default(uuid())
  elternzeitId    String
  fristTyp        ElternzeitFristTyp
  bezeichnung     String
  beschreibung    String?
  faelligAm       DateTime
  erledigtAm      DateTime?
  erledigtVon     String?
  erledigung      String?
  letzteSeverity  ElternzeitFristSeverity?
  letzteWarnungAm DateTime?
  // ...
}
```

**Neue Enums:**
- `ElternzeitFristTyp`: ANTRAGSFRIST_VORL, TOKEN_VORL_EXPIRY, TOKEN_ENDG_EXPIRY, GEBURTSURKUNDE_NACHREICHUNG, BR_GENEHMIGUNG, BEIHILFE_AENDERUNG, RUECKKEHR_GESPRAECH, TEILZEIT_ANTRAG_PRUEFUNG, SONSTIGE
- `ElternzeitFristSeverity`: INFO (>14 Tage), WARNING (8-14), URGENT (0-7), OVERDUE

**Schema-Erweiterung Block 2D:**
- `ElternzeitProzess.leiterTokenEndg` + `leiterTokenEndgExpiry` + `leiterTokenEndgUsedAt` + `leiterGenehmigungAm` + `leiterAblehnungGrund` (Einrichtungsleiter-Workflow)

### Lib-Helper

| Datei | Funktion |
|---|---|
| `src/lib/elternzeit-fristen.ts` | `berechneSeverity`, `verbleibendeTage`, `berechneFristTemplates` (8 Fristtypen), `syncElternzeitFristen` |
| `src/lib/file-upload.ts` | `validateMagicBytes`, `validateUpload`, `sanitizeFilename`, `saveUploadedFile` (Pfad-Traversal-Schutz) |

### API + UI: Mandanten-Konfiguration

| Methode | Pfad | Zweck |
|---|---|---|
| GET/PATCH | `/api/organizations/[id]/elternzeit-config` | Mandanten-Config (ADMIN_ROLES) |

**UI:** `/mandanten/[id]/elternzeit-config` mit 4 Sektionen (Geschaeftsfuehrung, Standard-Einrichtungsleiter, BR Detmold, Token-Validity). Link in `mandanten-content.tsx` ergaenzt.

---

## Block 2B — Endgueltiger Antrag

### Validierungen (`src/lib/validations/elternzeit.ts`)

- `generateAntragLinkEndgSchema` — Magic Link Token 2 anlegen
- `publicAntragEndgSchema` — Public Form 2 (Kind-Daten, Geburtsurkunde-Bestaetigung, DSGVO)
- `genehmigenEndgSchema` / `ablehnenEndgSchema` — HR-Aktionen

### API-Routes (HR, geschuetzt)

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/elternzeit/[id]/antrag-link-endg` | Token 2 generieren (mandanten-Validity) |
| POST | `/api/elternzeit/[id]/genehmigen-endg` | Endgueltige Genehmigung durch HR |
| POST | `/api/elternzeit/[id]/ablehnen-endg` | Endgueltige Ablehnung |
| GET | `/api/elternzeit/[id]/genehmigung-endg` | PDF Endgueltige Genehmigung |
| GET/POST/DELETE | `/api/elternzeit/[id]/dokumente[/[docId]]` | Dokument-Upload (HR) + Download + Loeschen |

### Public-Routes (Magic Link, kein Auth)

| Methode | Pfad | Zweck |
|---|---|---|
| GET/POST | `/api/elternzeit-antrag-endg/[token]` | Token 2 validieren + endg. Antrag absenden |
| POST | `/api/elternzeit-antrag-endg/[token]/upload` | Geburtsurkunde hochladen (mehrfach erlaubt bis Single-Use) |

### PDF-Generator

`generateEndgueltigeGenehmigungPdf` in `src/lib/elternzeit-pdf.ts` — verwendet Mandanten-Geschaeftsfuehrer als Unterzeichner, Glueckwunsch + Kind-Daten.

### UI

- **Public Form 2** unter `/elternzeit-antrag-endg/[token]` (3 Schritte: Kind-Daten, Geburtsurkunde-Upload, DSGVO+Bestaetigung)
- **Detail-UI** erweitert um Aktions-Buttons: Magic Link endg., Endg. Genehmigen, Endg. Ablehnen, PDF endg. Genehmigung

---

## Block 2C — Briefe, Behoerden & Webhooks

### Geteilter Brief-Helper

`createBrief()` in `elternzeit-pdf.ts` — kapselt Header (CREDO Wortmarke, 4-Farb-Linie, QR-Code, Empfaenger-Adresse, Datum/Vorgang) und Footer. + `renderDataBlock`, `renderAbsatz`, `renderUnterschrift`. Reduziert Code-Duplikation der 5 weiteren PDFs deutlich.

### 5 PDF-Generatoren

| Funktion | DMS-Typ | Personalgruppe |
|---|---|---|
| `generateBRDetmoldSchreiben` | BR_DETMOLD_ELTERNZEIT | Beamte / PSI |
| `generateVBLInfoBrief` | VBL_INFORMATIONSBRIEF | TV-L |
| `generateAGBescheinigungElterngeld` | AG_BESCHEINIGUNG_ELTERNGELD | alle (LOGA-Eingabe-Dialog) |
| `generateBADAufforderungsbrief` | BAD_AUFFORDERUNG_KITA | Mutterschutz/Kita |
| `generateBeihilfeAenderungsformular` | BEIHILFE_AENDERUNGSFORMULAR | Beamte / PSI |

### API-Routes

| Methode | Pfad | Personalgruppen-Check |
|---|---|---|
| GET | `/api/elternzeit/[id]/br-detmold` | nur BEAMTER / PSI |
| GET | `/api/elternzeit/[id]/vbl-info` | nur TARIF_TV_L |
| POST | `/api/elternzeit/[id]/ag-bescheinigung` | alle (Body: Brutto, Wochenstunden, beschaeftigtSeit, geburtsdatum) |
| GET | `/api/elternzeit/[id]/bad-aufforderung` | alle |
| GET | `/api/elternzeit/[id]/beihilfe-aenderung` | nur BEAMTER / PSI |
| PATCH | `/api/elternzeit/[id]/br-tracking` | BR Detmold Tracking-Felder (versandtAm, Aktenzeichen, Eingang) |

### Webhook-Events erweitert

- `elternzeit-br-detmold-generiert`
- `elternzeit-vbl-generiert`
- `elternzeit-ag-bescheinigung-generiert`
- `elternzeit-br-genehmigung-eingegangen`
- `elternzeit-endg-genehmigt`
- `elternzeit-endg-abgelehnt`
- `elternzeit-frist-eskaliert` (aus Cron)
- `elternzeit-leiter-link-versandt` / `-genehmigt` / `-abgelehnt`

### Detail-UI: Tab "Briefe"

Drei Sektionen (Genehmigungen, Beamte/PSI, TV-L, Externe Stellen) mit Download-Buttons. AG-Bescheinigung via Modal-Prompt fuer LOGA-Daten.

---

## Block 2D — Fristen, Cron, Schulferien-UI, Einrichtungsleiter

### Fristen-System

- `lib/elternzeit-fristen.ts` mit `syncElternzeitFristen()` wird in **alle** State-Mutationsstellen aufgerufen:
  - `POST /api/elternzeit` (Anlage)
  - `POST .../antrag-link-vorl|endg`
  - `POST .../genehmigen-vorl|endg`, `.../ablehnen-vorl|endg`
  - `POST /api/elternzeit-antrag/[token]` (Submission)
  - `PATCH .../br-tracking`

### Cron-Job

- `POST /api/cron/elternzeit-fristen` (CRON_SECRET, timing-safe)
- 4-stufige Eskalation INFO/WARNING/URGENT/OVERDUE
- Webhook `elternzeit-frist-eskaliert` nur bei Stufenwechsel (verhindert Mehrfach-Notifications via `letzteSeverity`)

### Fristen-API

| Methode | Pfad | Zweck |
|---|---|---|
| GET/POST | `/api/elternzeit/[id]/fristen` | Liste mit Severity / manuelle Frist anlegen |
| PATCH/DELETE | `/api/elternzeit/[id]/fristen/[fristId]` | Erledigen / loeschen |

### UI

- **Detail-UI Tab "Fristen"** mit Ampel-Farben (gruen/gelb/orange/rot), Erledigen-Button.
- **Einstellungen-Page `/einstellungen/schulferien`** mit CRUD (Anlegen, Bearbeiten, Aktiv-Toggle, Loeschen).

### API Schulferien

| Methode | Pfad | Berechtigung |
|---|---|---|
| GET | `/api/schulferien` | PORTAL_ROLES |
| POST | `/api/schulferien` | ADMIN_ROLES |
| PATCH/DELETE | `/api/schulferien/[id]` | ADMIN_ROLES |

### Seed-Daten

`prisma/seeds/schulferien-nrw-2024-2028.ts` mit 18 Eintraegen (Schuljahre 2023/24 bis 2027/28). Ausfuehren via:

```bash
npx tsx prisma/seeds/schulferien-nrw-2024-2028.ts
```

Idempotent — bestehende Eintraege werden uebersprungen.

### Einrichtungsleiter-Workflow

- Schema-Felder `leiterTokenEndg*` + `leiterGenehmigungAm` + `leiterAblehnungGrund`
- API `POST /api/elternzeit/[id]/leiter-link` (HR-Aktion: Magic Link erzeugen)
- Public-Routes `GET/POST /api/elternzeit-leiter/[token]` (Single-Use, Genehmigen/Ablehnen mit Begruendung)
- Public-Page `/elternzeit-leiter/[token]` zeigt Antrag + Entscheidungs-Buttons
- Detail-UI Button "Leiter-Magic-Link" (sichtbar bei `ANTRAG_VORL_EINGEREICHT`)

---

## Phase 2 Nachschlag (April 2026) — Mutterschutz-Vervollstaendigung & Prozess-Steuerung

Nach dem ersten End-to-End-Test wurden drei Luecken sichtbar, die zur Phase 2
gehoeren und nachgezogen wurden:

### Mutterschutz auf Doku-Niveau

Die Doku (`elternzeit-implementierungsplan.md` § 7) listet Endpunkte fuer
Mutterschutz-Dokumente, BAD-Brief und Status-Transitions, die in der ersten
Phase-2-Welle nicht umgesetzt waren. Jetzt vorhanden:

| Methode | Pfad | Zweck |
|---|---|---|
| GET/POST | `/api/mutterschutz/[id]/dokumente` | Liste / Upload (HR_EDIT_ROLES) |
| GET/DELETE | `/api/mutterschutz/[id]/dokumente/[docId]` | Download / Loeschen |
| GET | `/api/mutterschutz/[id]/bad-aufforderung` | BAD-Brief generieren + persistieren |
| POST | `/api/mutterschutz/[id]/bad-beauftragen` | Status GEMELDET → BAD_BEAUFTRAGT |
| POST | `/api/mutterschutz/[id]/bad-abschliessen` | Status BAD_BEAUFTRAGT → BAD_ABGESCHLOSSEN |
| POST | `/api/mutterschutz/[id]/aktivieren` | Status → AKTIV |
| POST | `/api/mutterschutz/[id]/beenden` | Status → BEENDET |

State-Validierung in `src/lib/mutterschutz-workflow.ts` (`erlaubteFolgestatus`),
Transition-Helper in `src/lib/mutterschutz-transitions.ts` (zentrales Pattern
fuer Audit-Log + Webhook). Webhook-Events:
`mutterschutz-bad-beauftragt|abgeschlossen|aktiviert|beendet` und
`mutterschutz-bad-aufforderung-generiert` (via Audit-Action).

Wichtig: Mutterschutz hat **kein** `dienstbezeichnung`-Feld. Der BAD-Brief-
Generator wird mit `dienstbezeichnung: null` aufgerufen, der Brief stellt
das via "—" dar.

### Dokumente sichtbar im Vorgang

Vorher: Geburtsurkunden wurden via Magic-Link-Token-Upload korrekt als
`ElternzeitDokument` gespeichert, die Detail-UI hatte aber keinen
Dokumente-Tab — sie waren also unsichtbar. Jetzt:

- **Neuer Tab "Dokumente"** in `elternzeit-detail-content.tsx` und
  `mutterschutz-detail-content.tsx` mit Liste, Download, Upload, Loeschen.
- **Quick-Glance "Dokumente"-Sektion** in der Elternzeit-Uebersicht zeigt
  Geburtsurkunde-Status (gruener Haken + Direktlink) und Gesamtzahl, mit
  Link in den Tab.
- **Mutterschutz-Dokumente-Tab** enthaelt zusaetzlich den Button "BAD-Brief
  erzeugen" (sichtbar nur wenn `badErforderlich = true`).

### Prozess-Steuerung sichtbar (Stepper + Naechster-Schritt-Banner)

Damit ein Dritter sofort sieht "wo stehe ich, was ist erster/letzter Schritt":

- **`src/lib/elternzeit-workflow.ts`** und **`src/lib/mutterschutz-workflow.ts`**
  — deklarative State-Maschinen mit `STEPS`, `getStepIndex`, `getNaechsterSchritt`,
  `isErsterSchritt`, `isLetzterSchritt`. Endzustaende (Ablehnung, Pause)
  separat.
- **`src/components/prozess-stepper.tsx`** — generische `<ProzessStepper>` und
  `<NaechsterSchrittBanner>`. Horizontale Kreise mit Verbindungslinien
  (Desktop), vertikale Liste (Mobile), gruene Haken fuer abgeschlossene
  Schritte, kraeftige Umrandung fuer den aktuellen Schritt, "Start"/"Ende"
  an den Enden.
- **Banner** unten am Stepper zeigt: "Naechster Schritt — HR" (gruen,
  blinkender Punkt) oder "Naechster Schritt" (grau) plus passenden
  Action-Button, der direkt den richtigen Handler aufruft (Magic-Link senden,
  Genehmigen, BAD beauftragen, Aktivieren, Beenden, …).

In beiden Detail-Seiten (`elternzeit-detail-content.tsx`,
`mutterschutz-detail-content.tsx`) direkt unter dem Header eingebaut.

### Geaenderte Files (Nachschlag)

```
src/lib/
├── elternzeit-workflow.ts                    # NEW
├── mutterschutz-workflow.ts                  # NEW
└── mutterschutz-transitions.ts               # NEW

src/components/
└── prozess-stepper.tsx                       # NEW

src/app/api/mutterschutz/[id]/
├── dokumente/route.ts                        # NEW
├── dokumente/[docId]/route.ts                # NEW
├── bad-aufforderung/route.ts                 # NEW
├── bad-beauftragen/route.ts                  # NEW
├── bad-abschliessen/route.ts                 # NEW
├── aktivieren/route.ts                       # NEW
└── beenden/route.ts                          # NEW

src/app/(portal)/dashboard/
├── elternzeit/[id]/elternzeit-detail-content.tsx     # MODIFIED (Stepper + Banner + Dokumente-Tab)
└── mutterschutz/[id]/mutterschutz-detail-content.tsx # MODIFIED (Stepper + Banner + Dokumente-Tab)
```

### Personalgruppe-Cleanup (Nebenbei)

`PLANSTELLENINHABER` aus den Anlage-Modals (Mutterschutz, Elternzeit) entfernt
— in unserem Kontext synonym mit `BEAMTER`. Enum bleibt fuer Bestandsdaten.
Logik-Checks (`BEAMTER || PLANSTELLENINHABER`) bleiben unveraendert.

---

## GoLive-Haertung (April 2026, Commit `4cc1358`)

Nach dem Code-Review wurden weitere Haertungen umgesetzt — Phase 2 ist
damit GoLive-tauglich.

### Sicherheit

- **R11 Token-Hashing:** Magic-Link-UUIDs werden via SHA-256 in der DB
  abgelegt, der Klartext existiert nur in der Magic-URL und im Empfaenger-
  Posteingang. `lib/token-hash.ts`. Alle 3 Generations- und 4 Validation-
  Routes umgestellt. `tokenExpiry` ist defense-in-depth zusaetzlich im
  atomaren `updateMany.where`.
  - **⚠️ Breaking Change:** Bestehende Klartext-Magic-Links in alten DB-
    Records werden nach dem Update ungueltig (Lookup hasht den eingehenden
    Token, in der DB steht aber noch Klartext aus alten Vorgaengen).
    Vor dem Update DB-Check auf offene Tokens machen, ggf. neue Links
    nach dem Update versenden.

- **IDOR-Schliessung Mutterschutz:** Alle 4 Bestands-Routes (`[id]` GET/
  PATCH/DELETE, `notizen` GET/POST, `checkliste/[itemId]` PATCH) und
  `POST /api/mutterschutz` pruefen jetzt `canAccessProcess`/`canAccessOrg`.
  404 statt 403 — verhindert Existenz-Leak.

- **Pre-existing Elternzeit-IDOR-Symmetrie:** `POST /api/elternzeit`
  prueft jetzt ebenfalls `canAccessOrg` fuer `organizationId` UND fuer
  `mutterschutzId`-Verknuepfung.

- **Atomarer Mutterschutz-State-Wechsel:** `mutterschutz-transitions.ts`
  refactored — `updateMany` mit `getErlaubteVorgaenger()` im WHERE plus
  `prisma.$transaction` fuer Update + AuditLog. Race-frei, keine
  Compliance-Luecke (Status-Wechsel ohne Audit unmoeglich).

- **Public-Magic-Link AuditLogs erweitert:** Eigene Action-Suffixe
  `*_VIA_MAGIC_LINK` mit `ipAddress` + `tokenHash` (NICHT Klartext).
  Forensik bei Missbrauch jetzt moeglich.

### UI/UX

- **Stepper-Accessibility:** `<nav aria-label="Prozessfortschritt">`,
  `aria-current="step"` am aktuellen Schritt, `aria-label` pro `<li>`
  mit "Schritt X von Y: Label — Status", `aria-hidden` auf alle
  dekorativen Elemente, `motion-safe:animate-pulse` (respektiert
  prefers-reduced-motion).

- **`confirm()` durch `ConfirmDeleteModal` ersetzt:** Beim Loeschen
  von Dokumenten in beiden Detail-Components wird jetzt das Modal
  aus `components/elternzeit/elternzeit-modals.tsx` verwendet, mit
  Anzeige des Dateinamens und konsistentem CREDO-Styling.

- **`type="button"`** auf allen Modal-Buttons ergaenzt — verhindert
  versehentliche Form-Submits.

- **Error-Handling-Polish:** Alle bisher silent failenden Fetch-Aufrufe
  in den Detail-Components (`dokumentLoeschen`, `fristToggle`, `toggleItem`,
  `notizSpeichern`) setzen jetzt `actionError` mit deutscher Meldung.

### Tests

- `src/__tests__/lib/mutterschutz-workflow.test.ts` — 43 Tests fuer die
  State-Maschine, inkl. Konsistenz-Check zwischen `erlaubteFolgestatus`
  und `getErlaubteVorgaenger`.
- `src/__tests__/lib/token-hash.test.ts` — 7 Tests Idempotenz, Hex-Format,
  leerer String, UUID, sehr lange Strings.
- Test-Suite: 110 → 160 Tests (von 161 gesamt, 1 pre-existing Offboarding).

### Hot-Spot-Refactor (Code-Review)

- **Hot-Spot #1:** `mutterschutz-transitions.ts` macht jetzt Auth +
  IDOR-Check selbst. Die 4 Status-Transition-Routes sind dadurch je
  nur ~45 Zeilen (statt ~70). −33% DB-Roundtrips pro Transition.
- **Hot-Spot #2:** Alte Status-Buttons in `elternzeit-detail-content`
  entfernt — der `NaechsterSchrittBanner` ist jetzt Single-Source-of-
  Truth fuer den primaeren HR-Schritt. Sekundaere Aktionen (Ablehnen,
  Leiter-Link, PDF-Downloads) sind in einer eigenen Section.
- **Hot-Spot #3:** `tokenExpiry: { gt: new Date() }` zusaetzlich im
  atomaren `updateMany.where` der 3 Public-Token-Routes.

---

## Webhook-Verdrahtung (April 2026, Commit `54481cb`)

### Webhook-Admin-UI

- 18 neue Webhook-Events in `WEBHOOK_EVENTS` (13 Elternzeit + 5
  Mutterschutz)
- **Filter-Leiste** oben (Volltext-Suche + Gruppen-Dropdown)
- **Quick-Add-Button "+ Webhook"** in jedem Event-Header → Modal
  kommt mit prefilltem Event auf, kein Scrollen mehr durch die Liste
- `WebhookModal` Prop `defaultEvent` fuer Prefill
- Gruppen-Farben CREDO-CD-konform: EZ=gelb, MS=rot

### n8n-Generator-Scripts

Versioniert in `scripts/n8n/`, Output bleibt lokal in `n8n/` (gitignored).

- `generator-lib.js`: geteilte Renderer-Library + `buildFlow()` Helper
- `generate-elternzeit-flow.js`: 13 Events → `n8n/CREDO-Elternzeit-v3.json`
  (39 Nodes, 26 Connections). Frist-Eskalations-Mail mit Severity-Farb-
  Mapping (rot/gelb/blau).
- `generate-mutterschutz-flow.js`: 5 Events → `n8n/CREDO-Mutterschutz-v3.json`
  (15 Nodes, 10 Connections).

```bash
# Aufruf:
node scripts/n8n/generate-elternzeit-flow.js > n8n/CREDO-Elternzeit-v3.json
node scripts/n8n/generate-mutterschutz-flow.js > n8n/CREDO-Mutterschutz-v3.json
```

Dann in n8n ueber **Workflows → Import from File** importieren.
Outlook-Credential muss bereits existieren (gleiche ID wie Onboarding-Flow).

### Seed-Skript

`scripts/seed-elternzeit-mutterschutz-webhooks.ts` legt alle 18 Webhooks
**idempotent** in der DB an. Aufruf:

```bash
N8N_BASE_URL=https://n8n.fes-credo.de tsx scripts/seed-elternzeit-mutterschutz-webhooks.ts
```

Alle Webhooks werden **inaktiv** angelegt — Admin aktiviert manuell nach
Test (verhindert Mailflut beim ersten Vorgang).

**Hinweis Prod:** Im Container ist `tsx` NICHT verfuegbar. Auf prod
stattdessen ein Direct-SQL-INSERT-Snippet (siehe Deployment-Runbook der
Session) oder die UI-Quick-Add-Buttons nutzen.

---

## Was bewusst NICHT in Phase 2 ist (→ Phase 3)

- `ElternzeitUnterbrechung` Sub-Prozess + PDF
- Rest-EZ-Kalkulator (verbleibende Monate ueber mehrere Kinder)
- Lohnbuero-Export (CSV mit DEUEV-Feldern fuer DATEV/LOGA)
- BR Detmold Tracking-UI (eigener Tab) — bisher nur API
- Analytics-Dashboard
- Teilzeit-Antrag als Mini-Workflow

---

## Aktivierung

**Vor der ersten Nutzung von Phase 2 muss einmalig:**

```bash
cd HR_Portal_CREDO
docker start credo-hr-db-dev
export DATABASE_URL="postgresql://credo:credo_dev_2026@localhost:5433/hr_portal?schema=public"
export JWT_SECRET="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4"
export ENCRYPTION_KEY="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
export CRON_SECRET="cron-dev-secret-2026"

npm run db:push
npm run db:generate

# Schulferien-Seed (einmalig)
npx tsx prisma/seeds/schulferien-nrw-2024-2028.ts

npx next dev -p 3000
```

**Mandanten-Config setzen:** Login als SUPER_ADMIN → Mandanten → "Elternzeit-Konfig" pro Einrichtung pflegen (Geschaeftsfuehrung, BR Detmold-Kontakt).

**Cron-Job aktivieren:** n8n-Workflow taeglich gegen `/api/cron/elternzeit-fristen` mit Bearer-Token aus `CRON_SECRET`.

---

## Datei-Inventar (Phase 2)

```
prisma/
├── schema.prisma                                                # erweitert
└── seeds/schulferien-nrw-2024-2028.ts                           # NEW

src/lib/
├── elternzeit-fristen.ts                                        # NEW
├── elternzeit-pdf.ts                                            # erweitert (1 + 5 PDFs + createBrief-Helper)
├── file-upload.ts                                               # NEW
└── validations/elternzeit.ts                                    # erweitert (5 neue Schemas)

src/app/api/
├── cron/elternzeit-fristen/route.ts                             # NEW
├── schulferien/
│   ├── route.ts                                                 # NEW
│   └── [id]/route.ts                                            # NEW
├── organizations/[id]/elternzeit-config/route.ts                # NEW
├── elternzeit/[id]/
│   ├── antrag-link-endg/route.ts                                # NEW
│   ├── genehmigen-endg/route.ts                                 # NEW
│   ├── ablehnen-endg/route.ts                                   # NEW
│   ├── genehmigung-endg/route.ts                                # NEW
│   ├── dokumente/route.ts                                       # NEW
│   ├── dokumente/[docId]/route.ts                               # NEW
│   ├── br-detmold/route.ts                                      # NEW
│   ├── vbl-info/route.ts                                        # NEW
│   ├── ag-bescheinigung/route.ts                                # NEW
│   ├── bad-aufforderung/route.ts                                # NEW
│   ├── beihilfe-aenderung/route.ts                              # NEW
│   ├── br-tracking/route.ts                                     # NEW
│   ├── fristen/route.ts                                         # NEW
│   ├── fristen/[fristId]/route.ts                               # NEW
│   ├── leiter-link/route.ts                                     # NEW
│   ├── antrag-link-vorl/route.ts                                # MODIFIED (Fristen-Sync)
│   ├── genehmigen-vorl/route.ts                                 # MODIFIED (Fristen-Sync)
│   └── ablehnen-vorl/route.ts                                   # MODIFIED (Fristen-Sync)
├── elternzeit-antrag/[token]/route.ts                           # MODIFIED (Fristen-Sync)
├── elternzeit-antrag-endg/
│   ├── [token]/route.ts                                         # NEW
│   └── [token]/upload/route.ts                                  # NEW
└── elternzeit-leiter/[token]/route.ts                           # NEW

src/app/elternzeit-antrag-endg/[token]/                          # NEW (public form 2)
├── page.tsx
└── elternzeit-antrag-endg-form.tsx

src/app/elternzeit-leiter/[token]/page.tsx                       # NEW (public leiter page)

src/app/(portal)/
├── einstellungen/schulferien/                                   # NEW
│   ├── page.tsx
│   └── schulferien-content.tsx
├── mandanten/
│   ├── mandanten-content.tsx                                    # MODIFIED (Link Elternzeit-Konfig)
│   └── [id]/elternzeit-config/                                  # NEW
│       ├── page.tsx
│       └── elternzeit-config-content.tsx
└── dashboard/elternzeit/[id]/elternzeit-detail-content.tsx      # MODIFIED (Tab Briefe + Fristen + Aktions-Buttons)

src/app/api/elternzeit/route.ts                                  # MODIFIED (Fristen-Sync bei Anlage)
```

---

*Phase 2 fertig — bereit fuer End-to-End-Tests. Phase 3 wird in einer eigenen Session umgesetzt.*
