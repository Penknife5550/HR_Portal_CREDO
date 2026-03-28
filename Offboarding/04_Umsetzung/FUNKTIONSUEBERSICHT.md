# Funktionsuebersicht: Offboarding-Modul (Phase 1)

**Stand:** 2026-03-27
**Erstellt fuer:** Dimitri Riesen (Projektleiter)
**Status:** Phase 1 MVP -- Code-Complete, bereit fuer Testing

---

## 1. Executive Summary

Das Offboarding-Modul erweitert das bestehende CREDO HR-Portal um den kompletten Austrittsprozess fuer die 16 Einrichtungen der Bildungsgruppe. Es ermoeglicht HR-Mitarbeitern, Austrittsvorgaenge digital zu erfassen, mit automatischen Checklisten (je Einrichtungstyp) zu verwalten und Fachabteilungen (IT, Facility, Buchhaltung) per Magic Link einzubinden -- ohne dass diese einen Portal-Login benoetigen. Das System deckt Rueckgabe-Tracking, Dokumentenverwaltung, Notizen und einen vollstaendigen Status-Workflow (Erfasst bis Abgeschlossen) ab, inklusive Audit-Log und Webhook-Integration fuer n8n-Automatisierung. Phase 1 ist backend- und frontend-seitig implementiert; es fehlen noch n8n-Workflows, Migration/Seed-Ausfuehrung und manuelles Testing.

---

## 2. Feature-Matrix

| Nr | Feature | Status | Beschreibung |
|----|---------|--------|--------------|
| 1 | Prisma-Schema (8 neue Modelle, 4 Enums) | Fertig | OffboardingProcess, ExitData, ChecklistItem, ReturnItem, Document, Note, DepartmentConfig, DepartmentLink |
| 2 | Dashboard-Tab "Offboarding" | Fertig | Tab-Umschaltung Onboarding/Offboarding, Status-Kacheln (6 Status), Tabelle mit Sortierung, Filter, Pagination, Suche |
| 3 | "Neuer Austritt"-Modal | Fertig | Formular mit 8 Feldern (Vorname, Nachname, Dienst-E-Mail, Private E-Mail, Einrichtung, Austrittsart, Letzter Arbeitstag, Personalnummer), automatische displayId-Generierung |
| 4 | Detail-Ansicht (5 Tabs) | Fertig | Uebersicht, Checkliste, Rueckgaben, Dokumente, Notizen -- vollstaendige CRUD-UI |
| 5 | Automatische Checklisten | Fertig | Template-basiert je Einrichtungstyp (Bildungseinrichtung vs. Standard), automatische Fristberechnung relativ zum letzten Arbeitstag |
| 6 | Checklisten-Verwaltung | Fertig | Items abhaken/zuruecksetzen, Notizen, Abteilungs-Zuweisung, Fortschrittsanzeige |
| 7 | Rueckgabe-Tracking | Fertig | Items anlegen (7 Kategorien: IT-Hardware, Schluessel, Fahrzeug, Dokumente, Kleidung, Speichermedien, Sonstiges), Zustand dokumentieren, als zurueckgegeben markieren |
| 8 | Dokumenten-Upload | Fertig | 10 Dokumenttypen, Magic-Bytes-Validierung, Max 10 MB, PDF/JPG/PNG/WebP, Path-Traversal-Schutz, Download-Endpunkt |
| 9 | Notizen-System | Fertig | Erstellen, Bearbeiten, Loeschen (nur eigene), Audit-Log |
| 10 | Status-Workflow | Fertig | 6 Status mit validierten Uebergaengen (INITIATED -> NOTICE_PERIOD -> HANDOVER_PHASE -> FINAL_SETTLEMENT -> COMPLETED; jederzeit CANCELLED moeglich) |
| 11 | Abteilungs-Magic-Links | Fertig | Automatische Token-Generierung pro Abteilung, E-Mail-Lookup ueber DepartmentConfig, 90-Tage-Gueltigkeit, Tracking (firstOpened, lastOpened, openCount) |
| 12 | Oeffentliche Aufgaben-Seite | Fertig | Abteilungen sehen nur ihre Aufgaben, Optimistic Updates mit Rollback, Countdown zum letzten Arbeitstag, Fortschrittsbalken, Kommentar-Funktion |
| 13 | Reminder-System | Fertig | API fuer manuelle Reminder an Abteilungen, Reminder-Counter, Webhook-Integration |
| 14 | Abteilungs-Einstellungen (CRUD) | Fertig | Funktions-E-Mails pro Abteilung pflegen, einrichtungsspezifisch oder zentral, nur SUPER_ADMIN/HR_LEITUNG |
| 15 | Audit-Logging | Fertig | Alle Aktionen (Vorgang erstellt, Status geaendert, Notiz erstellt/bearbeitet/geloescht, Department-Links generiert, Reminder gesendet) |
| 16 | Webhook-Integration | Fertig | 7 Events (offboarding-created, department-assigned, task-completed, department-completed, task-overdue, reminder, completed) |
| 17 | Verschluesselung sensibler Daten | Fertig | Abfindungssumme wird verschluesselt gespeichert und bei Abruf entschluesselt |
| 18 | Constants/Labels | Fertig | 6 neue Label-Maps (Status, Austrittsarten, Rueckgabe-Kategorien, Dokumenttypen, Abteilungen) |
| 19 | Seed-Daten (Checklisten-Templates) | Fertig | 4 Templates, 4 Abteilungs-Defaults |
| 20 | n8n-Workflows | Offen | E-Mail-Versand, Reminder-Automatisierung, Benachrichtigungen |
| 21 | Prisma-Migration ausfuehren | Offen | `npx prisma migrate dev --name add-offboarding` |
| 22 | Manuelles Testing | Offen | End-to-End-Tests aller Flows |
| 23 | Exit-Interview / Exit-Survey | Offen (Phase 2) | 25 Fragen, Magic Link an private E-Mail, Aggregation |
| 24 | Zeugnis-Workflow | Offen (Phase 2) | 5 Berufsgruppen-Bewertungsboegen, Schulnoten, Textbaustein-Generierung |
| 25 | LOGA-Integration | Offen (Phase 3) | Stammdaten-Sync, auslaufende Vertraege |
| 26 | DSGVO-Loeschlogik | Offen (Phase 4) | Automatische Loeschfristen, Datenbereinigung |

---

## 3. User Stories

| Nr | User Story |
|----|-----------|
| 1 | Als HR-Mitarbeiter kann ich im Dashboard zwischen Onboarding und Offboarding umschalten, um beide Prozesse zentral zu verwalten. |
| 2 | Als HR-Mitarbeiter kann ich einen neuen Austrittsvorgang ueber ein Modal anlegen (Name, E-Mail, Einrichtung, Austrittsart, letzter Arbeitstag), um den Offboarding-Prozess zu starten. |
| 3 | Als HR-Mitarbeiter kann ich alle Offboarding-Vorgaenge in einer Tabelle mit Status-Kacheln, Suchfeld, Einrichtungsfilter und Pagination sehen, um den Ueberblick zu behalten. |
| 4 | Als HR-Mitarbeiter kann ich den Status eines Vorgangs schrittweise weiterschalten (Erfasst -> Kuendigungsfrist -> Uebergabe -> Endabrechnung -> Abgeschlossen), um den Fortschritt abzubilden. |
| 5 | Als HR-Mitarbeiter kann ich eine automatisch generierte Checkliste abarbeiten (Items abhaken, Notizen ergaenzen), um keine Aufgabe zu vergessen. |
| 6 | Als HR-Mitarbeiter kann ich Rueckgabe-Items erfassen (Laptop, Schluessel, Zugangskarte etc.) und als zurueckgegeben markieren, um die Gegenstandsrueckgabe zu tracken. |
| 7 | Als HR-Mitarbeiter kann ich Dokumente (Kuendigungsschreiben, Zeugnis, Arbeitsbescheinigung etc.) hochladen und herunterladen, um die Personalakte digital zu fuehren. |
| 8 | Als HR-Mitarbeiter kann ich Notizen zu einem Vorgang hinzufuegen, bearbeiten und loeschen, um interne Informationen festzuhalten. |
| 9 | Als HR-Mitarbeiter kann ich Magic Links an Fachabteilungen (IT, Facility, Buchhaltung) versenden, um deren Aufgaben ohne Portal-Login zu delegieren. |
| 10 | Als HR-Mitarbeiter kann ich den Status der Abteilungs-Aufgaben einsehen (geoeffnet, erledigt, Reminder-Anzahl), um den Gesamtfortschritt zu ueberpruefen. |
| 11 | Als HR-Mitarbeiter kann ich manuelle Reminder an saeumige Abteilungen senden, um offene Aufgaben einzufordern. |
| 12 | Als IT-/Facility-Mitarbeiter kann ich ueber einen Magic Link meine zugewiesenen Offboarding-Aufgaben sehen und abhaken, ohne mich im HR-Portal anmelden zu muessen. |
| 13 | Als IT-/Facility-Mitarbeiter sehe ich einen Countdown zum letzten Arbeitstag und einen Fortschrittsbalken, um die Dringlichkeit einzuschaetzen. |
| 14 | Als Administrator kann ich Abteilungs-Funktions-E-Mails pflegen (zentral oder pro Einrichtung), um die Magic-Link-Zustellung zu steuern. |
| 15 | Als Projektleiter kann ich ueber Webhooks n8n-Workflows triggern (Vorgang erstellt, Aufgabe erledigt, Abteilung fertig, Vorgang abgeschlossen), um E-Mail-Benachrichtigungen zu automatisieren. |

---

## 4. API-Endpunkt-Uebersicht

| Methode | Pfad | Auth | Beschreibung |
|---------|------|------|-------------|
| GET | `/api/offboarding` | Session | Alle Vorgaenge auflisten (Filter: status, organizationId, search; Pagination) |
| POST | `/api/offboarding` | Session | Neuen Vorgang anlegen (erzeugt displayId, Checkliste aus Template, Audit-Log, Webhook) |
| GET | `/api/offboarding/[id]` | Session | Einzelvorgang mit allen Details (ExitData, Checkliste, Rueckgaben, Dokumente, Notizen, DepartmentLinks, AuditLogs) |
| PATCH | `/api/offboarding/[id]` | Session | Vorgang aktualisieren (Status, Termine, Austrittsart); validierte Status-Uebergaenge |
| GET | `/api/offboarding/[id]/checklist` | Session | Alle Checklisten-Items eines Vorgangs |
| PATCH | `/api/offboarding/[id]/checklist/[itemId]` | Session | Item abhaken/zuruecksetzen, Notizen aendern, Abteilung zuweisen |
| GET | `/api/offboarding/[id]/return-items` | Session | Alle Rueckgabe-Items auflisten |
| POST | `/api/offboarding/[id]/return-items` | Session | Neues Rueckgabe-Item anlegen (Kategorie, Name, Seriennummer) |
| PATCH | `/api/offboarding/[id]/return-items` | Session | Item als zurueckgegeben markieren, Zustand/Notizen aendern |
| GET | `/api/offboarding/[id]/documents` | Session | Alle Dokumente auflisten |
| POST | `/api/offboarding/[id]/documents` | Session | Dokument hochladen (FormData, 10 MB max, Magic-Bytes-Validierung) |
| GET | `/api/offboarding/[id]/documents/[docId]` | Session | Dokument herunterladen (mit Path-Traversal-Schutz) |
| GET | `/api/offboarding/[id]/notes` | Session | Alle Notizen laden |
| POST | `/api/offboarding/[id]/notes` | Session | Neue Notiz erstellen |
| PATCH | `/api/offboarding/[id]/notes/[noteId]` | Session | Notiz bearbeiten (nur eigene) |
| DELETE | `/api/offboarding/[id]/notes/[noteId]` | Session | Notiz loeschen (nur eigene) |
| GET | `/api/offboarding/[id]/department-links` | Session | Status aller Abteilungs-Links |
| POST | `/api/offboarding/[id]/department-links` | Session | Magic Links generieren ODER Reminder senden (action: "remind") |
| GET | `/api/offboarding-tasks/[token]` | Oeffentlich (Token) | Aufgaben einer Abteilung laden (via Magic Link); Tracking: firstOpened, openCount |
| PATCH | `/api/offboarding-tasks/[token]/[itemId]` | Oeffentlich (Token) | Aufgabe abhaken (mit Sicherheitspruefung: Item gehoert zu richtigem Offboarding + Abteilung) |
| GET | `/api/settings/departments` | Session (Admin) | Alle Abteilungs-Konfigurationen laden |
| POST | `/api/settings/departments` | Session (Admin) | Neue Abteilung anlegen |
| PATCH | `/api/settings/departments/[id]` | Session (Admin) | Abteilung aktualisieren (E-Mail, Name, aktiv/inaktiv) |
| DELETE | `/api/settings/departments/[id]` | Session (Admin) | Abteilung loeschen |

**Gesamt: 24 Endpunkte in 14 Route-Dateien**

---

## 5. Datenfluss: Lebenszyklus eines Offboarding-Vorgangs

**Schritt 1 -- Vorgang anlegen**
HR-Mitarbeiter klickt "Neuer Austritt" im Dashboard. Das Modal erfasst Pflichtfelder (Name, E-Mail, Einrichtung, Austrittsart, letzter Arbeitstag). Das System generiert eine displayId (z.B. `OFF-2026-GYM-003`), legt den OffboardingProcess an, erstellt automatisch eine ExitData-Instanz (leer) und befuellt die Checkliste aus dem passenden Template (Bildungseinrichtung oder Standard). Ein Audit-Log wird geschrieben und der Webhook `offboarding-created` gefeuert.

**Schritt 2 -- Status: INITIATED -> NOTICE_PERIOD**
HR setzt den Status auf "Kuendigungsfrist" und beginnt die Checkliste abzuarbeiten (Phase 1: Sofort-Aufgaben wie Kuendigungsbestaetigung, IT informieren).

**Schritt 3 -- Abteilungen einbinden**
HR klickt "Abteilungs-Links generieren". Das System gruppiert Checklisten-Items nach `assigneeDepartment`, schlaegt in `DepartmentConfig` die Funktions-E-Mails nach und generiert pro Abteilung einen Magic Link (UUID-Token, 90 Tage gueltig). Der Webhook `offboarding-department-assigned` wird pro Abteilung getriggert -- n8n versendet die E-Mails.

**Schritt 4 -- Abteilungen arbeiten Aufgaben ab**
IT/Facility/Buchhaltung oeffnen ihren Magic Link (`/offboarding-tasks/[token]`). Sie sehen nur ihre zugewiesenen Aufgaben, einen Countdown und Fortschrittsbalken. Jedes Abhaken triggert PATCH auf den oeffentlichen Endpunkt und feuert den Webhook `offboarding-task-completed`. Sind alle Aufgaben einer Abteilung erledigt, wird `offboarding-department-completed` getriggert.

**Schritt 5 -- Rueckgaben und Dokumente**
Parallel erfasst HR Rueckgabe-Items (Laptop, Schluessel etc.) und markiert sie als zurueckgegeben. Dokumente (Kuendigungsschreiben, Zeugnis etc.) werden hochgeladen.

**Schritt 6 -- Status-Fortschritt**
HR schaltet den Status weiter: NOTICE_PERIOD -> HANDOVER_PHASE -> FINAL_SETTLEMENT. Bei jedem Uebergang wird ein Audit-Log geschrieben.

**Schritt 7 -- Abschluss**
Wenn alle Checklisten-Items erledigt, Rueckgaben komplett und Dokumente vollstaendig sind, setzt HR den Status auf COMPLETED. Das System setzt `completedAt` und feuert den Webhook `offboarding-completed`.

---

## 6. Was fehlt (Phase 2+)

### Phase 2: Exit-Interview + Zeugnis (4-6 Wochen)
- Exit-Survey per Magic Link an private E-Mail (25 Fragen, 5-Sterne-Skala + Freitext)
- eNPS (Weiterempfehlungs-Score)
- Aggregierte Auswertung (anonymisiert ab 5 Antworten, "Rule of 5")
- Zeugnis-Bewertungsworkflow (5 Berufsgruppen: Lehrkraft, Erzieher/in, Verwaltung, Schulleitung, Hausmeister/Technik)
- Schulnoten-zu-Formulierung-Mapping
- Automatische Zeugnisentwurf-Generierung aus Textbausteinen
- On-/Off-Verknuepfung

### Phase 3: LOGA + Stammdaten + Rollen (3-4 Wochen)
- Employee-Modell (gemeinsame Stammdaten-Tabelle)
- LOGA-Sync via n8n (Stammdaten abgreifen)
- Auslaufende Vertraege automatisch erkennen und melden
- Rolle "Einrichtungsleitung" (sieht nur eigene Einrichtung)

### Phase 4: DSGVO + Alumni + Polish (2-3 Wochen)
- DSGVO-Loeschlogik mit automatischen Loeschfristen
- Alumni-Grundfunktion
- UX-Feinschliff

---

## 7. Bekannte Einschraenkungen

| Nr | Einschraenkung | Auswirkung |
|----|---------------|-----------|
| 1 | **Migration noch nicht ausgefuehrt** | Datenbank-Tabellen existieren noch nicht. `npx prisma migrate dev --name add-offboarding` und `npx prisma db seed` muessen zuerst laufen. |
| 2 | **n8n-Workflows fehlen** | Webhooks werden gefeuert, aber es gibt noch keine n8n-Workflows die darauf reagieren. Abteilungs-E-Mails mit Magic Links muessen manuell oder per n8n-Workflow versendet werden. |
| 3 | **Keine E-Mail-Versand-Logik im Portal** | Das Portal feuert nur Webhooks. Der tatsaechliche E-Mail-Versand laeuft ueber n8n (oder den SMTP-Fallback, der separat konfiguriert werden muss). |
| 4 | **Checklisten-Templates muessen per Seed existieren** | Ohne ausgefuehrten Seed werden bei neuen Vorgaengen keine Checklisten-Items generiert. |
| 5 | **Kein Loeschen von Offboarding-Vorgaengen** | Es gibt keinen DELETE-Endpunkt fuer Vorgaenge. Stattdessen: Status auf CANCELLED setzen. |
| 6 | **Kein Loeschen von Rueckgabe-Items** | Items koennen nur aktualisiert, nicht geloescht werden. |
| 7 | **Kein Loeschen von hochgeladenen Dokumenten** | Upload und Download sind implementiert, aber kein DELETE-Endpunkt fuer Dokumente. |
| 8 | **Sortierung auf API-Seite nicht vollstaendig** | Das Dashboard sendet sortBy/sortOrder-Parameter, aber die API sortiert aktuell immer nach `createdAt desc`. |
| 9 | **statusCounts im Dashboard** | Die API liefert kein `statusCounts`-Feld -- die Status-Kacheln zeigen aktuell 0 fuer alle Status. Muss in der API ergaenzt werden. |
| 10 | **Field-Name-Mismatch im Modal** | Das Modal sendet `firstName`/`lastName`/`workEmail`, aber die API erwartet `employeeFirstName`/`employeeLastName`/`employeeEmail`. Muss abgeglichen werden. |
| 11 | **Offboarding-Tasks-Page Datenstruktur** | Die Page-Komponente erwartet `result` direkt als OffboardingTaskData, aber die API liefert `{ data: { ... } }`. Muss abgeglichen werden. |
| 12 | **Keine Rollen-Pruefung fuer Offboarding-CRUD** | Alle authentifizierten Benutzer koennen Offboarding-Vorgaenge anlegen und bearbeiten. Feingranulare Berechtigungen fehlen. |

---

## 8. Test-Checkliste (20 manuelle Testfaelle)

### Voraussetzungen
- [ ] Migration ausgefuehrt (`npx prisma migrate dev --name add-offboarding`)
- [ ] Seed ausgefuehrt (`npx prisma db seed`)
- [ ] App laeuft (`npm run dev`)

### Dashboard & Navigation
- [ ] **T01:** Dashboard oeffnen -> Tab "Offboarding" anklicken -> Leere Tabelle wird angezeigt mit Meldung "Keine Offboarding-Vorgaenge vorhanden"
- [ ] **T02:** Button "Neuer Austritt" klicken -> Modal oeffnet sich mit allen Pflichtfeldern

### Vorgang anlegen
- [ ] **T03:** Alle Pflichtfelder ausfuellen (Vorname, Nachname, E-Mail, Einrichtung, Austrittsart, Letzter Arbeitstag) -> "Austritt anlegen" -> Erfolgs-Meldung mit displayId (z.B. OFF-2026-GYM-001)
- [ ] **T04:** Modal mit Pflichtfeld leer absenden -> Validierungsfehler wird angezeigt
- [ ] **T05:** Nach Anlegen: Tabelle zeigt neuen Vorgang mit korrektem Status "Erfasst"

### Detail-Ansicht
- [ ] **T06:** Auf Vorgang in Tabelle klicken -> Detail-Seite oeffnet sich mit 5 Tabs (Uebersicht, Checkliste, Rueckgaben, Dokumente, Notizen)
- [ ] **T07:** Tab "Uebersicht" zeigt korrekte Mitarbeiterdaten, Einrichtung, Austrittsart, Status und Countdown zum letzten Arbeitstag
- [ ] **T08:** Status weiterschalten: "Erfasst" -> "Kuendigungsfrist" -> Bestaetigung, Status-Badge aendert sich

### Checkliste
- [ ] **T09:** Tab "Checkliste" zeigt automatisch generierte Items gruppiert nach Phasen
- [ ] **T10:** Checklisten-Item abhaken -> Fortschrittsanzeige aktualisiert sich (z.B. "1/18 erledigt")
- [ ] **T11:** Abgehaktes Item zuruecksetzen -> Fortschritt verringert sich

### Rueckgaben
- [ ] **T12:** Tab "Rueckgaben" -> Neues Item anlegen (z.B. Kategorie "IT_HARDWARE", Name "Laptop ThinkPad") -> Item erscheint in der Liste
- [ ] **T13:** Rueckgabe-Item als zurueckgegeben markieren, Zustand eintragen -> Status aendert sich

### Dokumente
- [ ] **T14:** Tab "Dokumente" -> PDF-Datei hochladen (Typ "Kuendigungsschreiben", max 10 MB) -> Dokument erscheint in der Liste
- [ ] **T15:** Dokument herunterladen -> Datei wird korrekt heruntergeladen

### Notizen
- [ ] **T16:** Tab "Notizen" -> Neue Notiz schreiben -> Notiz erscheint mit Autorname und Zeitstempel
- [ ] **T17:** Eigene Notiz bearbeiten -> Inhalt wird aktualisiert
- [ ] **T18:** Eigene Notiz loeschen -> Notiz verschwindet aus der Liste

### Abteilungs-Links (Magic Links)
- [ ] **T19:** Abteilungs-Links generieren (Button in Uebersicht oder Checkliste) -> Links werden erstellt, Status in der Uebersicht sichtbar (Abteilung, E-Mail, gesendet am)
- [ ] **T20:** Magic Link in neuem Browser-Tab oeffnen -> Oeffentliche Aufgaben-Seite zeigt nur die Aufgaben der jeweiligen Abteilung, mit Countdown und Fortschrittsbalken. Aufgabe abhaken -> Status aktualisiert sich (Optimistic Update)

---

## Dateien-Referenz

### Schema
- `prisma/schema.prisma` (Zeile 618 ff. -- Offboarding-Modelle)

### API Routes (14 Dateien)
- `src/app/api/offboarding/route.ts`
- `src/app/api/offboarding/[id]/route.ts`
- `src/app/api/offboarding/[id]/checklist/route.ts`
- `src/app/api/offboarding/[id]/checklist/[itemId]/route.ts`
- `src/app/api/offboarding/[id]/return-items/route.ts`
- `src/app/api/offboarding/[id]/documents/route.ts`
- `src/app/api/offboarding/[id]/documents/[docId]/route.ts`
- `src/app/api/offboarding/[id]/notes/route.ts`
- `src/app/api/offboarding/[id]/notes/[noteId]/route.ts`
- `src/app/api/offboarding/[id]/department-links/route.ts`
- `src/app/api/offboarding-tasks/[token]/route.ts`
- `src/app/api/offboarding-tasks/[token]/[itemId]/route.ts`
- `src/app/api/settings/departments/route.ts`
- `src/app/api/settings/departments/[id]/route.ts`

### UI-Komponenten (7 Dateien)
- `src/app/(portal)/dashboard/page.tsx` (Tab-Umschaltung)
- `src/app/(portal)/dashboard/offboarding-dashboard-content.tsx` (Dashboard-Tabelle)
- `src/components/neuer-austritt-modal.tsx` (Anlage-Modal)
- `src/app/(portal)/dashboard/offboarding/[id]/page.tsx` (Detail-Wrapper)
- `src/app/(portal)/dashboard/offboarding/[id]/offboarding-detail-content.tsx` (Detail-Ansicht)
- `src/app/offboarding-tasks/[token]/page.tsx` (Magic-Link-Einstieg)
- `src/app/offboarding-tasks/[token]/offboarding-tasks-form.tsx` (Abteilungs-Aufgaben)

### Dokumentation
- `Offboarding/README.md`
- `Offboarding/03_Konzepte/PROZESSUEBERSICHT.md`
- `Offboarding/04_Umsetzung/IMPLEMENTIERUNGSPLAN.md`
