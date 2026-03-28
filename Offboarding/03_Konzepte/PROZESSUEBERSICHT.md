# Offboarding-Prozessuebersicht CREDO HR-Portal

**Stand:** 2026-03-27
**Fuer:** CREDO Bildungsgruppe (16 Einrichtungen)

---

## Gesamtprozess auf einen Blick

```
  AUSLOESER                    HR-PORTAL                      BETEILIGTE
  =========                    =========                      ==========

  Kuendigung              +-----------------+
  Aufhebungsvertrag  ---> | 1. ERFASSUNG    | <--- HR-Mitarbeiter
  Befristungsende         |    im Portal    |
  Rente/Pension           +-----------------+
                                 |
                                 v
                          +-----------------+
                          | 2. PLANUNG      | <--- HR + Vorgesetzter
                          |    Checkliste   |
                          |    Fristen      |
                          +-----------------+
                                 |
                          +------+------+
                          |             |
                          v             v
                   +----------+  +------------+
                   | 3. UEBER-|  | 4. ADMINI- | <--- HR + IT + Buchhaltung
                   |   GABE   |  |   STRATION |
                   | Wissen   |  | Rueckgaben |
                   | Projekte |  | IT-Zugaenge|
                   +----------+  +------------+
                          |             |
                          +------+------+
                                 |
                                 v
                          +-----------------+
                          | 5. LETZTER TAG  | <--- Alle
                          |    Verabschie-  |
                          |    dung         |
                          +-----------------+
                                 |
                                 v
                          +-----------------+
                          | 6. NACH-        |
                          |    BEARBEITUNG  |
                          |                 |
                          |  +-- Zeugnis ---+--> Vorgesetzter (Magic Link)
                          |  +-- SV-Abmeld. |
                          |  +-- Exit-Survey-+--> Ex-Mitarbeiter (Magic Link)
                          |  +-- Archivierung|
                          +-----------------+
```

---

## Detailprozess: Schritt fuer Schritt

### PHASE 1: Erfassung (Tag 1-3)

```
+------------------------------------------------------------------+
|                                                                    |
|   HR-MITARBEITER oeffnet das Portal                               |
|                                                                    |
|   Dashboard --> Tab "Offboarding" --> Button "Neuer Austritt"     |
|                                                                    |
|   +----------------------------------------------------------+   |
|   |  MODAL: Neuer Austritt                                    |   |
|   |                                                           |   |
|   |  Mitarbeiter:    [Max Mustermann          ] (aus LOGA*)   |   |
|   |  Einrichtung:    [Gymnasium Minden        v]              |   |
|   |  Austrittsart:   [Kuendigung Arbeitnehmer v]              |   |
|   |                                                           |   |
|   |  Austrittsarten:                                          |   |
|   |    - Kuendigung Arbeitnehmer                              |   |
|   |    - Kuendigung Arbeitgeber                               |   |
|   |    - Aufhebungsvertrag                                    |   |
|   |    - Befristungsende                                      |   |
|   |    - Rente / Pension                                      |   |
|   |    - Erwerbsminderung                                     |   |
|   |    - Entlassung Beamter                                   |   |
|   |    - Versetzung                                           |   |
|   |    - Sonstiges                                            |   |
|   |                                                           |   |
|   |  Letzter Arbeitstag:  [31.07.2026]                       |   |
|   |  Private E-Mail:      [max@privat.de]                    |   |
|   |  Berufsgruppe:        [Lehrkraft            v]           |   |
|   |                                                           |   |
|   |              [Abbrechen]  [Vorgang erstellen]             |   |
|   +----------------------------------------------------------+   |
|                                                                    |
|   --> System erstellt:                                            |
|       - Offboarding-Vorgang mit ID "OFF-2026-GYM-003"           |
|       - Checkliste (automatisch je nach Einrichtungstyp)         |
|       - AuditLog-Eintrag                                         |
|       - Webhook an n8n --> Benachrichtigungs-E-Mail an HR-Team   |
|                                                                    |
+------------------------------------------------------------------+

* LOGA-Anbindung ab Phase 3 -- vorher manuelle Eingabe
```

---

### PHASE 2: Planung & Kuendigungsfrist (Woche 1)

```
+------------------------------------------------------------------+
|                                                                    |
|   DETAIL-ANSICHT: OFF-2026-GYM-003                               |
|                                                                    |
|   +----------------------------------------------------------+   |
|   |  Max Mustermann                    Status: KUENDIGUNGSFRIST|   |
|   |  Gymnasium Minden                  Austritt: 31.07.2026   |   |
|   |  Lehrkraft                         Noch 94 Tage           |   |
|   +----------------------------------------------------------+   |
|                                                                    |
|   [Uebersicht] [Checkliste] [Rueckgaben] [Dokumente] [Notizen]  |
|                                                                    |
|   TAB: Uebersicht                                                 |
|   +--------------------------+  +-----------------------------+   |
|   | TIMELINE                 |  | AUSTRITTSDATEN              |   |
|   |                          |  |                             |   |
|   | 15.04. Kuendigung erh.   |  | Art: Eigenkunedigung        |   |
|   | 16.04. IT informiert     |  | Kuendigungsfrist: 3 Mon.   |   |
|   | 18.04. Team informiert   |  | Letzter Tag: 31.07.2026    |   |
|   | ....                     |  | Vertragsende: 31.07.2026   |   |
|   | 31.07. Letzter Tag       |  |                             |   |
|   |                          |  | Resturlaub: 12 Tage        |   |
|   |                          |  | Ueberstunden: 24h          |   |
|   |                          |  | Zeugnis: Ausstehend        |   |
|   +--------------------------+  +-----------------------------+   |
|                                                                    |
|   TAB: Checkliste (automatisch zugewiesen)                        |
|   +----------------------------------------------------------+   |
|   |                                                           |   |
|   |  PHASE 1: Sofort (Tag 1-3)                     3/5 done  |   |
|   |  [x] Kuendigungsbestaetigung erstellen     HR   15.04.   |   |
|   |  [x] Kuendigungsfrist berechnen            HR   15.04.   |   |
|   |  [x] IT-Abteilung informieren              HR   16.04.   |   |
|   |  [ ] Resturlaub pruefen                    HR   faellig  |   |
|   |  [ ] Team ueber Austritt informieren       VG   faellig  |   |
|   |                                                           |   |
|   |  PHASE 2: Erste Woche                       0/3 done     |   |
|   |  [ ] Nachfolgeplanung einleiten            VG   22.04.   |   |
|   |  [ ] Uebergabeplan erstellen               VG   22.04.   |   |
|   |  [ ] Stellenausschreibung vorbereiten      HR   25.04.   |   |
|   |                                                           |   |
|   |  PHASE 3: Uebergabephase                    0/3 done     |   |
|   |  [ ] Wissenstransfer durchfuehren          VG   15.06.   |   |
|   |  [ ] Dokumentation vervollstaendigen       MA   30.06.   |   |
|   |  [ ] Arbeitszeugnis erstellen              HR   15.07.   |   |
|   |                                                           |   |
|   |  PHASE 4: Letzte Woche                      0/3 done     |   |
|   |  [ ] Exit-Interview durchfuehren           HR   25.07.   |   |
|   |  [ ] Rueckgabe Arbeitsmittel               MA   30.07.   |   |
|   |  [ ] IT-Zugaenge sperren (vorbereiten)     IT   30.07.   |   |
|   |                                                           |   |
|   |  PHASE 5: Letzter Tag                       0/2 done     |   |
|   |  [ ] Alle IT-Zugaenge sperren              IT   31.07.   |   |
|   |  [ ] Physische Zugangsrechte entziehen     FM   31.07.   |   |
|   |                                                           |   |
|   |  PHASE 6: Nach Austritt                     0/2 done     |   |
|   |  [ ] Arbeitsbescheinigung ausstellen       HR   03.08.   |   |
|   |  [ ] SV-Abmeldung durchfuehren             HR   11.09.   |   |
|   |                                                           |   |
|   |  VG = Vorgesetzter  MA = Mitarbeiter                     |   |
|   |  HR = Personalabtlg.  IT = IT-Abtlg.  FM = Facility Mgmt|   |
|   +----------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

### PHASE 3: Uebergabe & Administration (Woche 2 bis 4 Wochen vor Austritt)

```
PARALLEL LAUFENDE PROZESSE:
============================

    Wissenstransfer                    Rueckgabe-Tracking
    ===============                    ==================

    Vorgesetzter plant mit             TAB: Rueckgaben
    Mitarbeiter die Uebergabe
                                       +----------------------------------+
    - Tandem-Phase mit Nachfolger      |                                  |
    - Expert Debriefing                |  Kategorie       Status          |
    - Dokumentation erstellen          |  --------------------------------|
    - Kontakte uebergeben              |  Laptop          [ ] Ausstehend  |
    - Projekte uebergeben              |  Diensthandy     [ ] Ausstehend  |
                                       |  Schluessel B204 [x] Zurueck     |
    (Wird ueber Checkliste             |  Zugangskarte    [ ] Ausstehend  |
     getrackt)                         |  Parkausweis     [x] Zurueck     |
                                       |  USB-Stick       [ ] Ausstehend  |
                                       |                                  |
                                       |  [+ Gegenstand hinzufuegen]      |
                                       +----------------------------------+


    Dokumente hochladen                Notizen
    ===================                =======

    TAB: Dokumente                     TAB: Notizen

    +---------------------------+      +---------------------------+
    | Kuendigungsschreiben  PDF |      | 15.04. HR Mueller:        |
    | [Hochgeladen 15.04.]      |      | "Kuendigung per Post      |
    |                           |      |  eingegangen, Original    |
    | Aufhebungsvertrag     --  |      |  in Personalakte"         |
    | [Noch nicht vorhanden]    |      |                           |
    |                           |      | 18.04. HR Schmidt:        |
    | Arbeitsbescheinigung  --  |      | "MA wuenscht qualifi-     |
    | [Wird nach Austritt       |      |  ziertes Zeugnis"         |
    |  erstellt]                |      |                           |
    |                           |      | [+ Notiz hinzufuegen]     |
    | [+ Dokument hochladen]    |      +---------------------------+
    +---------------------------+
```

---

### PHASE 4: Letzte Woche & Letzter Tag

```
+------------------------------------------------------------------+
|                                                                    |
|  WOCHE VOR AUSTRITT                                               |
|  ==================                                                |
|                                                                    |
|  Mo  Exit-Interview (persoenlich, durch HR)                       |
|      --> Notizen im Portal erfassen                               |
|                                                                    |
|  Di  Rueckgabe Arbeitsmittel                                      |
|      --> Jedes Item im Portal als "zurueckgegeben" markieren      |
|      --> Zustand dokumentieren                                     |
|                                                                    |
|  Mi  Abschlussgespraech mit Vorgesetztem                          |
|                                                                    |
|  Do  IT bereitet Sperrung vor                                      |
|      --> Liste der zu sperrenden Zugaenge pruefen                 |
|                                                                    |
|  Fr  LETZTER ARBEITSTAG                                           |
|      --> Verabschiedung                                            |
|      --> Alle Checklisten-Items Phase 5 abhaken                   |
|      --> Status wechselt zu: ENDABRECHNUNG                        |
|                                                                    |
|  AUTOMATISCH AM LETZTEN TAG:                                      |
|  +----------------------------------------------------------+    |
|  |  IT-Zugaenge sperren (Checklisten-Item)                   |    |
|  |  - E-Mail: Abwesenheitsassistent aktivieren               |    |
|  |  - VPN, Cloud, Intranet deaktivieren                      |    |
|  |  - Software-Lizenzen freigeben                            |    |
|  |  - Slack/Teams-Accounts deaktivieren                      |    |
|  |  - Physische Zugangsrechte entziehen                      |    |
|  +----------------------------------------------------------+    |
|                                                                    |
+------------------------------------------------------------------+
```

---

### PHASE 5: Nachbearbeitung (nach dem Austritt)

```
+------------------------------------------------------------------+
|                                                                    |
|  TAG +1 bis +3: Arbeitsbescheinigung                              |
|  =====================================                            |
|  HR erstellt Arbeitsbescheinigung --> Dokument hochladen          |
|  Checklisten-Item abhaken                                         |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  TAG +7: EXIT-SURVEY (Magic Link)                    [Phase 2]    |
|  ====================================                              |
|                                                                    |
|  System sendet automatisch Magic Link an private E-Mail           |
|                                                                    |
|  Ex-Mitarbeiter erhaelt:                                          |
|  +----------------------------------------------------------+    |
|  |                                                           |    |
|  |  Lieber Max,                                              |    |
|  |                                                           |    |
|  |  vielen Dank fuer Ihre Arbeit am Gymnasium Minden.        |    |
|  |  Ihre Meinung ist uns wichtig.                            |    |
|  |                                                           |    |
|  |  [  Zum Fragebogen (8-10 Min.)  ]  <-- Magic Link        |    |
|  |                                                           |    |
|  |  Vertraulich. Ihre Antworten werden nur                   |    |
|  |  aggregiert ausgewertet.                                  |    |
|  |                                                           |    |
|  +----------------------------------------------------------+    |
|                                                                    |
|  Fragebogen:                                                      |
|  - 25 Fragen (5-Sterne-Skala + Freitext)                        |
|  - Kategorien: Fuehrung, Kultur, Entwicklung, Gehalt,            |
|    Work-Life-Balance, Ausstattung, Kommunikation                 |
|  - eNPS (0-10 Weiterempfehlung)                                  |
|  - Rueckkehr-Bereitschaft                                         |
|  - DSGVO-Einwilligung vorgeschaltet                              |
|                                                                    |
|  Nach Absenden:                                                   |
|  --> Webhook an n8n --> E-Mail an HR: "Exit-Survey ausgefuellt"  |
|  --> Scores berechnet und aggregiert                              |
|  --> Im Dashboard sichtbar (anonymisiert, ab 5 Antworten)        |
|                                                                    |
|  Reminder: Tag 12, 17, 32 (falls nicht ausgefuellt)              |
|  Token laeuft nach 30 Tagen ab                                    |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  TAG +7 bis +14: ZEUGNIS-WORKFLOW (Magic Link)       [Phase 2]   |
|  =================================================                |
|                                                                    |
|  HR startet Zeugnisvorgang im Portal:                             |
|                                                                    |
|  1. HR waehlt Berufsgruppe --> System waehlt Bewertungsbogen      |
|                                                                    |
|  2. Magic Link an Vorgesetzten:                                   |
|     +--------------------------------------------------------+   |
|     |                                                         |   |
|     |  Zeugnis-Bewertung: Max Mustermann                     |   |
|     |  Gymnasium Minden | Lehrkraft | 01.08.2020 - 31.07.2026|   |
|     |                                                         |   |
|     |  A) Fachliche Kompetenz                    Gewicht: 20% |   |
|     |  +-------------------------------------------------+    |   |
|     |  | Fachwissen            [1] [2] [3] [4] [5] [6]   |    |   |
|     |  | Didaktik/Methodik     [1] [2] [3] [4] [5] [6]   |    |   |
|     |  | Fortbildung           [1] [2] [3] [4] [5] [6]   |    |   |
|     |  +-------------------------------------------------+    |   |
|     |                                                         |   |
|     |  B) Paedagogische Kompetenz                Gewicht: 25% |   |
|     |  +-------------------------------------------------+    |   |
|     |  | Unterrichtsgestaltung [1] [2] [3] [4] [5] [6]   |    |   |
|     |  | Differenzierung       [1] [2] [3] [4] [5] [6]   |    |   |
|     |  | Lernerfolgskontrolle  [1] [2] [3] [4] [5] [6]   |    |   |
|     |  | Classroom Management  [1] [2] [3] [4] [5] [6]   |    |   |
|     |  +-------------------------------------------------+    |   |
|     |                                                         |   |
|     |  ... (C, D, E analog) ...                               |   |
|     |                                                         |   |
|     |  Besondere Staerken: [________________________]         |   |
|     |  Besondere Projekte: [________________________]         |   |
|     |                                                         |   |
|     |              [Zwischenspeichern]  [Absenden]            |   |
|     +--------------------------------------------------------+   |
|                                                                    |
|  3. System berechnet Gesamtnote:                                  |
|     Note 1.8 --> "stets zu unserer vollen Zufriedenheit" (Gut)   |
|                                                                    |
|  4. System generiert Zeugnisentwurf aus Textbausteinen            |
|                                                                    |
|  5. HR prueft, passt an, gibt frei                                |
|                                                                    |
|  6. Optional: Freigabe-Link an Vorgesetzten                      |
|                                                                    |
|  7. Zeugnis finalisieren --> als Dokument hochladen              |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  BIS WOCHE +6: SV-Abmeldung                                      |
|  ============================                                      |
|  HR meldet bei Krankenkasse / Minijob-Zentrale ab                 |
|  Checklisten-Item abhaken                                         |
|  Arbeitsbescheinigung an Arbeitsagentur                           |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  ABSCHLUSS: Vorgang abschliessen                                 |
|  ================================                                  |
|  Alle Checklisten-Items abgehakt?                                 |
|  Alle Dokumente hochgeladen?                                      |
|  Alle Rueckgaben bestaetigt?                                      |
|                                                                    |
|  --> Status: ABGESCHLOSSEN                                        |
|  --> DSGVO: Loeschfrist wird berechnet                            |
|  --> Webhook: offboarding-completed                               |
|  --> Personalakte archiviert                                       |
|                                                                    |
+------------------------------------------------------------------+
```

---

## Status-Verlauf

```
                                     Kuendigung
                                     zurueckgenommen
                                         |
ERFASST ---> KUENDIGUNGSFRIST ---> UEBERGABE ---> ENDABRECHNUNG ---> ABGESCHLOSSEN
                                                        |
                                                   ABGEBROCHEN


Status im Portal:

+-------------+------------------+-------------------------------------------+
| Status      | Badge-Farbe      | Bedeutung                                 |
+-------------+------------------+-------------------------------------------+
| ERFASST     | Blau             | Vorgang angelegt, noch keine Aktion       |
| KUENDIGUNGS-| Gelb             | In der Kuendigungsfrist                   |
| FRIST       |                  |                                           |
| UEBERGABE   | Orange           | Wissenstransfer und Rueckgaben laufen     |
| ENDAB-      | Lila             | Zeugnis, SV-Abmeldung, letzte Admin       |
| RECHNUNG    |                  |                                           |
| ABGE-       | Gruen            | Alles erledigt, archiviert                |
| SCHLOSSEN   |                  |                                           |
| ABGEBROCHEN | Grau             | Kuendigung zurueckgenommen                |
+-------------+------------------+-------------------------------------------+
```

---

## Dashboard-Ansicht

```
+------------------------------------------------------------------+
|  CREDO HR-Portal                          HR Mueller  [Abmelden] |
+------------------------------------------------------------------+
|                                                                    |
|  [Onboarding]  [Offboarding]                                     |
|                 ^^^^^^^^^^^                                        |
|                                                                    |
|  +----------+  +----------+  +----------+  +----------+          |
|  |    3     |  |    5     |  |    2     |  |    12    |          |
|  | Erfasst  |  | Kuend.-  |  | Ueber-  |  | Abge-   |          |
|  |          |  | frist    |  | gabe    |  | schlossen|          |
|  +----------+  +----------+  +----------+  +----------+          |
|                                                                    |
|  +------+  +-------+  +--------+                                 |
|  |Filter|  |Suche  |  |+ Neuer |                                 |
|  | v    |  |[     ]|  | Austritt|                                |
|  +------+  +-------+  +--------+                                 |
|                                                                    |
|  +----------------------------------------------------------+    |
|  | ID              | Name           | Einrichtung  | Status  |    |
|  |-----------------|----------------|--------------|---------|    |
|  | OFF-2026-GYM-003| M. Mustermann  | Gymnasium    | Kuend.- |    |
|  | OFF-2026-KIT-001| L. Schmidt     | KiTa Minden  | Ueberg. |    |
|  | OFF-2026-GS-002 | K. Weber       | GS Haddenh.  | Endabr. |    |
|  | OFF-2026-VW-001 | S. Fischer     | Verwaltung   | Abges.  |    |
|  +----------------------------------------------------------+    |
|                                                                    |
|  Offboarding-spezifische Spalten:                                 |
|  - Letzter Arbeitstag                                             |
|  - Austrittsart                                                   |
|  - Checkliste (Fortschritt %)                                     |
|  - Rueckgaben (x/y zurueck)                                      |
|  - Zeugnis-Status                                                 |
|                                                                    |
+------------------------------------------------------------------+
```

---

## Beteiligte Rollen und ihre Aufgaben

```
+------------------+------------------------------------------------+
| Rolle            | Aufgaben im Offboarding                        |
+------------------+------------------------------------------------+
|                  |                                                  |
| HR-MITARBEITER   | - Vorgang im Portal anlegen                    |
|                  | - Checkliste abarbeiten                        |
|                  | - Austrittsdaten erfassen                       |
|                  | - Dokumente hochladen                          |
|                  | - Zeugnis erstellen (aus Bewertung)             |
|                  | - SV-Abmeldung durchfuehren                    |
|                  | - Exit-Interview auswerten                     |
|                  |                                                  |
+------------------+------------------------------------------------+
|                  |                                                  |
| VORGESETZTER     | - Uebergabeplan erstellen                      |
| (Magic Link)     | - Wissenstransfer begleiten                    |
|                  | - Zeugnis-Bewertung abgeben (Schulnoten 1-6)  |
|                  | - Checklisten-Items abhaken (zugewiesene)      |
|                  |                                                  |
+------------------+------------------------------------------------+
|                  |                                                  |
| MITARBEITER      | - Dokumentation erstellen                      |
| (ausscheidend)   | - Arbeitsmittel zurueckgeben                   |
|                  | - Exit-Survey ausfuellen (nach Austritt,       |
|                  |   freiwillig, per Magic Link)                  |
|                  |                                                  |
+------------------+------------------------------------------------+
|                  |                                                  |
| IT-ABTEILUNG     | - Zugaenge sperren (am letzten Tag)            |
|                  | - Geraete zuruecknehmen                        |
|                  | - Lizenzen freigeben                           |
|                  | - Passwoerter aendern (shared Accounts)        |
|                  |                                                  |
+------------------+------------------------------------------------+
|                  |                                                  |
| SYSTEM           | - Checkliste automatisch zuweisen               |
| (automatisch)    | - Fristen berechnen                            |
|                  | - Webhooks/E-Mails senden (via n8n)            |
|                  | - Exit-Survey versenden (Tag +7)               |
|                  | - Reminder senden                              |
|                  | - Zeugnisentwurf generieren                    |
|                  | - DSGVO-Loeschfristen setzen                   |
|                  | - Auslaufende Vertraege melden (LOGA)          |
|                  |                                                  |
+------------------+------------------------------------------------+
```

---

## Unterschiede je Einrichtungstyp

```
+------------------+------------------------------------------------+
| Einrichtungstyp  | Besonderheiten im Offboarding                  |
+------------------+------------------------------------------------+
|                  |                                                  |
| GYMNASIUM /      | - Austritt bevorzugt zum 31.01. oder 31.07.    |
| GRUNDSCHULE      |   (Schuljahresbindung)                         |
|                  | - Zusatz-Checkliste: Lehrmaterialien,           |
|                  |   Zeugniskonferenzen, Elternbrief              |
|                  | - Zeugnis-Bogen: Lehrkraft (paed. Kompetenz)   |
|                  |                                                  |
+------------------+------------------------------------------------+
|                  |                                                  |
| KITA             | - Austritt bevorzugt zum 31.07./31.08.          |
|                  |   (KiTa-Jahresende)                            |
|                  | - Zusatz-Checkliste: Entwicklungsdoku uebergeben|
|                  |   Eltern informieren, Betreuungsschluessel     |
|                  | - Zeugnis-Bogen: Erzieher/in                   |
|                  |                                                  |
+------------------+------------------------------------------------+
|                  |                                                  |
| VERWALTUNG       | - Keine Schuljahresbindung                     |
|                  | - Standard-Checkliste                          |
|                  | - Zeugnis-Bogen: Verwaltungspersonal           |
|                  |                                                  |
+------------------+------------------------------------------------+
|                  |                                                  |
| BEAMTE           | - Kein Offboarding im klassischen Sinne         |
|                  | - Entlassungsantrag an Dienstherrn             |
|                  | - Eigene Checkliste (Dienstakten, Siegel)      |
|                  | - Pensionierung: Ruhestandsberechnung          |
|                  | - Kein Arbeitszeugnis sondern Dienstzeugnis    |
|                  |                                                  |
+------------------+------------------------------------------------+
```

---

## Zeitstrahl (Beispiel: 3-Monats-Kuendigungsfrist)

```
Tag 0          Woche 1        Woche 4        Woche 8        Woche 11       Woche 12       Tag +7         Tag +42
  |              |              |              |              |              |              |              |
  v              v              v              v              v              v              v              v

  Kuendigung     Team           Nachfolger     Wissens-       Exit-          LETZTER        Exit-          SV-
  eingang        informiert     gefunden       transfer       Interview      TAG            Survey         Abmeldung
                                               laeuft         (persoenlich)                 (Magic Link)
  |              |              |              |              |              |              |              |
  +-- ERFASST --+-- KUENDIGUNGSFRIST ---------+-- UEBERGABE -+              +- ENDABRECHN.-+              |
                                                                                                          |
                                                                             Zeugnis        Zeugnis       |
                                                                             Bewertung      versendet     |
                                                                             (Magic Link)                 |
                                                                                                          |
                                                                                            +-ABGESCHLOSSEN+
```

---

## Verbindung zum bestehenden Onboarding

```
MITARBEITER-LEBENSZYKLUS IM CREDO HR-PORTAL:

    ONBOARDING                              OFFBOARDING
    ==========                              ===========

    HR erstellt Vorgang                     HR erstellt Vorgang
         |                                       |
         v                                       v
    Magic Link an MA ----+             +---- Checkliste automatisch
         |               |             |         |
    10-Schritte-         |  VERKNUEPFT |    Uebergabe & Rueckgaben
    Fragebogen           |  ueber      |         |
         |               |  displayId  |    Zeugnis (Magic Link VG)
    Magic Link an VG     |  oder       |         |
         |               |  E-Mail     |    Exit-Survey (Magic Link MA)
    Modalitaeten         |             |         |
         |               +------+------+    Abschluss
    HR-Review                   |                |
         |                      v                |
    Abschluss           [Stammdaten-Tabelle]     |
         |               (Phase 3: LOGA)         |
         |                      |                |
         +----------+-----------+--------+-------+
                    |                    |
                    v                    v
              Dashboard              Dashboard
              Tab: Onboarding        Tab: Offboarding
```

---

## Phasen der Umsetzung

```
PHASE 1 (MVP)                PHASE 2                    PHASE 3              PHASE 4
4-5 Wochen                   4-6 Wochen                 3-4 Wochen           2-3 Wochen
==============               ===========                ===========          ===========

[x] Offboarding-Modell       [ ] Exit-Survey             [ ] LOGA-Sync        [ ] DSGVO-Loeschung
[x] CRUD-API                     Magic Link              [ ] Employee-Modell   [ ] Alumni-Verwaltung
[x] Dashboard-Tab                25 Fragen               [ ] Vertrags-Warnung  [ ] UX-Feinschliff
[x] Detail-Ansicht               Aggregation             [ ] Rollen-Erweiterung
[x] Checklisten                  Dashboard               [ ] Einrichtungs-
[x] Rueckgabe-Tracking      [ ] Zeugnis-Workflow             Spezifika
[x] Dokumente                    5 Berufsgruppen
[x] Notizen                      Noten-zu-Text
[x] Webhooks                     Entwurf-Generierung
[x] Status-Workflow          [ ] On-/Off-Verknuepfung
```
