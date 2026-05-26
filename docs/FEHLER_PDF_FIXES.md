# Fehler/Verbesserungen aus `Plan_Fixes/Fehler.pdf` — Umsetzungsdokumentation

> **Stand:** 2026-05-26
> **Branch:** `fix/fehler-pdf-fixes`
> **Verifikation:** `npm run build` ✅ · `tsc --noEmit` ✅ (0 Fehler) · `npm run lint` ✅ (0 Errors) · `jest` grün (1 pre-existing Offboarding-Fail unverändert)

Alle 9 Punkte aus der Fehlerliste wurden umgesetzt. Zwei Punkte (P5, P6) wurden auf
**Wunsch als Word-Dokument** statt PDF realisiert. Das größere Feature
"Zentrale Vorlagenverwaltung" ist geplant, aber bewusst **noch nicht begonnen**
(siehe Abschnitt am Ende).

---

## Übersicht

| # | Punkt | Typ | Status |
|---|---|---|---|
| P1 | Umlaute uneinheitlich | UI + Datenmigration | ✅ |
| P2 | Legende für Status-Verteilung | UI | ✅ |
| P3 | Checkliste-Toggle springt nach oben | Bug | ✅ |
| P4 | Felder bearbeitbar + Auditlog | Feature | ✅ |
| P5 | Erweitertes Führungszeugnis (Brief) | Feature → **Word** | ✅ |
| P6 | Masernschutznachweis Arzt-Formular | Feature → **Word** | ✅ |
| P7 | Verantwortliche Stelle anpassen | Config | ✅ |
| P8 | Schreibweise „HELEX.IT GmbH" | Datenfix | ✅ |
| P9 | Pflicht-Upload nicht erzwungen | Bug + Config | ✅ |

---

## P1 — Umlaute vereinheitlicht (ganze App + DB-Migration)

**Problem:** UI-Strings teils ohne Umlaute („Persoenliche Daten", „Staatsangehoerigkeit").

**Lösung:**
- Kanonische Quelle korrigiert: `src/lib/field-definitions.ts` (Feld-Labels + Schritt-Titel).
- App-weiter, **wortbasierter** Codemod `scripts/fix-umlaute-ui.mjs` (651 Zeilen in 181 Dateien).
  Nur ganze Wörter (`\bWort\b`) → camelCase-Identifier (z. B. `dokumentLoeschen`) bleiben
  unangetastet; ALL-CAPS-Enums (`ANTRAG_VORLAEUFIG`) ebenfalls geschützt (Case-sensitiv).
- **DB-Migration** `scripts/migrate-umlaute-templates.mjs`: korrigiert Umlaute in
  bereits gespeicherten `FormTemplate.stepsConfig` und `OnboardingProcess.formTemplateSnapshot`
  (nur `title`/`label`, nie `name`). Idempotent, Dry-Run-fähig.

**Hinweis:** Neue Vorgänge zeigen sofort korrekte Umlaute (Code). Die DB-Migration ist
**optional** und betrifft nur Alt-Snapshots — nicht deploy-blockierend.

---

## P2 — Legende für Status-Verteilung

**Datei:** `src/components/dashboard-charts.tsx` (`StatusPieChart`).
`<Legend>` mit Farb-Punkt, Status-Label und Anzahl ergänzt (Donut auf 320 px erhöht,
`cy=45%`). Vorher zeigte das Diagramm die Anzahl nur per Hover ohne Status-Zuordnung.

---

## P3 — Checkliste-Toggle springt nach oben (Bug)

**Ursache:** Nach jeder Aktion lud `load()`/`loadData()` die kompletten Daten neu und setzte
`loading=true` → der `if (loading) …`-Gate unmountete die Detailansicht → Scroll-Reset.

**Lösung:** „Stiller Refetch" — `load(silent=true)` setzt den Loading-State NICHT, sodass
die Ansicht nicht unmountet. Betroffen & gefixt:
- `dashboard/mutterschutz/[id]/mutterschutz-detail-content.tsx` (+ optimistischer Toggle)
- `dashboard/elternzeit/[id]/elternzeit-detail-content.tsx`
- `dashboard/civil-service/[id]/civil-service-detail-content.tsx`
- Onboarding & Offboarding: Checklisten-Toggle aktualisierte den State bereits in-place → nicht betroffen.

---

## P4 — Personaldaten bearbeitbar + Audit-Log

**Entscheidung:** Alle Felder, HR-Edit-Rollen, inkl. verschlüsselter Felder, mit Audit-Log.

- **API:** `PATCH /api/onboarding/[id]/personal-data`
  - Auth: `HR_EDIT_ROLES` (SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER)
  - Multi-Tenant: `canAccessProcess` → **404 statt 403** (kein Existenz-Leak)
  - Zod-Whitelist; sensible Felder (IBAN, SV-Nr, Steuer-ID) werden **AES-verschlüsselt** gespeichert
  - **Audit-Log** mit Vorher/Nachher je geändertem Feld; sensible Werte als `***` maskiert
- **UI:** `src/app/(portal)/dashboard/[id]/edit-personal-data-modal.tsx`
  - Button „Daten bearbeiten" im Fragebogen-Tab (nur HR-Rollen)
  - Sensible Felder werden NICHT vorbefüllt — nur bei Neueingabe übertragen (sonst unverändert)

---

## P5 — Aufforderung erweitertes Führungszeugnis (**Word**)

**Datei:** `src/lib/docx-fuehrungszeugnis.ts` (Paket `docx`), Route
`GET /api/onboarding/[id]/fuehrungszeugnis-antrag`, Button „Führungszeugnis-Antrag (Word)".
Erzeugt einen Brief gem. § 30a BZRG (Aufforderung an die/den Mitarbeiter/in), mit
Personendaten + verantwortlicher Stelle. Auth + Org-Scope wie Export-Routen.

---

## P6 — Masernschutz „Nachweis-Bescheinigung" (**Word**)

**Datei:** `src/lib/docx-masernschutz.ts`, Route
`GET /api/onboarding/[id]/masernschutz-bescheinigung`, Button „Masernschutz-Formular (Word)".
Bildet das amtliche NRW-Formular (Ministerium f. Schule u. Bildung, Stand Feb. 2020)
als `.docx` nach; Name/Vorname, Geburtstag, Wohnanschrift sind vorbefüllt — Ankreuzfelder,
Ort/Datum, Unterschrift & Praxisstempel bleiben für die Ärztin/den Arzt frei.

---

## P7 — Verantwortliche Stelle pro Mandant konfigurierbar

- **Schema:** `Organization.dsgvoVerantwortliche{Name,Strasse,Plz,Ort}` (optional).
- **Helper:** `src/lib/dsgvo.ts` — Default „Christlicher Schulverein Minden e.V., …" + Formatierung.
- **Public-Fragebogen:** `step10-summary.tsx` zieht den Text aus der Mandanten-Config (sonst Default).
- **Admin:** `GET/PATCH /api/organizations/[id]/dsgvo-config` + Seite
  `/mandanten/[id]/dsgvo-config` (Live-Vorschau), verlinkt aus der Mandantenliste („DSGVO-Konfig").

---

## P8 — „HELEX.IT GmbH"

`prisma/seed.ts`: Mandant #747 „helex.it GmbH" → „HELEX.IT GmbH". Der Seed nutzt
`upsert` mit `update: { name }` → ein erneuter Seed-Lauf korrigiert auch den Bestand.
Branding „Powered by helex.it" im Footer bleibt unverändert (bewusst).

---

## P9 — Pflicht-Dokumente konfigurierbar + Submit-Enforcement

**Problem:** Fragebogen ließ sich ohne Pflicht-Upload absenden.

- **Schema:** `FormTemplate.requiredDocuments DocumentType[]` (Default: beide Geburtsurkunden).
- **Helper:** `src/lib/required-documents.ts` (Labels + `computeMissingRequiredDocuments`,
  GEBURTSURKUNDE_KIND nur wenn Kinder vorhanden).
- **Server-Enforcement:** `POST /api/fragebogen/[token]` lehnt mit **400** + deutscher Meldung ab,
  wenn Pflicht-Dokumente fehlen.
- **Client:** `document-upload.tsx` leitet die Pflicht-Liste aus der Vorlagen-Config ab.
- **Admin:** Editor `/vorlagen` → pro Vorlage Pflicht-Dokumente per Toggle wählbar + speichern.

---

## Deployment (Reihenfolge)

1. `prisma db push` — neue Felder (in Produktion automatisch via `entrypoint.sh`).
2. `node prisma/seed.js` (Container) bzw. `npm run db:seed` (lokal) — korrigiert HELEX.IT GmbH.
3. *Optional:* `node scripts/migrate-umlaute-templates.mjs --apply` — Umlaute in Alt-Snapshots.

---

## Noch offen: Epic „Zentrale Vorlagenverwaltung"

Großes, separat geplantes Feature (`.docx`-Templates mit Platzhaltern, Einzel- + Serienbrief,
Gotenberg für `.docx→PDF`). **Noch nicht begonnen** — bewusst nach dem Deploy/Test der
9 Fixes, idealerweise mit laufender DB/Docker. Entscheidungen & Task-Schnitt sind in der
Session dokumentiert (Format `.docx`-Upload, Koexistenz mit pdfkit, Platzhalter + Wenn/Dann,
ZIP- oder Sammel-PDF, sensible Felder mit Audit, global + Mandanten-Override).
```
