# Advocatus Diaboli: Kritische Analyse des CREDO HR-Portals fuer Offboarding-Integration

**Datum:** 2026-03-27
**Analysiert von:** Technischer Analyst (Advocatus Diaboli)
**Gegenstand:** CREDO HR-Portal — Offboarding-Erweiterung

---

## Zusammenfassung (Executive Summary)

Das bestehende HR-Portal ist ein **solides Onboarding-System**, das jedoch architektonisch als **Einzweck-Anwendung** konzipiert wurde. Die Namensgebung (`OnboardingProcess`, `onboarding_processes`, `onboardingId`), die Datenstrukturen und die gesamte UI sind auf den Einstellungsprozess zugeschnitten. Eine Offboarding-Integration ist **machbar, aber nicht trivial**. Der groesste Risikofaktor ist die enge Kopplung zwischen dem generischen Prozessmodell und onboarding-spezifischer Logik.

**Gesamtbewertung Aufwand:** Mittel bis hoch (geschaetzt 15-25 Entwicklertage)
**Risikobewertung:** Mittel — hauptsaechlich durch DSGVO-Anforderungen und Datenmodell-Vererbung

---

## 1. Datenmodell-Analyse

### 1.1 Was wiederverwendet werden kann

| Modell | Wiederverwendbar? | Anmerkung |
|--------|:-:|---|
| `Organization` | Ja, 1:1 | Mandantenzuordnung ist identisch |
| `User` (HR-Team) | Ja, 1:1 | Rollen und Auth bleiben gleich |
| `AuditLog` | Ja, 1:1 | Generisch genug (`onboardingId` muss allerdings umbenannt oder erweitert werden) |
| `Document` | Teilweise | `DocumentType`-Enum ist onboarding-spezifisch (ARBEITSVERTRAG, FUEHRUNGSZEUGNIS etc.) |
| `ChecklistTemplate` / `ChecklistItem` | Ja, konzeptionell | Checklisten-Mechanik ist identisch, braucht aber eigene Offboarding-Templates |
| `OnboardingNote` | Ja, konzeptionell | Mechanik identisch, Name falsch |
| `WebhookConfig` / `EmailTemplate` | Ja, 1:1 | Neues Event "offboarding-created" etc. hinzufuegen |
| `SmtpConfig` | Ja, 1:1 | Infrastruktur-Singleton |

### 1.2 Was fehlt komplett

**Kritische Luecken fuer Offboarding:**

1. **Kein `OffboardingData`-Modell** — Das Pendant zu `PersonalData` existiert nicht. Offboarding braucht voellig andere Felder:
   - Kuendigungsgrund (arbeitnehmer-/arbeitgeberseitig, aufhebung, befristungsende, rente, tod)
   - Letzter Arbeitstag
   - Austrittsdatum (kann abweichen!)
   - Abfindungsregelung
   - Resturlaub (Tage, Auszahlung?)
   - Ueberstundenabgeltung
   - Wettbewerbsverbot
   - Zeugnis-Status (einfach/qualifiziert, Entwurf, versendet)
   - Rueckgabe-Inventar (Schluessel, Laptop, Dienstwagen, Zugangskarten)
   - Sperrfrist Arbeitsagentur (bei Eigenkuendigung)
   - Abmeldungen (Krankenkasse, VBL/ZVK, Berufsgenossenschaft)

2. **Kein Datenloesch-Mechanismus (DSGVO Art. 17)** — Es gibt keinerlei Logik zum Loeschen oder Anonymisieren von Personaldaten nach Ablauf der Aufbewahrungsfristen. Das ist nicht nur ein Offboarding-Problem, sondern ein grundsaetzliches Defizit.

3. **Keine Mitarbeiter-Stammdaten-Tabelle** — Es gibt nur `PersonalData` als Onboarding-Snapshot. Ein Offboarding muesste auf die gleichen Stammdaten zugreifen, aber es gibt keinen persistenten `Employee`-Record. Das ist der **fundamentalste architektonische Mangel**.

4. **Keine Verknuepfung zwischen Onboarding und Offboarding** — Wenn ein Mitarbeiter ongeboardet wurde und spaeter offgeboardet wird, gibt es keinen Link zwischen den beiden Vorgaengen.

### 1.3 Was erweitert werden muss

- `ProcessType` Enum: `KUENDIGUNG` existiert bereits, aber...
- `OnboardingStatus` Enum: Die Status sind onboarding-spezifisch (`INVITED`, `SUBMITTED`, `SUPERVISOR_PENDING`). Offboarding hat andere Phasen.
- `DocumentType` Enum: Braucht Erweiterungen (KUENDIGUNG, ZEUGNIS_EINFACH, ZEUGNIS_QUALIFIZIERT, AUFHEBUNGSVERTRAG, ABFINDUNGSVEREINBARUNG, ARBEITSBESCHEINIGUNG, SPERRZEIT_ANTRAG)
- `AuditLog.onboardingId`: Muesste zu `processId` oder aehnlich generalisiert werden, oder ein optionales `offboardingId` dazukommen.

### 1.4 Kritische Frage: Eigenes Modell oder Erweiterung?

**Problem:** Das `OnboardingProcess`-Modell hat 30+ Felder, die ausschliesslich fuer Onboarding relevant sind (`token`, `tokenExpiresAt`, `supervisorToken`, `formTemplateVersion`, `formTemplateSnapshot`, `questionnaireType`). Ein Offboarding braucht davon fast nichts, hat aber eigene Felder.

**Wenn wir `OnboardingProcess` erweitern:**
- Pro: Eine Tabelle, ein Dashboard, einfachere Queries
- Contra: Die Tabelle wird ein Monster mit 50+ Spalten, davon 60% jeweils NULL. Nullable-Felder-Hoelle. Jede Query muss nach `processType` filtern. Bestehende Indizes werden ineffizienter.

**Wenn wir ein eigenes `OffboardingProcess`-Modell erstellen:**
- Pro: Saubere Trennung, kein Risiko bestehende Onboarding-Logik zu brechen, spezifische Status und Felder
- Contra: Code-Duplizierung bei Checklisten, Notizen, Dokumenten. Dashboard braucht Union-Queries.

---

## 2. Enum/Status-Analyse

### 2.1 OnboardingStatus — Fundamentales Problem

Die aktuellen Status sind **nicht uebertragbar** auf Offboarding:

```
INVITED              → Nicht relevant (kein Magic-Link-basierter Prozess)
IN_PROGRESS          → Bedingt relevant
SUBMITTED            → Andere Semantik
SUPERVISOR_PENDING   → Eventuell relevant (Vorgesetzter muss Austritt bestaetigen)
SUPERVISOR_SUBMITTED → Eventuell relevant
REVIEWED             → Relevant (HR prueft)
COMPLETED            → Relevant
EXPIRED              → Nicht relevant (Offboarding laeuft nicht ab)
```

**Offboarding braeuchte:**
```
INITIATED            → HR oder Vorgesetzter hat Austritt gemeldet
PENDING_APPROVAL     → Wartet auf Genehmigung (z.B. Geschaeftsfuehrung bei Aufhebung)
NOTICE_PERIOD        → In Kuendigungsfrist
HANDOVER_PHASE       → Uebergabe laeuft
EXIT_INTERVIEW       → Austrittsgespraech ausstehend
IT_DEPROVISIONING    → IT-Accounts/Zugaenge werden entfernt
FINAL_SETTLEMENT     → Endabrechnung laeuft
COMPLETED            → Alles erledigt
CANCELLED            → Kuendigung zurueckgenommen
```

**Fazit:** Ein gemeinsamer `OnboardingStatus` fuer beide Prozesse ist **nicht sinnvoll**. Die Zustandsautomaten sind zu unterschiedlich.

### 2.2 ProcessType

`KUENDIGUNG` existiert bereits im Enum — das ist gut. Aber:
- Es ist zu unspezifisch. "Kuendigung" ist nur einer von vielen Austrittsgruenden.
- In der UI (`neuer-vorgang-modal.tsx`, Zeile 266) ist der Typ `disabled` — nie implementiert.
- Die API (`route.ts`, Zeile 81) akzeptiert `KUENDIGUNG` zwar als validen ProcessType, aber die gesamte Folgelogik (PersonalData-Erstellung, Checklisten-Zuweisung, Template-Snapshot) ist auf Onboarding zugeschnitten.

### 2.3 QuestionnaireType — Nicht relevant

Fuer Offboarding gibt es keinen "Fragebogentyp" im selben Sinne. Man koennte argumentieren, dass verschiedene Austrittsarten (Kuendigung AN, Kuendigung AG, Aufhebung, Befristungsende, Rente) eine aehnliche Differenzierung brauchen, aber die Mechanik waere voellig anders.

---

## 3. API-Architektur-Analyse

### 3.1 Bestehende API-Struktur (31 Routes)

```
/api/auth                               — Login/Logout
/api/onboarding                         — CRUD Vorgaenge
/api/onboarding/[id]                    — Einzelvorgang
/api/onboarding/[id]/checklist          — Checklisten
/api/onboarding/[id]/checklist/[itemId] — Einzelnes Item
/api/onboarding/[id]/documents/[docId]  — Dokument-Management
/api/onboarding/[id]/export             — Daten-Export
/api/onboarding/[id]/notes              — Notizen
/api/onboarding/[id]/supervisor-link    — Vorgesetzten-Link
/api/fragebogen/[token]                 — Magic-Link Fragebogen
/api/fragebogen/[token]/documents       — Dokument-Upload (MA)
/api/modalitaeten/[token]               — Vorgesetzten-Formular
/api/organizations                      — Mandanten
/api/organizations/[id]                 — Einzelmandant
/api/users                              — HR-Benutzer
/api/users/[id]                         — Einzelbenutzer
/api/checklisten                        — Checklisten-Templates
/api/checklisten/[id]                   — Einzeltemplate
/api/checklisten/[id]/items             — Template-Items
/api/vorlagen                           — Formular-Templates
/api/vorlagen/[id]                      — Einzelvorlage
/api/vorlagen/[id]/preview              — Vorschau
/api/settings/webhooks                  — Webhook-Verwaltung
/api/settings/webhooks/[id]             — Einzelwebhook
/api/settings/webhooks/[id]/test        — Webhook-Test
/api/settings/smtp                      — SMTP-Config
/api/settings/smtp/test                 — SMTP-Test
/api/settings/email-templates           — E-Mail-Vorlagen
/api/settings/email-templates/[id]      — Einzelvorlage
/api/dashboard/stats                    — Dashboard-Statistiken
/api/cron/reminders                     — Erinnerungs-Cron
```

### 3.2 Kann die API erweitert werden?

**Nein, nicht direkt.** Die URLs sind hart auf `/api/onboarding/` gemappt. Optionen:

**Option A: Parallele API-Struktur**
```
/api/offboarding                         — CRUD
/api/offboarding/[id]                    — Einzelvorgang
/api/offboarding/[id]/checklist          — Offboarding-Checkliste
/api/offboarding/[id]/documents          — Austritts-Dokumente
/api/offboarding/[id]/notes              — Notizen
/api/offboarding/[id]/exit-data          — Austrittsdaten
```
- Pro: Klar getrennt, kein Risiko fuer bestehende API
- Contra: ~10-15 neue Route-Dateien mit viel Copy-Paste

**Option B: Generische `/api/processes/`-Struktur**
```
/api/processes?type=OFFBOARDING          — Alle Offboardings
/api/processes/[id]                      — Einzelvorgang (typ-agnostisch)
```
- Pro: Zukunftssicher (auch fuer Verbeamtung, Vertragsaenderung)
- Contra: Massives Refactoring der gesamten bestehenden API, Breaking Change

**Empfehlung:** Option A. Pragmatisch, risikoarm, aber mit dem Bewusstsein, dass spaetestens beim dritten Prozesstyp ein Refactoring faellig wird.

### 3.3 Abhaengigkeiten

- `/api/dashboard/stats` muss Offboarding-Vorgaenge einbeziehen
- `/api/cron/reminders` braucht Offboarding-Erinnerungen
- Die Webhook-Events muessen erweitert werden
- Die `n8n.ts` (wird in `onboarding/route.ts` importiert als `triggerN8nWebhook`) muss generalisiert werden

---

## 4. UI/UX-Bedenken

### 4.1 Dashboard

Das aktuelle Dashboard (`dashboard-content.tsx`) ist **hart auf Onboarding kodiert:**
- Titel: "Onboarding-Vorgaenge" (Zeile 294)
- Status-Kacheln: Zaehlen nur Onboarding-Status
- Tabelle: Spalten wie "Fragebogen" und "Vorgesetzter" sind onboarding-spezifisch
- Charts: `StatusPieChart`, `MonthlyTrendChart` basieren auf Onboarding-Daten
- Filter: Kein Prozesstyp-Filter

**Optionen:**
1. **Tabs im Dashboard:** "Onboarding | Offboarding | Alle" — einfachste Loesung
2. **Einheitliches Dashboard mit Prozesstyp-Filter** — eleganter, aber mehr Aufwand
3. **Separate Dashboard-Seiten** — `/dashboard/onboarding` und `/dashboard/offboarding`

**Kritik an Option 1/2:** Die Tabellenspalten sind fundamental unterschiedlich. Onboarding zeigt "Fragebogen-Fortschritt" und "Vorgesetzter-Status". Offboarding muesste "Letzter Arbeitstag", "Kuendigungsfrist" und "Rueckgabe-Status" zeigen. Ein gemeinsamer Tabellen-View waere entweder uebermaessig komplex oder unbefriedigend.

### 4.2 Detail-Ansicht

Die Detail-Seite (`detail-content.tsx`) hat 5 Tabs:
- Uebersicht | Fragebogen-Daten | Dokumente | Checkliste | Vorgesetzter

Fuer Offboarding brauchte man:
- Uebersicht | Austrittsdaten | Rueckgaben | Dokumente | Checkliste

Die bestehende Detail-Komponente ist **nicht wiederverwendbar** — sie ist zu stark mit onboarding-spezifischen Datenstrukturen verknuepft.

### 4.3 Navigation

Die aktuelle Navigation (`portal-header.tsx`) hat vermutlich Links zu Dashboard und Einstellungen. Offboarding braeuchte entweder:
- Einen eigenen Navigationspunkt
- Oder Integration als Filter/Tab im bestehenden Dashboard

### 4.4 Modal "Neuer Vorgang"

Der `NeuerVorgangModal` koennte theoretisch erweitert werden — er hat bereits ein `processType`-Dropdown. Aber:
- Die Felder nach dem Typ-Wechsel aendern sich komplett (kein Fragebogentyp fuer Offboarding, stattdessen: Austrittsgrund, letzter Arbeitstag, betroffener Mitarbeiter)
- Das Modal wird entweder monstroes oder man braucht ein separates `NeuerAustrittModal`

---

## 5. Sicherheitsbedenken (DSGVO)

### 5.1 Datenloesch-Pflicht

**DSGVO Art. 17 (Recht auf Loeschung)** und **Aufbewahrungsfristen** kollidieren:

| Datentyp | Aufbewahrungsfrist | Quelle |
|----------|:--:|---|
| Lohnabrechnungen | 6 Jahre | AO ss 147 |
| Sozialversicherungsdaten | 5 Jahre | SGB IV ss 28f |
| Personalakte allgemein | 3 Jahre nach Austritt | Verjaehrungsfrist BGB |
| Steuer-ID, IBAN | Loeschen bei Austritt | DSGVO Art. 17 |
| Bewerbungsunterlagen | 6 Monate | AGG ss 15 |
| Zeugnisse | Sofort nach Austritt loeschbar | — |

**Kritisches Problem:** Im aktuellen System gibt es **keinerlei Mechanismus** fuer:
- Automatische Datenloesung nach Fristablauf
- Anonymisierung statt Loeschung (fuer Statistiken)
- Dokumentation der Loeschung (Nachweis gegenueber Betroffenen)
- Differenzierte Loeschfristen pro Feld

Die `PersonalData` wird mit `onDelete: Cascade` geloescht, wenn der `OnboardingProcess` geloescht wird — aber wer loescht den? Und wann? Und wie wird sichergestellt, dass verschluesselte Felder (IBAN, SV-Nummer, Steuer-ID) nicht in Backups oder Logs verbleiben?

### 5.2 Verschluesselung

Die Verschluesselung (`encryption.ts`) schuetzt nur 3 Felder:
- IBAN
- Sozialversicherungsnummer
- Steuer-ID

**Fehlend bei Offboarding:**
- Abfindungshoehe (hochsensibel!)
- Kuendigungsgrund (besonders bei krankheitsbedingter oder verhaltensbedingter Kuendigung)
- Zeugnisinhalte (Leistungsbeurteilung)

### 5.3 Zugriffskontrolle

Beim Offboarding braucht man **restriktivere Zugriffsrechte:**
- Nicht jeder HR_SACHBEARBEITER sollte Kuendigungsgruende sehen koennen
- Abfindungsvereinbarungen sind oft nur fuer HR_LEITUNG + SUPER_ADMIN
- Juristische Korrespondenz muss separat geschuetzt werden

Das aktuelle Berechtigungsmodell (`UserRole`: SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER) ist **zu grob** fuer Offboarding-Szenarien.

---

## 6. Technische Schulden

### 6.1 Naming-Problem (schwerwiegend)

Die gesamte Codebase verwendet "Onboarding" als Praefx:
- `OnboardingProcess` (Modell)
- `OnboardingNote` (Modell)
- `OnboardingStatus` (Enum)
- `onboardingId` (FK in 8 Tabellen)
- `onboarding_processes` (DB-Tabellenname)
- `/api/onboarding/` (URL-Pfad)

Wenn Offboarding hinzukommt, wird das verwirrend. Ist `OnboardingProcess` mit `processType: KUENDIGUNG` ein "Onboarding"? Semantisch absurd.

**Entweder:**
- Vollstaendiges Rename zu `HRProcess` (Breaking Change, Migration notwendig)
- Oder eigenes Modell mit eigener Nomenklatur (Code-Duplizierung)

### 6.2 displayId-Generierung hat Race-Condition-Risiko

Die `displayId`-Generierung (`route.ts`, Zeile 64-77) nutzt `count + 1` mit einer Retry-Schleife. Unter Last koennen Kollisionen auftreten. Bei zwei parallelen Prozesstypen (Onboarding + Offboarding) verschaerft sich das Problem. Das Praefix (`2026-GYM-001`) unterscheidet nicht zwischen Prozesstypen.

**Empfehlung:** Offboarding-IDs brauchen ein eigenes Praefix (z.B. `OFF-2026-GYM-001`).

### 6.3 Fehlende Transaktionen

Die `POST /api/onboarding`-Route fuehrt 5 separate Datenbankoperationen aus (Create, PersonalData Create, FormTemplate Update, ChecklistItems CreateMany, Audit-Log Create) **ohne Prisma-Transaktion ($transaction)**. Bei einem Fehler nach Step 2 bleiben verwaiste Datensaetze zurueck. Dieses Pattern wuerde sich bei Offboarding wiederholen.

### 6.4 Hart-kodierte Schrittzahlen

In der Dashboard-Tabelle steht `Schritt ${ob.personalData.currentStep}/10` (Zeile 480). Die "10" ist hart kodiert. Offboarding hat eine andere Schrittzahl.

### 6.5 `triggerN8nWebhook` vs. `triggerWebhooks`

In `onboarding/route.ts` wird `triggerN8nWebhook` aus `@/lib/n8n` importiert. In `webhooks.ts` gibt es `triggerWebhooks`. Es existieren **zwei parallele Webhook-Mechanismen**. Das muss vor der Offboarding-Integration vereinheitlicht werden.

---

## 7. Risiken

### 7.1 Hohes Risiko

| Risiko | Auswirkung | Eintrittswahrscheinlichkeit |
|--------|:--:|:--:|
| DSGVO-Verstoss durch fehlende Loeschlogik | Bussgeld bis 4% Jahresumsatz | Hoch (derzeit keine Loeschfunktion) |
| Bestehende Onboarding-Funktionalitaet bricht | Produktionsausfall | Mittel (bei Schema-Migration) |
| Datenmodell-Entscheidung ist nicht zukunftsfaehig | Teures Refactoring spaeter | Mittel |

### 7.2 Mittleres Risiko

| Risiko | Auswirkung | Eintrittswahrscheinlichkeit |
|--------|:--:|:--:|
| Performance-Degradation bei gemeinsamer Tabelle | Langsame Queries | Niedrig-Mittel |
| Verwirrung bei HR-Nutzern durch gemischtes Dashboard | Fehlbedienung | Mittel |
| Webhook-Konfiguration wird unuebersichtlich | Fehlende Benachrichtigungen | Niedrig |

### 7.3 Niedrigeres Risiko

| Risiko | Auswirkung | Eintrittswahrscheinlichkeit |
|--------|:--:|:--:|
| displayId-Kollisionen bei parallelen Prozessen | Fehlerhafte IDs | Niedrig |
| Test-Abdeckung unbekannt (keine Tests gesichtet) | Regressionsfehler | Hoch |

---

## 8. Wiederverwendbarkeit (Komponenten-Analyse)

### 8.1 1:1 uebertragbar

| Komponente | Aufwand | Anmerkung |
|------------|:--:|---|
| `ChecklistTemplate` / `ChecklistItem` | Null | Mechanik identisch, nur neue Templates braucht |
| `Document` + Upload-Logik | Minimal | Neue DocumentTypes hinzufuegen |
| `OnboardingNote` (als "ProcessNote") | Null | Nur der Name ist falsch |
| `AuditLog` | Minimal | Neues FK-Feld oder generalisiertes `processId` |
| `WebhookConfig` + Dispatcher | Minimal | Neue Events registrieren |
| `EmailTemplate` | Minimal | Neue Templates fuer Offboarding-Events |
| Auth-System (JWT + Magic-Links) | Ja | Magic-Links koennten fuer Exit-Interviews genutzt werden |
| Verschluesselung (AES-256-GCM) | Ja | Gleiche Mechanik fuer neue sensible Felder |
| `PortalHeader` | Ja | Navigation muss erweitert werden |
| Organisation/Mandant-Zuordnung | Ja | Identisch |

### 8.2 Teilweise uebertragbar

| Komponente | Aufwand | Anmerkung |
|------------|:--:|---|
| Dashboard-Layout (Grid, Kacheln, Tabelle) | Mittel | Struktur ja, Inhalte nein |
| Detail-Ansicht (Tab-Layout) | Mittel | Tabs und Layout ja, Inhalte komplett neu |
| Status-Labels/Badges | Minimal | Neues Label-Mapping fuer Offboarding-Status |
| Dashboard-Charts | Mittel | Neue Datenquellen, gleiche Chart-Komponenten |
| SMTP-Fallback | Ja | Infrastruktur steht |

### 8.3 Nicht uebertragbar

| Komponente | Grund |
|------------|---|
| `PersonalData`-Modell + Validierung | Onboarding-spezifische Felder |
| `SupervisorData`-Modell | Einstellungsmodalitaeten, nicht relevant |
| `field-definitions.ts` | Komplett andere Felder fuer Offboarding |
| Personalfragebogen (10 Steps) | Nicht relevant fuer Austritt |
| Vorgesetzten-Formular (Modalitaeten) | Nicht relevant fuer Austritt |
| Magic-Link-Fragebogen-Flow | Konzept moeglich, aber voellig anderer Inhalt |
| FormTemplate / Versionierung | Offboarding hat keinen dynamischen Fragebogen |

---

## 9. Aufwandsschaetzung

### 9.1 Aufwandsbloecke

| Block | Geschaetzter Aufwand | Abhaengigkeiten |
|-------|:--:|---|
| **1. Datenmodell-Design + Migration** | 2-3 Tage | Architektur-Entscheidung (eigenes Modell vs. Erweiterung) |
| **2. Offboarding-API (CRUD + Business-Logic)** | 4-5 Tage | Block 1 |
| **3. Dashboard-Integration** | 3-4 Tage | Block 2, UI-Entscheidung |
| **4. Offboarding-Detail-Ansicht** | 3-4 Tage | Block 2 |
| **5. Offboarding-Checklisten (Templates + UI)** | 1-2 Tage | Block 2 |
| **6. Dokument-Management-Erweiterung** | 1 Tag | Block 2 |
| **7. Webhook/Notification-Erweiterung** | 1 Tag | Block 2 |
| **8. DSGVO: Loeschlogik + Fristen** | 3-4 Tage | Block 1, erfordert juristische Klaerung |
| **9. Testing + Bug-Fixes** | 2-3 Tage | Alle Bloecke |

**Gesamtschaetzung: 20-26 Entwicklertage** (4-5 Wochen bei einem Entwickler)

### 9.2 Groesste Bloecke (Pareto)

1. **Datenmodell-Entscheidung** — Wenn das falsch ist, wird alles teurer
2. **DSGVO-Loeschlogik** — Juristisch komplex, technisch non-trivial
3. **Dashboard-Integration** — UI-Komplexitaet durch zwei Prozesstypen

---

## 10. Empfehlungen

### 10.1 Architektur-Empfehlung: **Eigenes OffboardingProcess-Modell**

Ich empfehle **gegen** die Erweiterung des bestehenden `OnboardingProcess`-Modells und **fuer** ein separates `OffboardingProcess`-Modell. Gruende:

1. **Semantische Klarheit:** Ein `OnboardingProcess` mit `processType: KUENDIGUNG` ist ein Widerspruch in sich.
2. **Schema-Stabilitaet:** Keine Aenderungen am bestehenden Modell = kein Risiko fuer Produktions-Onboardings.
3. **Unterschiedliche Lebenszyklen:** Onboarding-Daten werden nach Abschluss archiviert. Offboarding-Daten muessen zu unterschiedlichen Zeitpunkten geloescht werden.
4. **Unterschiedliche Zugriffsrechte:** Offboarding-Daten sind oft sensitiver.
5. **Unterschiedliche Status-Automaten:** Die Zustandsuebergaenge sind fundamental verschieden.

### 10.2 Vorgeschlagenes Datenmodell (Prisma-Sketch)

```prisma
model OffboardingProcess {
  id                String              @id @default(uuid())
  displayId         String?             @unique  // "OFF-2026-GYM-001"
  organizationId    String
  organization      Organization        @relation(fields: [organizationId], references: [id])

  // Mitarbeiter-Identifikation
  employeeEmail     String
  employeeFirstName String
  employeeLastName  String
  onboardingId      String?             // Link zum urspruenglichen Onboarding (falls vorhanden)

  // Austritts-Details
  exitReason        ExitReason
  exitDate          DateTime            // Letzter Arbeitstag
  contractEndDate   DateTime?           // Vertragsende (kann abweichen)
  noticePeriodEnd   DateTime?           // Ende Kuendigungsfrist
  noticeDate        DateTime?           // Datum der Kuendigung

  // Status
  status            OffboardingStatus   @default(INITIATED)

  // Tracking
  initiatedById     String
  initiatedBy       User                @relation(...)
  initiatedAt       DateTime            @default(now())
  completedAt       DateTime?

  // DSGVO
  dataRetentionDate DateTime?           // Wann Daten geloescht werden muessen
  dataDeletedAt     DateTime?           // Wann Daten tatsaechlich geloescht wurden

  // Relationen
  exitData          OffboardingExitData?
  returnItems       ReturnItem[]
  documents         OffboardingDocument[]
  checklistItems    OffboardingChecklistItem[]
  notes             OffboardingNote[]
  auditLogs         AuditLog[]

  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
}

enum OffboardingStatus {
  INITIATED
  PENDING_APPROVAL
  APPROVED
  NOTICE_PERIOD
  HANDOVER_PHASE
  FINAL_SETTLEMENT
  COMPLETED
  CANCELLED
}

enum ExitReason {
  KUENDIGUNG_ARBEITNEHMER
  KUENDIGUNG_ARBEITGEBER
  AUFHEBUNGSVERTRAG
  BEFRISTUNGSENDE
  RENTE
  ERWERBSMINDERUNG
  TOD
  SONSTIGES
}
```

### 10.3 Migrations-Strategie

1. **Phase 1 (Woche 1-2):** Neues Modell, API, Seed-Daten
2. **Phase 2 (Woche 3):** Dashboard-Integration (Tabs/Filter)
3. **Phase 3 (Woche 4):** Detail-Ansicht, Checklisten, Dokumente
4. **Phase 4 (Woche 5):** DSGVO-Loeschlogik, Tests, Polish

### 10.4 Sofortige Massnahmen (vor Offboarding-Start)

1. **Technische Schuld beheben:** `triggerN8nWebhook` und `triggerWebhooks` vereinheitlichen
2. **Transaktionen einfuehren:** `$transaction` in bestehender API nutzen
3. **AuditLog generalisieren:** Optionales `processType`-Feld hinzufuegen
4. **Organization-Modell erweitern:** `offboardings`-Relation hinzufuegen
5. **DSGVO-Grundlagen:** `dataRetentionDate` + Cron-Job fuer Loeschung konzipieren

### 10.5 Was ich NICHT empfehle

- **Kein generisches "HRProcess"-Modell jetzt bauen.** Das waere Over-Engineering. Erst wenn der dritte Prozesstyp (Verbeamtung, Vertragsaenderung) kommt, lohnt sich die Abstraktion.
- **Kein Rewrite des bestehenden Onboarding-Codes.** Das Risiko ist zu hoch. Lieber parallel bauen.
- **Keine "Quick-and-Dirty"-Loesung** durch Missbrauch des OnboardingProcess-Modells mit `processType: KUENDIGUNG`. Das raecht sich innerhalb von 3 Monaten.

---

## Fazit

Das CREDO HR-Portal ist **gut gebaut fuer seinen Zweck**, aber es wurde **nicht als erweiterbare Prozess-Plattform** konzipiert. Die Offboarding-Integration ist machbar, erfordert aber bewusste Architektur-Entscheidungen. Der groesste Fallstrick ist die Versuchung, das bestehende Modell "mal eben" zu erweitern, statt sauber zu trennen.

Die DSGVO-Luecke (fehlende Loeschlogik) ist unabhaengig vom Offboarding ein Problem, das priorisiert werden sollte — insbesondere weil Offboarding der natuerliche Trigger fuer Datenloesch-Anfragen ist.

**Bottom Line:** Eigenes Modell, parallele API, geteilte Infrastruktur (Auth, Webhooks, Checklisten-Mechanik, Dokumente). Geschaetzter Aufwand: 4-5 Wochen.
