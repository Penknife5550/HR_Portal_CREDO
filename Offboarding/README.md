# Offboarding-Modul: CREDO HR-Portal

**Projektstart:** 2026-03-27
**Status:** Phase 1 + Phase 2 — Vollständig implementiert

---

## Was ist das?

Ein digitales Offboarding-Modul für die CREDO Bildungsgruppe (16 Einrichtungen). Es erweitert das bestehende HR-Portal um den kompletten Austrittsprozess — von der Kündigung bis zur Archivierung, inklusive Exit-Interview und Zeugnis-Bewertung.

---

## Ordnerstruktur

```
Offboarding/
|
+-- README.md                          <-- Du bist hier. Start hier.
|
+-- 01_Recherche/                      Grundlagenforschung (abgeschlossen)
|   +-- HR_EXPERTE_RECHERCHE.md        Rechtliche Grundlagen, Best Practices, Checklisten
|   +-- OFFBOARDING_RECHERCHE_BERICHT.md  Detailbericht (1.200 Zeilen, alle 10 Bereiche)
|
+-- 02_Analyse/                        Kritische Prüfung gegen Code-Stand (abgeschlossen)
|   +-- ADVOCATUS_DIABOLI_ANALYSE.md   1. Analyse: Datenmodell, API, UI, Risiken
|   +-- KRITISCHE_PRUEFUNG_FINAL.md    2. Analyse: Konsistenz, Machbarkeit, Phasenplan
|
+-- 03_Konzepte/                       Feature-Konzepte (abgeschlossen)
|   +-- PROZESSUEBERSICHT.md           Gesamtprozess visuell (Flowcharts, Mockups, Timeline)
|   +-- ABTEILUNGEN_MAGIC_LINKS.md     Funktions-E-Mails, Abteilungs-Links, Reminder
|   +-- EXIT_INTERVIEW_FRAGEBOGEN.md   25 Fragen, Magic-Link-Flow, Datenmodell, Aggregation
|   +-- ZEUGNIS_BEWERTUNGSBOGEN.md     5 Berufsgruppen, Schulnoten, Formulierungstabellen
|
+-- 04_Umsetzung/                      Implementierung
    +-- IMPLEMENTIERUNGSPLAN.md        Datenmodell, API, Phasenplan, Aufwand
    +-- FUNKTIONSUEBERSICHT.md         Feature-Matrix, Testfälle
    +-- CODE_REVIEW.md                 Code-Review Phase 1
    +-- UX_REVIEW.md                   UX-Review Phase 1
```

---

## Architektur-Entscheidungen (fixiert)

| Entscheidung | Ergebnis | Begründung |
|---|---|---|
| Eigenes Modell vs. Erweiterung | **Eigenes `OffboardingProcess`-Modell** | Unterschiedliche Status, Felder, Zugriffsrechte |
| API-Struktur | **Parallele `/api/offboarding/`-Routes** | Kein Risiko für bestehende Onboarding-API |
| Dashboard | **Tab-Umschaltung: Onboarding / Offboarding** | Einfach, klar, Apple-like |
| Abteilungs-Einbindung | **Magic Links an Funktions-E-Mails** | Kein Portal-Login nötig für IT, Facility etc. |
| Exit-Interview | **Magic Link an private E-Mail, 7 Tage nach Austritt** | DSGVO-konform, hohe Rücklaufquote |
| Zeugnis | **Schulnoten-Bewertung durch Vorgesetzte per Magic Link** | Einfach, 5 Berufsgruppen-Bögen |
| Vorlagen | **Alles admin-konfigurierbar** | Fragen, Kategorien, Gewichtungen über Admin-UI editierbar |
| Reminder | **3-stufig via n8n: Info → Warnung → Eskalation** | Automatisiert, mit manuellem Override |
| Navigation | **3 Hauptmenüpunkte mit Dropdowns** | Dashboard, Vorlagen (4 Unterseiten), Verwaltung (3 Unterseiten) |

---

## Phasenplan

### Phase 1: MVP Offboarding ✅ Abgeschlossen

HR kann Austrittsvorgänge digital erfassen, Abteilungen per Magic Link einbinden, Checklisten abhaken und den Fortschritt tracken.

**Scope:**
- [x] Prisma-Schema (8 Modelle, 4 Enums, 3 bestehende Modelle erweitert)
- [x] CRUD-API: 14 Route-Dateien, ~25 Endpunkte
- [x] Dashboard-Tab "Offboarding" (Tabelle, Filter, Status-Kacheln)
- [x] "Neuer Austritt"-Modal mit Validierung
- [x] Detail-Ansicht (7 Tabs: Übersicht, Checkliste, Rückgaben, Dokumente, Notizen, Exit-Interview, Zeugnis)
- [x] Automatische Checklisten (Template-basiert je Einrichtungstyp)
- [x] Abteilungs-Magic-Links + öffentliche Aufgaben-Seite
- [x] Rückgabe-Tracking, Dokumenten-Upload, Notizen-System
- [x] Status-Workflow (6 Status mit validierten Übergängen)
- [x] n8n-Workflows (2 JSON-Dateien vorbereitet)
- [x] Abteilungs-Fortschritt in der Übersicht sichtbar
- [x] Magic-Link-URLs kopierbar (inline Copy-Button)
- [x] Fehler-Feedback (Error-Banner statt stille catch-Blöcke)
- [x] ARIA, Focus-Trap, htmlFor (Accessibility)
- [x] Click-Outside-Handler für Dropdowns

### Phase 2: Exit-Interview + Zeugnis ✅ Abgeschlossen

Exit-Survey per Magic Link (26 Fragen, konfigurierbar) + Zeugnis-Workflow (5 Berufsgruppen, Schulnoten, konfigurierbar).

**Scope:**
- [x] Prisma-Schema (12 neue Modelle, 6 neue Enums)
- [x] Exit-Interview Template (admin-konfigurierbar): Kategorien, Fragen, Fragetypen, Rollenfilter
- [x] Zeugnis-Bewertung Templates (admin-konfigurierbar): 5 Berufsgruppen, Kategorien, Kriterien, Gewichtungen, Formulierungen
- [x] Template-APIs: CRUD für Exit-Interview + Zeugnis (8 Endpunkte)
- [x] Process-APIs: Erstellen, Senden, Reminder, HR-Review (10 Endpunkte)
- [x] Magic-Link-APIs: Öffentlich, Token-validiert, Rate-Limited (8 Endpunkte)
- [x] Magic-Link-Seite Exit-Interview: Multi-Step-Survey (DSGVO-Consent, 5-Sterne, eNPS, Freitext, Multiple Choice)
- [x] Magic-Link-Seite Zeugnis: Schulnoten 1-6 pro Kriterium, gewichteter Durchschnitt, Auto-Save
- [x] Detail-Integration: 2 neue Tabs (Exit-Interview + Zeugnis) mit Status, Copy-Button, Antwort-Anzeige
- [x] HR kann Zeugnis-Bewertungen einsehen (Noten pro Kriterium, Kategorie-Durchschnitte, HR-Override)
- [x] Admin-Seite "Exit-Interview Vorlagen" (Kategorien, Fragen, Typen, Optionen bearbeiten)
- [x] Admin-Seite "Zeugnis-Vorlagen" (5 Tabs je Berufsgruppe, Kriterien, Gewichtungen, Formulierungen)
- [x] Navigation: 3 Hauptmenüpunkte mit Dropdowns (Dashboard, Vorlagen, Verwaltung)
- [x] Seed: Standard Exit-Interview (9 Kategorien, 26 Fragen) + 5 Zeugnis-Bögen
- [x] Umlaute korrigiert, CREDO-Farben konsistent, Touch-Targets optimiert

### Phase 3: LOGA + Stammdaten + Rollen (geplant)
- Employee-Modell, LOGA-Sync via n8n, auslaufende Verträge, Einrichtungsleitungs-Rolle

### Phase 4: DSGVO + Alumni + Polish (geplant)
- Löschlogik, Alumni-Grundfunktion, UX-Feinschliff

---

## Datenmodell-Überblick

### Phase 1 Modelle
```
OffboardingProcess (Kern-Vorgang)
├── OffboardingExitData (1:1 — Finanzielle Daten, Zeugnis-Status)
├── OffboardingChecklistItem (1:n — Aufgaben mit Abteilungs-Zuweisung)
├── ReturnItem (1:n — Rückgabe-Tracking)
├── OffboardingDocument (1:n — Datei-Upload)
├── OffboardingNote (1:n — Interne Notizen)
├── OffboardingDepartmentLink (1:n — Magic Links pro Abteilung)
├── ExitInterview (1:1 — Phase 2)
└── ZeugnisBewertung (1:1 — Phase 2)

DepartmentConfig (Funktions-E-Mails pro Abteilung)
```

### Phase 2 Modelle
```
Exit-Interview (Template-basiert, admin-konfigurierbar):
ExitInterviewTemplate
├── ExitInterviewTemplateCategory (1:n)
│   └── ExitInterviewTemplateQuestion (1:n)
ExitInterview (1:1 zum Offboarding, mit Template-Snapshot)
└── ExitInterviewResponse (1:n — eine pro Frage)

Zeugnis-Bewertung (Template-basiert, admin-konfigurierbar):
ZeugnisBewertungTemplate
├── ZeugnisBewertungTemplateCategory (1:n)
│   └── ZeugnisBewertungTemplateCriterion (1:n)
├── ZeugnisFormulierung (1:n — Note → Zeugnistext)
ZeugnisBewertung (1:1 zum Offboarding, mit Template-Snapshot)
└── ZeugnisBewertungRating (1:n — eine pro Kriterium)
```

---

## Status-Flow Offboarding

```
ERFASST → KÜNDIGUNGSFRIST → ÜBERGABE → ENDABRECHNUNG → ABGESCHLOSSEN
                                              |
                                          ABGEBROCHEN
```

## Exit-Interview Flow

```
Exit-Interview erstellt (SCHEDULED)
    ↓ 7 Tage nach letztem Arbeitstag
Magic Link versendet (INVITED)
    ↓ Mitarbeiter öffnet Link
Fragebogen in Bearbeitung (IN_PROGRESS)
    ↓ Mitarbeiter submittet
Abgeschlossen (SUBMITTED) → HR sieht Antworten
    oder: Token abgelaufen (EXPIRED)
```

## Zeugnis-Bewertung Flow

```
HR erstellt Bewertung + wählt Berufsgruppe (INVITED)
    ↓ Magic Link an Vorgesetzten
Vorgesetzter benotet (IN_PROGRESS)
    ↓ Alle Kriterien bewertet + Submit
Eingereicht (SUBMITTED)
    ↓ HR prüft, passt ggf. Noten an
HR-Prüfung (HR_REVIEW) → Finalisiert (FINALIZED)
```

---

## API-Endpunkte (Gesamt: ~50 Endpunkte)

### Phase 1 (24 Endpunkte)
| Pfad | Beschreibung |
|---|---|
| `/api/offboarding` | GET/POST — Vorgänge auflisten/anlegen |
| `/api/offboarding/[id]` | GET/PATCH — Einzelvorgang laden/aktualisieren |
| `/api/offboarding/[id]/checklist` | GET — Checkliste laden |
| `/api/offboarding/[id]/checklist/[itemId]` | PATCH — Item abhaken |
| `/api/offboarding/[id]/return-items` | GET/POST/PATCH — Rückgaben |
| `/api/offboarding/[id]/documents` | GET/POST — Dokumente |
| `/api/offboarding/[id]/documents/[docId]` | GET — Download |
| `/api/offboarding/[id]/notes` | GET/POST — Notizen |
| `/api/offboarding/[id]/notes/[noteId]` | PATCH/DELETE — Notiz bearbeiten/löschen |
| `/api/offboarding/[id]/department-links` | GET/POST — Abteilungs-Links |
| `/api/offboarding-tasks/[token]` | GET/PATCH — Öffentliche Aufgaben-Seite |
| `/api/settings/departments` | GET/POST/PATCH/DELETE — Abteilungen verwalten |

### Phase 2 — Exit-Interview (~10 Endpunkte)
| Pfad | Auth | Beschreibung |
|---|---|---|
| `/api/exit-interview-templates` | Session | GET/POST — Templates verwalten |
| `/api/exit-interview-templates/[id]` | Session | GET/PUT/DELETE — Template CRUD |
| `/api/offboarding/[id]/exit-interview` | Session | GET/POST — Interview erstellen/laden |
| `/api/offboarding/[id]/exit-interview/send` | Session | POST — Link sofort senden |
| `/api/exit-interview/[token]` | Öffentlich | GET/PUT — Fragebogen laden/Antworten speichern |
| `/api/exit-interview/[token]/submit` | Öffentlich | POST — Fragebogen abschließen |

### Phase 2 — Zeugnis-Bewertung (~10 Endpunkte)
| Pfad | Auth | Beschreibung |
|---|---|---|
| `/api/zeugnis-templates` | Session | GET/POST — Templates verwalten |
| `/api/zeugnis-templates/[id]` | Session | GET/PUT/DELETE — Template CRUD |
| `/api/offboarding/[id]/zeugnis-bewertung` | Session | GET/POST — Bewertung erstellen/laden |
| `/api/offboarding/[id]/zeugnis-bewertung/hr-review` | Session | PUT — HR-Review + Finalisierung |
| `/api/zeugnis-bewertung/[token]` | Öffentlich | GET/PUT — Bewertung laden/Noten speichern |
| `/api/zeugnis-bewertung/[token]/submit` | Öffentlich | POST — Bewertung einreichen |

---

## UI-Seiten

### Portal (authentifiziert)
| Seite | Pfad | Beschreibung |
|---|---|---|
| Dashboard | `/dashboard` | Onboarding/Offboarding-Tabs, Status-Kacheln, Tabelle |
| Offboarding-Detail | `/dashboard/offboarding/[id]` | 7 Tabs: Übersicht, Checkliste, Rückgaben, Dokumente, Notizen, Exit-Interview, Zeugnis |
| Exit-Interview Vorlagen | `/exit-interview-vorlagen` | Fragebogen-Kategorien und Fragen konfigurieren |
| Zeugnis-Vorlagen | `/zeugnis-vorlagen` | Bewertungsbögen pro Berufsgruppe konfigurieren |
| Benutzer | `/benutzerverwaltung` | HR-Benutzer verwalten |
| Mandanten | `/mandanten` | Einrichtungen verwalten |
| Einstellungen | `/einstellungen` | Webhooks, E-Mail-Templates, SMTP |

### Öffentlich (Magic Link)
| Seite | Pfad | Beschreibung |
|---|---|---|
| Abteilungs-Aufgaben | `/offboarding-tasks/[token]` | Abteilung hakt Aufgaben ab |
| Exit-Interview | `/exit-interview/[token]` | Multi-Step-Fragebogen für Ex-Mitarbeiter |
| Zeugnis-Bewertung | `/zeugnis-bewertung/[token]` | Schulnoten-Bewertung durch Vorgesetzte |

---

## Navigation

```
┌─────────────────────────────────────────────────────────┐
│ CREDO  HR-Portal    Dashboard   Vorlagen ▾  Verwaltung ▾│
│                                                         │
│                     Vorlagen:        Verwaltung:         │
│                     ├ Formulare      ├ Benutzer          │
│                     ├ Checklisten    ├ Mandanten          │
│                     ├ Exit-Interview └ Einstellungen      │
│                     └ Zeugnis-Bewertung                   │
└─────────────────────────────────────────────────────────┘
```

---

## Webhook-Events

### Phase 1
| Event | Auslöser |
|---|---|
| `offboarding-created` | Vorgang angelegt |
| `offboarding-department-assigned` | Magic Link an Abteilung |
| `offboarding-task-completed` | Abteilung hakt Aufgabe ab |
| `offboarding-department-completed` | Alle Aufgaben einer Abteilung erledigt |
| `offboarding-task-overdue` | Aufgabe überfällig |
| `offboarding-reminder` | Reminder an Abteilung |
| `offboarding-completed` | Gesamter Vorgang abgeschlossen |

### Phase 2 (vorbereitet)
| Event | Auslöser |
|---|---|
| `exit-interview-invited` | Fragebogen-Link versendet |
| `exit-interview-submitted` | Fragebogen ausgefüllt |
| `zeugnis-bewertung-invited` | Bewertungslink versendet |
| `zeugnis-bewertung-submitted` | Bewertung eingereicht |

---

## Dev-Umgebung

**Starten:**
```bash
cd HR_Portal_CREDO
docker start credo-hr-db-dev
npx next dev -p 3000
```

**Login:** `dimitri@credo-gruppe.de` / `Test1234!Admin`

**Env-Variablen:** In `.env` konfiguriert (DB, JWT, Verschlüsselung, Cron)

**DB:** PostgreSQL via Docker (Port 5433)

**Seed:** `npx prisma db seed` — Erstellt:
- 16 Mandanten
- Admin-User
- 5 Formularvorlagen
- 2 Onboarding-Checklisten + 4 Offboarding-Checklisten
- 4 Abteilungs-Defaults
- 1 Standard Exit-Interview-Template (9 Kategorien, 26 Fragen)
- 5 Zeugnis-Bewertungsbögen (Lehrkraft, Erzieher/in, Verwaltung, Schulleitung, Sonstiges)

---

## Nächste Schritte

1. **n8n-Workflows importieren** — E-Mail-Versand für Magic Links, Reminder, Benachrichtigungen (`https://n8n.fes-minden.de/`)
2. **Phase 3:** LOGA-Integration, Stammdaten-Sync, Einrichtungsleitungs-Rolle
3. **Phase 4:** DSGVO-Löschlogik, Alumni, UX-Feinschliff
