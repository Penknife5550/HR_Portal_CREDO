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
