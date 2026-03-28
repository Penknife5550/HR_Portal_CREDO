# Abteilungs-Einbindung per Magic Link & Funktions-E-Mails

**Stand:** 2026-03-27
**Feature:** Beteiligte Abteilungen erhalten eigene Magic Links fuer ihre Offboarding-Aufgaben

---

## Konzept

Beim Offboarding sind mehrere Abteilungen beteiligt (HR, IT, Vorgesetzter, Facility Management, Buchhaltung). Jede Abteilung erhaelt per **Funktions-E-Mail** einen **Magic Link** mit ihren spezifischen Checklisten-Aufgaben. HR und Vorgesetzter haben jederzeit den Ueberblick ueber den Gesamtfortschritt.

---

## Ablauf

```
HR erstellt Offboarding-Vorgang
         |
         v
System weist Checklisten-Items den Abteilungen zu
         |
         +--> Magic Link an IT-Abteilung (it@gymnasium-minden.de)
         |    "3 Aufgaben fuer Sie: Zugaenge sperren, Geraete, Lizenzen"
         |
         +--> Magic Link an Facility (hausmeister@gymnasium-minden.de)
         |    "1 Aufgabe: Schluessel/Zugangskarten zuruecknehmen"
         |
         +--> Magic Link an Buchhaltung (buchhaltung@credo-gruppe.de)
         |    "2 Aufgaben: Resturlaub abrechnen, Endabrechnung"
         |
         +--> Magic Link an Vorgesetzten (schulleitung@gymnasium-minden.de)
              "4 Aufgaben: Uebergabe, Zeugnis-Bewertung, Team informieren"

         Jede Abteilung sieht NUR ihre eigenen Aufgaben
         und kann diese abhaken + Kommentar hinterlassen

         HR sieht ALLES im Dashboard (Gesamtfortschritt)
         Vorgesetzter sieht Gesamtfortschritt (ohne sensible HR-Daten)

REMINDER:
  Tag +3:  "2 von 3 Aufgaben noch offen"
  Tag +7:  "1 Aufgabe ueberfaellig!"
  Individuell: X Tage vor Faelligkeitsdatum
```

---

## Funktions-E-Mails: Verwaltung im Portal

### Wo werden sie gepflegt?

In den **Einstellungen** (bestehende Seite `/einstellungen`) kommt ein neuer Tab:

```
[Webhooks]  [SMTP]  [E-Mail-Vorlagen]  [Abteilungen]
                                        ^^^^^^^^^^^

+------------------------------------------------------------------+
|  Abteilungs-Funktionsadressen                                    |
|                                                                    |
|  Diese E-Mail-Adressen erhalten automatisch Magic Links          |
|  fuer zugewiesene Offboarding-Aufgaben.                          |
|                                                                    |
|  +------------------------------------------------------------+  |
|  | Abteilung          | Funktions-E-Mail          | Status    |  |
|  |--------------------|---------------------------|-----------|  |
|  | IT-Abteilung       | support@cdc-owl.de        | Aktiv     |  |
|  | Facility Mgmt.     | gebaeudewirtschaft@fes-minden.de  | Aktiv     |  |
|  | Buchhaltung        | buchhaltung@fes-minden.de| Aktiv    |  |
|  | Datenschutz        | dsb@credo-gruppe.de       | Aktiv     |  |
|  +------------------------------------------------------------+  |
|                                                                    |
|  PRO EINRICHTUNG (optional, ueberschreibt zentral):              |
|  +------------------------------------------------------------+  |
|  | Einrichtung        | Abteilung     | E-Mail               |  |
|  |--------------------|---------------|-----------------------|  |
|  | Gymnasium Minden   | IT            | it@gym-minden.de     |  |
|  | Gymnasium Minden   | Facility      | hm@gym-minden.de     |  |
|  | KiTa Minden        | IT            | (zentral)            |  |
|  | KiTa Minden        | Facility      | hm@kita-minden.de   |  |
|  +------------------------------------------------------------+  |
|                                                                    |
|  [+ Abteilung hinzufuegen]                                       |
|                                                                    |
+------------------------------------------------------------------+
```

### Logik: Zentral vs. Einrichtung

```
Beim Versand eines Magic Links:

1. Gibt es eine einrichtungsspezifische E-Mail fuer diese Abteilung?
   JA  --> Verwende einrichtungsspezifische E-Mail
   NEIN --> Verwende zentrale Funktions-E-Mail

Beispiel:
  Offboarding am Gymnasium Minden, Abteilung "IT"
  --> Einrichtungs-E-Mail vorhanden: it@gym-minden.de
  --> Magic Link geht an: it@gym-minden.de

  Offboarding an der KiTa Minden, Abteilung "IT"
  --> Keine Einrichtungs-E-Mail
  --> Fallback auf zentral: it@credo-gruppe.de
```

---

## Magic-Link-Seite fuer Abteilungen

```
+------------------------------------------------------------------+
|  CREDO HR-Portal                                                  |
|  ---------------------------------------------------------------- |
|  Offboarding-Aufgaben: IT-Abteilung                              |
|  Mitarbeiter: Max Mustermann | Gymnasium Minden                  |
|  Letzter Arbeitstag: 31.07.2026 (noch 94 Tage)                  |
+------------------------------------------------------------------+
|                                                                    |
|  Ihre offenen Aufgaben:                                           |
|                                                                    |
|  +----------------------------------------------------------+    |
|  |                                                           |    |
|  |  [ ] E-Mail-Account sperren              Faellig: 31.07. |    |
|  |      Abwesenheitsassistent aktivieren,                    |    |
|  |      Weiterleitung einrichten                             |    |
|  |      Kommentar: [________________________]                |    |
|  |                                                           |    |
|  |  [ ] VPN & Cloud-Zugaenge deaktivieren   Faellig: 31.07. |    |
|  |      Office 365, VPN, Intranet, WLAN                     |    |
|  |      Kommentar: [________________________]                |    |
|  |                                                           |    |
|  |  [ ] Software-Lizenzen freigeben         Faellig: 01.08. |    |
|  |      Adobe, MS Office Einzellizenz                        |    |
|  |      Kommentar: [________________________]                |    |
|  |                                                           |    |
|  +----------------------------------------------------------+    |
|                                                                    |
|  Bereits erledigte Aufgaben:                                      |
|  +----------------------------------------------------------+    |
|  |  [x] Geraete-Ruecknahme vorbereiten     Erledigt: 20.06. |    |
|  |      "MacBook Pro SN#ABC123 auf Liste"                    |    |
|  +----------------------------------------------------------+    |
|                                                                    |
|  Gesamtfortschritt dieses Offboardings:                           |
|  [=========>              ] 42% (8 von 19 Aufgaben erledigt)     |
|                                                                    |
|  Hinweis: Sie sehen nur die Ihnen zugewiesenen Aufgaben.         |
|  Bei Fragen wenden Sie sich an die Personalabteilung.            |
|                                                                    |
+------------------------------------------------------------------+
```

---

## Vorgesetzten-Ansicht (Magic Link)

Der Vorgesetzte sieht mehr als andere Abteilungen:

```
+------------------------------------------------------------------+
|  CREDO HR-Portal                                                  |
|  ---------------------------------------------------------------- |
|  Offboarding-Uebersicht: Max Mustermann                         |
|  Gymnasium Minden | Lehrkraft | Austritt: 31.07.2026            |
+------------------------------------------------------------------+
|                                                                    |
|  IHRE AUFGABEN:                                                   |
|  +----------------------------------------------------------+    |
|  |  [ ] Team ueber Austritt informieren     Faellig: 22.04. |    |
|  |  [ ] Uebergabeplan erstellen             Faellig: 25.04. |    |
|  |  [ ] Wissenstransfer begleiten           Faellig: 15.07. |    |
|  |  [ ] Zeugnis-Bewertung abgeben           Faellig: 20.07. |    |
|  |      [Zur Zeugnis-Bewertung -->]  (separater Magic Link)  |    |
|  +----------------------------------------------------------+    |
|                                                                    |
|  GESAMTFORTSCHRITT (alle Abteilungen):                           |
|  +----------------------------------------------------------+    |
|  |  Abteilung        | Fortschritt | Status                  |    |
|  |--------------------|-------------|------------------------|    |
|  |  HR                | 5/7         | 2 offen                |    |
|  |  IT                | 1/4         | 3 offen, 1 ueberfaellig|    |
|  |  Facility          | 0/2         | Noch nicht begonnen    |    |
|  |  Buchhaltung       | 1/2         | 1 offen                |    |
|  |  Vorgesetzter      | 1/4         | 3 offen                |    |
|  |  -------------------------------------------               |    |
|  |  GESAMT            | 8/19 (42%)  |                        |    |
|  +----------------------------------------------------------+    |
|                                                                    |
|  Sensible HR-Daten (Abfindung, Kuendigungsgrund) sind NICHT      |
|  sichtbar fuer den Vorgesetzten.                                 |
|                                                                    |
+------------------------------------------------------------------+
```

---

## HR-Dashboard: Abteilungs-Ueberblick

In der Detail-Ansicht des Offboardings sieht HR den Status aller Abteilungen:

```
TAB: Checkliste (HR-Ansicht, erweitert)

+------------------------------------------------------------------+
|                                                                    |
|  Filter: [Alle Abteilungen v]  [Nur offene v]                   |
|                                                                    |
|  ABTEILUNG: HR                                     5/7 erledigt  |
|  [x] Kuendigungsbestaetigung           HR Mueller    15.04.      |
|  [x] Frist berechnen                   HR Mueller    15.04.      |
|  [x] IT informieren                    HR Mueller    16.04.      |
|  [x] Resturlaub pruefen                HR Schmidt    18.04.      |
|  [x] Stellenausschreibung              HR Mueller    20.04.      |
|  [ ] Arbeitszeugnis erstellen          HR Schmidt    Faellig!    |
|  [ ] SV-Abmeldung                      HR Schmidt    01.09.      |
|                                                                    |
|  ABTEILUNG: IT                                     1/4 erledigt  |
|  [x] Geraete-Ruecknahme vorbereiten    IT (Link)     20.06.      |
|  [ ] E-Mail-Account sperren            IT (Link)     31.07.      |
|  [ ] VPN & Cloud deaktivieren          IT (Link)     31.07.      |
|  [ ] Lizenzen freigeben                IT (Link)     01.08.      |
|      Link versendet: 16.04. | Zuletzt geoeffnet: 20.06.         |
|      [Reminder senden]                                            |
|                                                                    |
|  ABTEILUNG: Facility                               0/2 erledigt  |
|  [ ] Schluessel zuruecknehmen          Facility      30.07.      |
|  [ ] Zugangscodes aendern              Facility      31.07.      |
|      Link versendet: 16.04. | Noch nicht geoeffnet              |
|      [Reminder senden]  <-- manueller Reminder-Button            |
|                                                                    |
|  ABTEILUNG: Vorgesetzter                           1/4 erledigt  |
|  [x] Team informiert                   VG (Link)     18.04.      |
|  [ ] Uebergabeplan                     VG (Link)     25.04.      |
|  [ ] Wissenstransfer                   VG (Link)     15.07.      |
|  [ ] Zeugnis-Bewertung                 VG (Link)     20.07.      |
|      Link versendet: 16.04. | Zuletzt geoeffnet: 18.04.         |
|      [Reminder senden]                                            |
|                                                                    |
|  ABTEILUNG: Buchhaltung                            1/2 erledigt  |
|  [x] Resturlaub abgerechnet            Buchhltg.     25.06.      |
|  [ ] Endabrechnung erstellen           Buchhltg.     31.07.      |
|                                                                    |
+------------------------------------------------------------------+
```

---

## Reminder-System

### Automatische Reminder (via n8n Cron)

```
CRON-JOB: Taeglich um 08:00 Uhr

1. Finde alle aktiven Offboardings
2. Fuer jede Abteilung mit offenen Aufgaben:
   a) Ist eine Aufgabe in 3 Tagen faellig? --> Erinnerung senden
   b) Ist eine Aufgabe ueberfaellig?       --> Eskalation senden
   c) Wurde der Link noch nie geoeffnet?   --> Nach 5 Tagen erneut senden

REMINDER-STUFEN:
+----------+------------------------------------------+------------------+
| Stufe    | Ausloeser                                | Empfaenger       |
+----------+------------------------------------------+------------------+
| Info     | Aufgabe in 3 Tagen faellig               | Abteilung        |
| Warnung  | Aufgabe 1 Tag ueberfaellig               | Abteilung + HR   |
| Eskalation| Aufgabe 3+ Tage ueberfaellig            | Abteilung + HR   |
|          |                                          | + Vorgesetzter   |
+----------+------------------------------------------+------------------+

E-MAIL-INHALT (Beispiel Reminder):

  Betreff: "Offboarding Max Mustermann: 2 Aufgaben offen (IT)"

  Hallo IT-Team,

  fuer das Offboarding von Max Mustermann (Gymnasium Minden)
  sind noch 2 Aufgaben offen:

  - E-Mail-Account sperren (faellig: 31.07.)
  - VPN-Zugaenge deaktivieren (faellig: 31.07.)

  [Aufgaben jetzt erledigen -->]  (Magic Link)

  Bei Fragen: personalabteilung@credo-gruppe.de
```

### Manueller Reminder (HR-Button)

```
HR sieht im Dashboard bei jeder Abteilung einen [Reminder senden]-Button.
Klick --> Sofort neuer Magic Link + E-Mail an die Funktionsadresse.
AuditLog: "HR Mueller hat Reminder an IT gesendet (OFF-2026-GYM-003)"
```

---

## Webhook-Events (Erweiterung bestehende Struktur)

Neue Events fuer `webhooks.ts`:

```typescript
export type WebhookEvent =
  // Bestehende Onboarding-Events
  | "onboarding-created"
  | "questionnaire-completed"
  | "supervisor-link-created"
  | "supervisor-completed"
  | "employee-reminder"
  | "supervisor-reminder"
  // Neue Offboarding-Events
  | "offboarding-created"
  | "offboarding-completed"
  | "offboarding-department-assigned"    // NEU: Abteilung wurde Aufgaben zugewiesen
  | "offboarding-department-completed"   // NEU: Abteilung hat alle Aufgaben erledigt
  | "offboarding-task-completed"         // NEU: Einzelne Aufgabe wurde abgehakt
  | "offboarding-task-overdue"           // NEU: Aufgabe ist ueberfaellig
  | "offboarding-reminder"              // NEU: Reminder an Abteilung
  | "exit-survey-sent"                   // NEU: Exit-Survey versendet
  | "exit-survey-completed"              // NEU: Exit-Survey ausgefuellt
  | "certificate-assessment-sent"        // NEU: Zeugnis-Bewertung versendet
  | "certificate-assessment-completed"   // NEU: Zeugnis-Bewertung abgeschlossen
  | (string & Record<never, never>);
```

### Webhook-Payloads

```json
// offboarding-department-assigned
{
  "event": "offboarding-department-assigned",
  "timestamp": "2026-04-16T08:00:00Z",
  "data": {
    "offboardingId": "uuid",
    "offboardingDisplayId": "OFF-2026-GYM-003",
    "employeeName": "Max Mustermann",
    "organizationName": "Gymnasium Minden",
    "lastWorkingDay": "2026-07-31",
    "department": {
      "name": "IT-Abteilung",
      "email": "it@gym-minden.de",
      "magicLink": "https://hr.fes-credo.de/offboarding-tasks/{token}",
      "tokenExpiresAt": "2026-08-15T00:00:00Z"
    },
    "tasks": [
      { "title": "E-Mail-Account sperren", "dueDate": "2026-07-31" },
      { "title": "VPN-Zugaenge deaktivieren", "dueDate": "2026-07-31" },
      { "title": "Lizenzen freigeben", "dueDate": "2026-08-01" }
    ],
    "totalTaskCount": 3
  }
}

// offboarding-reminder
{
  "event": "offboarding-reminder",
  "timestamp": "2026-07-28T08:00:00Z",
  "data": {
    "offboardingDisplayId": "OFF-2026-GYM-003",
    "employeeName": "Max Mustermann",
    "department": {
      "name": "IT-Abteilung",
      "email": "it@gym-minden.de",
      "magicLink": "https://hr.fes-credo.de/offboarding-tasks/{token}"
    },
    "reminderLevel": "WARNING",
    "openTasks": [
      { "title": "E-Mail-Account sperren", "dueDate": "2026-07-31", "daysUntilDue": 3 }
    ],
    "completedTasks": 1,
    "totalTasks": 4
  }
}

// offboarding-task-completed
{
  "event": "offboarding-task-completed",
  "timestamp": "2026-07-31T14:30:00Z",
  "data": {
    "offboardingDisplayId": "OFF-2026-GYM-003",
    "task": {
      "title": "E-Mail-Account sperren",
      "department": "IT-Abteilung",
      "completedAt": "2026-07-31T14:30:00Z",
      "comment": "Abwesenheitsassistent aktiviert, Weiterleitung an hr@gym-minden.de"
    },
    "progress": {
      "completed": 2,
      "total": 4,
      "percentage": 50
    }
  }
}
```

---

## Datenmodell-Erweiterungen

### Neues Modell: DepartmentConfig

```prisma
// Abteilungs-Funktions-E-Mails (zentral + pro Einrichtung)
model DepartmentConfig {
  id              String        @id @default(uuid())

  departmentKey   String        // "IT", "FACILITY", "BUCHHALTUNG", "DSB", etc.
  departmentName  String        // "IT-Abteilung"
  email           String        // Funktions-E-Mail

  // Optional: Einrichtungs-spezifisch
  organizationId  String?       // null = zentral (gilt fuer alle)
  organization    Organization? @relation(fields: [organizationId], references: [id])

  isActive        Boolean       @default(true)

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@unique([departmentKey, organizationId])  // Pro Einrichtung nur eine E-Mail pro Abteilung
  @@map("department_configs")
}
```

### Erweiterung: OffboardingChecklistItem

```prisma
model OffboardingChecklistItem {
  // ... bestehende Felder ...

  // NEU: Abteilungs-Zuordnung
  assigneeDepartment  String?       // "IT", "FACILITY", "BUCHHALTUNG", "HR", "VORGESETZTER"
  assigneeEmail       String?       // Aufgeloeste E-Mail (aus DepartmentConfig)

  // NEU: Magic-Link-Tracking
  magicLinkToken      String?       @unique
  magicLinkExpiresAt  DateTime?
  magicLinkSentAt     DateTime?
  magicLinkOpenedAt   DateTime?     // Wann wurde der Link zuerst geoeffnet?

  // NEU: Reminder-Tracking
  lastReminderSentAt  DateTime?
  reminderCount       Int           @default(0)
}
```

### Neues Modell: OffboardingDepartmentLink (Magic Link pro Abteilung)

```prisma
// Ein Magic Link pro Abteilung pro Offboarding
// (damit nicht jedes Item einen eigenen Token braucht)
model OffboardingDepartmentLink {
  id              String              @id @default(uuid())
  offboardingId   String
  offboarding     OffboardingProcess  @relation(fields: [offboardingId], references: [id], onDelete: Cascade)

  departmentKey   String              // "IT", "FACILITY", etc.
  departmentName  String
  email           String              // Die aufgeloeste E-Mail

  // Token
  token           String              @unique
  expiresAt       DateTime

  // Tracking
  sentAt          DateTime?
  firstOpenedAt   DateTime?
  lastOpenedAt    DateTime?
  openCount       Int                 @default(0)

  // Reminder
  lastReminderAt  DateTime?
  reminderCount   Int                 @default(0)

  // Status
  allTasksComplete  Boolean           @default(false)
  completedAt       DateTime?

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([offboardingId, departmentKey])
  @@map("offboarding_department_links")
}
```

---

## API-Endpunkte (Neu)

```
// Abteilungs-Konfiguration (Admin)
GET    /api/settings/departments          — Alle Abteilungen + E-Mails
POST   /api/settings/departments          — Neue Abteilung anlegen
PATCH  /api/settings/departments/[id]     — E-Mail aendern
DELETE /api/settings/departments/[id]     — Abteilung entfernen

// Abteilungs-Links pro Offboarding
POST   /api/offboarding/[id]/department-links          — Links generieren + versenden
GET    /api/offboarding/[id]/department-links          — Status aller Abteilungs-Links
POST   /api/offboarding/[id]/department-links/remind   — Manueller Reminder

// Oeffentliche Magic-Link-Seite (kein Login)
GET    /api/offboarding-tasks/[token]     — Aufgaben fuer diese Abteilung laden
PATCH  /api/offboarding-tasks/[token]/[itemId]  — Aufgabe abhaken + Kommentar

// Vorgesetzten-Uebersicht (Magic Link, erweiterter Zugriff)
GET    /api/offboarding-overview/[token]  — Gesamtfortschritt (ohne sensible Daten)
```

---

## n8n-Workflows (Neu/Erweitert)

### Workflow 1: Abteilungs-Benachrichtigung

```
Trigger: Webhook "offboarding-department-assigned"
    |
    v
E-Mail an Funktionsadresse:
    Betreff: "Offboarding [Name]: [X] Aufgaben fuer [Abteilung]"
    Body: Aufgabenliste + Magic Link + Fristen
    |
    v
Bestaetigung an HR:
    "[Abteilung] wurde ueber Offboarding [ID] informiert"
```

### Workflow 2: Automatische Reminder

```
Trigger: Cron (taeglich 08:00)
    |
    v
HR-Portal API aufrufen: GET /api/cron/offboarding-reminders
    |
    v
Fuer jeden faelligen Reminder:
    |
    +--> Stufe INFO (3 Tage vor Faelligkeit):
    |    E-Mail an Abteilung: "Erinnerung: [X] Aufgaben bald faellig"
    |
    +--> Stufe WARNUNG (1 Tag ueberfaellig):
    |    E-Mail an Abteilung + HR: "Aufgabe ueberfaellig!"
    |
    +--> Stufe ESKALATION (3+ Tage ueberfaellig):
         E-Mail an Abteilung + HR + Vorgesetzter: "ESKALATION"
```

### Workflow 3: Aufgabe erledigt

```
Trigger: Webhook "offboarding-task-completed"
    |
    v
E-Mail an HR: "[Abteilung] hat [Aufgabe] erledigt (Fortschritt: X%)"
    |
    v
Wenn alle Aufgaben der Abteilung erledigt:
    Webhook: "offboarding-department-completed"
    E-Mail an HR: "[Abteilung] hat alle Aufgaben abgeschlossen"
    |
    v
Wenn ALLE Abteilungen fertig:
    Webhook: "offboarding-completed"
    E-Mail an HR: "Offboarding [ID] vollstaendig abgeschlossen"
```

---

## Einordnung in den Phasenplan

| Feature | Phase |
|---------|-------|
| DepartmentConfig-Modell + Admin-UI | Phase 1 (MVP) |
| Checklisten-Items mit Abteilungs-Zuordnung | Phase 1 (MVP) |
| Magic Links an Abteilungen generieren + versenden | Phase 1 (MVP) |
| Oeffentliche Aufgaben-Seite (Magic Link) | Phase 1 (MVP) |
| HR-Dashboard: Abteilungs-Fortschritt | Phase 1 (MVP) |
| Webhook-Events (department-assigned, task-completed) | Phase 1 (MVP) |
| Automatische Reminder (n8n Cron) | Phase 1 (MVP) |
| Manueller Reminder-Button | Phase 1 (MVP) |
| Vorgesetzten-Uebersicht (Magic Link) | Phase 1 (MVP) |
| Eskalations-Logik (3-stufig) | Phase 2 |

**Begruendung:** Die Abteilungs-Einbindung ist ein Kern-Feature des Offboardings und gehoert in Phase 1. Ohne die Abteilungs-Magic-Links ist das Offboarding nur ein internes HR-Tool -- mit den Links wird es ein abteilungsuebergreifender Workflow.
