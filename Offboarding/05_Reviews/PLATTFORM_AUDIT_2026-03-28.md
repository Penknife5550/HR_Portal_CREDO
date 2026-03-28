# HR-Portal CREDO — Kritischer Plattform-Audit

**Datum:** 2026-03-28
**Ziel:** Bewertung der Plattform-Reife für Ausbau (Verbeamtung, Vertragsänderung, weitere HR-Prozesse)
**Methode:** 3 parallele Audit-Agenten (Architektur, Code-Qualität, UX/Features)

---

## Executive Summary

| Bereich | Score | Bewertung |
|---------|-------|-----------|
| Kern-Workflow (Offboarding) | 9/10 | Exzellent — vollständiger Lebenszyklus |
| Code-Qualität & TypeScript | 8/10 | Sehr gut — strikte Typisierung, gute Patterns |
| Sicherheit | 8/10 | Gut — AES-256, CSP, Rate Limiting, JWT |
| Architektur & Skalierbarkeit | 5/10 | Problematisch — zu viel Duplizierung, keine Abstraktion |
| Testing | 0/10 | Nicht vorhanden — kein einziger Test |
| Reporting & Analytics | 0/10 | Nicht vorhanden — keine Auswertungen |
| Bulk-Operationen | 0/10 | Nicht vorhanden — alles einzeln |
| Export/Print | 0/10 | Nicht vorhanden — kein CSV, PDF |
| Mobile/Tablet | 3/10 | Mangelhaft — Desktop-fokussiert |
| **Gesamtbewertung** | **5.5/10** | **Proof of Concept — solider Kern, fehlende Enterprise-Features** |

**Verdict:** Der Kern-Workflow funktioniert hervorragend. Aber für den Ausbau zu einer echten HR-Plattform fehlen Enterprise-Features (Reporting, Export, Bulk-Ops) und die Architektur muss vor dem nächsten Prozess refactored werden.

---

## 1. Was hervorragend funktioniert

### Workflow-Engine
- Vollständiger Offboarding-Lebenszyklus (6 Status mit validierten Übergängen)
- 7 integrierte Tabs (Übersicht, Checkliste, Rückgaben, Dokumente, Notizen, Exit-Interview, Zeugnis)
- Template-Snapshot-Pattern (Vorlage wird bei Erstellung eingefroren — genial für Konsistenz)
- Magic-Link-System für Abteilungen, Ex-Mitarbeiter und Vorgesetzte

### Sicherheit
- AES-256-GCM Verschlüsselung für IBAN, SV-Nr, Abfindung
- CSP-Headers, X-Frame-Options, HSTS via Middleware
- JWT mit 7-Tage-Expiry, sichere Cookie-Flags
- Rate Limiting auf Login und öffentliche Endpunkte
- Magic-Link-Tokens: UUID v4, Ablaufdatum, Tracking

### Code-Patterns (Best Practices)
- Webhook-System: DB-gesteuert, SMTP-Fallback, konfigurierbare Auth-Methoden
- Verschlüsselung: Lazy-loaded Key, Backward-Kompatibilität
- Prisma-Transaktionen für atomare Multi-Step-Operationen
- Optimistic Updates mit Rollback (Magic-Link-Seiten)
- TypeScript strict: 0 `any`-Types, 0 `@ts-ignore`

### Konfigurierbarkeit
- Exit-Interview-Vorlagen admin-editierbar (Kategorien, Fragen, Fragetypen, Rollenfilter)
- Zeugnis-Bewertungsbögen admin-editierbar (5 Berufsgruppen, Gewichtungen, Formulierungen)
- Checklisten-Templates pro Einrichtungstyp

---

## 2. Kritische Probleme

### 2.1 Code-Duplizierung (~40-50%)

**Problem:** Onboarding und Offboarding sind fast identische Kopien statt Abstraktionen.

| Komponente | Onboarding | Offboarding | Duplizierung |
|---|---|---|---|
| Dashboard | 601 Zeilen | 518 Zeilen | ~80% identisch |
| API (GET/POST) | 307 Zeilen | 357 Zeilen | ~60% identisch |
| Detail-Ansicht | 1.772 Zeilen | 2.692 Zeilen | ~40% identisch |
| Checklisten-Modell | ChecklistItem | OffboardingChecklistItem | Identische Felder |
| Dokumente | Document | OffboardingDocument | Identische Felder |

**Auswirkung:** Jeder neue Prozess (Verbeamtung, Vertragsänderung) erzeugt 1.000+ Zeilen Kopie.

**Lösung:** Generisches `HRProcess`-Modell + `ProcessDashboard<T>`-Komponente extrahieren.
**Aufwand:** 5-7 Tage

### 2.2 Keine Tests

```
Testdateien gefunden: 0
Test-Framework installiert: Nein
CI/CD-Pipeline: Nicht vorhanden
```

**Auswirkung:** Jede Änderung ist ein Risiko. Refactoring ohne Tests ist gefährlich.

**Lösung:** Jest + React Testing Library, kritische API-Pfade zuerst testen.
**Aufwand:** 3-5 Tage Setup + fortlaufend

### 2.3 Keine Reporting/Analytics

HR kann aktuell **keine einzige Auswertung** erstellen:
- Keine Trend-Analyse (steigen Austritte?)
- Keine Abteilungs-Performance (welche Abteilung ist langsam?)
- Keine Exit-Interview-Auswertung (aggregierte Zufriedenheit)
- Keine Compliance-Übersicht (SV-Abmeldungen, Zeugnisse)
- Kein Export (CSV, PDF)

**Auswirkung:** HR verbringt 50% der Zeit mit manuellen Workarounds statt HR-Arbeit.

### 2.4 Keine Bulk-Operationen

Alles ist Einzelklick:
- 5 Exit-Interviews erstellen = 5x klicken
- 10 Reminder senden = 10x klicken
- 3 Rückgaben bestätigen = 3x klicken

Bei 16 Einrichtungen multipliziert sich das.

### 2.5 Riesige Komponenten

| Datei | Zeilen | Empfehlung |
|---|---|---|
| offboarding-detail-content.tsx | 2.692 | In 7 Tab-Komponenten aufteilen |
| detail-content.tsx (Onboarding) | 1.772 | In Feature-Module aufteilen |
| einstellungen-content.tsx | 1.398 | In Sektionen aufteilen |
| exit-interview-vorlagen-content.tsx | 1.065 | Modal/Forms extrahieren |

Dateien über 500 Zeilen sind schwer zu warten und zu testen.

---

## 3. Architektur-Empfehlungen für Plattform-Ausbau

### 3.1 Generisches Prozess-Modell (MUSS VOR VERBEAMTUNG)

**Aktuell:**
```
OnboardingProcess ──┐
                    ├── Keine gemeinsame Basis
OffboardingProcess ─┘
```

**Ziel:**
```
HRProcess (abstrakt)
├── Onboarding (extends HRProcess)
├── Offboarding (extends HRProcess)
├── Verbeamtung (extends HRProcess)
├── Vertragsänderung (extends HRProcess)
└── Kündigung (extends HRProcess)
```

**Gemeinsame Features:**
- displayId, organizationId, status, initiatedBy
- Checklisten, Dokumente, Notizen, Audit-Log
- Magic Links, Webhooks
- Dashboard-Tabelle mit Filtern

**Aufwand:** 5 Tage

### 3.2 Rollen- und Berechtigungssystem

**Aktuell:** 3 hardcodierte Rollen (SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER)

**Benötigt für Ausbau:**
- Einrichtungsleitung (sieht nur eigene Einrichtung)
- Vorgesetzte (bewertet Mitarbeiter)
- Org-scoped Rollen (HR-Leitung Gymnasium ≠ HR-Leitung Kita)
- Feingranulare Berechtigungen (kann_exportieren, kann_zeugnis_finalisieren)

**Lösung:** Datenbank-basiertes Berechtigungssystem:
```
UserRole(userId, role, organizationId)
RolePermission(role, resource, action)
```

**Aufwand:** 3-4 Tage

### 3.3 State Management

**Aktuell:** Reines `useState` + `fetch` — kein Caching, keine Deduplizierung.

**Problem bei 5+ Prozessen:**
- Jede Seite fetcht unabhängig → doppelte API-Calls
- Kein optimistischer Cache → Latenz sichtbar
- Race Conditions bei schnellen Filter-Wechseln

**Lösung:** TanStack Query (React Query) einführen.
**Aufwand:** 2-3 Tage

---

## 4. Feature-Roadmap (Empfehlung)

### Sprint 1: Fundament stärken (2 Wochen)
| # | Feature | Aufwand | Priorität |
|---|---------|---------|-----------|
| 1 | Generisches Process-Modell extrahieren | 5 Tage | KRITISCH |
| 2 | Test-Infrastruktur aufsetzen (Jest) | 2 Tage | KRITISCH |
| 3 | Große Komponenten aufteilen | 3 Tage | WICHTIG |
| 4 | API-Validierung mit Zod | 2 Tage | WICHTIG |

### Sprint 2: Enterprise-Features (2 Wochen)
| # | Feature | Aufwand | Priorität |
|---|---------|---------|-----------|
| 5 | CSV-Export für alle Prozesse | 2 Tage | HOCH |
| 6 | Erweiterte Filter (Datum, Multi-Org, Typ) | 2 Tage | HOCH |
| 7 | Audit-Log-Viewer im Portal | 2 Tage | HOCH |
| 8 | Bulk-Operationen (Reminder, Status) | 3 Tage | HOCH |
| 9 | Überfällig-Warnungen (rote Badges) | 1 Tag | MITTEL |

### Sprint 3: Analytics & Reporting (2 Wochen)
| # | Feature | Aufwand | Priorität |
|---|---------|---------|-----------|
| 10 | Exit-Interview Aggregation (Rule of 5) | 3 Tage | HOCH |
| 11 | Dashboard-KPIs (Durchlaufzeit, Completion) | 2 Tage | HOCH |
| 12 | Abteilungs-Performance-Übersicht | 2 Tage | MITTEL |
| 13 | PDF-Report-Generator | 3 Tage | MITTEL |

### Sprint 4: Neuer Prozess — Verbeamtung (2 Wochen)
| # | Feature | Aufwand | Priorität |
|---|---------|---------|-----------|
| 14 | Verbeamtungs-Prozess (nutzt generisches Modell) | 3 Tage | HOCH |
| 15 | Spezifische Checkliste + Dokumente | 2 Tage | HOCH |
| 16 | Rollen-Erweiterung (Einrichtungsleitung) | 3 Tage | HOCH |
| 17 | n8n-Workflows live schalten | 2 Tage | HOCH |

---

## 5. Offene Fragen an Dimitri

### Prozess-Fragen
1. **Verbeamtung:** Welche Schritte hat der Verbeamtungsprozess? Welche Dokumente werden benötigt? Wer ist beteiligt (Bezirksregierung, Schulamt)?
2. **Vertragsänderung:** Wann passiert das typisch? Welche Felder ändern sich (Gehalt, Stunden, Einrichtung)?
3. **Prozess-Verknüpfung:** Soll ein Mitarbeiter von Onboarding → Verbeamtung → Vertragsänderung → Offboarding durchlaufen können mit durchgängiger Akte?

### Rollen-Fragen
4. **Einrichtungsleitung:** Welche Rechte genau? Nur lesen? Eigene Checklisten abhaken? Vorgesetzte für Zeugnis?
5. **Datentrennung:** Darf die Leitung Gymnasium die KiTa-Daten sehen? Oder strikt getrennt?
6. **Externe Beteiligte:** Gibt es weitere Rollen? Betriebsrat? Personalrat? Bezirksregierung?

### Reporting-Fragen
7. **Welche Reports** braucht ihr am dringendsten? Monatliche Übersicht? Compliance-Check? Für wen (Vorstand, Geschäftsführung)?
8. **LOGA-Export:** In welchem Format braucht LOGA die Daten? CSV mit welchen Feldern?

### Betrieb-Fragen
9. **Deployment:** Wo soll das Portal laufen? Eigener Server? Cloud? Docker?
10. **Nutzeranzahl:** Wie viele HR-Mitarbeiter arbeiten gleichzeitig im Portal?
11. **Backup-Strategie:** Wie werden DB-Backups gemacht?

### Prioritäten
12. **Was brennt am meisten?** Analytics? Export? Verbeamtung? n8n-Mails?
13. **Go-Live-Datum:** Wann soll das Offboarding-Modul produktiv sein?

---

## 6. Technische Kennzahlen

| Metrik | Wert |
|---|---|
| Gesamte Codezeilen (src/) | ~35.000 |
| TypeScript/TSX-Dateien | 126 |
| API-Endpunkte | ~50 |
| Prisma-Modelle | 34 |
| Prisma-Enums | 16 |
| Client-Komponenten ("use client") | 38 |
| Test-Dateien | 0 |
| `any`-Types | 0 |
| Größte Datei | 2.692 Zeilen (offboarding-detail) |
| Seed-Daten | 16 Mandanten, 26 Exit-Fragen, 5 Zeugnis-Bögen |

---

## 7. Fazit

Das CREDO HR-Portal hat einen **exzellenten Kern** — der Offboarding-Workflow, die Magic-Link-Integration und das Template-System sind produktionsreif. Die Sicherheitsarchitektur ist solide.

**Aber:** Die Plattform ist aktuell ein **Proof of Concept**, kein Enterprise-System. Für den Ausbau zu einer echten Multi-Prozess-HR-Plattform (Verbeamtung, Vertragsänderung, etc.) braucht es:

1. **Architektur-Refactoring** — Generisches Prozess-Modell statt Copy-Paste
2. **Enterprise-Features** — Export, Reporting, Bulk-Ops, Audit-Trail
3. **Testing** — Mindestens kritische Pfade testen
4. **Rollen-System** — Datenbank-basiert statt hardcodiert

**Empfehlung:** 4-6 Wochen Konsolidierung vor dem nächsten Prozess. Dann kann jeder weitere Prozess in 1-2 Wochen statt 4-6 Wochen gebaut werden.

**Das Ding kann richtig groß werden — wenn wir das Fundament jetzt richtig machen.**
