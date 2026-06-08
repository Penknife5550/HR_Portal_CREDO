# BEM-Modul — Umsetzungsdokumentation

> **Single Source of Truth** für den Bau des BEM-Moduls (Betriebliches Eingliederungs­management, § 167 Abs. 2 SGB IX).
> Diese Datei ist so geschrieben, dass jede Session genau weiß, was als Nächstes zu tun ist.

- **Status:** **E0 + E1 + E2 + E3 umgesetzt.** E0 (Vorlagenbibliothek) 2026-06-03; E1 (versiegelte Akte) + E2 (Workflow/Dashboard/Detailseite) + E3 (Gespräche/Checklisten/Maßnahmen) 2026-06-08 — alle build/lint/test gruen, E3 adversariell reviewt (3 Findings gefixt). Auf Server ausstehend: `BEM_ENCRYPTION_KEY` setzen, `db push` (via entrypoint), Gotenberg-Container. Naechster Schritt: **E4** (Einladung & Einwilligung digital + Papier, inkl. CREDO-CI-Mail-Layout). Entscheidungen 2026-06-08: BEM-Mails immer SMTP-direkt (#9), prüfungssichere Nachvollziehbarkeit `BemKommunikation` (NFR 0a), CREDO-CI-HTML-Mails (E4), Auto-Freigabe für Anlegende:n (E2).
- **Plan-Dokument (Übersicht + Mockups):** `BEM/BEM_Modul_Plan.html`
- **Quell-Unterlagen + 7 Word-Vorlagen:** `BEM/` (`0_Gedaechnisprotokoll…` … `4_Datenschutzvereinbarung…`, `Allg. Info Credo.pdf`)
- **Verwandter (pausierter) Epic:** „Zentrale Vorlagenverwaltung" → wird hier als **E0** gebaut. Siehe `docs/FEHLER_PDF_FIXES.md` (Abschnitt Gotenberg) und Memory `vorlagenverwaltung-epic`.

---

## 0. Kernprinzip (nie vergessen)

Das heutige Portal gilt: **„globale Rollen sehen alles"** (`orgFilter`, `GLOBAL_ROLES` in `src/lib/permissions.ts`).
BEM **invertiert** das: **niemand** sieht BEM-Inhalte — außer Personen, die für **genau diesen Fall** freigegeben sind (Tabelle `BemZugriff` = Allowlist). Selbst SUPER_ADMIN/HR_LEITUNG dürfen Freigaben *verwalten*, aber Inhalte **nicht lesen**. Strikt getrennt von der Personalakte (gesetzlich vorgeschrieben).

> ⚠️ Das größte Risiko ist **nicht** fehlende Funktion, sondern ein **versehentliches Datenleck**. Jede BEM-Inhalts-Antwort braucht eigene Queries/DTOs. **403-Tests sind Teil der Definition-of-Done.**

### 0a. Prüfungssichere Nachvollziehbarkeit (verbindliche NFR, 2026-06-08)
Bei einer Prüfung muss CREDO **lückenlos nachweisen** können: *„Die Einladung/der Brief ging am X an Y raus."* (DSGVO Art. 5 Abs. 2 Rechenschaftspflicht; § 167 SGB IX Dokumentationspflicht). Umsetzung:
- **`BemKommunikation`** (neues Modell) = Versand-/Kommunikationsprotokoll. **Jede** ausgehende Mail und **jeder** generierte Brief erzeugt einen strukturierten, beweissicheren Eintrag: Kanal (E-MAIL/BRIEF), Empfänger, Betreff, Dokument-**SHA256-Hash**, Zeitstempel, auslösende:r Nutzer:in, Status (GESENDET/FEHLGESCHLAGEN/GENERIERT), **SMTP-Message-ID** (Zustellnachweis), Fehlertext, IP.
- Eintrag wird **erst nach erfolgreichem Versand** als `GESENDET` geschrieben (Fehlversuche als `FEHLGESCHLAGEN`) — Protokoll bleibt wahrheitsgemäß.
- **`AuditLog.bemFallId`** + `BEM_*`-Actions = technische Lückenlosigkeit (Lesezugriffe `BEM_AKTE_GEOEFFNET`, Statuswechsel, Freigabe/Entzug).
- **Menschenlesbare Übersicht:** pro Fall ein Tab „Protokoll" (Tabelle: Datum · Vorgang · Empfänger · Status · Hash) + **PDF-Export** des kompletten Protokolls (Versand + Zugriffe). Ausbau in E6, Datenmodell in E1.
- `sendEmail()` wird so erweitert, dass es die **Message-ID/akzeptierten Empfänger** von nodemailer zurückgibt (statt nur `boolean`), damit der Zustellnachweis echt ist.

---

## 1. Abgestimmte Entscheidungen (2026-06-03)

| # | Thema | Entscheidung |
|---|-------|--------------|
| 1 | Zugriffsmodell | **MVP intern** (versiegelte Akte, Auto-Freigabe für gekennzeichnete BEM-Beauftragte). Externe Logins erst **Phase 2 (E7)**. |
| 2 | Fall-Auslösung | **Manuell** (Phase 1). Fehlzeiten-Automatik erst **Phase 2 (E8)**. |
| 3 | Mitarbeiter-Einbindung | **Beide Wege:** digital (Magic-Link-Formular) **und** Papier + Scan-Upload. |
| 4 | Dokumente | **Zentrale Vorlagenbibliothek** (Word-Upload + Variablen, docxtemplater). Ausgabe **Word + PDF (Ausdruck)** und **Mail (online)**. |
| 5 | Mitarbeiter-Einsicht | **Gesamt-Export** der kompletten Akte als zusammengefasstes PDF (DSGVO Art. 15). |
| 6 | Wer legt an? | **Nur SUPER_ADMIN + BEM-Beauftragte.** |
| 7 | Sprache | Nur Deutsch (keine englische Datenschutzvereinbarung). |
| 8 | Reihenfolge | **E0 vor E5** (Vorlagen-Basis zuerst). |
| 9 | Mailversand (2026-06-08) | **Alle BEM-Mails immer SMTP-direkt** (`sendEmail()`), **kein n8n**. Begründung: „versiegelte Akte" — BEM-Daten/Links sollen nicht durch den externen n8n-Automationsserver fließen. Event-Mails (E4 Einladung/Einwilligung, E6 Erinnerungen) NICHT über `triggerWebhooks`, sondern direkt `sendEmail`. |

**Aktentrennungs-Nuance (automatisch umsetzen):**
- Datenschutzvereinbarung, Gespräche (Erst/Folge/Gedächtnis) → **nur BEM-Akte**.
- Maßnahmenplan → BEM-Original **+ bereinigte Kopie (ohne med. Details)** in Personalakte.
- Abbruch- & Beendigungserklärung → **Original Personalakte** (Kündigungsschutz-Nachweis) + Kopie BEM.

**BEM-Beauftragte bei CREDO:** Elena Bergen (elena.bergen@cfh-minden.de) / Danny Bergen (danny.bergen@mvs-minden.de) — extern, für alle 16 Mandanten dieselben (pro Mandant überschreibbar).

---

## 2. Echte Rollen im Portal (Stand verifiziert)

`src/lib/permissions.ts`: `SUPER_ADMIN`, `HR_LEITUNG`, `HR_SACHBEARBEITER` (= `GLOBAL_ROLES`, sehen alles), `EINRICHTUNGSLEITUNG`, `VORGESETZTER` (= `ORG_RESTRICTED_ROLES`), `SERVICE` (n8n).
> Die in der alten CLAUDE.md genannten Rollen (`ADMIN`, `HR_STAFF`, `VIEWER`) sind **veraltet** — nicht verwenden.

---

## 3. Architektur-Überblick

### 3.1 Neue Prisma-Modelle (BEM)
- `BemFall` — id, displayId (`BEM-2026-GYM-001`), organizationId→Organization, employeeId→Employee, status (`BemStatus`), eingangsweg (`DIGITAL|PAPIER`), anlassFehlzeitenAb, einladungAm, datenschutzAm, beendetAm, beendigungsgrund, aufbewahrungBis, geloeschtAm, createdBy.
- `BemZugriff` — id, bemFallId, userId, rolle (`BEAUFTRAGTE|VERTRETUNG|BR|SBV`), grantedBy, grantedAt, revokedAt. **= die „Versiegelung".**
- `BemGespraech` — id, bemFallId, typ (`ERSTGESPRAECH|FOLGEGESPRAECH|GEDAECHTNISPROTOKOLL`), datum, ort, teilnehmer (Json), **notizen (Text, verschlüsselt)**, checkliste (Json), naechsterTermin, createdBy.
- `BemMassnahme` — id, bemFallId, kategorie (`TECHNISCH|ORGANISATORISCH|PERSONENBEZOGEN`), **beschreibung (verschlüsselt)**, zustaendig, frist, status, evaluationAm.
- `BemEinwilligung` — id, bemFallId, art (`DATENSCHUTZ|DURCHFUEHRUNG|BR|SBV`), status (`OFFEN|ERTEILT|ABGELEHNT|WIDERRUFEN`), token, tokenExpiry, signedAt, signedIp, signedName, dokumentHash.
- `BemDokument` — id, bemFallId, typ (`BemDokumentTyp`), ablage (`NUR_BEM|KOPIE_PERSONALAKTE`), quelle (`GENERIERT|UPLOAD`), pfad, hash, createdBy.
- `BemFrist` — id, bemFallId, typ, faelligAm, severity, letzteSeverity, erledigt.
- `BemKommunikation` — id, bemFallId, kanal (`EMAIL|BRIEF`), empfaenger, betreff, dokumentId?, dokumentHash, status (`GESENDET|FEHLGESCHLAGEN|GENERIERT`), messageId (SMTP-Zustellnachweis), fehlertext, gesendetAm, gesendetById, ipAddress. **= prüfungssicherer Versandnachweis (NFR 0a).**

**Enums:** `BemStatus` (`ANGELEGT, EINLADUNG_VERSENDET, EINWILLIGUNG_ERTEILT, EINWILLIGUNG_ABGELEHNT, ERSTGESPRAECH, MASSNAHMEN_LAUFEN, ABGESCHLOSSEN, ABGEBROCHEN, AUFBEWAHRUNG, GELOESCHT`), `BemGespraechTyp`, `BemMassnahmeKategorie`, `BemDokumentTyp`, `BemEinwilligungArt`, `BemZugriffRolle`.

**Erweiterungen bestehender Modelle:**
- `AuditLog` (~`prisma/schema.prisma:585`): Feld `bemFallId String?` + neue Actions (`BEM_*`, inkl. `BEM_AKTE_GEOEFFNET` für Lese-Zugriffe).
- `Organization`: `bemDefaultBeauftragte` (Namen/E-Mails analog zu `ez…`-Feldern), `bemAufbewahrungJahre Int @default(4)`.
- `User`: `isBemBeauftragte Boolean @default(false)` (Phase-1-Kennzeichnung; volle Rolle in E7).

### 3.2 Gemeinsame Vorlagenbibliothek (E0, modulübergreifend)
- `DocumentTemplate` — id, name, modul, dateipfad (.docx), platzhalter (Json), scope (global/Mandant), createdBy.
- `GeneratedDocument` — id, templateId, modul, refId (z.B. bemFallId), pfadDocx, pfadPdf, createdBy, audit.
- Rendering: **docxtemplater** (angular-parser für Wenn/Dann). `.docx → PDF` via **Gotenberg-Container** (docker-compose, `internal`-Netz).
- Upload-UI unter **`/brief-vorlagen`** (NICHT `/vorlagen` — das sind die Fragebogen-Formularvorlagen!).

### 3.3 Zugriffsmodell (neuer Kern-Baustein)
Neue Helfer in `src/lib/permissions.ts` (analog zu `orgFilter`/`canAccessProcess`):
- `bemFilter(session)` → `{ id: { in: <aktive BemZugriff-FallIDs> } }`. Kein Eintrag = kein Zugriff.
- `canAccessBemContent(session, bemFallId)` → für jede Inhalts-Route.
- `canManageBemAccess(session)` → SUPER_ADMIN/HR_LEITUNG dürfen Freigaben verwalten, **nicht** Inhalte lesen.
- `canCreateBemFall(session)` → nur `SUPER_ADMIN` oder `user.isBemBeauftragte`.
Middleware (`src/middleware.ts`): `/dashboard/bem/*` und `/api/bem/*` schützen.

### 3.4 Verschlüsselung
Neuer ENV `BEM_ENCRYPTION_KEY` (64 Hex). `src/lib/encryption.ts` um optionalen Key-Parameter erweitern (`encrypt(text, key?)`, `decrypt(text, key?)`), damit BEM-Gesundheits-Felder mit eigenem Schlüssel ver-/entschlüsselt werden (Rotation unabhängig von Personalakte).

---

## 4. Wiederverwendbare Bausteine (Code-Referenzen)

| Zweck | Vorlage im Code |
|------|------------------|
| Status-Maschine + atomare Transitions (+ AuditLog, Race-Schutz via `updateMany`) | `src/lib/mutterschutz-workflow.ts`, `src/lib/mutterschutz-transitions.ts` |
| Workflow-Schritte, displayId-Generierung, Checklisten | `src/lib/elternzeit-workflow.ts`, `elternzeit-helpers.ts`, `elternzeit-checkliste-template.ts` |
| Fristen + Severity + Cron-Sync | `src/lib/elternzeit-fristen.ts`, `src/app/api/cron/elternzeit-fristen/route.ts` |
| Cron-Sicherheit (CRON_SECRET + timingSafeCompare) | `src/app/api/cron/reminders/route.ts` |
| Auth/Tenant/Rollen-Wrapper | `src/lib/api-handler.ts`, `src/lib/permissions.ts`, `src/lib/auth.ts` |
| Verschlüsselung (AES-256-GCM, `iv:authTag:ciphertext`) | `src/lib/encryption.ts` |
| Magic-Link (Token-Hash, Validierung, Rate-Limit) | `src/lib/token-hash.ts`, `auth.ts` (`validateMagicToken`), `rate-limit.ts` (`tokenRateLimiter`) |
| Öffentliches Formular (Muster Einwilligung) | `src/app/fragebogen/[token]/`, `src/app/exit-interview/[token]/` |
| Mail / n8n / Webhooks | `src/lib/mailer.ts`, `default-email-templates.ts`, `n8n.ts`, `webhooks.ts` (`triggerWebhooks`) |
| Word-Generierung (Muster) / PDF + DMS-QR | `src/lib/docx-fuehrungszeugnis.ts`, `docx-masernschutz.ts`, `pdf-export.ts` (`buildQRContent`) |
| File-Upload (Magic-Bytes, Pfad-Schutz) | `src/lib/file-upload.ts` (`validateUpload`, `saveUploadedFile`) |
| Verantwortliche Stelle (DSGVO) | `src/lib/dsgvo.ts` (`resolveVerantwortlicheStelle`) |
| UI: Stepper, Nächster-Schritt-Banner | `src/components/prozess-stepper.tsx`, `process-workflow-stepper.tsx` |
| UI: CREDO-Linie, Header/Nav, Modals, Detailseite | `credo-linie.tsx`, `portal-header.tsx` (`NAV_GROUPS`), `elternzeit/elternzeit-modals.tsx`, `dashboard/elternzeit/[id]/elternzeit-detail-content.tsx` |
| CI-Farben/Theme | `src/app/globals.css` (Primär `#575756`, Akzent `#DADADA`, CREDO-Linie Gelb `#FBC900`/Grün `#6BAA24`/Rot `#E2001A`/Blau `#009AC6`, Montserrat, **keine Verläufe**) |

---

## 5. Umsetzungsreihenfolge & Tasks

> Konvention: jede Box hat **Ziel**, **Schritte**, **Dateien**, **DoD** (Definition of Done). `[ ]` = offen.

### E0 — Vorlagenbibliothek-Fundament  ·  ~4–6 Tage  ·  **Voraussetzung, vor E5**  ·  ✅ UMGESETZT (2026-06-03)
**Ziel:** Word-Vorlagen hochladen, Platzhalter befüllen, Ausgabe Word/PDF/Mail. Modulübergreifend.
- [x] Gotenberg-Service in `docker-compose.yml` (nur `internal`-Netz), Health-Check. (+ `GOTENBERG_URL` in `.env(.production).example`)
- [x] `docxtemplater` + `pizzip` (+ `angular-expressions` Peer für Wenn/Dann, `@types/pizzip`) als Dependencies; Render-Lib `src/lib/doc-templates.ts` (Platzhalter füllen, angular-parser, fehlende → „___" + Warnung; Extraktion via `getFullText`, String-Literale in Ausdrücken werden ignoriert). `next.config.ts`: `serverExternalPackages` ergänzt.
- [x] `.docx → PDF`-Helfer gegen Gotenberg (`src/lib/gotenberg.ts`: `convertDocxToPdf` + `mergePdfs` für Deckblatt).
- [x] Prisma: `DocumentTemplate`, `GeneratedDocument` (+ Back-Relations Organization/User). **`db push` läuft auf dem Server automatisch via `entrypoint.sh`** (lokal keine DB).
- [x] Platzhalter-Resolver pro Modul (`src/lib/doc-template-resolvers.ts`, Registry + `ALLGEMEIN`-Resolver auf `dsgvo.ts`; `sensitiveFields`-Hook für Audit → Modul-Resolver wie BEM kommen in E5).
- [x] Admin-Upload-UI unter `/brief-vorlagen` (Anlegen/Bearbeiten/Deaktivieren: SUPER_ADMIN+HR_LEITUNG; Liste+Erzeugen: HR_EDIT_ROLES, Mandanten-Scope via `orgFilter`). Nav-Eintrag + Middleware-Schutz ergänzt.
- [x] Ausgabe-Aktionen: Word-Download, PDF-Download (Gotenberg + DMS-QR-Deckblatt via `pdf-deckblatt.ts`), „Per Mail senden" (Mail erst nach erfolgreichem Versand persistiert; `mailer.ts` um Attachments erweitert).
- **DoD:** ✅ Build/Lint/Typecheck grün; Render-Pipeline (docx-Befüllung + Extraktion) lokal end-to-end verifiziert; fehlende Platzhalter werden markiert; Rollen-Gating greift. ⏳ **Offline nicht testbar (braucht laufende DB + Gotenberg-Container):** tatsächliche `.docx→PDF`-Konvertierung, Mail-Versand, `db push`. Auf dem Server nach `docker compose up -d --build` verifizieren.

### E1 — Versiegelte Akte, Datenmodell & Beauftragten-Kennzeichnung  ·  ~3–4 Tage  ·  **Fundament, zuerst**  ·  ✅ UMGESETZT (2026-06-08)
**Ziel:** Sichere Basis — niemand sieht Inhalte ohne Freigabe.
- [x] Prisma: `BemFall`, `BemZugriff`, `BemGespraech`, `BemMassnahme`, `BemEinwilligung`, `BemDokument`, `BemFrist`, **`BemKommunikation`** (NFR 0a) + Enums; `AuditLog.bemFallId`; `Organization.bem…`; `User.isBemBeauftragte`. (`prisma validate` + `generate` grün; **`db push` läuft auf dem Server via `entrypoint.sh`** — lokal keine DB.)
- [x] `bemFilter`, `canAccessBemContent`, `canManageBemAccess`, `canCreateBemFall` in `permissions.ts` (KEIN globaler Bypass — auch SUPER_ADMIN/HR_LEITUNG brauchen `BemZugriff`).
- [x] Middleware-Schutz: `/dashboard/bem/*` ist durch das bestehende `/dashboard`-Login-Gate abgedeckt; `/api/bem/*` läuft über `apiHandler` (Session+Rollen). Per-Fall-„Versiegelung" passiert in den Routen (Edge-Runtime hat kein Prisma) — kein redundanter Middleware-Code.
- [x] Lese-Audit-Helfer `src/lib/bem-audit.ts` (Action-Konstanten `BEM_*` + `logBemAudit` für AuditLog **und** `logBemKommunikation` für das Versandprotokoll). Anwendung an konkreten GET-Routen folgt mit E2.
- [x] `encryption.ts` um optionalen Key erweitert (+ `encryptBem`/`decryptBem`/`isBemEncryptionConfigured`); `BEM_ENCRYPTION_KEY` in `.env(.production).example` + `entrypoint.sh`-Pflichtprüfung.
- [x] `mailer.ts`: `sendEmail()` gibt `SendEmailResult|null` (Message-ID + akzeptierte Empfänger) zurück — Zustellnachweis. Rückwärtskompatibel (Aufrufer prüfen truthy).
- [x] **403-Tests** (Jest, `src/__tests__/lib/bem-permissions.test.ts`): globale Rollen ohne Freigabe → kein Zugriff; mit `BemZugriff` → Zugriff. 27 Tests grün.
- **DoD:** ✅ 403-Tests grün; `npm run build` + `npm run lint` grün; `canCreateBemFall` lässt nur SUPER_ADMIN/BEM-Beauftragte zu. ⏳ **Auf Server:** `BEM_ENCRYPTION_KEY` setzen, `db push` (automatisch via entrypoint).

### E2 — Workflow, Dashboard & Detailseite  ·  ~3–4 Tage  ·  ✅ UMGESETZT (2026-06-08)
- [x] `src/lib/bem-workflow.ts` (BemStatus, BEM_STEPS, `getNaechsterSchritt`, `erlaubteFolgestatus`, `getErlaubteVorgaenger`, `statusLabel`) + `bem-transitions.ts` (atomar via `updateMany` + AuditLog in `$transaction`; **kein Webhook** — BEM ist SMTP-direkt). Zugriff via `canAccessBemContent` (nicht Rolle).
- [x] `src/lib/bem-helpers.ts`: `generateBemDisplayId(org)` (`BEM-{YYYY}-{KÜRZEL}-{NR}`, Retry bei Race).
- [x] API: `GET/POST /api/bem` (Liste via `bemFilter`, Anlegen nur SUPER_ADMIN/Beauftragte + **Auto-Freigabe für Anlegende:n**, auditiert), `GET /api/bem/[id]` (Inhalt + Lese-Audit `BEM_AKTE_GEOEFFNET`), `POST /api/bem/[id]/status`.
- [x] UI: `/dashboard/bem` (KPIs, Filter, Suche, „+ Neuer Fall"-Modal), `/dashboard/bem/[id]` (Stepper, Nächster-Schritt-Banner mit Status-Buttons, Tabs **Übersicht** + **Protokoll** = Versandnachweis & Zugriffs-/Änderungsprotokoll). Nav-Eintrag „🔒 BEM" für alle Portal-Rollen (Liste filtert via `bemFilter`).
- [x] Tests: `bem-workflow.test.ts` (State-Machine, Vorgänger/Folge-Konsistenz). Build/Lint/Test grün.
- **DoD:** ✅ Fall anlegen → erscheint in Liste (Anlegende:r auto-freigegeben); Detailseite zeigt Stepper/Status + Nächster-Schritt-Banner; Status-Übergang race-frei + Audit; Protokoll-Tab zeigt Versand-/Zugriffsnachweis. ⏳ Runtime-Verifikation auf Server (DB).

**Design-Entscheidung E2 (2026-06-08):** Beim Anlegen erhält der/die Anlegende automatisch eine `BemZugriff(BEAUFTRAGTE)`-Freigabe (sonst wäre der eigene Fall unsichtbar) — explizit auditiert, **kein** globaler Bypass.

### E3 — Gespräche, Checklisten & Maßnahmen  ·  ~3 Tage  ·  ✅ UMGESETZT (2026-06-08)
- [x] `BemGespraech`-CRUD (Erst/Folge/Gedächtnis) mit Pflicht-Checklisten (`bem-checkliste-template.ts`, vorbefüllt je Typ); Freitext `notizen` **verschlüsselt** (`encryptBem`). API: `POST /api/bem/[id]/gespraeche`, `PATCH/DELETE /api/bem/[id]/gespraeche/[gespraechId]` (alle via `canAccessBemContent` + IDOR-Check).
- [x] `BemMassnahme`-CRUD (TECH/ORG/PERSON), Status, Frist, Evaluationstermin; `beschreibung` **verschlüsselt**. API: `POST /api/bem/[id]/massnahmen`, `PATCH/DELETE .../[massnahmeId]`.
- [x] Entschlüsselung NUR in der zugriffsgeschützten Detail-Route (`GET /api/bem/[id]`), NIE in der Liste, NIE im Audit (Audit-Details enthalten nur IDs/Typen).
- [x] UI: Detailseite um Tabs **Gespräche** (Modal: Typ, Datum, Ort, Teilnehmer-Zeilen, verschlüsselte Notizen, vorbefüllte Checkliste) + **Maßnahmen** (Tabelle + Modal mit Status) erweitert.
- [x] Eigene Audit-Actions für create/update/delete (`*_ERFASST`/`*_AKTUALISIERT`/`*_GELOESCHT`) — aus adversarialer Review (NFR 0a, prüfungssichere Unterscheidung).
- [x] Tests: `bem-e3.test.ts` (Checkliste + Validierung, 11 Tests). Build/Lint grün, 48 BEM-Tests grün.
- **DoD:** ✅ Gespräch mit Checkliste anlegen/bearbeiten/löschen; Notizen/Maßnahmen-Beschreibung verschlüsselt in DB; Maßnahmen mit Status verwalten. ⏳ Runtime-Verifikation auf Server (DB + `BEM_ENCRYPTION_KEY`).
- **Bekannte Einschränkung (akzeptiert):** PATCH ist Last-Write-Wins (gesamtes Formular, inkl. Checkliste) — konsistent mit Elternzeit/Mutterschutz (kein Optimistic-Locking im Portal). Jede Änderung wird auditiert; Datenverlust nur bei echt gleichzeitigem Editieren zweier Freigegebener. Optimistic-Locking ggf. portalweit später.
- **Hinweis Checklisten-Inhalt:** Default-Texte praxisnah abgeleitet; können 1:1 an die finalen CREDO-Word-Vorlagen (`BEM/`, lokal) angeglichen werden.

### E4 — Einladung & Einwilligung (digital + Papier)  ·  ~2–3 Tage
- [ ] Magic-Link-Formular `src/app/bem/einwilligung/[token]/` (öffentlich, Rate-Limit, Zeitstempel+IP+Hash) — Muster: `fragebogen`/`exit-interview`.
- [ ] Alternativ: Papier-Scan-Upload (`file-upload.ts`).
- [ ] Widerruf jederzeit; `BemEinwilligung`-Status pflegen; Mail **direkt via `sendEmail()` (SMTP, kein n8n)** — siehe Entscheidung #9.
- [ ] **CREDO-CI-HTML-Mail-Layout** (User-Wunsch 2026-06-08): wiederverwendbarer Helfer `src/lib/email-layout.ts` (`renderCredoEmail({titel, bodyHtml, button?})`), Tabellen-Layout + Inline-Styles (Mail-Client-kompatibel), CI-Farben (Primär `#575756`, CREDO-Linie `#FBC900`/`#6BAA24`/`#E2001A`/`#009AC6`, Montserrat→Arial-Fallback, **keine Verläufe**), CREDO-Logo (`public/credo_logo*.svg`) per absoluter `APP_URL` oder CID-Embed. BEM-Mails rendern darüber; modulübergreifend nutzbar. Bestehende dunkelblaue Vorlagen (`default-email-templates.ts`) bleiben unberührt.
- **DoD:** Beide Wege erzeugen gültige, nachweisbare Einwilligung; Widerruf setzt Status + Audit.

### E5 — BEM-Vorlagen, Aktentrennung & Mitarbeiter-Export  ·  ~3 Tage  ·  **nach E0**
- [ ] Die 7 CREDO-Vorlagen als `DocumentTemplate` hinterlegen + Platzhalter mappen (Resolver für Modul „BEM").
- [ ] Aktentrennung automatisieren: Maßnahmenplan → bereinigte Kopie (ohne med. Details) als normales Personalakte-Dokument; Abbruch/Beendigung → Original Personalakte + Kopie BEM (`BemDokument.ablage`).
- [ ] Mitarbeiter-Gesamt-Export: ein PDF der kompletten Akte (Gespräche, Maßnahmen, Dokumente) + Audit.
- **DoD:** Alle 7 Vorlagen erzeugen Word+PDF korrekt befüllt; bereinigte Kopie enthält keine med. Details; Gesamt-Export vollständig.

### E6 — Fristen, Aufbewahrung & Löschung  ·  ~2–3 Tage
- [ ] `src/lib/bem-fristen.ts` (Einladung, Einwilligung, Erstgespräch, Folgegespräch, Evaluation, Aufbewahrungsende) + `GET /api/cron/bem-fristen` (CRON_SECRET).
- [ ] `GET /api/cron/bem-aufbewahrung`: `aufbewahrungBis <= heute` → Crypto-Shredding (verschlüsselte Inhalte + Dokumente löschen), `status=GELOESCHT`, Audit bleibt. Vorab-Warnung.
- [ ] Tab „Zugriffe/Protokoll" + Zugriffs-Report.
- **DoD:** Fristen erscheinen mit Severity; Lösch-Cron entfernt abgelaufene Inhalte, behält Audit; Aufbewahrungsdatum wird bei Beendigung korrekt gesetzt (`beendetAm + bemAufbewahrungJahre`).

### Phase 2 (später)
- **E7** Externe Logins: Rolle `BEM_BEAUFTRAGTER` (Magic-Link/Passwort), sehen ausschließlich BEM. ~3 Tage.
- **E8** Automatische Auslösung aus Fehlzeiten (LOGA/n8n, Schwelle >6 Wo/12 Mon). ~3–5 Tage.
- **E9** BR/SBV-Einwilligungen + optionaler Diagnose-Schutz. ~2 Tage.

---

## 6. Umgebungs-Voraussetzungen für den Bau
- Laufende **DB + Docker** (für `db push` und Gotenberg). E0 ist **offline nicht testbar** (`.docx→PDF` braucht Gotenberg).
- Neuer ENV: `BEM_ENCRYPTION_KEY` (`openssl rand -hex 32`).
- Befehle: `npm run db:push`, `npm run db:generate`, `npm run build`, `npm run lint`, `npm run test`.
- CREDO-Konventionen: keine Umlaute in Bezeichnern; `<Link>` statt `<a>`; zentrale Zod-Schemas (`src/lib/validations/`); `apiHandler`-Wrapper. Vor Push: Skills `credo-check`, `edge-cases`, `simpler`.

---

## 7. Wenn du hier neu startest (Resume)
1. Diese Datei lesen + Memory `bem-modul-plan` / `vorlagenverwaltung-epic`.
2. Aktuellen Stand prüfen: existieren schon `BemFall` etc. in `prisma/schema.prisma`? Welche Tasks oben sind `[x]`?
3. Mit dem ersten offenen Task in **E0** beginnen (oder, falls E0 fertig, E1).
4. Pro abgeschlossenem Task hier `[ ]`→`[x]` setzen und den Status oben aktualisieren.
