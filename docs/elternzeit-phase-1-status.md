# Elternzeit & Mutterschutz — Phase 1 MVP (umgesetzt)

> **Stand:** April 2026
> **Vorgehen:** Phase 1 nach Plan `docs/elternzeit-implementierungsplan.md`
> **TypeScript-Check:** ✅ sauber
> **Lint:** ✅ sauber (keine neuen Warnings)

---

## Was ist umgesetzt

### 1. Datenbank-Schema (`prisma/schema.prisma`)

Neue Modelle (am Ende der Datei, nach `civil_service_*`):

| Modell | Tabelle | Zweck |
|---|---|---|
| `MutterschutzProzess` | `mutterschutz_prozesse` | Eigenstaendiger Mutterschutz-Vorgang (MuSchG) |
| `MutterschutzDokument` | `mutterschutz_dokumente` | Dateien je Vorgang |
| `MutterschutzNotiz` | `mutterschutz_notizen` | HR-Notizen |
| `MutterschutzChecklistItem` | `mutterschutz_checkliste` | Auto-generierte Items |
| `ElternzeitProzess` | `elternzeit_prozesse` | Elternzeit-Vorgang (BEEG) |
| `ElternzeitAbschnitt` | `elternzeit_abschnitte` | 1-3 Zeitabschnitte je EZ |
| `ElternzeitDokument` | `elternzeit_dokumente` | Dateien |
| `ElternzeitChecklistItem` | `elternzeit_checkliste` | Personalgruppen-spezifisch |
| `ElternzeitNotiz` | `elternzeit_notizen` | HR-Notizen |
| `SchulferienNRW` | `schulferien_nrw` | Ferienkalender (Phase 2 mit UI) |

Neue Enums: `MutterschutzStatus`, `MutterschutzEinrichtungstyp`, `MutterschutzDokumentTyp`, `ElternzeitStatus`, `Personalgruppe`, `Geschlecht`, `KVTyp`, `KindGeschlecht`, `ElternzeitDokumentTyp`, `ElternzeitPhase`, `FerienTyp`.

**Erweiterte Modelle:**
- `Employee`: Relations `mutterschutzProzesse`, `elternzeitProzesse`
- `Organization`: Relations `mutterschutzProzesse`, `elternzeitProzesse`
- `User`: Relations `initiatedMutterschutz`, `initiatedElternzeit`
- `AuditLog`: Felder `mutterschutzId`, `elternzeitId`, Indexes erweitert

**Migration:**
```bash
cd HR_Portal_CREDO
docker start credo-hr-db-dev
export DATABASE_URL="postgresql://credo:credo_dev_2026@localhost:5433/hr_portal?schema=public"
npm run db:push
npm run db:generate
```

> Es gibt keinen `prisma/migrations/`-Ordner — das Schema wird via `prisma db push` synchronisiert.

---

### 2. Lib-Helper

| Datei | Zweck |
|---|---|
| `src/lib/elternzeit-helpers.ts` | `berechneMutterschutzBeginn`, `berechneMutterschutzEnde`, `generateMutterschutzDisplayId`, `generateElternzeitDisplayId`, `pruefeFeriensperrfrist`, `pruefeAntragsfrist`, `hatMutterschutz`, `deuevPflicht`, `hatKvZuschussAnspruch`, `ferienBegruendungPflicht` |
| `src/lib/elternzeit-checkliste-template.ts` | Personalgruppen-spezifische Checklisten-Items mit ausfuehrlichen LOGA-Klickpfaden |
| `src/lib/elternzeit-pdf.ts` | PDF-Generator "Vorlaeufige Genehmigung" (Mutter- und Vater-Version) mit Swiss-DMS-QR-Code |
| `src/lib/validations/elternzeit.ts` | Zod-Schemas (Anlage, Update, Public-Form, Magic-Link) |

**Display-IDs:**
- Mutterschutz: `MU-{year}-{shortName}-{nr3}` z.B. `MU-2026-GYM-001`
- Elternzeit: `EZ-{year}-{shortName}-{nr3}` z.B. `EZ-2026-GYM-001`

**Feriensperrfrist (§ 11 FrUrlV NRW):**
- Hinweis fuer **alle** Personalgruppen
- Pflichtbegruendung nur fuer **Beamte/PSI** (`ferienBegruendungPflicht()`)
- Sperrzone: Sommerferien 6 Wochen vor/nach, sonstige 2 Wochen vor/nach

---

### 3. API-Routes

**Mutterschutz (geschuetzt, JWT)**

| Methode | Pfad | Berechtigung |
|---|---|---|
| GET | `/api/mutterschutz` | `PORTAL_ROLES` |
| POST | `/api/mutterschutz` | `PROCESS_CREATE_ROLES` |
| GET | `/api/mutterschutz/[id]` | `PORTAL_ROLES` |
| PATCH | `/api/mutterschutz/[id]` | `HR_EDIT_ROLES` |
| DELETE | `/api/mutterschutz/[id]` | `ADMIN_ROLES`, nur Status `GEMELDET` |
| GET/POST | `/api/mutterschutz/[id]/notizen` | `PORTAL_ROLES` |
| PATCH | `/api/mutterschutz/[id]/checkliste/[itemId]` | `CHECKLIST_ROLES` |

**Elternzeit (geschuetzt)**

| Methode | Pfad | Berechtigung |
|---|---|---|
| GET | `/api/elternzeit` | `PORTAL_ROLES` |
| POST | `/api/elternzeit` | `PROCESS_CREATE_ROLES` |
| GET | `/api/elternzeit/[id]` | `PORTAL_ROLES` |
| PATCH | `/api/elternzeit/[id]` | `HR_EDIT_ROLES` |
| DELETE | `/api/elternzeit/[id]` | `ADMIN_ROLES`, nur Status `ANGELEGT` |
| GET/POST | `/api/elternzeit/[id]/notizen` | `PORTAL_ROLES` |
| PATCH | `/api/elternzeit/[id]/checkliste/[itemId]` | `CHECKLIST_ROLES` |
| POST | `/api/elternzeit/[id]/antrag-link-vorl` | `HR_EDIT_ROLES` — Magic Link Token 1 generieren |
| POST | `/api/elternzeit/[id]/genehmigen-vorl` | `HR_EDIT_ROLES` |
| POST | `/api/elternzeit/[id]/ablehnen-vorl` | `HR_EDIT_ROLES` |
| GET | `/api/elternzeit/[id]/genehmigung-vorl` | `EXPORT_ROLES` — PDF Mutter-/Vater-Version |

**Public (Magic Link, kein Auth)**

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/elternzeit-antrag/[token]` | Token validieren + Daten + Schulferien laden |
| POST | `/api/elternzeit-antrag/[token]` | Antrag absenden, Single-Use Schutz |

**Magic-Link-Pattern:**
- Token = `crypto.randomUUID()` (wie Verbeamtung)
- Gueltigkeit: 30 Tage
- Single-Use Schutz via `antragTokenVorlUsedAt` (DB-Spalte) — abgesendetes Formular kann nicht erneut geoeffnet werden
- Ablauf-Check: HTTP 403 wenn `expiry > now`, HTTP 410 wenn `usedAt` gesetzt

**Erweiterung Offboarding (Cross-Check § 18 BEEG):**

`POST /api/offboarding` prueft jetzt, ob fuer `employeeEmail` ein Elternzeit-Vorgang in Status `ANTRAG_VORL_EINGEREICHT | VORLAEUFIG_GENEHMIGT | ANTRAG_ENDG_EINGEREICHT | GENEHMIGT | AKTIV | RUECKKEHR_GEPLANT` existiert. Bei Treffer → HTTP 409 mit Hinweis auf § 18 BEEG. Override durch Klient mit `confirmElternzeit: true` im Body.

---

### 4. Oeffentliches Antragsformular (`/elternzeit-antrag/[token]`)

5-Schritt-Wizard, "use client":

1. **Persoenliche Daten** — Adresse, Dienstbezeichnung, Schulnummer
2. **Kind & Betreuung** — Betreuungsabsicht, gleichzeitige EZ?
3. **Zeitabschnitte** — 1 bis 3 Abschnitte mit Von/Bis, Uebertragung 3.–8. Lj.
   - Live Feriensperrfrist-Check (lokal berechnet, gelb)
   - Pflicht-Begruendungsfeld nur bei Beamte/PSI
4. **Teilzeit** — pro Abschnitt, max. 32h/Woche (§ 15 Abs. 7 BEEG)
5. **Abschluss** — Zusammenfassung + DSGVO-Einwilligung

Files:
- `src/app/elternzeit-antrag/[token]/page.tsx` — Server-Wrapper, Token-Validierung
- `src/app/elternzeit-antrag/[token]/elternzeit-antrag-form.tsx` — Client-Form (~600 Zeilen)

---

### 5. Portal UI

**Dashboard-Tabs** (`src/app/(portal)/dashboard/page.tsx`):
- Neuer Tab "Mutterschutz" (`?tab=mutterschutz`)
- Neuer Tab "Elternzeit" (`?tab=elternzeit`)
- Beide nutzen die generische `ProcessDashboard`-Komponente

**Configs:**
- `src/app/(portal)/dashboard/mutterschutz-config.tsx`
- `src/app/(portal)/dashboard/elternzeit-config.tsx`

**Wrapper-Components:**
- `src/app/(portal)/dashboard/mutterschutz-dashboard.tsx`
- `src/app/(portal)/dashboard/elternzeit-dashboard.tsx`

**Anlage-Modals:**
- `src/components/neuer-mutterschutz-modal.tsx`
- `src/components/neue-elternzeit-modal.tsx` — verknuepft optional mit bestehendem Mutterschutz

**Detailseiten:**
- `src/app/(portal)/dashboard/mutterschutz/[id]/page.tsx` + `mutterschutz-detail-content.tsx`
  - Tabs: Uebersicht / Checkliste / Notizen
- `src/app/(portal)/dashboard/elternzeit/[id]/page.tsx` + `elternzeit-detail-content.tsx`
  - Tabs: Uebersicht / Abschnitte / Checkliste (gruppiert nach Phase) / Notizen
  - Aktions-Buttons: "Magic Link senden", "Vorlaeufig genehmigen", "Ablehnen", "PDF Genehmigung"

---

### 6. Webhook-Events (n8n)

Folgende Events werden via `triggerWebhooks()` ausgeloest (fire-and-forget):

| Event | Trigger |
|---|---|
| `mutterschutz-angelegt` | Mutterschutz-Vorgang erstellt |
| `elternzeit-angelegt` | Elternzeit-Vorgang erstellt |
| `elternzeit-antrag-link-versandt` | Magic Link Token 1 generiert (enthaelt `magicUrl`) |
| `elternzeit-antrag-eingereicht` | Mitarbeiter hat Formular abgesendet |
| `elternzeit-vorl-genehmigt` | HR hat vorlaeufig genehmigt |
| `elternzeit-vorl-abgelehnt` | HR hat abgelehnt |

Konfiguration: Admin-Portal → Einstellungen → Webhooks (DB-Tabelle `webhook_configs`).

---

## Was bewusst NICHT in Phase 1 ist (→ Phase 2)

- **Fristen-Tracking** (`ElternzeitFrist`-Modell, Cron-Job, Ampel-Anzeige)
- **Magic Link Token 2** (endgueltiger Antrag nach Geburt mit Geburtsurkunden-Upload)
- **Weitere PDF-Briefe**: Endgueltige Genehmigung, BR Detmold-Schreiben, VBL-Info, AG-Bescheinigung Elterngeld, Beihilfe-Aenderung, BAD-Aufforderung
- **Schulferienkalender-Verwaltung** (`/einstellungen/schulferien` — Schema steht bereits, nur UI fehlt)
- **Einrichtungsleiter-Genehmigung via Magic Link** (in Phase 1 genehmigt HR direkt im Portal)
- **Dokumenten-Upload-API** (`/api/elternzeit/[id]/dokumente` POST)
- **Webhook-Events** fuer Folge-Schritte

---

## Was bewusst NICHT in Phase 2 ist (→ Phase 3)

- `ElternzeitUnterbrechung` Sub-Prozess
- Rest-EZ-Kalkulator
- Lohnbuero-Export (CSV)
- BR Detmold Tracking-UI
- Analytics-Dashboard
- Teilzeit-Antrag als Mini-Workflow

---

## Klaerungen aus Phase 1 (fuer Phase 2 wichtig)

| Punkt | Entscheidung |
|---|---|
| AG-Bescheinigung Elterngeld | Daten kommen aus LOGA → manueller Eingabedialog vor PDF-Generierung |
| Unterschrift endg. Genehmigung | **Konfigurierbar pro Mandant** (analog Beurteilungs-Vorlagen), Phase 2 |
| LOGA-Hinweise | **Ausfuehrlich** mit Klickpfad — bereits in Checklisten-Templates umgesetzt |
| Feriensperrfrist | Variante **B**: Hinweis fuer alle, Pflichtbegruendung nur Beamte/PSI |
| BR Detmold Antragsmuster | Nach § 16 BEEG-Pflichtfeldern in Phase 2 generieren |
| Prisma-Migrationen | `prisma db push` (kein Migrations-Ordner) |
| Magic-Link Single-Use | **Ja**, via `antragTokenVorlUsedAt`-Spalte |
| Geburtsurkunde-Upload | Bestehende Struktur `uploads/`, mit QR-Code wie DMS-Export |
| Rollenmodell | `SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER, EINRICHTUNGSLEITUNG, VORGESETZTER` |
| Mutterschutz vs Elternzeit | **Zwei eigenstaendige Tabs**, optional verknuepft |
| Kind-Nummerierung | HR waehlt manuell im Dropdown (1.–6. Kind) |
| Vater-Workflow | Kein Mutterschutz, nur Elternzeit, Vater-Briefvorlage |

---

## Naechste Schritte (Phase 2)

1. **Dokumenten-Upload-API** mit Magic-Bytes-Validierung (analog `civil-service/[id]/documents`)
2. **Magic Link Token 2** + Public Form fuer endgueltigen Antrag mit Geburtsurkunden-Upload
3. **Fristen-System** (`ElternzeitFrist`-Modell + Cron-Job `/api/cron/elternzeit-fristen`, Eskalation 4-stufig)
4. **PDF-Briefvorlagen** (alle 8 weiteren Briefe)
5. **Schulferienkalender-UI** unter `/einstellungen/schulferien` + Seed-Daten 2024–2028
6. **Einrichtungsleiter-Genehmigung via Magic Link** (Phase-2-Workflow)
7. **Konfigurierbare Unterschrifts-Daten pro Mandant** (Geschaeftsfuehrer-Name)
8. **Cross-Check Webhook-Mail-Templates** (n8n-seitig)

---

## Abhaengigkeiten / vor dem Start einer Folge-Phase

**WICHTIG:** Vor der ersten Nutzung von Phase 1 muss einmalig folgendes gemacht werden:

```bash
cd HR_Portal_CREDO
docker start credo-hr-db-dev
export DATABASE_URL="postgresql://credo:credo_dev_2026@localhost:5433/hr_portal?schema=public"
export JWT_SECRET="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4"
export ENCRYPTION_KEY="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
npm run db:push     # Schema synchronisieren
npm run db:generate # Prisma Client neu erzeugen
npx next dev -p 3000
```

Login: `dimitri@credo-gruppe.de` / `Test1234!Admin`

Dann Tabs **Mutterschutz** und **Elternzeit** im Dashboard testen.

---

## Datei-Inventar (Phase 1)

```
prisma/schema.prisma                                                # ~370 Zeilen ergaenzt

src/lib/
├── elternzeit-helpers.ts                                           # NEW
├── elternzeit-checkliste-template.ts                               # NEW
├── elternzeit-pdf.ts                                               # NEW
└── validations/elternzeit.ts                                       # NEW

src/app/api/
├── mutterschutz/
│   ├── route.ts                                                    # NEW
│   └── [id]/
│       ├── route.ts                                                # NEW
│       ├── notizen/route.ts                                        # NEW
│       └── checkliste/[itemId]/route.ts                            # NEW
├── elternzeit/
│   ├── route.ts                                                    # NEW
│   └── [id]/
│       ├── route.ts                                                # NEW
│       ├── notizen/route.ts                                        # NEW
│       ├── checkliste/[itemId]/route.ts                            # NEW
│       ├── antrag-link-vorl/route.ts                               # NEW
│       ├── genehmigen-vorl/route.ts                                # NEW
│       ├── ablehnen-vorl/route.ts                                  # NEW
│       └── genehmigung-vorl/route.ts                               # NEW
├── elternzeit-antrag/[token]/route.ts                              # NEW (public)
└── offboarding/route.ts                                            # MODIFIED (Cross-Check)

src/app/elternzeit-antrag/[token]/                                  # NEW (public)
├── page.tsx
└── elternzeit-antrag-form.tsx

src/app/(portal)/dashboard/
├── page.tsx                                                        # MODIFIED (Tabs ergaenzt)
├── mutterschutz-config.tsx                                         # NEW
├── mutterschutz-dashboard.tsx                                      # NEW
├── elternzeit-config.tsx                                           # NEW
├── elternzeit-dashboard.tsx                                        # NEW
├── mutterschutz/[id]/
│   ├── page.tsx                                                    # NEW
│   └── mutterschutz-detail-content.tsx                             # NEW
└── elternzeit/[id]/
    ├── page.tsx                                                    # NEW
    └── elternzeit-detail-content.tsx                               # NEW

src/components/
├── neuer-mutterschutz-modal.tsx                                    # NEW
└── neue-elternzeit-modal.tsx                                       # NEW
```

---

*Phase 1 fertig — bereit fuer Tests. Phase 2 wird in einer eigenen Session umgesetzt.*
