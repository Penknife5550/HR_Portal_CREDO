# HR-Portal — Masterplan: Vom PoC zur verkaufsfähigen Plattform

**Erstellt:** 2026-03-28
**Ziel:** Multi-Mandanten HR-Plattform, Docker-deployed, verkaufsfähig an andere Bildungsträger und Organisationen
**Aktueller Stand:** Phase 1+2 Offboarding implementiert (Proof of Concept)

---

## Vision

Ein **modulares HR-Portal** das jede Organisation (nicht nur CREDO) nutzen kann:
- Eigenes Branding (Logo, Farben)
- Eigene Prozesse aktivieren/deaktivieren
- Eigene Vorlagen, Checklisten, Fragebögen
- Docker-Container → einfaches Deployment beim Kunden
- Mandantenfähig (ein Portal für mehrere Gesellschaften/Einrichtungen)

---

## Konsolidierungs-Sprints

### Sprint 1: Aufräumen & Absichern (1 Woche)

| # | Aufgabe | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 1.1 | Große Dateien aufteilen | offboarding-detail (2.692 Z.) → 7 Tab-Komponenten, detail-content (1.772 Z.) → Module | 3 Tage |
| 1.2 | Test-Infrastruktur | Jest + React Testing Library einrichten, kritische API-Pfade testen (Login, Vorgang erstellen, Checkliste, Magic Links) | 2 Tage |
| 1.3 | API-Validierung | Zod-Schemas für alle POST/PATCH-Endpunkte, Fehler mit Feldnamen zurückgeben | 2 Tage |
| 1.4 | API-Middleware | Auth-Check, Error-Handling, Rate-Limiting zentral statt in jeder Route einzeln | 1 Tag |

**Ergebnis:** Saubere Codebasis, Tests sichern Änderungen ab.

---

### Sprint 2: Baukasten — Generisches Prozess-System (1-2 Wochen)

| # | Aufgabe | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 2.1 | Generisches Prozess-Modell | Gemeinsame Basis für alle HR-Prozesse (Onboarding, Offboarding, Verbeamtung, etc.) — ein Modell, ein Dashboard, eine API | 5 Tage |
| 2.2 | Generische Dashboard-Komponente | `ProcessDashboard<T>` — Tabelle, Filter, Status-Kacheln, Suche — einmal gebaut, für jeden Prozess nutzbar | 3 Tage |
| 2.3 | Gemeinsame Module | Checklisten, Dokumente, Notizen, Audit-Log als wiederverwendbare Module statt Kopien | 2 Tage |
| 2.4 | Rollen- & Berechtigungssystem | Datenbank-basiert statt hardcodiert. Org-scoped Rollen (Einrichtungsleitung sieht nur eigene Daten) | 3 Tage |

**Ergebnis:** Neuer Prozess = Konfiguration statt Programmierung.

---

### Sprint 3: Enterprise-Features (1-2 Wochen)

| # | Aufgabe | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 3.1 | CSV/Excel-Export | Alle Prozesse, Filter, Felder exportierbar. Für LOGA-Import und Compliance-Audits | 2 Tage |
| 3.2 | Erweiterte Filter | Datumsbereich, Multi-Org, Prozesstyp, Überfällige, Abteilung | 2 Tage |
| 3.3 | Überfällig-Warnungen | Rote Badges, Ampel-System, optionale E-Mail-Benachrichtigung | 1 Tag |
| 3.4 | Audit-Log-Viewer | Wer hat was wann geändert — sichtbar im Portal, filterbar | 2 Tage |
| 3.5 | Sammelaktionen | Mehrere Vorgänge auswählen → Bulk-Reminder, Bulk-Status-Änderung | 2 Tage |
| 3.6 | Exit-Interview Analytics | Aggregierte Auswertung (Rule of 5), Trends über Zeit, eNPS-Score | 3 Tage |

**Ergebnis:** HR arbeitet effizient statt einzeln zu klicken.

---

### Sprint 4: Docker & Multi-Tenant für Verkauf (1 Woche)

| # | Aufgabe | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 4.1 | Docker-Compose Production | Next.js + PostgreSQL + n8n in einem `docker-compose.yml`, mit Volumes, Health-Checks, Auto-Restart | 2 Tage |
| 4.2 | Konfigurierbares Branding | Logo, Farben, Firmenname, Claim über Umgebungsvariablen oder Admin-UI einstellbar — nicht hardcoded CREDO | 2 Tage |
| 4.3 | Onboarding-Wizard für neue Kunden | Erster Start: Admin-Account erstellen, Organisation anlegen, Branding setzen, Seed-Daten wählen | 2 Tage |
| 4.4 | Deployment-Dokumentation | Installationsanleitung, Systemanforderungen, Backup-Strategie, Update-Prozess | 1 Tag |
| 4.5 | Lizenz & Datenschutz | Lizenzbedingungen klären, DSGVO-Dokumentation, Auftragsverarbeitungsvertrag-Template | 1 Tag |

**Ergebnis:** `docker-compose up` → HR-Portal läuft beim Kunden.

---

### Sprint 5+: Neue Prozesse (je 1-2 Wochen pro Prozess)

| Prozess | Beschreibung | Priorität |
|---------|-------------|-----------|
| Verbeamtung | Spezifischer Workflow für Beamten-Einstellung (Bezirksregierung, Gesundheitsprüfung, Vereidigung) | HOCH |
| Vertragsänderung | Gehalt, Stunden, Einrichtungswechsel, Befristungsverlängerung | MITTEL |
| Jahresgespräch | Jährliche Mitarbeiter-Bewertung mit Zielvereinbarung | MITTEL |
| Fortbildungsverwaltung | Kurse, Zertifikate, Pflichtfortbildungen (Masern, Erste Hilfe) | NIEDRIG |

---

## Offene Fragen — Bitte beantworten vor Sprint-Start

### A. Produkt & Verkauf

| # | Frage | Warum wichtig |
|---|-------|---------------|
| A1 | **Zielgruppe:** Nur Bildungsträger oder auch andere Branchen (Sozialwirtschaft, Kirche, Mittelstand)? | Bestimmt wie branchenspezifisch vs. generisch wir bauen |
| A2 | **Preismodell:** Pro Einrichtung? Pro Mitarbeiter? Einmal-Lizenz oder SaaS (monatlich)? | Beeinflusst Multi-Tenant-Architektur |
| A3 | **Hosting:** Jeder Kunde eigener Docker? Oder zentrales SaaS wo alle drauf sind? | Komplett andere Architektur |
| A4 | **Branding:** Reicht Logo+Farben per Umgebungsvariable oder soll jeder Kunde alles im Admin-Bereich selbst einstellen können? | Aufwand für UI-Theming |
| A5 | **Firmenname:** Wie soll das Produkt heißen? "CREDO HR-Portal" ist zu spezifisch für den Verkauf | Marketing, Domain, Branding |

### B. Prozesse & Workflows

| # | Frage | Warum wichtig |
|---|-------|---------------|
| B1 | **Verbeamtung:** Welche Schritte hat der Prozess? Welche Dokumente? Wer ist beteiligt (Bezirksregierung, Schulamt, Amtsarzt)? | Schema-Design |
| B2 | **Vertragsänderung:** Wann passiert das? Welche Felder ändern sich? Braucht es eine Genehmigungskette? | Workflow-Design |
| B3 | **Prozess-Verknüpfung:** Soll ein Mitarbeiter eine durchgängige Akte haben? (Einstellung → Verbeamtung → Vertragsänderung → Austritt) | Datenmodell-Entscheidung |
| B4 | **Vorgesetzten-Rolle:** Was darf der Vorgesetzte genau? Nur Zeugnis bewerten? Auch Checklisten abhaken? Eigene Vorgänge sehen? | Berechtigungssystem |
| B5 | **Einrichtungsleitung:** Welche Rechte? Nur eigene Einrichtung sehen? Eigene Vorgänge starten? Oder nur lesen? | Berechtigungssystem |

### C. Daten & Compliance

| # | Frage | Warum wichtig |
|---|-------|---------------|
| C1 | **Datentrennung:** Darf Gymnasium-Leitung KiTa-Daten sehen? Strikt getrennt oder alles sichtbar für HR? | Row-Level Security |
| C2 | **LOGA-Export:** In welchem Format? CSV mit welchen Feldern? Automatisch oder manuell? | Export-Entwicklung |
| C3 | **Aufbewahrungsfristen:** Wie lange müssen Offboarding-Daten aufbewahrt werden? 2 Jahre? 10 Jahre? | DSGVO-Löschlogik |
| C4 | **Backup:** Wer macht DB-Backups? Wie oft? Wohin? | Betriebskonzept |

### D. Betrieb & Technik

| # | Frage | Warum wichtig |
|---|-------|---------------|
| D1 | **Server:** Wo soll das Portal laufen? Eigener Server bei CREDO? Cloud (Hetzner, AWS)? Bei helex.it? | Docker-Setup |
| D2 | **Domain:** Welche URL? hr.credo-gruppe.de? hr.fes-minden.de? | DNS, SSL-Zertifikat |
| D3 | **Nutzeranzahl:** Wie viele HR-Mitarbeiter arbeiten gleichzeitig? 2-3? 10+? | Performance-Planung |
| D4 | **E-Mail:** Welcher SMTP-Server für den Versand? Office 365? Eigener Mailserver? | Mailer-Konfiguration |
| D5 | **n8n:** Läuft bereits auf n8n.fes-minden.de — soll das Portal sich dort anbinden oder eigene n8n-Instanz pro Kunde? | Architektur-Entscheidung |

### E. Prioritäten & Timeline

| # | Frage | Warum wichtig |
|---|-------|---------------|
| E1 | **Was brennt am meisten?** Export? Analytics? Verbeamtung? n8n-Mails live schalten? | Sprint-Reihenfolge |
| E2 | **Go-Live Offboarding:** Wann soll das Offboarding-Modul produktiv genutzt werden? | Deadline |
| E3 | **Erster Kunde:** Gibt es bereits einen Interessenten für den Verkauf? Wann? | Priorität Docker/Branding |
| E4 | **Budget/Kapazität:** Wie viel Zeit pro Woche können wir investieren? Vollzeit-Sprints oder nebenbei? | Realistische Planung |

---

## Entscheidungsmatrix (Stand 2026-03-28)

| Entscheidung | Option A | Option B | Gewählt |
|---|---|---|---|
| Hosting-Modell | Self-hosted Docker pro Kunde | Zentrales SaaS | **Self-hosted Docker** |
| Prozess-Architektur | Generisches Modell (Baukasten) | Individuelle Module pro Prozess | **Generisches Modell** |
| Rollen-System | 5 feste Rollen | Frei konfigurierbare Rollen | **Konfigurierbar + Org-scoped** |
| Branding | Env-Variablen (Logo, Farben) | Volle Admin-UI für Theming | **Admin-UI für Branding** |
| Datentrennung | Org-Filter in der App | PostgreSQL Row-Level Security | **Org-Filter (1:n Leiter:Mandant)** |
| Mitarbeiter-Akte | Durchgängig (ein Employee-Record) | Pro Prozess getrennt | **Durchgängig, Prozesse verknüpft** |
| Erster neuer Prozess | Verbeamtung | Vertragsänderung | **Verbeamtung (PSI)** |

---

## Beantwortete Fragen (2026-03-28)

### A. Produkt & Verkauf
| # | Frage | Antwort |
|---|-------|---------|
| A1 | Zielgruppe | Bildungsträger + Soziale Dienste (Schulen, Kitas, GmbHs, Pflege) |
| A2 | Preismodell | Einmalige Lizenzgebühr |
| A3 | Hosting | Self-hosted Docker pro Kunde |
| A4 | Branding | Logo + Farben im Admin-Bereich änderbar. CI CREDO als Default |
| A5 | Produktname | **HR-Portal** (neutral, nicht CREDO-spezifisch) |

### B. Prozesse & Workflows
| # | Frage | Antwort |
|---|-------|---------|
| B1 | Verbeamtung | Detaillierter 5-Phasen-Plan liegt vor (PLAN_VERBEAMTUNG.html): Antrag → Verwaltung → Personaladmin → Probezeit (3 Jahre) → Übernahme auf Lebenszeit. 40+ Checklisten-Punkte, 3 Pflichtbeurteilungen, Amtsarzt, Betriebsrat, LOGA-Umstellung |
| B3 | Durchgängige Akte | Ja — ein Employee-Record, Prozesse getrennt dargestellt aber verknüpft. Stammdaten-Import via n8n (Mandantennr, Personennr, Beginn, Ende). **Besonderheit: Mehrfacheinstellungen** — ein MA kann mehrere Anstellungen haben, erscheint aber nur einmal im Portal |
| B4 | Vorgesetzter | Eigene MA sehen, Checklisten-Bearbeitung einsehen, Ergebnisse sehen. Bewertungen per Magic Link + im Portal sichtbar |
| B5 | Einrichtungsleitung | Darf Vorgänge starten (z.B. Kündigung). Rechte in Einstellungen anpassbar. Sieht nur zugewiesene Mandanten |

### C. Daten & Compliance
| # | Frage | Antwort |
|---|-------|---------|
| C1 | Datentrennung | Strikt — jeder Leiter sieht nur zugewiesene Mandanten. 1 Leiter kann n Mandanten haben (1:n) |
| C2 | LOGA-Format | CSV — genaues Format wird später bereitgestellt |
| C3 | Aufbewahrungsfrist | 10 Jahre nach Austritt |

### D. Technik & Betrieb
| # | Frage | Antwort |
|---|-------|---------|
| D1 | Server | Eigene Server bei CREDO |
| D2 | URL | https://hr.fes-credo.de (bereits live) |
| D3 | Nutzeranzahl | 5-6 gleichzeitig |
| D4 | E-Mail | SMTP + n8n für Webhooks |
| D5 | n8n | Eigene Instanz pro Kunde. CREDO: https://n8n.fes-minden.de |

### E. Timeline & Prioritäten
| # | Frage | Antwort |
|---|-------|---------|
| E1 | Priorität | Export/Analytics → dann Verbeamtung |
| E2 | Go-Live Offboarding | So schnell wie möglich in neuer Struktur |
| E3 | Erster Kunde | Ja, es gibt einen Interessenten |
| E4 | Kapazität | 40 Stunden pro Woche |

---

## Schlüssel-Erkenntnisse für die Architektur

### Employee-Modell (NEUE ANFORDERUNG)
```
Employee (zentrale Personalakte)
├── employeeNumber (Personalnummer)
├── mandantNumber (aus LOGA)
├── firstName, lastName, email
├── organizations[] (1:n — Mehrfacheinstellungen!)
│   ├── organizationId
│   ├── position, startDate, endDate
│   └── contractType, workingHours
├── processes[] (verknüpfte HR-Prozesse)
│   ├── OnboardingProcess
│   ├── OffboardingProcess
│   ├── CivilServiceProcess (Verbeamtung)
│   └── ContractChangeProcess (Vertragsänderung)
└── importedAt, importSource (n8n/LOGA)
```

### Rollen-System (NEUE ANFORDERUNG)
```
UserRole
├── userId
├── role (SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER, EINRICHTUNGSLEITUNG, VORGESETZTER)
├── organizationIds[] (zugewiesene Mandanten, 1:n)
└── permissions[] (konfigurierbar in Einstellungen)
```

### Verbeamtung: 5-Phasen-Engine (aus PLAN_VERBEAMTUNG.html)
```
Phase 1: Antrag & Beurteilung (T-6 Monate)
  → SL startet Vorgang, Magic Link für Beurteilung
Phase 2: Verwaltungsvorgang (T-3 Monate)
  → Automatisch nach positiver Beiratsentscheidung
Phase 3: Personaladministration (umfangreichste Phase)
  → 8 Kategorien, 40+ Checklisten-Punkte
  → Amtsarzt, BR-Anhörung, RV-Befreiung, LOGA-Umstellung
Phase 4: Probezeit (3 Jahre)
  → 3 Pflichtbeurteilungen via Magic Link
  → Automatische Erinnerungen
Phase 5: Übernahme auf Lebenszeit (T-3 Monate vor Ende)
  → Neues Amtsarztzeugnis, Beirat, Vertrag
```

---

## Nächster Schritt

Alle Fragen beantwortet. Sprint 1 kann starten:

1. **Große Dateien aufteilen** (3 Tage)
2. **Test-Infrastruktur** (2 Tage)
3. **API-Validierung mit Zod** (2 Tage)
4. **API-Middleware** (1 Tag)

**Kapazität:** 40h/Woche → Sprint 1 in 1 Woche machbar.
