# Kritische Pruefung: Offboarding-Modul CREDO HR-Portal

**Datum:** 2026-03-27
**Rolle:** Advocatus Diaboli -- Technischer Analyst
**Gegenstand:** Konsistenz, Machbarkeit und Risiken aller Offboarding-Planungsdokumente
**Grundlage:** IMPLEMENTIERUNGSPLAN.md, EXIT_INTERVIEW_FRAGEBOGEN.md, ZEUGNIS_BEWERTUNGSBOGEN.md, ADVOCATUS_DIABOLI_ANALYSE.md, HR_EXPERTE_RECHERCHE.md sowie aktueller Code-Stand (schema.prisma, constants.ts, dashboard-content.tsx, neuer-vorgang-modal.tsx, webhooks.ts, route.ts, n8n.ts)

---

## Inhaltsverzeichnis

- [A) Konsistenz-Check](#a-konsistenz-check)
- [B) Datenmodell-Review](#b-datenmodell-review)
- [C) Machbarkeits-Check](#c-machbarkeits-check)
- [D) Risiko-Analyse](#d-risiko-analyse)
- [E) LOGA-Integration](#e-loga-integration)
- [F) Rollen-Konzept](#f-rollen-konzept)
- [G) Phasenplan](#g-phasenplan)
- [H) UX-Kritik](#h-ux-kritik)

---

## A) Konsistenz-Check

### A.1 Widersprueche zwischen Dokumenten

**1. Enum-Benennung: `ExitType` vs. `ExitReason`**

| Dokument | Enum-Name | Werte |
|----------|-----------|-------|
| IMPLEMENTIERUNGSPLAN.md | `ExitType` | KUENDIGUNG_ARBEITNEHMER, ..., VERSETZUNG, TOD, SONSTIGES |
| ADVOCATUS_DIABOLI_ANALYSE.md | `ExitReason` | KUENDIGUNG_ARBEITNEHMER, ..., TOD, SONSTIGES (ohne VERSETZUNG, ENTLASSUNG_BEAMTER) |

Die Advocatus-Analyse schlaegt `ExitReason` vor, der Implementierungsplan verwendet `ExitType`. Zudem hat der Implementierungsplan zwei zusaetzliche Werte (`VERSETZUNG`, `ENTLASSUNG_BEAMTER`), die in der Analyse fehlen. Der Implementierungsplan ist hier vollstaendiger und korrekter -- VERSETZUNG und ENTLASSUNG_BEAMTER sind fuer eine Bildungsgruppe mit Beamten zwingend noetig.

**Empfehlung:** `ExitType` verwenden (semantisch praeziser als `ExitReason`, da es die *Art* des Austritts beschreibt, nicht den *Grund*). Wertemenge aus dem Implementierungsplan uebernehmen.

**2. OffboardingStatus: Abweichende Werte**

| Implementierungsplan | Advocatus-Analyse |
|---------------------|-------------------|
| INITIATED | INITIATED |
| PENDING_APPROVAL | PENDING_APPROVAL |
| APPROVED | APPROVED |
| NOTICE_PERIOD | NOTICE_PERIOD |
| HANDOVER_PHASE | HANDOVER_PHASE |
| EXIT_INTERVIEW | *(fehlt)* |
| FINAL_SETTLEMENT | FINAL_SETTLEMENT |
| COMPLETED | COMPLETED |
| CANCELLED | CANCELLED |

Die Advocatus-Analyse listet zusaetzlich `IT_DEPROVISIONING` auf, was im Implementierungsplan fehlt. Umgekehrt hat der Implementierungsplan `EXIT_INTERVIEW` als eigenen Status, der in der Analyse fehlt.

**Kritik:** `EXIT_INTERVIEW` als eigener Status ist problematisch. Das Exit-Interview findet laut User-Entscheidung *nach dem Ausscheiden* statt (Magic Link 7-10 Tage nach letztem Arbeitstag). Zu diesem Zeitpunkt ist der Offboarding-Prozess intern laengst in `FINAL_SETTLEMENT` oder `COMPLETED`. Ein Status `EXIT_INTERVIEW` wuerde den Workflow blockieren, obwohl das Interview asynchron und unabhaengig laeuft.

`IT_DEPROVISIONING` als eigener Status ist ebenso fragwuerdig -- IT-Sperrungen sind Checklisten-Aufgaben, kein Prozess-Status.

**Empfehlung:** `EXIT_INTERVIEW` und `IT_DEPROVISIONING` streichen. Stattdessen:
```
INITIATED → NOTICE_PERIOD → HANDOVER_PHASE → FINAL_SETTLEMENT → COMPLETED
                                                                  ↓
                                                              CANCELLED
```
`PENDING_APPROVAL` und `APPROVED` nur bei Arbeitgeberkuendigungen/Aufhebungsvertraegen relevant -- als optionale Schritte modellieren, nicht als Pflicht-Status.

**3. Feld-Benennung: `exitDate` vs. `lastWorkingDay`**

| Advocatus-Analyse | Implementierungsplan |
|-------------------|---------------------|
| `exitDate` (letzter Arbeitstag) | `lastWorkingDay` (letzter Arbeitstag) |

Zwei verschiedene Feldnamen fuer dasselbe Konzept. `lastWorkingDay` ist semantisch praeziser (der letzte *Arbeits*tag kann vom formalen *Austritts*datum abweichen, z.B. bei Freistellung).

**Empfehlung:** `lastWorkingDay` verwenden. Zusaetzlich `contractEndDate` beibehalten fuer das formale Vertragsende.

**4. Exit-Survey vs. Exit-Interview**

Der EXIT_INTERVIEW_FRAGEBOGEN.md spricht durchgaengig von "Exit-Interview" und "Exit Survey", definiert aber ein eigenstaendiges Datenmodell (`ExitSurveyTemplate`, `ExitSurveyResponse`, `ExitSurveyAggregate`) mit eigener `offboardingId`-Referenz. Im Implementierungsplan hingegen werden Exit-Interview-Daten direkt auf dem `OffboardingProcess`-Modell gespeichert (`exitInterviewToken`, `exitInterviewDone`, `exitInterviewNotes`).

**Problem:** Doppelte Datenhaltung. Wenn sowohl `OffboardingProcess.exitInterviewDone` als auch `ExitSurveyResponse.status === SUBMITTED` existieren, welche Quelle ist fuehrend?

**Empfehlung:** Exit-Interview-Tracking komplett in die `ExitSurveyResponse`-Tabelle verlagern. Auf `OffboardingProcess` nur den Token und das Ablaufdatum behalten (fuer Magic-Link-Generierung). Den Boolean `exitInterviewDone` und `exitInterviewNotes` streichen -- diese Information kommt aus der Response-Tabelle.

**5. CertificateStatus: Doppelte Definition**

| Implementierungsplan (OffboardingExitData) | Zeugnis-Bewertungsbogen (CertificateProcess) |
|--------------------------------------------|----------------------------------------------|
| `certificateStatus: CertificateStatus` | `status: CertificateStatus` |

Der Zeugnisstatus wird an *zwei* Stellen gefuehrt: in `OffboardingExitData` und in `CertificateProcess`. Welches Modell ist fuehrend?

**Empfehlung:** `CertificateProcess` ist das fuehrende Modell fuer den Zeugnis-Workflow. `OffboardingExitData.certificateStatus` streichen und durch eine Relation `OffboardingProcess → CertificateProcess` ersetzen.

### A.2 Konsistenzen (was gut zusammenpasst)

- Alle Dokumente stimmen ueberein: Eigenes `OffboardingProcess`-Modell statt Erweiterung von `OnboardingProcess`
- Die Checklisten-Struktur (6 Phasen) ist zwischen HR-Experten-Recherche und Implementierungsplan konsistent
- Das Magic-Link-Konzept wird einheitlich fuer drei Zwecke genutzt: MA-Fragebogen (Onboarding), Exit-Survey (Offboarding), Zeugnis-Bewertung (Offboarding)
- DSGVO-Loeschfristen stimmen zwischen HR-Recherche und Implementierungsplan ueberein
- Die Webhook-Event-Typen sind sinnvoll benannt und ergaenzen die bestehenden Events

### A.3 Luecken in der Dokumentation

1. **Kein konkreter Plan fuer die On-/Offboarding-Verknuepfung.** Dimitri hat "JA" gesagt, aber es gibt nur ein optionales `onboardingId`-Feld. Wie findet man das zugehoerige Onboarding? Per E-Mail-Match? Per manueller Zuordnung? Was passiert, wenn ein Mitarbeiter mehrere Onboardings hatte (Wiedereinstellung)?

2. **Kein konkreter Plan fuer Einrichtungs-Spezifika.** Dimitri hat gesagt "verschiedene Offboarding-Typen noetig", aber keines der Dokumente definiert, wie sich ein Kita-Offboarding konkret von einem Gymnasium-Offboarding unterscheidet (ausser zusaetzlichen Checklisten-Items).

3. **Private E-Mail-Adresse.** Der Exit-Interview-Fragebogen verlangt explizit die Nutzung der privaten E-Mail. Woher kommt diese? Sie ist nicht im Offboarding-Datenmodell. Im Onboarding-PersonalData gibt es `emailPrivate`, aber dieses Feld ist optional und wird erst spaeter ausgefuellt.

---

## B) Datenmodell-Review

### B.1 Ueberschneidungen und Konflikte

**1. Drei separate Modelle mit `offboardingId`-Relation, aber keine gemeinsame Definition**

Das Exit-Survey-Modell (`ExitSurveyResponse`) referenziert `offboardingId`, definiert aber keine explizite Prisma-Relation (`@relation`). Das ist ein Sketch-Problem, das bei der tatsaechlichen Implementierung zu Fehlern fuehrt.

**2. `EmploymentType` vs. `QuestionnaireType`**

| Neuer Enum (Offboarding) | Bestehender Enum (Onboarding) |
|---------------------------|-------------------------------|
| `ANGESTELLT` | `STANDARD` |
| `BEAMTET` | `BEAMTE` |
| `MINIJOB` | `MINIJOB` |
| `EHRENAMT` | `EHRENAMT` |
| `BEFRISTET` | *(fehlt)* |

`BEFRISTET` ist als EmploymentType fragwuerdig -- Befristung ist ein Vertragsattribut, kein Beschaeftigungstyp. Ein befristeter Vertrag kann sowohl ANGESTELLT als auch MINIJOB sein. Im bestehenden System wird Befristung korrekt als Boolean auf `SupervisorData.befristet` modelliert.

**Empfehlung:** `BEFRISTET` aus `EmploymentType` streichen. Stattdessen ein Feld `isBefristet: Boolean` auf `OffboardingExitData` verwenden.

**3. `RoleVariant` als eigener Enum (Exit-Survey + Zeugnis)**

```prisma
enum RoleVariant {
  LEHRKRAFT
  ERZIEHER
  VERWALTUNG
  SCHULLEITUNG
  KITALEITUNG
  SONSTIGES
}
```

Dieser Enum existiert zweimal identisch (im Exit-Interview und im Zeugnis-Dokument). Er muss einmal zentral definiert werden. Wichtig: Er ist *nicht* identisch mit `QuestionnaireType` (Onboarding). `QuestionnaireType` hat `STANDARD`, `BEAMTE`, `ERZIEHER`, `MINIJOB`, `EHRENAMT`. `RoleVariant` hat `LEHRKRAFT`, `ERZIEHER`, `VERWALTUNG`, `SCHULLEITUNG`, `KITALEITUNG`, `SONSTIGES`.

Es gibt keine 1:1-Zuordnung. Ein `STANDARD`-Fragebogen kann sowohl fuer `LEHRKRAFT` als auch fuer `VERWALTUNG` gelten. Das ist ein konzeptionelles Problem, das bei der Verknuepfung On-/Offboarding Schwierigkeiten machen wird.

**4. `DocumentStatus` doppelt definiert**

Der bestehende `DocumentStatus` (`UPLOADED, REVIEWED, APPROVED, REJECTED`) wird im Implementierungsplan fuer `OffboardingDocument` wiederverwendet -- das ist korrekt und konsistent. Aber: Er wird auch im selben Dokument nochmals als Enum definiert, obwohl er bereits im Schema existiert.

**5. Fehlende Relationen im Prisma-Sketch**

- `ExitSurveyResponse` hat keinen `@relation` zu `OffboardingProcess`
- `ExitSurveyResponse` hat keinen `@relation` zu `ExitSurveyTemplate`
- `ExitSurveyResponse` hat keinen `@relation` zu `Organization`
- `CertificateProcess` hat keinen `@relation` von `OffboardingProcess` (nur umgekehrt)
- `CertificateFormulation` hat keine Relation -- ist ein Lookup-Table, das ist korrekt
- `OffboardingProcess` fehlt die Relation zu `CertificateProcess`
- `OffboardingProcess` fehlt die Relation zu `ExitSurveyResponse`

### B.2 Fehlende Felder und Modelle

**1. Stammdaten-Tabelle fehlt**

Dimitri hat entschieden: "Stammdatentabelle interessant", LOGA-Stammdaten via n8n abgreifbar. Keines der Dokumente definiert ein `Employee`- oder `Stammdaten`-Modell. Ohne dieses Modell gibt es keinen persistenten Mitarbeiter-Record, der Onboarding und Offboarding verbindet.

**Vorschlag:**

```prisma
model Employee {
  id                String    @id @default(uuid())
  personalnummer    String?   @unique  // LOGA-Personalnummer
  mandantennummer   String?             // LOGA-Mandant
  organizationId    String
  organization      Organization @relation(fields: [organizationId], references: [id])
  firstName         String
  lastName          String
  email             String
  emailPrivate      String?
  vertragsbeginn    DateTime?
  vertragsende      DateTime?
  isActive          Boolean   @default(true)

  // Sync-Tracking
  logaSyncedAt      DateTime?

  // Relationen
  onboardingId      String?   @unique
  offboardingId     String?   @unique

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@map("employees")
}
```

Dieses Modell wuerde als "Klammer" zwischen LOGA, Onboarding und Offboarding dienen. Es ist aber **nicht fuer Phase 1 (MVP)** noetig -- das Offboarding kann zunaechst ohne Stammdaten-Tabelle funktionieren.

**2. Private E-Mail auf OffboardingProcess**

Fuer den Exit-Survey-Versand (7 Tage nach Austritt, an private E-Mail) fehlt ein Feld `employeePrivateEmail` auf `OffboardingProcess`. Die bestehende `employeeEmail` ist vermutlich die dienstliche Adresse, die nach Austritt deaktiviert wird.

**3. Freistellungs-Tracking**

Kein Feld fuer "Freistellung" (ja/nein, ab wann). In der Praxis werden Mitarbeiter haeufig freigestellt -- der letzte Arbeitstag ist dann nicht gleich dem Vertragsende. Das beeinflusst:
- IT-Zugangssperrung (sofort bei Freistellung)
- Rueckgabe-Inventar (sofort)
- Gehaltsfortzahlung (bis Vertragsende)

### B.3 Datenmodell-Empfehlung (konsolidiert)

Das finale Prisma-Schema sollte diese Modelle umfassen:

| Modell | Phase | Prioritaet |
|--------|-------|-----------|
| `OffboardingProcess` | 1 | MVP |
| `OffboardingExitData` | 1 | MVP (vereinfacht) |
| `OffboardingChecklistItem` | 1 | MVP |
| `OffboardingNote` | 1 | MVP |
| `OffboardingDocument` | 1 | MVP |
| `ReturnItem` | 1 | MVP |
| `ExitSurveyTemplate` | 2 | Exit-Interview |
| `ExitSurveyResponse` | 2 | Exit-Interview |
| `ExitSurveyAggregate` | 2 | Exit-Interview Reporting |
| `CertificateProcess` | 2 | Zeugnis-Workflow |
| `CertificateFormulation` | 2 | Zeugnis-Textbausteine (Seed) |
| `Employee` (Stammdaten) | 3 | LOGA-Integration |

---

## C) Machbarkeits-Check

### C.1 Was ist realistisch fuer Phase 1 (MVP)?

**Realistisch (4-5 Wochen, 1 Entwickler):**

1. `OffboardingProcess`-Modell + vereinfachtes `OffboardingExitData`
2. CRUD-API (`/api/offboarding`)
3. Dashboard-Integration (Tab-Umschaltung Onboarding/Offboarding)
4. "Neuer Austritt"-Modal
5. Offboarding-Detail-Ansicht (3 Tabs: Uebersicht, Checkliste, Dokumente)
6. Offboarding-Checklisten (Templates + Auto-Zuweisung)
7. Webhook-Events (offboarding-created, offboarding-completed)
8. ReturnItem-Tracking (einfache Liste)
9. Notizen-System

**Nicht realistisch fuer Phase 1:**

| Feature | Begruendung |
|---------|-------------|
| Exit-Interview mit Magic Link | Eigenstaendiger Workflow, eigenes Template-System, Aggregation |
| Zeugnis-Bewertungsbogen | Komplexer Magic-Link-Flow mit 5 Berufsgruppen, Formulierungszuordnung, PDF-Generierung |
| DSGVO-Loeschlogik | Juristisch komplex, benoetigt Abstimmung mit DSB |
| LOGA-Integration | Abhaengig von n8n-Workflow-Entwicklung und LOGA-API-Zugang |
| Aggregierte Exit-Survey-Auswertung | Benoetigt Exit-Survey-System |
| Rollen-Erweiterung (Schulleitungen) | Benoetigt Rollen-Konzept-Redesign |
| Alumni-Verwaltung | Explizit als "spaetere Phase" deklariert |

### C.2 Aufwandsschaetzung (realistisch)

Der Implementierungsplan schaetzt 24-32 Tage (5-6 Wochen). Die Advocatus-Analyse schaetzt 20-26 Tage (4-5 Wochen).

**Meine Einschaetzung:**

| Block | Implementierungsplan | Meine Schaetzung | Delta |
|-------|---------------------|------------------|-------|
| Technische Schulden | 2 Tage | 1 Tag | Webhook-Vereinheitlichung ist bereits erledigt (`n8n.ts` delegiert an `webhooks.ts`). `$transaction` bleibt. |
| Datenmodell + Migration | 2-3 Tage | 2 Tage | Prisma-Schema + Seed sind straightforward |
| Core-API | 4-5 Tage | 5-6 Tage | **Unterschaetzt.** Business-Logic (Status-Uebergaenge, Validierung, Fristberechnung) ist komplex |
| Dashboard + UI | 5-6 Tage | 6-8 Tage | **Unterschaetzt.** Tab-Umschaltung allein ist einfach, aber die Offboarding-Tabelle hat andere Spalten, andere Filter, andere Status-Badges. Zwei Tabellen-Views = fast doppelter Aufwand |
| Detail-Ansicht | 3-4 Tage | 4-5 Tage | 5 Tabs mit je eigenem Formular/Ansicht |
| Exit-Interview | 2-3 Tage | 5-7 Tage | **Massiv unterschaetzt.** Template-System, Magic-Link-Flow, oeffentliche Seite, Verschluesselung, DSGVO-Consent, Reminder-Cron, Aggregation |
| Zeugnis-System | *(nicht separat)* | 6-8 Tage | **Komplett fehlt im Implementierungsplan als eigener Block!** Magic-Link fuer Vorgesetzte, Bewertungs-UI, Noten-zu-Text-Mapping, 5 Berufsgruppen, Gewichtungsberechnung, Entwurfsgenerierung |
| DSGVO | 3-4 Tage | 2-3 Tage | Phase 1: nur Feld `dataRetentionDate` setzen, Cron spaeter |
| Testing | 2-3 Tage | 3-4 Tage | Realistischer |
| **Gesamt** | **24-32 Tage** | **34-44 Tage** | |

**Fazit:** Der Implementierungsplan unterschaetzt den Gesamtaufwand um ca. 40%, hauptsaechlich weil:
1. Das Zeugnis-System nicht als eigener Block ausgewiesen ist
2. Der Exit-Interview-Aufwand zu niedrig angesetzt ist
3. UI-Aufwand fuer zwei parallele Dashboard-Ansichten unterschaetzt wird

**Fuer ein echtes MVP (Phase 1, ohne Exit-Interview und Zeugnis): 18-22 Tage (3.5-4.5 Wochen) sind realistisch.**

### C.3 Technische Schulden -- aktueller Stand

**Bereits erledigt:**
- `triggerN8nWebhook` vs. `triggerWebhooks`: Bereits vereinheitlicht. `n8n.ts` ist nur noch ein Re-Export von `webhooks.ts`. Der Implementierungsplan und die Advocatus-Analyse nennen das als offene Schuld -- es ist aber bereits geloest.

**Noch offen:**
- `$transaction` in `/api/onboarding` POST: 5 separate DB-Operationen ohne Transaktion
- `currentStep/10` hart kodiert in `dashboard-content.tsx` (Zeile 480)
- `displayId`-Generierung: Race-Condition-Risiko (count + 1 Ansatz)

---

## D) Risiko-Analyse

### D.1 Risiko-Matrix

| # | Risiko | Wahrscheinlichkeit | Auswirkung | Risiko-Score | Massnahme |
|---|--------|-------------------|------------|-------------|-----------|
| R1 | **Schema-Migration bricht Onboarding** | Mittel | Kritisch | HOCH | Migrations in Staging testen, Rollback-Plan, Feature-Branch |
| R2 | **DSGVO-Verstoss (fehlende Loeschlogik)** | Hoch | Kritisch | HOCH | Mindestens `dataRetentionDate`-Feld in Phase 1, Loeschlogik in Phase 2 |
| R3 | **Scope Creep** | Hoch | Hoch | HOCH | Striktes MVP. Exit-Interview und Zeugnis sind Phase 2. Kein "Wir bauen das noch schnell ein" |
| R4 | **UX-Komplexitaet** | Mittel | Hoch | MITTEL | User-Tests mit HR-Team nach Phase 1, bevor Phase 2 startet |
| R5 | **LOGA-Abhaengigkeit** | Mittel | Mittel | MITTEL | Offboarding muss auch ohne LOGA funktionieren (manuelle Eingabe als Fallback) |
| R6 | **Magic-Link-Sicherheit** | Niedrig | Hoch | MITTEL | Token-Expiration, Rate-Limiting, IP-Logging. Bestehende Onboarding-Mechanik als Vorlage |
| R7 | **Zeugnis-Rechtsrisiko** | Mittel | Hoch | MITTEL | Automatisch generierte Zeugnistexte MUESSEN durch HR geprueft werden. Niemals Auto-Versand |
| R8 | **Performance bei Union-Queries** | Niedrig | Niedrig | NIEDRIG | Getrennte Tabellen = getrennte Queries = kein Problem |
| R9 | **Test-Abdeckung** | Hoch | Mittel | MITTEL | Keine Tests im Repository gesichtet. Mindestens API-Integration-Tests fuer Phase 1 |

### D.2 Groesste Einzelrisiken

**R3 (Scope Creep)** ist das realistischste Risiko. Dimitri hat viele Features bestaetigt:
- Exit-Interview: JA
- Zeugnis-Bewertungsbogen: JA, aktiv unterstuetzen
- LOGA-Integration: JA
- Rollen-Erweiterung: JA
- Einrichtungs-Spezifika: JA
- Alumni: Beruecksichtigen

Jedes einzelne Feature ist sinnvoll. Aber alle gleichzeitig zu bauen ist unrealistisch. Ohne strikten Phasenplan wird das Projekt 3-4x so lang wie geplant.

**R7 (Zeugnis-Rechtsrisiko)** ist spezifisch fuer das Zeugnis-Modul: Wenn das System eine Note-5- oder Note-6-Formulierung generiert und diese ohne kritische Pruefung versendet wird, kann das zu arbeitsrechtlichen Klagen fuehren. Das UI muss einen "HR-Review-Pflicht"-Schritt erzwingen, der nicht umgangen werden kann.

---

## E) LOGA-Integration

### E.1 Konkrete Architektur

```
LOGA (Persis) ──REST/SOAP──→ n8n-Workflow ──Webhook──→ HR-Portal API
                                    │
                                    ├── /api/loga/sync (POST)
                                    │   Empfaengt Stammdaten-Updates
                                    │
                                    └── Scheduled (taeglich/woechentlich)
                                        Holt Mitarbeiter mit Vertragsende in 2-3 Monaten
```

### E.2 n8n-Workflow-Design

**Workflow 1: Stammdaten-Sync (Scheduled)**
1. LOGA API aufrufen: Alle aktiven Mitarbeiter mit Mandantennummer, Personalnummer, Name, Vertragsbeginn, Vertragsende
2. Mapping: LOGA-Felder auf HR-Portal-Felder
3. Upsert via HR-Portal API: `POST /api/employees/sync`
4. Fehlerbehandlung: E-Mail an HR bei Sync-Fehlern

**Workflow 2: Bald-Auslaufende-Vertraege (Scheduled, taeglich)**
1. LOGA API aufrufen: Mitarbeiter mit `vertragsende` in den naechsten 60-90 Tagen
2. Pruefen: Existiert bereits ein Offboarding-Vorgang im HR-Portal?
3. Wenn nein: Notification an HR ("Vertrag von Max Mustermann laeuft am 30.06. aus")
4. Optional: Automatisch Offboarding-Vorgang anlegen (nur bei `BEFRISTUNGSENDE`)

### E.3 Auswirkungen auf das Datenmodell

Fuer die LOGA-Integration brauchen wir:

1. **`Employee`-Modell** (siehe B.2) mit `personalnummer` und `mandantennummer` als externe Schluessel
2. **`logaSyncedAt`-Feld** auf dem Employee-Modell fuer Sync-Tracking
3. **API-Endpunkt `POST /api/employees/sync`** der Upsert-Logik implementiert
4. **Mapping-Tabelle** (optional, in n8n konfigurierbar): Welches LOGA-Feld mappt auf welches Portal-Feld

### E.4 Kritische Fragen an Dimitri

1. Hat LOGA eine REST-API oder nur SOAP/Dateischnittstelle?
2. Gibt es einen Staging-/Test-Zugang zu LOGA?
3. Welche Felder sind aus LOGA verfuegbar? (Nur die genannten, oder auch Abteilung, Vorgesetzter, Tarifvertrag?)
4. Darf das HR-Portal in LOGA zurueckschreiben (z.B. Austrittsdatum setzen)?
5. Wie wird die Authentifizierung gegen LOGA gehandhabt?

### E.5 Phase

LOGA-Integration ist **Phase 3**. Gruende:
- Abhaengig von LOGA-API-Zugang und Dokumentation
- Benoetigt n8n-Workflow-Entwicklung
- Benoetigt Employee-Modell (Phase 3)
- Offboarding muss auch ohne LOGA funktionieren (manuelle Eingabe)

---

## F) Rollen-Konzept

### F.1 Ist-Zustand

```prisma
enum UserRole {
  SUPER_ADMIN         // Vollzugriff
  HR_LEITUNG          // HR-Verwaltung
  HR_SACHBEARBEITER   // Operatives HR
}
```

Alle drei Rollen sind im `User`-Modell, alle haben Zugang zum Portal via Login. Es gibt keine Rollen fuer:
- Schulleitungen / Einrichtungsleitungen
- Vorgesetzte (ausser ueber Magic Links)
- Externe (z.B. Steuerberater, DSB)

### F.2 Anforderungen (aus User-Entscheidungen)

1. Aktuell: Alle HR-Rollen duerfen Offboarding erstellen
2. Zukunft: Schulleitungen und andere Rollen einbeziehen
3. Vorgesetzte koennten per Magic Link zugreifen
4. Zeugnis-Bewertung durch Vorgesetzte per Magic Link

### F.3 Vorgeschlagenes Rollen-Konzept (zukunftsfaehig)

**Stufe 1 (Phase 1 -- MVP):**

Keine Aenderung am bestehenden Rollenmodell. Offboarding-Erstellung und -Bearbeitung folgt denselben Regeln wie Onboarding:
- `SUPER_ADMIN`: Alles
- `HR_LEITUNG`: Alles ausser System-Einstellungen
- `HR_SACHBEARBEITER`: Vorgaenge erstellen und bearbeiten, keine Benutzerverwaltung

**Stufe 2 (Phase 2-3):**

```prisma
enum UserRole {
  SUPER_ADMIN
  HR_LEITUNG
  HR_SACHBEARBEITER
  EINRICHTUNGSLEITUNG   // NEU: Schulleitung, Kitaleitung
  VORGESETZTER          // NEU: Fachlicher Vorgesetzter
}
```

| Recht | SUPER_ADMIN | HR_LEITUNG | HR_SACH | EINR_LEITUNG | VORGESETZTER |
|-------|:-----------:|:----------:|:-------:|:------------:|:------------:|
| Offboarding erstellen | Ja | Ja | Ja | Nur eigene Einrichtung | Nein |
| Offboarding einsehen | Alle | Alle | Alle | Nur eigene Einrichtung | Nur zugewiesene |
| Austrittsdaten bearbeiten | Ja | Ja | Ja | Nein | Nein |
| Checkliste bearbeiten | Ja | Ja | Ja | Nur zugewiesene Items | Nur zugewiesene Items |
| Zeugnis-Bewertung | Nein | Nein | Nein | Nein | Per Magic Link |
| Exit-Interview einsehen | Ja | Ja | Aggregiert | Aggregiert | Nein |
| Abfindungen einsehen | Ja | Ja | Nein | Nein | Nein |
| DSGVO-Loeschung | Ja | Ja | Nein | Nein | Nein |
| System-Einstellungen | Ja | Nein | Nein | Nein | Nein |

**Stufe 3 (spaeter):**

Feingranulare Berechtigungen ueber ein `Permission`-System:

```prisma
model RolePermission {
  id          String   @id @default(uuid())
  role        UserRole
  resource    String   // z.B. "offboarding", "offboarding.exitData", "certificate"
  action      String   // "create", "read", "update", "delete"
  scope       String?  // "all", "own_org", "assigned"
  @@unique([role, resource, action])
}
```

**Empfehlung fuer jetzt:** Stufe 1 in Phase 1. Stufe 2 fruehestens in Phase 3. Stufe 3 nur bei konkretem Bedarf. Over-Engineering des Rollen-Systems ist ein klassischer Zeitfresser.

### F.4 Magic-Link-Zugriff fuer Vorgesetzte

Das bestehende System nutzt Magic Links bereits fuer:
- Mitarbeiter (Personalfragebogen)
- Vorgesetzte (Einstellungsmodalitaeten)

Dieses Muster kann direkt wiederverwendet werden fuer:
- Vorgesetzte (Zeugnis-Bewertung)
- Ex-Mitarbeiter (Exit-Survey)

Wichtig: Magic-Link-Nutzer sind **keine Portal-User**. Sie haben kein Login, keine Session, keinen Zugang zum Dashboard. Sie sehen nur die eine Seite, fuer die der Token gilt. Dieses Konzept ist sauber und sollte beibehalten werden.

---

## G) Phasenplan

### Phase 1: MVP Offboarding (4-5 Wochen)

**Ziel:** HR kann Austrittsvorgaenge digital erfassen, tracken und abhaken.

**Scope:**
- Prisma-Schema: `OffboardingProcess`, `OffboardingExitData` (vereinfacht), `OffboardingChecklistItem`, `OffboardingNote`, `OffboardingDocument`, `ReturnItem`
- Enums: `OffboardingStatus`, `ExitType`, `ReturnCategory`, `OffboardingDocType`
- API: CRUD fuer alle Offboarding-Modelle (ca. 12 Endpunkte)
- UI: Dashboard-Tab "Offboarding", Offboarding-Tabelle, "Neuer Austritt"-Modal
- UI: Detail-Ansicht mit 4 Tabs (Uebersicht, Checkliste, Rueckgaben, Dokumente)
- Checklisten-Templates (Seed: Standard, Bildungseinrichtung, Beamte, Minijob)
- Webhook-Events: offboarding-created, offboarding-completed
- AuditLog-Erweiterung: `processType`-Feld
- Technische Schuld: `$transaction` in bestehender Onboarding-API

**Nicht im Scope:**
- Exit-Interview
- Zeugnis-Bewertungsbogen
- LOGA-Integration
- Rollen-Erweiterung
- DSGVO-Loeschlogik (nur Feld `dataRetentionDate` setzen)
- Alumni
- Aggregierte Auswertungen

**Meilensteine:**
| Woche | Deliverable |
|-------|-------------|
| 1 | Schema, Migration, Seed-Daten, Basis-API (CRUD) |
| 2 | Erweiterte API (Checkliste, Rueckgaben, Dokumente), AuditLog |
| 3 | Dashboard-Tab, Offboarding-Tabelle, "Neuer Austritt"-Modal |
| 4 | Detail-Ansicht, Status-Workflow, Webhooks |
| 4-5 | Testing, Bugfixes, Polish, Deployment |

### Phase 2: Exit-Interview + Zeugnis (4-6 Wochen)

**Ziel:** Exit-Interviews automatisiert versenden und auswerten. Zeugnisworkflow mit Vorgesetzten-Bewertung.

**Scope:**
- Exit-Survey: Template-System, Magic-Link-Flow, oeffentliche Fragebogen-Seite, Verschluesselung, DSGVO-Consent, Reminder-Cron
- Exit-Survey: Dashboard-Auswertung (Aggregation, Diagramme, Alarme)
- Zeugnis: CertificateProcess-Modell, CertificateFormulation-Seed (alle Noten, alle Kategorien, alle Berufsgruppen)
- Zeugnis: Magic-Link fuer Vorgesetzte, Bewertungs-UI (Schulnoten-Klick)
- Zeugnis: Noten-zu-Text-Mapping, Gewichtungsberechnung, Entwurfsgenerierung
- Zeugnis: HR-Review-Workflow (Entwurf pruefen, anpassen, freigeben)
- On-/Offboarding-Verknuepfung: `onboardingId`-Zuordnung

**Nicht im Scope:**
- LOGA-Integration
- Rollen-Erweiterung
- Alumni
- DSGVO retroaktiv

### Phase 3: LOGA + Stammdaten + Rollen (3-4 Wochen)

**Ziel:** Stammdaten aus LOGA synchronisieren. Proaktive Benachrichtigung bei auslaufenden Vertraegen. Erweiterte Rollen.

**Scope:**
- Employee-Modell (Stammdaten-Tabelle)
- n8n-Workflow: LOGA-Stammdaten-Sync
- n8n-Workflow: Bald-auslaufende-Vertraege-Warnung
- Dashboard: "Bald auslaufende Vertraege"-Widget
- Rollen-Erweiterung: EINRICHTUNGSLEITUNG
- Einrichtungs-spezifische Offboarding-Typen (unterschiedliche Checklisten-Templates pro OrganizationType)

### Phase 4: DSGVO + Alumni + Polish (2-3 Wochen)

**Ziel:** Datenschutzkonforme Loeschlogik. Alumni-Grundfunktion. UX-Feinschliff.

**Scope:**
- DSGVO-Loeschlogik: Cron-Job, Anonymisierung, Loeschprotokoll
- DSGVO retroaktiv: Bestehende Onboarding-Daten einbeziehen
- Alumni-Grundfunktion: Boomerang-Flag, Rueckkehr-Tracking
- UX-Polish: Animationen, Ladezeiten, Responsive-Optimierung
- Dokumentation

### Gesamtzeitrahmen

| Phase | Dauer | Kumuliert |
|-------|-------|-----------|
| Phase 1 (MVP) | 4-5 Wochen | 4-5 Wochen |
| Phase 2 (Interview + Zeugnis) | 4-6 Wochen | 8-11 Wochen |
| Phase 3 (LOGA + Rollen) | 3-4 Wochen | 11-15 Wochen |
| Phase 4 (DSGVO + Alumni) | 2-3 Wochen | 13-18 Wochen |

**Realistisch: 4-5 Monate fuer den vollen Funktionsumfang bei einem Entwickler.**

---

## H) UX-Kritik

### H.1 Das "Apple-like"-Problem

Dimitri wuenscht "Apple-like UX: Einfach, klar, schoen". Das ist ein berechtigter Anspruch, aber er steht in direktem Konflikt mit der Komplexitaet des Systems:

- 9 verschiedene Austrittstypen
- 5 Berufsgruppen mit unterschiedlichen Bewertungskategorien
- 6-phasige Checklisten mit 10-22 Items
- Finanzielle Abwicklung (Resturlaub, Ueberstunden, Abfindung, Sonderzahlungen)
- Zeugnis-Workflow mit Noten, Gewichtungen, Formulierungen
- DSGVO-Compliance
- Exit-Interview mit 25+ Fragen

Apple-Produkte sind einfach, weil sie Komplexitaet *weglassen*, nicht weil sie Komplexitaet *huebsch verpacken*.

### H.2 Konkrete UX-Empfehlungen

**1. Progressive Disclosure (Schrittweise Enthuellung)**

Nicht alle Felder auf einmal zeigen. Stattdessen:
- "Neuer Austritt"-Modal: Nur 4 Felder (Name, Einrichtung, Austrittsart, letzter Arbeitstag)
- Detail-Ansicht: Tabs laden Inhalte on-demand
- "Erweiterte Optionen" fuer selten genutzte Felder (Wettbewerbsverbot, Outplacement)

**2. Wizard statt Formular**

Der Offboarding-Erstellungsprozess sollte ein Wizard sein:
```
Schritt 1: Wer geht? (Name, E-Mail, Einrichtung)
Schritt 2: Warum? (Austrittsart, Begruendung)
Schritt 3: Wann? (Kuendigungsdatum, letzter Arbeitstag, Freistellung)
Schritt 4: Zusammenfassung + Checklisten-Vorschau
```

**3. Status-Timeline statt Status-Dropdown**

Keine abstrakte Status-Anzeige ("HANDOVER_PHASE"), sondern eine visuelle Timeline:
```
[Erfasst] ──→ [Kuendigungsfrist] ──→ [Uebergabe] ──→ [Abschluss] ──→ [Erledigt]
   ✓              ✓                     ●
```

**4. Dashboard: Klare Trennung**

Kein "Alle Vorgaenge"-Tab, der Onboarding und Offboarding mischt. Das verwirrt mehr als es hilft. Stattdessen:
```
[Einstellungen (12)]  [Austritte (3)]
```
Zwei Tabs, zwei voellig getrennte Ansichten. Jeder Tab hat seine eigenen Spalten und Filter.

**5. Zeugnis-UI: Slider statt Dropdown**

Fuer die Schulnoten-Bewertung im Zeugnis-Bewertungsbogen:
- Keine Dropdowns mit 6 Optionen pro Kategorie
- Stattdessen: Visuelle Sterne oder horizontaler Slider (1-6)
- Sofort-Vorschau: Bei Notenauswahl wird die zugehoerige Formulierung live angezeigt
- Gesamtnote als grosser, farbiger Indikator (gruen 1-2, gelb 3, orange 4, rot 5-6)

**6. Rueckgabe-Inventar: Checklist-Cards**

Keine Tabelle, sondern Karten mit Checkboxen:
```
┌─────────────────────────┐
│ [x] MacBook Pro 14"     │
│     SN: C02XG1HQLVDL    │
│     Zurueck: 15.04.2026 │
│     Zustand: Gut         │
└─────────────────────────┘
```

**7. Mobile-First fuer Magic-Link-Seiten**

Exit-Survey und Zeugnis-Bewertung werden ueber Magic Links aufgerufen -- haeufig auf dem Smartphone. Diese Seiten muessen mobile-first designt sein:
- Grosse Touch-Targets (min. 44x44px)
- Keine horizontalen Scrollbars
- Sterne-Bewertung per Touch
- Zwischenspeichern bei Seitennavigation

### H.3 Anti-Patterns vermeiden

1. **Kein Modal-in-Modal.** Das aktuelle "Neuer Vorgang"-Modal ist bereits gross. Kein weiteres Modal darin oeffnen.
2. **Keine Tabelle mit 10+ Spalten.** Die Onboarding-Tabelle hat 8 Spalten -- an der Grenze. Offboarding sollte nicht mehr haben.
3. **Keine Pflichtfelder, die erst spaeter relevant werden.** Bei Erstellung nur das Minimum abfragen. Details koennen spaeter ergaenzt werden.
4. **Keine technischen Begriffe in der UI.** Statt "OffboardingStatus: HANDOVER_PHASE" → "Uebergabe laeuft".

---

## Zusammenfassung

### Top-5-Handlungsempfehlungen

1. **Striktes MVP definieren.** Phase 1 ohne Exit-Interview, ohne Zeugnis, ohne LOGA. Nur CRUD + Checkliste + Dashboard-Tab. Alles andere ist Phase 2+.

2. **Datenmodell konsolidieren.** Die fuenf Dokumente schlagen leicht unterschiedliche Enum-Namen, Feld-Namen und Modell-Strukturen vor. Vor dem ersten Commit muss ein verbindliches Prisma-Schema stehen, das alle Widersprueche aufloest.

3. **Exit-Interview und Zeugnis als eigenstaendige Module planen.** Beide sind komplex genug fuer eigene Planungsdokumente mit eigenem Scope. Sie sollten nicht als "Feature" des Offboarding-Moduls betrachtet werden, sondern als eigenstaendige Module, die mit dem Offboarding verknuepft sind.

4. **Technische Schulden vor Phase 1 beheben.** `$transaction` in der bestehenden Onboarding-API ist ein Muss. Die `displayId`-Generierung sollte auf Unique-Constraint + Retry umgestellt werden.

5. **UX-Review nach Phase 1.** Bevor Phase 2 startet: Das HR-Team (Dimitri + Kollegen) testet den MVP 1-2 Wochen im Alltag. Feedback einsammeln. Dann Phase 2 planen.

### Gesamturteil

Die Planungsdokumente sind **ueberdurchschnittlich gruendlich**. Die Architektur-Entscheidung (eigenes Modell, parallele API) ist korrekt. Die Risiken sind benannt. Die DSGVO-Anforderungen sind dokumentiert.

Die Hauptgefahr liegt nicht in der technischen Umsetzung, sondern im **Scope Management**. Dimitri hat zu vielen Features "JA" gesagt. Jedes einzelne ist sinnvoll. Aber alle gleichzeitig zu bauen, wuerde das Projekt auf 4-5 Monate aufblaehen statt der angenommenen 5-6 Wochen. Ein strikter Phasenplan mit klarem MVP ist der Schluessel zum Erfolg.

---

*Dieser Bericht wurde als kritische Gegenpruefung erstellt. Er soll nicht demotivieren, sondern sicherstellen, dass die Umsetzung auf einem soliden Fundament steht.*
