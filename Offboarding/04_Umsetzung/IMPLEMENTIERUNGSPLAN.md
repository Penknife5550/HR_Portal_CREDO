# Offboarding-Modul: Implementierungsplan

**Erstellt:** 2026-03-27
**Basierend auf:** HR-Experten-Recherche + Advocatus-Diaboli-Analyse
**Ziel:** Offboarding-Workflow fuer das CREDO HR-Portal

---

## 1. Architektur-Entscheidung

### Empfehlung: Eigenes `OffboardingProcess`-Modell

Basierend auf der kritischen Analyse empfehlen wir **gegen** die Erweiterung des bestehenden `OnboardingProcess` und **fuer** ein separates Modell.

**Gruende:**
- `OnboardingProcess` mit `processType: KUENDIGUNG` ist semantisch absurd
- Die Zustandsautomaten sind fundamental verschieden (INVITED/SUBMITTED vs. NOTICE_PERIOD/HANDOVER)
- Keine Nullable-Felder-Hoelle (50+ Spalten, 60% NULL)
- Kein Risiko bestehende Onboarding-Logik zu brechen
- Unterschiedliche DSGVO-Loeschfristen
- Unterschiedliche Zugriffsrechte (Offboarding sensitiver)

**Geteilte Infrastruktur (1:1 wiederverwendbar):**
- Auth-System (JWT + Rollen)
- Checklisten-Mechanik (eigene Templates)
- Dokument-Management (erweiterte DocumentTypes)
- Notizen-System
- Webhook/Email-System (neue Events)
- AuditLog (erweitert um processType)
- Organisation/Mandant-Zuordnung
- Verschluesselung (AES-256-GCM)
- Magic-Link-Mechanik (fuer Abteilungen, Vorgesetzte, Ex-Mitarbeiter)

**Abteilungs-Einbindung per Magic Link (Kern-Feature):**
- Beteiligte Abteilungen (IT, Facility, Buchhaltung, etc.) erhalten per Funktions-E-Mail Magic Links mit ihren Offboarding-Aufgaben
- Funktions-E-Mails werden zentral + pro Einrichtung im Portal gepflegt
- Automatische Reminder (3-stufig: Info, Warnung, Eskalation) via n8n Cron
- HR sieht Gesamtfortschritt aller Abteilungen, Vorgesetzter sieht Uebersicht
- Details siehe: `ABTEILUNGEN_MAGIC_LINKS.md`

---

## 2. Datenmodell

### 2.1 Neue Modelle

```prisma
// ============================================
// OFFBOARDING PROCESS (Kernmodell)
// ============================================
model OffboardingProcess {
  id                String              @id @default(uuid())
  displayId         String?             @unique  // "OFF-2026-GYM-001"

  // Organisation
  organizationId    String
  organization      Organization        @relation(fields: [organizationId], references: [id])

  // Mitarbeiter-Identifikation
  employeeEmail     String
  employeeFirstName String
  employeeLastName  String
  employeePersonalNr String?            // Personalnummer (falls vorhanden)
  onboardingId      String?             // Link zum urspruenglichen Onboarding

  // Austritts-Details
  exitType          ExitType            // Art des Austritts
  exitReason        String?             // Freitext-Begruendung
  noticeDate        DateTime?           // Datum der Kuendigung/Antragstellung
  lastWorkingDay    DateTime            // Letzter Arbeitstag
  contractEndDate   DateTime?           // Vertragsende (kann abweichen)
  noticePeriodEnd   DateTime?           // Ende Kuendigungsfrist

  // Status
  status            OffboardingStatus   @default(INITIATED)

  // Tracking
  initiatedById     String
  initiatedBy       User                @relation("OffboardingInitiator", fields: [initiatedById], references: [id])
  initiatedAt       DateTime            @default(now())
  completedAt       DateTime?

  // Exit-Interview
  exitInterviewDate     DateTime?
  exitInterviewDone     Boolean         @default(false)
  exitInterviewNotes    String?
  exitInterviewToken    String?         @unique  // Magic Link fuer anonymen Fragebogen
  exitInterviewTokenExp DateTime?

  // DSGVO
  dataRetentionDate DateTime?           // Wann Daten geloescht werden muessen
  dataDeletedAt     DateTime?           // Wann tatsaechlich geloescht

  // Relationen
  exitData          OffboardingExitData?
  returnItems       ReturnItem[]
  documents         OffboardingDocument[]
  checklistItems    OffboardingChecklistItem[]
  notes             OffboardingNote[]

  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  @@map("offboarding_processes")
}

// ============================================
// EXIT DATA (Austritts-Details)
// ============================================
model OffboardingExitData {
  id                    String              @id @default(uuid())
  offboardingId         String              @unique
  offboarding           OffboardingProcess  @relation(fields: [offboardingId], references: [id], onDelete: Cascade)

  // Vertragsdaten
  employmentType        EmploymentType      // ANGESTELLT, BEAMTET, MINIJOB, EHRENAMT
  tarifvertrag          String?             // TV-L, TVoeD SuE, Haustarif
  entgeltgruppe         String?

  // Finanzielle Abwicklung
  remainingVacationDays Float?              // Resturlaub in Tagen
  vacationPayout        Boolean?            // Auszahlung oder Abbau?
  overtimeHours         Float?              // Ueberstunden
  overtimePayout        Boolean?            // Auszahlung?
  severancePay          String?             // Abfindung (verschluesselt)
  bonusProRata          Boolean?            // Anteiliger Bonus?
  specialPayments       String?             // Sonderzahlungen

  // Zeugnis
  certificateType       CertificateType?    // EINFACH, QUALIFIZIERT
  certificateStatus     CertificateStatus   @default(PENDING)
  certificateDraftDate  DateTime?
  certificateSentDate   DateTime?

  // Sozialversicherung
  svDeregistrationDate  DateTime?           // SV-Abmeldung
  svDeregistrationDone  Boolean             @default(false)
  healthInsuranceName   String?
  employmentCertDate    DateTime?           // Arbeitsbescheinigung
  employmentCertDone    Boolean             @default(false)

  // Wettbewerb & Sonstiges
  nonCompeteClause      Boolean             @default(false)
  nonCompeteDetails     String?
  outplacementOffered   Boolean             @default(false)

  // Wissenstransfer
  knowledgeTransferPlan Boolean             @default(false)
  successorName         String?
  handoverDocComplete   Boolean             @default(false)

  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  @@map("offboarding_exit_data")
}

// ============================================
// RETURN ITEMS (Rueckgabe-Inventar)
// ============================================
model ReturnItem {
  id              String              @id @default(uuid())
  offboardingId   String
  offboarding     OffboardingProcess  @relation(fields: [offboardingId], references: [id], onDelete: Cascade)

  category        ReturnCategory
  itemName        String              // z.B. "MacBook Pro 14 Zoll"
  serialNumber    String?
  isReturned      Boolean             @default(false)
  returnedAt      DateTime?
  returnedToId    String?             // HR-User der die Rueckgabe bestaetigt
  condition       String?             // Zustand bei Rueckgabe
  notes           String?

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@map("return_items")
}

// ============================================
// OFFBOARDING DOCUMENTS
// ============================================
model OffboardingDocument {
  id              String              @id @default(uuid())
  offboardingId   String
  offboarding     OffboardingProcess  @relation(fields: [offboardingId], references: [id], onDelete: Cascade)

  type            OffboardingDocType
  fileName        String
  filePath        String
  fileSize        Int
  mimeType        String?

  status          DocumentStatus      @default(UPLOADED)

  uploadedAt      DateTime            @default(now())
  uploadedById    String?
  reviewedAt      DateTime?
  reviewedById    String?

  @@map("offboarding_documents")
}

// ============================================
// OFFBOARDING CHECKLIST ITEMS
// ============================================
model OffboardingChecklistItem {
  id              String              @id @default(uuid())
  offboardingId   String
  offboarding     OffboardingProcess  @relation(fields: [offboardingId], references: [id], onDelete: Cascade)

  title           String
  category        String              // Phase 1-6 aus Checkliste
  orderIndex      Int
  isCompleted     Boolean             @default(false)
  completedAt     DateTime?
  completedById   String?
  dueDate         DateTime?
  assignee        String?             // HR, IT, Vorgesetzter
  notes           String?

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@map("offboarding_checklist_items")
}

// ============================================
// OFFBOARDING NOTES
// ============================================
model OffboardingNote {
  id              String              @id @default(uuid())
  offboardingId   String
  offboarding     OffboardingProcess  @relation(fields: [offboardingId], references: [id], onDelete: Cascade)

  content         String
  createdById     String
  createdBy       User                @relation("OffboardingNoteAuthor", fields: [createdById], references: [id])

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@map("offboarding_notes")
}
```

### 2.2 Neue Enums

```prisma
enum OffboardingStatus {
  INITIATED              // HR hat Austritt erfasst
  PENDING_APPROVAL       // Wartet auf Genehmigung
  APPROVED               // Genehmigt
  NOTICE_PERIOD          // In Kuendigungsfrist
  HANDOVER_PHASE         // Uebergabe laeuft
  EXIT_INTERVIEW         // Austrittsgespraech ausstehend
  FINAL_SETTLEMENT       // Endabrechnung / Abmeldungen
  COMPLETED              // Alles erledigt
  CANCELLED              // Austritt zurueckgenommen
}

enum ExitType {
  KUENDIGUNG_ARBEITNEHMER     // Eigenkunedigung
  KUENDIGUNG_ARBEITGEBER      // Arbeitgeberkuendigung
  AUFHEBUNGSVERTRAG           // Einvernehmlich
  BEFRISTUNGSENDE             // Vertrag laeuft aus
  RENTE_PENSION               // Altersrente / Pensionierung
  ERWERBSMINDERUNG            // Erwerbsminderungsrente
  ENTLASSUNG_BEAMTER          // Beamtenrecht
  VERSETZUNG                  // Versetzung zu anderem Dienstherrn
  TOD                         // Todesfall
  SONSTIGES
}

enum EmploymentType {
  ANGESTELLT          // TV-L / TVoeD / Haustarif
  BEAMTET             // Beamtenverhaeltnis
  MINIJOB             // 520/603-Euro-Basis
  EHRENAMT            // Ehrenamtlich
  BEFRISTET           // Befristeter Vertrag
}

enum ReturnCategory {
  IT_HARDWARE         // Laptop, Smartphone, Tablet
  SCHLUESSEL          // Schluessel, Zugangskarten
  FAHRZEUG            // Firmenwagen, Parkausweis
  DOKUMENTE           // Unterlagen, Buecher
  KLEIDUNG            // Firmenkleidung
  SPEICHERMEDIEN      // USB-Sticks, Festplatten
  SONSTIGES
}

enum OffboardingDocType {
  KUENDIGUNG                  // Kuendigungsschreiben
  AUFHEBUNGSVERTRAG           // Aufhebungsvertrag
  ZEUGNIS_EINFACH             // Einfaches Arbeitszeugnis
  ZEUGNIS_QUALIFIZIERT        // Qualifiziertes Arbeitszeugnis
  ARBEITSBESCHEINIGUNG        // Fuer Arbeitsagentur
  ABFINDUNGSVEREINBARUNG      // Abfindungsvertrag
  WETTBEWERBSVERBOT           // Wettbewerbsvereinbarung
  RUECKGABEPROTOKOLL          // Rueckgabebestaetigung
  EXIT_INTERVIEW_PROTOKOLL    // Gespraechsprotokoll
  SV_ABMELDUNG                // Sozialversicherungsabmeldung
  SONSTIGES
}

enum CertificateType {
  EINFACH
  QUALIFIZIERT
}

enum CertificateStatus {
  PENDING           // Noch nicht begonnen
  DRAFT             // Entwurf erstellt
  REVIEW            // In Pruefung
  SENT              // Versendet
  ACCEPTED          // Vom MA akzeptiert
  DISPUTED          // Vom MA beanstandet
}

enum DocumentStatus {
  UPLOADED
  REVIEWED
  APPROVED
  REJECTED
}
```

### 2.3 Bestehende Modelle erweitern

```prisma
// Organization: Neue Relation hinzufuegen
model Organization {
  // ... bestehende Felder ...
  offboardings  OffboardingProcess[]
}

// AuditLog: Generalisieren
model AuditLog {
  // ... bestehende Felder ...
  processType   String?     // "ONBOARDING" oder "OFFBOARDING"
  offboardingId String?     // Optional: Link zu Offboarding
}

// WebhookEvent: Neue Events
// OFFBOARDING_CREATED, OFFBOARDING_COMPLETED, EXIT_INTERVIEW_SCHEDULED,
// CERTIFICATE_SENT, DATA_RETENTION_REMINDER

// ChecklistTemplate: questionnaireType erweitern oder neues Feld
// isOffboarding Boolean @default(false)
```

---

## 3. API-Struktur (Neue Routes)

```
/api/offboarding
  GET    — Liste aller Offboardings (Filter: Status, Organisation, Suche)
  POST   — Neuen Offboarding-Vorgang erstellen

/api/offboarding/[id]
  GET    — Einzelvorgang mit allen Details
  PATCH  — Status/Daten aktualisieren

/api/offboarding/[id]/exit-data
  GET    — Austrittsdaten laden
  PUT    — Austrittsdaten speichern

/api/offboarding/[id]/return-items
  GET    — Rueckgabe-Items laden
  POST   — Neues Item hinzufuegen
  PATCH  — Item aktualisieren (Rueckgabe bestaetigen)

/api/offboarding/[id]/documents
  GET    — Dokumente auflisten
  POST   — Dokument hochladen

/api/offboarding/[id]/documents/[docId]
  GET    — Dokument herunterladen
  DELETE — Dokument loeschen

/api/offboarding/[id]/checklist
  GET    — Checklisten-Items laden

/api/offboarding/[id]/checklist/[itemId]
  PATCH  — Item abhaken, Notiz hinzufuegen

/api/offboarding/[id]/notes
  GET    — Notizen laden
  POST   — Notiz erstellen

/api/offboarding/[id]/notes/[noteId]
  PATCH  — Notiz bearbeiten
  DELETE — Notiz loeschen

/api/offboarding/[id]/exit-interview
  POST   — Magic Link fuer Exit-Interview generieren

/api/offboarding/[id]/export
  GET    — CSV/PDF Export

/api/exit-interview/[token]
  GET    — Exit-Interview-Fragebogen laden
  POST   — Exit-Interview absenden

/api/dashboard/stats
  GET    — Erweitert um Offboarding-Statistiken
```

---

## 4. UI/UX-Plan

### 4.1 Dashboard-Integration

**Loesung: Tabs im Dashboard**

```
[Onboarding] [Offboarding] [Alle Vorgaenge]
```

- Jeder Tab hat eigene Tabellenspalten
- Onboarding: Fragebogen-Fortschritt, Vorgesetzter-Status
- Offboarding: Letzter Arbeitstag, Kuendigungsfrist, Rueckgabe-Status, Zeugnis-Status
- "Alle Vorgaenge": Vereinfachte Ansicht mit Typ-Spalte

### 4.2 Neue Seiten

```
/dashboard                          — Tabs: Onboarding | Offboarding
/dashboard/offboarding/[id]         — Detail-Ansicht (5 Tabs)
  - Uebersicht                      — Person, Status, Fristen, Timeline
  - Austrittsdaten                  — Finanzielle Abwicklung, SV, Zeugnis
  - Rueckgaben                      — Inventar-Tracking
  - Dokumente                       — Austritts-Dokumente
  - Checkliste                      — 6-Phasen-Checkliste
```

### 4.3 "Neuer Vorgang" Modal erweitern

- ProcessType-Auswahl: "Einstellung" oder "Austritt"
- Bei "Austritt": Andere Felder (Mitarbeitername, Exit-Typ, letzter Arbeitstag)
- Optionale Verknuepfung mit bestehendem Onboarding-Vorgang

### 4.4 Navigation

```
Portal Header:
  Dashboard | Benutzerverwaltung | Checklisten | Vorlagen | Mandanten | Einstellungen
               (bereits vorhanden)
```

Dashboard bekommt Tab-Navigation statt separatem Menue-Punkt.

---

## 5. Offboarding-Checklisten-Templates (Seed)

### Standard-Offboarding (18 Items)

**Phase 1: Sofort (Tag 1-3)**
1. Kuendigungsbestaetigung erstellen
2. Kuendigungsfrist und letzten Arbeitstag berechnen
3. Resturlaub pruefen
4. IT-Abteilung informieren
5. Betriebsrat informieren (falls vorhanden)

**Phase 2: Erste Woche**
6. Nachfolgeplanung einleiten
7. Uebergabeplan erstellen
8. Team ueber Austritt informieren

**Phase 3: Uebergabephase**
9. Wissenstransfer durchfuehren
10. Dokumentation vervollstaendigen
11. Arbeitszeugnis erstellen

**Phase 4: Letzte Woche**
12. Exit-Interview durchfuehren
13. Rueckgabe Arbeitsmittel
14. IT-Zugaenge sperren (vorbereiten)

**Phase 5: Letzter Tag**
15. Alle IT-Zugaenge sperren
16. Physische Zugangsrechte entziehen

**Phase 6: Nach Austritt**
17. Arbeitsbescheinigung ausstellen (3 Tage)
18. SV-Abmeldung durchfuehren (6 Wochen)

### Bildungseinrichtung-Offboarding (22 Items)
Wie Standard + 4 zusaetzliche:
- Eltern informieren
- Entwicklungsdokumentationen uebergeben
- Fortbildungsnachweise archivieren
- Vertretungsregelung sicherstellen

### Beamten-Offboarding (15 Items)
Angepasst fuer Beamtenrecht (Entlassungsantrag, Dienstherr, Aktenuebergabe)

### Minijob-Offboarding (10 Items)
Vereinfachte Version

---

## 6. Webhook-Events (Neu)

| Event | Beschreibung |
|---|---|
| `offboarding-created` | Neuer Offboarding-Vorgang erstellt |
| `offboarding-approved` | Austritt genehmigt |
| `exit-interview-scheduled` | Exit-Interview-Link versendet |
| `exit-interview-completed` | Exit-Interview abgeschlossen |
| `certificate-sent` | Arbeitszeugnis versendet |
| `offboarding-completed` | Offboarding abgeschlossen |
| `data-retention-reminder` | DSGVO-Loeschfrist naht |

---

## 7. DSGVO-Loeschlogik (Kritisch!)

### 7.1 Automatische Fristberechnung bei Offboarding-Abschluss

```
lastWorkingDay + 10 Jahre = dataRetentionDate (steuerrelevante Daten)
lastWorkingDay + 5 Jahre  = SV-Daten loeschen
lastWorkingDay + 3 Jahre  = Personalakte anonymisieren
lastWorkingDay + 0        = IBAN, Steuer-ID sofort loeschen (nur wenn Endabrechnung fertig)
```

### 7.2 Cron-Job fuer Datenloesung

- Taeglich pruefen: Welche Offboardings haben `dataRetentionDate < now()`?
- Anonymisierung: Personenbezogene Daten durch Platzhalter ersetzen
- Loeschprotokoll im AuditLog dokumentieren
- Benachrichtigung an SUPER_ADMIN vor Loeschung

### 7.3 DSGVO gilt auch fuer Onboarding!
Unabhaengig vom Offboarding-Modul muss die Loeschlogik auch fuer bestehende Onboarding-Daten implementiert werden.

---

## 8. Technische Schulden (Vorher beheben)

### 8.1 Muss vor Offboarding-Start
1. **Webhook-System vereinheitlichen:** `triggerN8nWebhook` und `triggerWebhooks` mergen
2. **Prisma $transaction:** In bestehender POST /api/onboarding einfuehren

### 8.2 Sollte parallel
3. **AuditLog generalisieren:** `processType`-Feld hinzufuegen
4. **displayId-Generierung:** Race-Condition mit Unique-Constraint + Retry absichern
5. **Hart-kodierte Werte:** `currentStep/10` dynamisieren

---

## 9. Phasenplan

### Phase 1: MVP Offboarding (Woche 1-5)

**Woche 1: Fundament**
- [ ] Technische Schulden beheben ($transaction in Onboarding-API)
- [ ] Prisma-Schema: OffboardingProcess, OffboardingExitData, OffboardingChecklistItem, OffboardingNote, OffboardingDocument, ReturnItem
- [ ] Prisma-Schema: DepartmentConfig, OffboardingDepartmentLink
- [ ] Migration erstellen und testen
- [ ] Seed-Daten (Checklisten-Templates, Abteilungs-Defaults, Offboarding-Events)
- [ ] Basis-API: CRUD fuer OffboardingProcess

**Woche 2: Core-API + Abteilungen**
- [ ] Exit-Data API, Return-Items API, Dokument-Management API
- [ ] Checklisten API (mit Abteilungs-Zuordnung), Notizen API
- [ ] DepartmentConfig API (Einstellungen → Abteilungen)
- [ ] Abteilungs-Magic-Links generieren + versenden (POST /api/offboarding/[id]/department-links)
- [ ] Oeffentliche Aufgaben-Seite (/offboarding-tasks/[token])
- [ ] AuditLog-Integration

**Woche 3: UI Dashboard + Abteilungen**
- [ ] Dashboard-Tabs (Onboarding | Offboarding)
- [ ] Offboarding-Tabelle mit Filtern
- [ ] "Neuer Austritt" Modal
- [ ] Einstellungen: Tab "Abteilungen" (Funktions-E-Mails pflegen)
- [ ] Abteilungs-Fortschritts-Uebersicht in Detail-Ansicht

**Woche 4: Detail-Ansicht + Workflows**
- [ ] Detail-Ansicht mit 5 Tabs (Uebersicht, Checkliste, Rueckgaben, Dokumente, Notizen)
- [ ] Checkliste mit Abteilungs-Gruppierung und Fortschrittsanzeige
- [ ] Manueller Reminder-Button ([Reminder senden])
- [ ] Vorgesetzten-Uebersicht (Magic Link, Gesamtfortschritt)
- [ ] Webhook-Events: offboarding-created, department-assigned, task-completed, reminder, completed

**Woche 5: Reminder + Testing**
- [ ] Automatische Reminder (n8n Cron, 3-stufig: Info/Warnung/Eskalation)
- [ ] n8n-Workflows: Abteilungs-Benachrichtigung, Reminder, Aufgabe-erledigt
- [ ] Status-Badges und Fortschrittsanzeige
- [ ] End-to-End-Tests, Bugfixes, Polish

### Phase 2: Exit-Interview + Zeugnis (Woche 6-11)
- [ ] Exit-Survey: Template-System, Magic-Link-Flow, Fragebogen-Seite (25 Fragen)
- [ ] Exit-Survey: DSGVO-Consent, Verschluesselung, Reminder-Cron
- [ ] Exit-Survey: Dashboard-Auswertung (Aggregation, Diagramme, Alarme)
- [ ] Zeugnis: CertificateProcess + CertificateFormulation (5 Berufsgruppen)
- [ ] Zeugnis: Magic-Link Vorgesetzten-Bewertung (Schulnoten 1-6)
- [ ] Zeugnis: Noten-zu-Text-Mapping, Entwurfsgenerierung
- [ ] Zeugnis: HR-Review-Workflow (Entwurf → Pruefung → Freigabe)
- [ ] On-/Offboarding-Verknuepfung

### Phase 3: LOGA + Stammdaten + Rollen (Woche 12-15)
- [ ] Employee-Modell (Stammdaten-Tabelle)
- [ ] n8n-Workflow: LOGA-Stammdaten-Sync
- [ ] n8n-Workflow: Bald-auslaufende-Vertraege-Warnung
- [ ] Dashboard: "Bald auslaufende Vertraege"-Widget
- [ ] Rollen-Erweiterung: EINRICHTUNGSLEITUNG, VORGESETZTER
- [ ] Einrichtungs-spezifische Offboarding-Varianten

### Phase 4: DSGVO + Alumni + Polish (Woche 16-18)
- [ ] DSGVO-Loeschlogik (Cron-Job, Anonymisierung, Loeschprotokoll)
- [ ] DSGVO retroaktiv (bestehende Onboarding-Daten)
- [ ] Alumni-Verwaltung (Grundfunktion)
- [ ] UX-Feinschliff, Security Review, Dokumentation

---

## 10. Geschaetzter Aufwand

| Block | Tage |
|---|---|
| Technische Schulden | 2 |
| Datenmodell + Migration | 2-3 |
| Core-API (CRUD + Business-Logic) | 4-5 |
| Dashboard + UI | 5-6 |
| Detail-Ansicht + Formulare | 3-4 |
| Exit-Interview-System | 2-3 |
| DSGVO-Loeschlogik | 3-4 |
| Webhooks + Email | 1-2 |
| Testing + Security | 2-3 |
| **Gesamt** | **24-32 Tage (5-6 Wochen)** |

---

## 11. Offene Fragen (mit User klaeren)

1. Soll der ausscheidende Mitarbeiter ein Exit-Portal bekommen (aehnlich wie der Fragebogen beim Onboarding)?
2. Brauchen wir eine Verknuepfung Onboarding → Offboarding (Mitarbeiter-Lebenszyklus)?
3. Sollen Exit-Interview-Antworten anonymisiert aggregiert werden?
4. Welche Rolle darf Offboarding-Vorgaenge erstellen? Nur HR_LEITUNG+, oder auch HR_SACHBEARBEITER?
5. Brauchen wir eine Alumni-Verwaltung (Boomerang-Tracking)?
6. Soll die DSGVO-Loeschlogik auch rueckwirkend fuer bestehende Onboarding-Daten gelten?
7. Gibt es bereits ein Lohnabrechnungssystem (LOGA), an das wir die Abmeldung exportieren?
