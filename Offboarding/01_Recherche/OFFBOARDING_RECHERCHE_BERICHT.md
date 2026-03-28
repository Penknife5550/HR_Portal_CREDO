# Offboarding-Prozess: Umfassender Recherchebericht

**Erstellt am:** 27.03.2026
**Autor:** HR-Fachexpertise (25 Jahre Erfahrung, Spezialisierung Bildungseinrichtungen)
**Zweck:** Grundlage fuer die Implementierung eines Offboarding-Moduls im HR-Portal CREDO

---

## Inhaltsverzeichnis

1. [Rechtliche Grundlagen Deutschland](#1-rechtliche-grundlagen-deutschland)
2. [Best Practices Offboarding](#2-best-practices-offboarding)
3. [Offboarding-Checkliste](#3-offboarding-checkliste)
4. [Offboarding in Bildungseinrichtungen](#4-offboarding-in-bildungseinrichtungen)
5. [Digitales Offboarding](#5-digitales-offboarding)
6. [Exit-Interview Best Practices](#6-exit-interview-best-practices)
7. [Wissenstransfer](#7-wissenstransfer)
8. [Fristen und Timeline](#8-fristen-und-timeline)
9. [Besonderheiten: Beamte, Minijobber, Befristete](#9-besonderheiten-beamte-minijobber-befristete)
10. [Employer Branding durch Offboarding](#10-employer-branding-durch-offboarding)
11. [Datenmodell-Empfehlung fuer das HR-Portal](#11-datenmodell-empfehlung-fuer-das-hr-portal)

---

## 1. Rechtliche Grundlagen Deutschland

### 1.1 Kuendigungsfristen nach BGB SS622

Die gesetzlichen Kuendigungsfristen bilden das Rueckgrat jedes Offboarding-Prozesses. Das System muss diese automatisch berechnen koennen.

#### Grundkuendigungsfrist (SS622 Abs. 1 BGB)
- **4 Wochen** zum 15. oder zum Ende eines Kalendermonats
- Gilt fuer Arbeitnehmer und waehrend der Probezeit mit verkuerzter Frist

#### Verlaengerte Kuendigungsfristen durch Arbeitgeber (SS622 Abs. 2 BGB)

| Betriebszugehoerigkeit | Kuendigungsfrist | Kuendigung zum |
|------------------------|------------------|----------------|
| 2 Jahre | 1 Monat | Monatsende |
| 5 Jahre | 2 Monate | Monatsende |
| 8 Jahre | 3 Monate | Monatsende |
| 10 Jahre | 4 Monate | Monatsende |
| 12 Jahre | 5 Monate | Monatsende |
| 15 Jahre | 6 Monate | Monatsende |
| 20 Jahre | 7 Monate | Monatsende |

#### Probezeit (SS622 Abs. 3 BGB)
- Waehrend einer vereinbarten Probezeit (max. 6 Monate): **2 Wochen** ohne bestimmten Termin

#### Besonderheiten
- **Tarifvertraege** koennen abweichende (auch kuerzere) Fristen vorsehen -- besonders relevant: **TVoeD** (oeffentlicher Dienst), **TV-L** (Laender), **AVR** (kirchliche Traeger)
- **Arbeitsvertragliche Regelungen** koennen laengere Fristen vereinbaren
- **Kuendigungsfrist fuer Arbeitnehmer:** Kann vertraglich an die Arbeitgeberfrist angepasst werden (SS622 Abs. 6 BGB)
- **Schwerbehinderte:** Mindestens 4 Wochen (SS169 SGB IX), Zustimmung des Integrationsamtes erforderlich

**Anforderung ans System:** Automatische Fristberechnung basierend auf Eintrittsdatum, Vertragsart, anwendbarem Tarifvertrag und individuellen Vereinbarungen.

### 1.2 Kuendigungsarten und ihre Auswirkungen auf den Offboarding-Prozess

| Kuendigungsart | Besonderheiten | Offboarding-Relevanz |
|----------------|----------------|---------------------|
| **Ordentliche Kuendigung (AG)** | Fristgebunden, ggf. Betriebsrat anhoeren (SS102 BetrVG) | Standardprozess, volle Fristen |
| **Ordentliche Kuendigung (AN)** | Fristgebunden | Standardprozess |
| **Ausserordentliche/fristlose Kuendigung** | Wichtiger Grund erforderlich (SS626 BGB), 2-Wochen-Frist ab Kenntnis | Sofort-Offboarding, IT-Sperrung sofort |
| **Aufhebungsvertrag** | Einvernehmlich, frei verhandelbar | Individueller Zeitplan, oft mit Abfindung |
| **Befristungsablauf** | Keine Kuendigung noetig (SS15 TzBfG) | Planbar, rechtzeitig vorbereiten |
| **Erreichen der Altersgrenze** | Regelaltersgrenze, ggf. Hinausschieben | Langfristig planbar, Wissenstransfer |
| **Betriebsbedingte Kuendigung** | Sozialauswahl erforderlich (SS1 KSchG) | Mehrere Mitarbeiter gleichzeitig moeglich |
| **Aenderungskuendigung** | Kuendigung + Angebot neuer Bedingungen | Kein vollstaendiges Offboarding |

### 1.3 Aufhebungsvertrag

Der Aufhebungsvertrag ist besonders haeufig in Bildungseinrichtungen, wenn z.B. eine Lehrkraft zu einem bestimmten Zeitpunkt (Schuljahresende) ausscheiden soll.

**Pflichtinhalte:**
- Beendigungsdatum
- Freistellungsregelung (bezahlt/unbezahlt)
- Resturlaubsregelung
- Zeugnis (Anspruch, Art, Zeitpunkt)
- Rueckgabe von Arbeitsmitteln
- Verschwiegenheitspflicht/nachvertragliches Wettbewerbsverbot
- Ggf. Abfindungsregelung (SS9, SS10 KSchG als Orientierung: 0,5 Bruttomonatsgehaelter pro Beschaeftigungsjahr)
- Ausgleichsklausel
- Hinweis auf Sperrzeit beim Arbeitslosengeld (SS159 SGB III -- 12 Wochen Sperrzeit moeglich!)

**Anforderung ans System:** Aufhebungsvertrag als eigener Beendigungsgrund mit spezifischer Checkliste, Dokumentenvorlage und Hinweis auf Sperrzeitrisiko.

### 1.4 Arbeitszeugnis

#### Rechtsgrundlage
- **SS109 GewO:** Anspruch auf schriftliches Zeugnis bei Beendigung
- **SS630 BGB:** Zeugnis bei Beendigung eines dauernden Dienstverhaeltnisses
- Anspruch auf **einfaches** oder **qualifiziertes** Zeugnis

#### Zeitliche Vorgaben
- Zeugnis ist bei Beendigung faellig
- **Zwischenzeugnis** bei berechtigtem Interesse (z.B. Vorgesetztenwechsel, Versetzung, Kuendigung)
- Verjaehrungsfrist: 3 Jahre (SS195 BGB), aber: Verwirkung moeglich nach ca. 10 Monaten

#### Inhaltliche Anforderungen
- **Wohlwollend** und **wahrheitsemaess**
- Keine negativen Formulierungen, aber Geheimcodes in der Branche etabliert
- Taetigkeitsbeschreibung, Leistungsbeurteilung, Sozialverhalten, Schlussformel
- In Bildungseinrichtungen: paedagogische Kompetenz, Elternarbeit, Teamarbeit besonders relevant

#### Zeugnissprache -- Notenstufen

| Note | Formulierung Leistung | Formulierung Verhalten |
|------|----------------------|----------------------|
| 1 (sehr gut) | "...stets zu unserer vollsten Zufriedenheit..." | "...war stets vorbildlich..." |
| 2 (gut) | "...stets zu unserer vollen Zufriedenheit..." | "...war vorbildlich..." |
| 3 (befriedigend) | "...zu unserer vollen Zufriedenheit..." | "...war einwandfrei..." |
| 4 (ausreichend) | "...zu unserer Zufriedenheit..." | "...gab keinen Anlass zu Beanstandungen..." |
| 5 (mangelhaft) | "...hat sich bemueht..." | "...war im Wesentlichen einwandfrei..." |

**Anforderung ans System:** Zeugnisgenerator mit Textbausteinen, Notenstufen-Auswahl, Spezialfelder fuer Bildungseinrichtungen. Fristenwarnung wenn Zeugnis noch nicht erstellt. Qualitaetskontroll-Workflow (Vier-Augen-Prinzip).

### 1.5 DSGVO bei Austritt

Die Datenschutz-Grundverordnung hat erhebliche Auswirkungen auf den Offboarding-Prozess.

#### Informationspflichten
- Mitarbeiter muss ueber Verarbeitung seiner Daten nach Ausscheiden informiert werden
- Rechtsgrundlage fuer weitere Speicherung muss dokumentiert sein

#### Loeschfristen und Aufbewahrungspflichten

| Datenart | Aufbewahrungspflicht | Rechtsgrundlage |
|----------|---------------------|-----------------|
| Lohnkonten, Gehaltsabrechnungen | **6 Jahre** | SS41 EStG, SS257 HGB |
| Lohnsteuerunterlagen | **6 Jahre** | SS41 EStG |
| Beitragsabrechnungen Sozialversicherung | **10 Jahre** | SS28f SGB IV |
| Arbeitsvertrag | **3 Jahre** (Verjaehrungsfrist) | SS195 BGB |
| Arbeitszeugnis (Kopie) | **3 Jahre** | SS195 BGB |
| Personalakte allgemein | **3 Jahre** nach Ausscheiden | SS195 BGB |
| Unfallunterlagen | **5 Jahre** | DGUV Vorschrift 1 |
| Mutterschutz-/Elternzeitunterlagen | **2 Jahre** nach letzter Eintragung | SS27 MuSchG |
| Arbeitszeitaufzeichnungen | **2 Jahre** | SS16 Abs. 2 ArbZG |
| Bewerbungsunterlagen | **6 Monate** nach Ablehnung | SS15 Abs. 4 AGG |
| Gesundheitsdaten (BEM) | Sofort nach Zweckerfuellung | Art. 9 DSGVO |

#### Technische Massnahmen
- **Zugangsentzug:** Sofortige Deaktivierung aller IT-Zugaenge am letzten Arbeitstag (oder bei fristloser Kuendigung: sofort)
- **E-Mail:** Abwesenheitsassistent einrichten, dann Konto deaktivieren, Weiterleitung an Nachfolger (zeitlich begrenzt, max. 6 Monate empfohlen)
- **Personenbezogene Daten auf Geraeten:** Sichere Loeschung vor Weitergabe
- **Fotos auf Website/Intranet:** Muessen entfernt werden (Recht am eigenen Bild, SS22 KUG)
- **Datensicherungen:** Loeschkonzept muss Backups einschliessen

**Anforderung ans System:** Automatische Loeschfristen-Verwaltung mit Erinnerungen. Checkliste fuer DSGVO-Konformitaet. Protokollierung aller Loeschvorgaenge. Dashboard fuer ausstehende Loeschungen.

### 1.6 Sozialversicherungsabmeldung und Meldepflichten

#### Abmeldung bei der Sozialversicherung
- **Frist:** Innerhalb von **6 Wochen** nach Ende der Beschaeftigung (SS28a SGB IV)
- **Meldung:** Abmeldung mit Abgabegrund 30 (bei ordentlicher Beendigung)
- **Uebermittlung:** Elektronisch ueber systemgeprueftes Entgeltabrechnungsprogramm

#### Weitere Meldepflichten

| Meldung | Frist | Empfaenger |
|---------|-------|-----------|
| Abmeldung Sozialversicherung | 6 Wochen | Krankenkasse (als Einzugsstelle) |
| Lohnsteuerbescheinigung | Bis 28.02. des Folgejahres (oder bei Austritt: zeitnah) | Finanzamt (elektronisch) |
| Arbeitsbescheinigung (SS312 SGB III) | Unverzueglich auf Verlangen | Agentur fuer Arbeit |
| Nebeneinkommensbescheinigung | Auf Verlangen | Agentur fuer Arbeit |
| Bescheinigung nach SS312a SGB III | Unverzueglich | Agentur fuer Arbeit |
| Schwerbehindertenmeldung | Jaehrlich bis 31.03. | Agentur fuer Arbeit |
| Berufsgenossenschaft | Jaehrliche Meldung | Zustaendige BG |
| Betriebliche Altersversorgung | Je nach Versorgungswerk | Versorgungstraeger |

#### Besonderheiten bei Minijobbern
- Abmeldung bei der **Minijob-Zentrale** (Knappschaft Bahn-See)
- Frist: Innerhalb von 6 Wochen nach Ende der Beschaeftigung

**Anforderung ans System:** Automatische Generierung der erforderlichen Meldungen. Fristenmonitoring. Schnittstellen zu Entgeltabrechnungssystemen. Checkliste aller Meldepflichten mit Status-Tracking.

### 1.7 Betriebsrat / Personalrat / MAV

In vielen Bildungseinrichtungen gibt es eine Mitarbeitervertretung:

- **Oeffentliche Traeger:** Personalrat nach BPersVG / jeweiligem LPersVG
- **Kirchliche Traeger:** Mitarbeitervertretung (MAV) nach MAVO (kath.) / MVG (ev.)
- **Freie Traeger:** Betriebsrat nach BetrVG

**Bei Kuendigung durch Arbeitgeber:**
- Anhoerung des Betriebsrats/Personalrats **vor** Ausspruch der Kuendigung (SS102 BetrVG)
- Stellungnahmefrist: 1 Woche (ordentlich) / 3 Tage (ausserordentlich)
- Ohne ordnungsgemaesse Anhoerung ist die Kuendigung **unwirksam**

**Anforderung ans System:** Workflow mit Pflichtschritt "Betriebsrat/Personalrat/MAV anhoeren" bei arbeitgeberseitiger Kuendigung. Dokumentation der Anhoerung und Stellungnahme. Fristenueberwachung.

---

## 2. Best Practices Offboarding

### 2.1 Grundprinzipien nach fuehrenden HR-Quellen

Die zentralen Erkenntnisse der HR-Fachwelt (SHRM, DGFP, Haufe, Personio, Kienbaum) lassen sich in fuenf Grundprinzipien zusammenfassen:

#### Prinzip 1: Offboarding ist genauso wichtig wie Onboarding
- **SHRM (Society for Human Resource Management):** Unternehmen investieren durchschnittlich das 3-fache in Onboarding gegenueber Offboarding -- ein Fehler, da schlecht abgewickelte Austritte zu Reputationsschaeden und Wissensverlust fuehren
- **Haufe:** Offboarding ist die "letzte Chance, einen guten Eindruck zu hinterlassen"
- **Personio:** 71% der Unternehmen haben keinen strukturierten Offboarding-Prozess

#### Prinzip 2: Strukturiert und standardisiert
- Jeder Austritt folgt einem definierten Prozess
- Checklisten sichern Vollstaendigkeit
- Digitale Workflows verhindern, dass Schritte vergessen werden
- Verantwortlichkeiten sind klar zugewiesen

#### Prinzip 3: Wertschaetzend und professionell
- Der ausscheidende Mitarbeiter wird bis zum letzten Tag respektvoll behandelt
- Abschiedsgespraech und -feier gehoeren dazu
- Offene Kommunikation im Team ueber den Weggang
- Keine "Strafaktionen" (Entzug von Aufgaben, Isolation)

#### Prinzip 4: Zukunftsorientiert
- Alumni-Netzwerk pflegen -- Boomerang-Hiring (Wiedereinstellung) wird immer wichtiger
- Exit-Interviews fuer kontinuierliche Verbesserung nutzen
- Wissenstransfer aktiv gestalten

#### Prinzip 5: Rechtssicher und compliant
- Alle gesetzlichen Fristen einhalten
- Dokumentation lueckenlos fuehren
- DSGVO-konforme Datenverarbeitung

### 2.2 Haeufigste Fehler im Offboarding

| Fehler | Auswirkung | Loesung |
|--------|-----------|---------|
| Kein strukturierter Prozess | Vergessene Schritte, rechtliche Risiken | Standardisierte Checklisten |
| IT-Zugaenge nicht rechtzeitig gesperrt | Sicherheitsrisiko, Datenschutzverletzung | Automatisierte IT-Deaktivierung |
| Kein Wissenstransfer | Know-how-Verlust | Uebergabeprozess mit Dokumentation |
| Kein Exit-Interview | Verpasste Verbesserungschancen | Systematische Austrittsbefragung |
| Zeugnis zu spaet erstellt | Rechtsstreit, unzufriedener Ex-Mitarbeiter | Fristenautomatik |
| Keine Kommunikation ans Team | Unsicherheit, Geruechte | Kommunikationsplan |
| Emotionale Reaktion der Fuehrungskraft | Schlechte Atmosphaere, Employer Branding | Fuehrungskraefte-Schulung |

### 2.3 Kennzahlen fuer erfolgreiches Offboarding

Folgende KPIs sollte das System tracken:

- **Offboarding Completion Rate:** Anteil vollstaendig abgeschlossener Offboarding-Prozesse
- **Time to Complete:** Durchschnittliche Dauer vom Kuendigungseingang bis zur Prozessabschluss
- **Exit-Interview-Teilnahmequote:** Sollte > 80% liegen
- **Zeugnis-Erstellungsdauer:** Zeit von Anforderung bis Uebergabe
- **IT-Deaktivierungszeit:** Zeit von Austrittstag bis vollstaendiger Zugangsdeaktivierung (Ziel: 0 Tage)
- **Arbeitsmittel-Rueckgabequote:** Anteil fristgerecht zurueckgegebener Geraete
- **Fluktuation nach Bereichen:** Woher kommen die meisten Austritte?
- **Kuendigungsgruende (aggregiert):** Aus Exit-Interviews

---

## 3. Offboarding-Checkliste

### 3.1 Uebersicht: Phasen des Offboarding

```
Phase 1: Kuendigungseingang / Beendigungsentscheidung
    |
Phase 2: Administrative Erstmassnahmen (Tag 1-3)
    |
Phase 3: Uebergangsphase (Kuendigungsfrist)
    |
Phase 4: Letzte Arbeitswoche
    |
Phase 5: Letzter Arbeitstag
    |
Phase 6: Nach Ausscheiden (Nachbereitung)
```

### 3.2 Detaillierte Checkliste nach Phasen

#### Phase 1: Kuendigungseingang / Beendigungsentscheidung

**Personalbereich (HR):**
- [ ] Kuendigung/Aufhebungsvertrag entgegennehmen und dokumentieren
- [ ] Eingang schriftlich bestaetigen (bei Kuendigung durch AN)
- [ ] Kuendigungsfrist berechnen und letzten Arbeitstag bestimmen
- [ ] Pruefung auf Sonderkuendigungsschutz (Schwangerschaft, Elternzeit, Schwerbehinderung, Betriebsrat, Datenschutzbeauftragter, Auszubildende)
- [ ] Bei AG-Kuendigung: Betriebsrat/Personalrat/MAV anhoeren
- [ ] Resturlaub berechnen (Auszahlung vs. Abgeltung in natura)
- [ ] Ueberstundenkonto pruefen
- [ ] Personalakte aktualisieren
- [ ] Entgeltabrechnung informieren
- [ ] Nachfolgeplanung anstoessen

**Fuehrungskraft:**
- [ ] Persoenliches Gespraech mit dem Mitarbeiter fuehren
- [ ] Kommunikation ans Team planen
- [ ] Uebergabeplan erstellen
- [ ] Nachfolger identifizieren oder Stellenausschreibung veranlassen

#### Phase 2: Administrative Erstmassnahmen (Tag 1-5)

**Personalbereich (HR):**
- [ ] Offboarding-Workflow im System starten
- [ ] IT-Abteilung informieren (geplantes Austrittsdatum)
- [ ] Facility Management informieren (Schluessel, Zugangsmedien)
- [ ] Betriebliche Altersversorgung informieren
- [ ] Fortbildungs-Rueckzahlungsansprueche pruefen
- [ ] Dienstwagen-Rueckgabe planen (Leasing pruefen)
- [ ] Darlehenssalden pruefen
- [ ] Hinweis an Mitarbeiter: Meldepflicht bei Agentur fuer Arbeit (SS38 SGB III -- 3 Monate vor Beendigung oder innerhalb von 3 Tagen nach Kenntnis)
- [ ] Zeugnis-Erstellung anstoessen

**IT-Abteilung:**
- [ ] Austrittsdatum und geplante Zugangsdeaktivierung notieren
- [ ] Datenmigration planen (E-Mails, Dateien, Projekte)
- [ ] Lizenzen pruefen (freiwerden von Softwarelizenzen)

#### Phase 3: Uebergangsphase (waehrend der Kuendigungsfrist)

**Fuehrungskraft:**
- [ ] Wissenstransfer durchfuehren (siehe Kapitel 7)
- [ ] Projektuebergaben koordinieren
- [ ] Kundenkontakte uebergeben (Vorstellung Nachfolger)
- [ ] Dokumentation laufender Projekte sicherstellen
- [ ] Regelmaessige Check-ins mit dem ausscheidenden Mitarbeiter

**Ausscheidender Mitarbeiter:**
- [ ] Dokumentation erstellen (Prozesse, Passwoerter, Kontakte)
- [ ] Projekte abschliessen oder uebergeben
- [ ] Nachfolger/Stellvertreter einarbeiten
- [ ] Persoenliche Daten von Firmengeraeten sichern/loeschen

**HR:**
- [ ] Exit-Interview terminieren
- [ ] Zeugnisentwurf vorbereiten
- [ ] Abschiedsveranstaltung planen (falls gewuenscht)
- [ ] Arbeitsbescheinigung vorbereiten

#### Phase 4: Letzte Arbeitswoche

**HR:**
- [ ] Zeugnis fertigstellen (Vier-Augen-Prinzip)
- [ ] Alle Bescheinigungen vorbereiten
- [ ] Abschlussgespraech durchfuehren
- [ ] Exit-Interview durchfuehren (falls nicht bereits erfolgt)
- [ ] Arbeitspapiere zusammenstellen:
  - Arbeitszeugnis
  - Arbeitsbescheinigung (SS312 SGB III)
  - Lohnsteuerbescheinigung
  - Bescheinigung ueber betriebliche Altersversorgung
  - Nachweis ueber Sozialversicherungszeiten
  - Urlaubsbescheinigung (SS6 Abs. 2 BUrlG)

**Fuehrungskraft:**
- [ ] Abschluss-Check: Sind alle Uebergaben erledigt?
- [ ] Teaminfo ueber letzten Tag
- [ ] Persoenliche Verabschiedung

**IT-Abteilung:**
- [ ] Vorbereitung der Zugangsdeaktivierung (zum Ablauf des letzten Tages)
- [ ] E-Mail-Weiterleitung / Abwesenheitsmeldung einrichten
- [ ] Datensicherung der personenbezogenen Arbeitsergebnisse

#### Phase 5: Letzter Arbeitstag

**Ausscheidender Mitarbeiter:**
- [ ] Rueckgabe aller Arbeitsmittel:
  - Laptop/PC/Tablet
  - Mobiltelefon/Diensthandy
  - Schluessel / Chipkarten / Zugangskarten
  - Firmenkreditkarten
  - Dienstausweis
  - Firmenwagen inkl. Schluessel und Tankkarte
  - Fachliteratur / Materialien
  - Uniformen / Dienstkleidung
  - Parkausweis
- [ ] Persoenliche Gegenstaende mitnehmen
- [ ] Abschied von Kollegen

**HR:**
- [ ] Rueckgabeprotokoll erstellen und unterschreiben lassen
- [ ] Arbeitspapiere uebergeben
- [ ] Zeugnis uebergeben (oder Versand vereinbaren)
- [ ] Kontaktdaten fuer Rueckfragen austauschen
- [ ] Alumni-Netzwerk anbieten

**IT-Abteilung (zum Ende des Arbeitstages):**
- [ ] Alle Benutzerkonten deaktivieren (Active Directory, Mail, VPN, Cloud-Dienste)
- [ ] Fernzugriff deaktivieren
- [ ] Multi-Faktor-Authentifizierung entfernen
- [ ] Geraete einsammeln und zuruecksetzen
- [ ] Geteilte Passwoerter aendern
- [ ] Zugang zu Fachanwendungen sperren
- [ ] E-Mail-Weiterleitung aktivieren (zeitlich begrenzt)

**Facility Management:**
- [ ] Zugangsberechtigungen deaktivieren (Tuercodex, Alarmanlagen)
- [ ] Schluesselrueckgabe dokumentieren
- [ ] Parkplatz freigeben
- [ ] Briefkasten/Postfach umleiten

#### Phase 6: Nach Ausscheiden (Nachbereitung)

**HR (innerhalb von 6 Wochen):**
- [ ] Sozialversicherungsabmeldung durchfuehren
- [ ] Lohnsteuerbescheinigung uebermitteln
- [ ] Personalakte archivieren (mit Loeschfrist versehen)
- [ ] Arbeitsbescheinigung an Agentur fuer Arbeit (auf Anforderung)
- [ ] Betriebliche Altersversorgung abmelden/uebertragen
- [ ] Organigramm aktualisieren
- [ ] Website/Teamseite aktualisieren (Foto, Kontaktdaten entfernen)
- [ ] Verteiler/Mailinglisten bereinigen
- [ ] Exit-Interview auswerten

**IT (innerhalb von 30 Tagen):**
- [ ] E-Mail-Konto nach Ablauf der Weiterleitungsfrist loeschen
- [ ] Geraete fuer Wiederverwendung aufbereiten
- [ ] Software-Lizenzen freigeben
- [ ] Cloud-Speicher bereinigen

**HR (langfristig):**
- [ ] Loeschfristen ueberwachen (DSGVO)
- [ ] Daten zum vorgesehenen Zeitpunkt loeschen
- [ ] Loeschung protokollieren
- [ ] Alumni-Kontakt pflegen (Weihnachtsgruesse, Firmennewsletter -- nur mit Einwilligung)

---

## 4. Offboarding in Bildungseinrichtungen

### 4.1 Besonderheiten im Bildungsbereich

Bildungseinrichtungen unterscheiden sich fundamental von der freien Wirtschaft:

#### Schuljahresbindung
- **Lehrkraefte** sind de facto an Schuljahre gebunden
- Idealer Austrittszeitpunkt: **31.07.** (Ende Schuljahr) oder **31.01.** (Halbjahr)
- Kuendigungsfrist TVoeD/TV-L: 3 Monate zum Quartalsende, aber in vielen Bundeslaendern: **6 Wochen zum Quartalsende** fuer Lehrkraefte
- Kuendigung mitten im Schuljahr: Paedagogisch problematisch, Vertretung muss organisiert werden

#### Kita-spezifische Aspekte
- **Betreuungsschluessel:** Beim Ausscheiden einer Erzieherin muss der gesetzliche Betreuungsschluessel eingehalten werden
- **Fachkraeftegebot:** Je nach Bundesland muessen bestimmte Qualifikationen im Team vorhanden sein
- **Kinderbindung:** Bezugserziehersystem -- Uebergang muss paedagogisch begleitet werden
- **Elternkommunikation:** Eltern muessen ueber Personalwechsel informiert werden (sensibel!)
- **Betriebserlaubnis:** Kann gefaehrdet sein, wenn Personalschluessel unterschritten wird (SS45 SGB VIII)

#### Schul-spezifische Aspekte
- **Unterrichtskontinuitaet:** Lehrplanerfuellung muss gesichert sein
- **Pruefungsverantwortung:** Lehrkraft darf nicht waehrend laufender Pruefungsphasen ausscheiden (faktische Bindung)
- **Schulaufsicht:** Muss bei Kuendigungen informiert werden
- **Vertretungsorganisation:** Vertretungsplan muss angepasst werden

### 4.2 Beschaeftigtengruppen in Bildungseinrichtungen

| Gruppe | Rechtsstellung | Offboarding-Besonderheiten |
|--------|---------------|---------------------------|
| **Beamte (Lehrkraefte)** | Oeffentlich-rechtliches Dienstverhaeltnis | Kein Offboarding im klassischen Sinn, sondern Entlassung/Versetzung (siehe Kap. 9) |
| **Angestellte Lehrkraefte** | TV-L / TVoeD | Tarifliche Kuendigungsfristen, Schuljahresbindung |
| **Erzieher/innen** | TVoeD-SuE (Sozial- und Erziehungsdienst) | Betreuungsschluessel beachten |
| **Verwaltungspersonal** | TVoeD / TV-L | Standardprozess |
| **Schulsozialarbeiter** | TVoeD-SuE | Uebergabe laufender Faelle! |
| **Hausmeister/Reinigung** | TVoeD | Schluesselverwaltung besonders wichtig |
| **Schulbegleiter/Integrationshelfer** | Oft befristet | Befristungsablauf planen |
| **Praktikanten/FSJ/BFD** | Sonderregelungen | Kurzfristige Verhaeltnisse, Bescheinigungen fuer Traeger |
| **Vertretungslehrkraefte** | Oft befristet | Kettenbefristung pruefen (SS14 TzBfG) |
| **Minijobber (Mensa, etc.)** | Geringfuegig Beschaeftigte | Vereinfachtes Offboarding (siehe Kap. 9) |

### 4.3 Spezifische Checkliste Bildungseinrichtungen

**Zusaetzlich zum Standardprozess:**

- [ ] Schulleitung/Kita-Leitung informieren
- [ ] Schulaufsicht/Traeger informieren
- [ ] Vertretungsregelung sicherstellen
- [ ] Betreuungsschluessel pruefen (Kita)
- [ ] Elternbrief vorbereiten (Kita/Grundschule)
- [ ] Uebergabe paedagogischer Dokumentation (Entwicklungsberichte, Foerderlplaene, Beobachtungsboegen)
- [ ] Uebergabe von Schuelerakten / Portfolios
- [ ] Uebergabe laufender Foerderplaene
- [ ] Klassenbuch/Gruppenbuch aktualisieren
- [ ] Unterrichtsmaterialien sichern (Eigentumsfrage klaeren!)
- [ ] Pruefungsunterlagen uebergeben
- [ ] Kooperationspartner informieren (Therapeuten, Jugendamt, etc.)
- [ ] Dienstliche Materialien zurueckgeben (Lehrbuechersaetze, paedagogisches Material, Sportgeraete)
- [ ] Schliessberechtigungen (Gebaeude, Fachraeme, Sporthalle) zurueckgeben
- [ ] Ersthelfer/Brandschutzhelfer ersetzen
- [ ] Erweitertes Fuehrungszeugnis-Dokumentation archivieren (SS72a SGB VIII)
- [ ] Belehrung nach SS43 IfSG dokumentieren (Kita/Mensa)

### 4.4 Tarifvertraege im Bildungsbereich

#### TVoeD-SuE (Sozial- und Erziehungsdienst)
- Eingruppierung: S2 bis S18
- Kuendigungsfristen: nach SS34 TVoeD
- Besonderheit: Unkuendbarkeit nach 15 Jahren Beschaeftigung und Alter 40+ (SS34 Abs. 2 TVoeD)
- Regenerationstage: muessen abgegolten werden

#### TV-L (Laender -- fuer angestellte Lehrkraefte)
- Kuendigungsfristen nach SS34 TV-L (identisch mit TVoeD)
- Besonderheit: Sonderregelungen fuer Lehrkraefte in Anlage zu SS44 TV-L
- Kuendigungstermine: zum Schulhalbjahresende oder Schuljahresende

#### AVR (Arbeitsvertragsrichtlinien -- kirchliche Traeger)
- AVR Caritas / AVR Diakonie
- Eigene Kuendigungsfristen und -regelungen
- Kirchliches Arbeitsrecht: kein Streikrecht, MAV statt Betriebsrat
- Loyalitaetsobliegenheiten auch nach Ausscheiden

---

## 5. Digitales Offboarding

### 5.1 Kernfunktionen eines digitalen Offboarding-Systems

Ein modernes HR-Portal sollte folgende Offboarding-Funktionen bieten:

#### A) Workflow-Engine
- **Automatisierte Prozesssteuerung:** Sobald eine Beendigung erfasst wird, startet der Workflow automatisch
- **Rollenbasierte Aufgabenzuweisung:** HR, Fuehrungskraft, IT, Facility Management, Mitarbeiter selbst erhalten ihre jeweiligen Aufgaben
- **Eskalationsmechanismus:** Ueberfaellige Aufgaben werden eskaliert
- **Parallele und sequentielle Schritte:** Manche Aufgaben parallel, manche muessen in Reihenfolge
- **Bedingte Logik:** Je nach Beendigungsart, Vertragstyp, Beschaeftigtengruppe werden unterschiedliche Aufgaben generiert

#### B) Checklisten-Management
- **Dynamische Checklisten:** Passen sich automatisch an (z.B. Dienstwagen-Rueckgabe nur bei Mitarbeitern mit Dienstwagen)
- **Fortschrittsanzeige:** Prozentuale Darstellung des Offboarding-Fortschritts
- **Verantwortlichkeiten:** Klare Zuweisung wer was bis wann erledigen muss
- **Delegation:** Moeglichkeit, Aufgaben weiterzuleiten
- **Kommentare/Notizen:** An jeder Aufgabe

#### C) Fristen- und Terminmanagement
- **Automatische Fristberechnung:** Kuendigungsfristen, Zeugniserstellung, Meldepflichten
- **Kalenderintegration:** Termine fuer Exit-Interview, Uebergaben, Rueckgaben
- **Erinnerungen:** Automatische E-Mail-/Push-Benachrichtigungen
- **Dashboard:** Uebersicht aller laufenden Offboarding-Prozesse mit Ampelsystem

#### D) Dokumentenmanagement
- **Dokumentengenerierung:** Automatische Erstellung von:
  - Kuendigungsbestaetigung
  - Aufhebungsvertraegen (Vorlage)
  - Arbeitszeugnissen (Textbausteine)
  - Arbeitsbescheinigungen
  - Rueckgabeprotokollen
  - Abschlussbescheinigungen
- **Digitale Unterschrift:** Integration von E-Signatur-Loesungen
- **Dokumentenarchivierung:** Revisionssichere Ablage mit Loeschfristen

#### E) IT-Integration
- **Active Directory / LDAP Integration:** Automatische Deaktivierung von Benutzerkonten
- **Identity & Access Management (IAM):** Zentrale Steuerung aller Zugaenge
- **MDM-Integration (Mobile Device Management):** Remote-Loeschung von Firmengeraeten
- **Ticket-System-Anbindung:** Automatische Erstellung von IT-Tickets fuer Zugangsdeaktivierung
- **SSO-Deaktivierung:** Alle Single-Sign-On-Zugaenge sperren

#### F) Exit-Interview-Modul
- **Online-Befragung:** Digitaler Fragebogen
- **Anonymisierte Auswertung:** Aggregierte Dashboards
- **Trendanalyse:** Vergleich ueber Zeitraeume
- **Kategorisierung:** Nach Bereich, Position, Kuendigungsgrund

#### G) Wissenstransfer-Modul
- **Uebergabedokument-Vorlagen:** Strukturierte Dokumentation
- **Wiki/Knowledge-Base-Anbindung:** Transfer in zentrale Wissensdatenbank
- **Uebergabeplan-Tool:** Terminierung und Tracking von Einarbeitungen
- **Video-Aufzeichnung:** Moeglichkeit, Screencasts/Erklaervideos zu erstellen

#### H) Reporting und Analytics
- **Offboarding-Dashboard:** Alle laufenden Prozesse auf einen Blick
- **KPI-Tracking:** Completion Rate, Durchlaufzeiten, Fluktuationsraten
- **Compliance-Report:** Uebersicht offener Pflichten (Meldungen, Loeschungen)
- **Fluktuationsanalyse:** Trends, Gruende, Kostenkalkulation

#### I) Self-Service-Portal fuer ausscheidende Mitarbeiter
- **Eigene Aufgabenliste:** Was muss der Mitarbeiter selbst erledigen?
- **Dokumenten-Upload:** Z.B. Schluesselrueckgabe-Bestaetigung
- **Kontaktdaten hinterlegen:** Fuer Rueckfragen nach Ausscheiden
- **Alumni-Registrierung:** Opt-in fuer Alumni-Netzwerk
- **Feedback-Moeglichkeit:** Exit-Interview online ausfuellen

### 5.2 Technische Architektur-Empfehlung

```
+--------------------------------------------------+
|              HR-Portal (Frontend)                  |
|  +---------------------------------------------+  |
|  |         Offboarding-Dashboard                |  |
|  |  - Laufende Prozesse                         |  |
|  |  - Fristen-Ampel                             |  |
|  |  - KPI-Widgets                               |  |
|  +---------------------------------------------+  |
+--------------------------------------------------+
              |                    |
    +---------+--------+  +-------+----------+
    |  Workflow-Engine  |  |  Dokumenten-     |
    |  (Task-Queue)     |  |  Generator       |
    +------------------+  +------------------+
              |                    |
    +---------+--------+  +-------+----------+
    |  Fristen-Service  |  |  Benachrich-     |
    |  (Cron-Jobs)      |  |  tigungssystem   |
    +------------------+  +------------------+
              |
    +---------+----------------------------------+
    |           Integrationen                     |
    |  +--------+ +--------+ +--------+ +------+ |
    |  |  AD/   | | Lohn-  | | Ticket | | DMS  | |
    |  | LDAP   | | abr.   | | System | |      | |
    |  +--------+ +--------+ +--------+ +------+ |
    +--------------------------------------------+
```

### 5.3 Datenbankfelder fuer das Offboarding-Modul

```
Offboarding {
  id: UUID
  employeeId: FK -> Employee
  initiatedBy: FK -> User
  initiatedAt: DateTime
  terminationType: ENUM [
    RESIGNATION,           // Eigenkundigung
    TERMINATION_ORDINARY,  // Ordentliche Kundigung AG
    TERMINATION_EXTRAORDINARY, // Fristlose Kundigung
    MUTUAL_AGREEMENT,      // Aufhebungsvertrag
    CONTRACT_EXPIRY,       // Befristungsablauf
    RETIREMENT,            // Ruhestand
    TRANSFER,              // Versetzung (Beamte)
    DISMISSAL_CIVIL_SERVANT, // Entlassung Beamter
    DEATH                  // Todesfall
  ]
  lastWorkingDay: Date
  noticePeriodEnd: Date
  noticePeriodCalculated: Date  // System-berechnet
  freelanceUntil: Date?         // Freistellung bis
  remainingVacationDays: Decimal
  overtimeBalance: Decimal
  status: ENUM [INITIATED, IN_PROGRESS, COMPLETED, CANCELLED]
  certificateStatus: ENUM [NOT_STARTED, DRAFT, REVIEW, APPROVED, DELIVERED]
  exitInterviewCompleted: Boolean
  exitInterviewDate: Date?
  knowledgeTransferCompleted: Boolean
  itDeactivationCompleted: Boolean
  assetReturnCompleted: Boolean
  socialSecurityDeregistered: Boolean
  finalPayrollProcessed: Boolean
  documentsDelivered: Boolean
  notes: Text
  completedAt: DateTime?
  createdAt: DateTime
  updatedAt: DateTime
}

OffboardingTask {
  id: UUID
  offboardingId: FK -> Offboarding
  taskTemplateId: FK -> TaskTemplate
  title: String
  description: Text
  assignedTo: FK -> User
  assignedRole: ENUM [HR, MANAGER, IT, FACILITY, EMPLOYEE, PAYROLL]
  dueDate: Date
  status: ENUM [PENDING, IN_PROGRESS, COMPLETED, OVERDUE, SKIPPED, NOT_APPLICABLE]
  completedAt: DateTime?
  completedBy: FK -> User?
  notes: Text
  sortOrder: Integer
  phase: ENUM [INITIATION, TRANSITION, FINAL_WEEK, LAST_DAY, POST_EXIT]
  isMandatory: Boolean
  dependsOn: FK -> OffboardingTask? // Abhaengigkeit
}

AssetReturn {
  id: UUID
  offboardingId: FK -> Offboarding
  assetType: ENUM [LAPTOP, PHONE, KEY, ACCESS_CARD, CREDIT_CARD, VEHICLE, PARKING, ID_BADGE, OTHER]
  assetDescription: String
  assetSerialNumber: String?
  returnedAt: DateTime?
  returnedTo: FK -> User?
  condition: ENUM [GOOD, DAMAGED, LOST]
  notes: Text
}

ExitInterview {
  id: UUID
  offboardingId: FK -> Offboarding
  conductedBy: FK -> User
  conductedAt: DateTime
  overallSatisfaction: Integer (1-10)
  reasonForLeaving: ENUM [BETTER_OFFER, CAREER_CHANGE, RELOCATION, DISSATISFACTION_SALARY, DISSATISFACTION_MANAGEMENT, DISSATISFACTION_CULTURE, PERSONAL, RETIREMENT, CONTRACT_END, OTHER]
  wouldRecommend: Boolean
  wouldReturn: Boolean
  feedbackManagement: Text
  feedbackCulture: Text
  feedbackWorkConditions: Text
  feedbackDevelopment: Text
  suggestions: Text
  isAnonymized: Boolean
  anonymizedAt: DateTime?
}

DataDeletionSchedule {
  id: UUID
  offboardingId: FK -> Offboarding
  dataCategory: String
  retentionPeriod: Integer // Monate
  deletionDueDate: Date
  deletedAt: DateTime?
  deletedBy: FK -> User?
  legalBasis: String
  status: ENUM [PENDING, DUE, COMPLETED, EXTENDED]
}
```

---

## 6. Exit-Interview Best Practices

### 6.1 Warum Exit-Interviews?

Exit-Interviews sind eines der wertvollsten Instrumente im HR-Management:
- **70-80%** der Kuendigungsgruende sind beeinflussbar (Fuehrung, Kultur, Entwicklung)
- Scheidende Mitarbeiter sind ehrlicher als aktive (keine Angst vor Konsequenzen)
- Systematische Auswertung zeigt Muster und Handlungsfelder
- Zeigt Wertschaetzung gegenueber dem ausscheidenden Mitarbeiter

### 6.2 Timing

| Zeitpunkt | Vorteile | Nachteile |
|-----------|----------|-----------|
| **1-2 Wochen vor letztem Tag** (empfohlen) | Noch im Unternehmen, emotional abgekuehlt, praktische Erfahrung frisch | Evtl. noch nicht ganz losgeloest |
| **Am letzten Tag** | Unmittelbar, alles noch praesent | Oft emotional, Abschiedsstress |
| **2-4 Wochen nach Ausscheiden** | Groesste Distanz, ehrlichste Antworten | Schwer terminierbar, Ruecklaufquote sinkt |

**Empfehlung:** Zwei-Stufen-Ansatz:
1. **Persoenliches Gespraech:** 1-2 Wochen vor dem letzten Tag
2. **Online-Befragung:** 4 Wochen nach Ausscheiden (anonymisiert)

### 6.3 Wer fuehrt das Gespraech?

- **Nicht der direkte Vorgesetzte** (Befangenheit, Mitarbeiter ist weniger offen)
- **Idealerweise:** HR-Mitarbeiter, der nicht direkt am Kuendigungsprozess beteiligt war
- **Alternative:** Externer Dienstleister (hoechste Anonymitaet)
- **Groessere Organisationen:** Dedizierter "Exit-Interview-Verantwortlicher"

### 6.4 Fragebereiche und konkrete Fragen

#### A) Kuendigungsgruende
- "Was hat Sie letztlich dazu bewogen, sich beruflich zu veraendern?"
- "Gab es einen konkreten Ausloser fuer Ihre Entscheidung?"
- "Haetten wir etwas tun koennen, um Sie zu halten?"
- "Seit wann haben Sie ueber einen Wechsel nachgedacht?"

#### B) Fuehrung und Management
- "Wie bewerten Sie die Zusammenarbeit mit Ihrer Fuehrungskraft?"
- "Haben Sie regelmaessig Feedback zu Ihrer Arbeit erhalten?"
- "Fuehlten Sie sich in Entscheidungen angemessen einbezogen?"
- "Wie bewerten Sie die Kommunikation innerhalb Ihres Teams / der Organisation?"

#### C) Arbeitsumfeld und Kultur
- "Wie wuerden Sie die Arbeitsatmosphaere beschreiben?"
- "Fuehlten Sie sich als Mensch wertgeschaetzt?"
- "Wie bewerten Sie die Work-Life-Balance?"
- "Gab es Konflikte oder Belastungen, die nicht geloest wurden?"

#### D) Entwicklung und Karriere
- "Wurden Ihre Staerken angemessen eingesetzt?"
- "Gab es ausreichend Weiterbildungsmoeglichkeiten?"
- "Wie bewerten Sie Ihre Karriereperspektiven in unserer Organisation?"
- "Wurden Entwicklungsziele mit Ihnen vereinbart und verfolgt?"

#### E) Vergutung und Benefits
- "Wie empfanden Sie Ihre Verguetung im Vergleich zum Markt?"
- "Welche Benefits waren Ihnen besonders wichtig / haben gefehlt?"

#### F) Bildungseinrichtungs-spezifisch
- "Wie bewerten Sie die paedagogische Ausstattung?"
- "Fuehlten Sie sich in Ihrer paedagogischen Arbeit unterstuetzt?"
- "Wie empfanden Sie die Zusammenarbeit mit den Eltern?"
- "Wie bewerten Sie die raeumlichen Gegebenheiten?"
- "Gab es ausreichend Zeit fuer Vor- und Nachbereitung?"
- "Wie bewerten Sie die Gruppengroessen / Klassenstaerken?"

#### G) Abschluss
- "Wuerden Sie unser Unternehmen als Arbeitgeber weiterempfehlen?"
- "Koennen Sie sich vorstellen, in Zukunft zurueckzukehren?"
- "Was wuerden Sie uns als wichtigsten Rat mitgeben?"
- "Gibt es etwas, das Sie als Positives hervorheben moechten?"

### 6.5 Anonymitaet und Datenschutz

- Einzelne Antworten werden **nicht** an die Fuehrungskraft weitergegeben
- Auswertung nur **aggregiert** (mindestens 5 Interviews pro Auswertungseinheit)
- Mitarbeiter muss ueber Verwendung der Daten informiert werden (DSGVO Art. 13)
- Einwilligung einholen (Art. 6 Abs. 1 lit. a DSGVO) oder berechtigtes Interesse als Rechtsgrundlage
- Anonymisierung nach Auswertung (spaetestens nach 12 Monaten)
- Keine Pflicht zur Teilnahme!

### 6.6 Auswertung und Massnahmen

- **Quartalsweise:** Aggregierte Auswertung aller Exit-Interviews
- **Trendanalyse:** Veraenderungen ueber die Zeit
- **Benchmarking:** Vergleich zwischen Bereichen/Standorten
- **Massnahmenableitung:** Aus den Top-3-Kuendigungsgruenden konkrete Massnahmen entwickeln
- **Management-Reporting:** Regelmaessige Praesentation der Ergebnisse an die Geschaeftsfuehrung

---

## 7. Wissenstransfer

### 7.1 Warum Wissenstransfer kritisch ist

Studien zeigen:
- **Bis zu 70%** des organisationsrelevanten Wissens ist implizites Wissen (in den Koepfen der Mitarbeiter)
- Die Kosten des Wissensverlustes bei einer Fachkraft betragen geschaetzt **50-200%** des Jahresgehalts
- In Bildungseinrichtungen besonders kritisch: paedagogisches Erfahrungswissen, Beziehungswissen zu Kindern/Eltern

### 7.2 Arten von Wissen

| Wissensart | Beispiele Bildung | Transfer-Methode |
|------------|------------------|-----------------|
| **Explizites Wissen** | Lehrplaene, Dokumentationen, Foerderplaene | Dokumentation, Dateien uebergeben |
| **Implizites Wissen** | Umgang mit schwierigen Eltern, paedagogische Tricks | Tandem-Arbeit, Gespraeche |
| **Prozesswissen** | Ablaeufe, Ansprechpartner, Workarounds | Prozessdokumentation |
| **Beziehungswissen** | Kontakte, Netzwerke, Kooperationspartner | Vorstellung, Kontaktlisten |
| **Kontextwissen** | Schulgeschichte, vergangene Entscheidungen | Erzaehlung, Dokumentation |

### 7.3 Methoden des Wissenstransfers

#### 1. Uebergabedokumentation (Pflicht)
Strukturierte Vorlage mit folgenden Abschnitten:
- **Taetigkeitsuebersicht:** Was mache ich? (mit Priorisierung)
- **Wiederkehrende Aufgaben:** Kalender der regelmaessigen Taetigkeiten (taeglich, woechentlich, monatlich, jaehrlich)
- **Laufende Projekte/Vorgaenge:** Status, naechste Schritte, Ansprechpartner
- **Kontaktliste:** Interne und externe Ansprechpartner mit Kontext
- **Zugangsdaten:** Systemzugaenge, Passwoerter (sicher uebergeben!)
- **Dateien und Ablagesystem:** Wo liegt was?
- **Bekannte Probleme/Workarounds:** Was laeuft nicht rund?
- **Tipps fuer den Nachfolger:** Persoenliche Empfehlungen

#### 2. Tandem-Arbeit / Shadowing
- Nachfolger arbeitet fuer 1-4 Wochen parallel mit dem Ausscheidenden
- Besonders effektiv fuer implizites Wissen
- In Bildungseinrichtungen: gemeinsames Unterrichten / gemeinsame Betreuung

#### 3. Video-Dokumentation
- Screencast-Aufnahmen fuer komplexe IT-Prozesse
- Video-Tutorials fuer wiederkehrende Aufgaben
- In Kitas: Video-Dokumentation paedagogischer Routinen (Datenschutz beachten!)

#### 4. Wissens-Workshops
- Ausscheidender Mitarbeiter haelt Schulung fuer Team
- Dokumentation des Workshops
- Besonders bei Spezialistenwissen

#### 5. Knowledge-Base / Wiki
- Wissen in zentrale Wissensdatenbank uebertragen
- Durchsuchbar und fuer alle zugaenglich
- Regelmaessige Aktualisierung sicherstellen

#### 6. Mentoring-Modell
- Ausscheidender wird fuer begrenzte Zeit (2-4 Wochen) zum Mentor des Nachfolgers
- Regelmaessige Check-ins
- Definierte Lernziele

### 7.4 Wissenstransfer-Plan fuer das System

```
Wissenstransfer-Timeline:

Woche 1 nach Kuendigung:
  -> Uebergabedokumentation beginnen
  -> Nachfolger identifizieren

Woche 2-3:
  -> Dokumentation vertiefen
  -> Laufende Projekte dokumentieren

Ab Woche 4 (wenn Nachfolger da):
  -> Tandem-Arbeit starten
  -> Kontakte vorstellen

Letzte 2 Wochen:
  -> Wissens-Workshop fuer Team
  -> Finale Dokumentation
  -> Offene Fragen klaeren

Letzter Tag:
  -> Dokumentation finalisieren
  -> Kontaktdaten fuer Rueckfragen hinterlassen
```

### 7.5 Anforderungen an das System

- **Uebergabedokument-Vorlage:** Vorkonfiguriert, vom Mitarbeiter auszufuellen
- **Fortschritts-Tracking:** Wie weit ist die Dokumentation?
- **Erinnerungen:** Automatische Erinnerungen an den ausscheidenden Mitarbeiter
- **Review-Funktion:** Fuehrungskraft prueft Vollstaendigkeit
- **Archivierung:** Uebergabedokumentation wird archiviert
- **Nachfolger-Zugang:** Nachfolger kann auf alle Uebergabedokumente zugreifen

---

## 8. Fristen und Timeline

### 8.1 Typischer Zeitplan: Ordentliche Kuendigung durch Arbeitnehmer

Beispiel: Kuendigungsfrist 3 Monate zum Monatsende

```
Tag 0: Kuendigungseingang
  |
Tag 1-3: Administrative Erstmassnahmen
  - Kuendigung bestaetigen
  - Fristen berechnen
  - Offboarding-Workflow starten
  - Team informieren
  |
Woche 1-2: Planung
  - Nachfolgersuche starten
  - Uebergabeplan erstellen
  - Exit-Interview terminieren
  - Zeugnis-Erstellung anstoessen
  |
Woche 3 bis Woche 10: Uebergangsphase
  - Wissenstransfer durchfuehren
  - Projekte uebergeben
  - Dokumentation erstellen
  - Nachfolger einarbeiten (wenn moeglich)
  |
Woche 11 (2 Wochen vor Austritt):
  - Exit-Interview durchfuehren
  - Zeugnis finalisieren
  - Alle Bescheinigungen vorbereiten
  - Rueckgabe-Termin vereinbaren
  |
Woche 12 (letzte Woche):
  - Mo-Do: Letzte Uebergaben
  - Do: Rueckgabe Arbeitsmittel
  - Fr (letzter Tag): Verabschiedung, Papiere uebergeben
  |
Tag +1 (nach Ausscheiden):
  - IT-Zugaenge deaktivieren
  - Arbeitsplatz raeumen (wenn nicht bereits geschehen)
  |
Tag +1 bis +42 (6 Wochen):
  - SV-Abmeldung
  - Lohnsteuerbescheinigung
  - Arbeitsbescheinigung (auf Anforderung)
  |
Monat +1 bis +6:
  - E-Mail-Weiterleitung beenden
  - Alumni-Kontakt pflegen
  - Online-Befragung (4 Wochen nach Austritt)
  |
Ab Monat +6 bis Jahre:
  - DSGVO-Loeschfristen beachten
  - Daten schrittweise loeschen
```

### 8.2 Sonderfall: Fristlose Kuendigung

```
Stunde 0: Kuendigungsausspruch
  |
Sofort (Stunde 0):
  - IT-Zugaenge SOFORT sperren
  - Zugangsberechtigungen deaktivieren
  - Schluessel einziehen
  - Firmeneigentum einfordern
  - Mitarbeiter vom Gelaende begleiten
  |
Tag 1:
  - Arbeitsplatz raeumen (mit Zeugen)
  - Persoenliche Gegenstaende versenden
  - Betriebsrat-Stellungnahme dokumentieren
  |
Tag 1-7:
  - Zeugnis erstellen (auch bei fristloser Kuendigung Anspruch!)
  - Arbeitspapiere versenden
  - Entgeltabrechnung (anteilig)
  |
Tag 1-42:
  - SV-Abmeldung
  - Weitere Meldepflichten
```

### 8.3 Sonderfall: Aufhebungsvertrag

```
Tag 0: Aufhebungsvertrag unterzeichnet
  |
Je nach vereinbartem Austrittsdatum:
  - Ggf. sofortige Freistellung (bezahlt)
  - Oder Arbeit bis zum Austrittsdatum
  |
Bei Freistellung:
  - IT-Zugaenge: Je nach Vereinbarung (Zugang behalten oder sperren)
  - Arbeitsmittel: Rueckgabe am letzten Prasenztag oder am Austrittsdatum
  |
Austrittsdatum:
  - Wie bei ordentlicher Kuendigung
  |
Besonderheit:
  - Abfindungszahlung: Faelligkeit gemaess Vereinbarung
  - Sperrzeit pruefen / Hinweis dokumentieren
```

### 8.4 Fristenkalender fuer das System

Das System sollte folgende Fristen automatisch berechnen und ueberwachen:

| Frist | Berechnung | Warnung vor |
|-------|-----------|-------------|
| Letzter Arbeitstag | Kuendigungsfrist-Berechnung | -- |
| Exit-Interview | 10 Arbeitstage vor letztem Tag | 15 Tage |
| Zeugnis-Fertigstellung | 5 Arbeitstage vor letztem Tag | 20 Tage |
| IT-Deaktivierung | Letzter Arbeitstag 23:59 | 3 Tage |
| Arbeitsmittel-Rueckgabe | Letzter Arbeitstag | 5 Tage |
| SV-Abmeldung | 42 Tage nach Austritt | 35 Tage |
| Lohnsteuerbescheinigung | 28.02. Folgejahr (oder zeitnah) | 14 Tage |
| E-Mail-Weiterleitung Ende | 6 Monate nach Austritt | 7 Tage |
| Datenloesch-Termine | Individuell je Datenkategorie | 30 Tage |

---

## 9. Besonderheiten: Beamte, Minijobber, Befristete

### 9.1 Verbeamtung (Entlassung / Versetzung)

Beamte unterliegen nicht dem Arbeitsrecht, sondern dem Beamtenrecht. Es gibt kein "Offboarding" im klassischen Sinn, aber vergleichbare Prozesse.

#### Beendigungsgruende bei Beamten

| Beendigungsgrund | Rechtsgrundlage | Besonderheiten |
|-----------------|-----------------|----------------|
| **Entlassung auf Antrag** | SS33 BeamtStG / Landesbeamtengesetz | Beamter selbst beantragt Entlassung |
| **Entlassung von Amts wegen** | SS34 BeamtStG | Z.B. bei Verlust der Staatsangehoerigkeit |
| **Entfernung aus dem Dienst** | Disziplinarrecht | Schwerste Disziplinarmassnahme |
| **Ruhestand (Alter)** | SS51 BBG / Landesrecht | Regelaltersgrenze / Antragsaltersgrenze |
| **Dienstunfaehigkeit** | SS44 BBG | Versetzung in vorzeitigen Ruhestand |
| **Versetzung** | SS28 BBG | In anderen Geschaeftsbereich |
| **Abordnung** | SS27 BBG | Voruebergehende Zuweisung |

#### Fristen bei Beamten
- **Entlassung auf Antrag:** Frist in der Regel **3 Monate** zum Schluss eines Kalendervierteljahres
- **Lehrkraefte:** Entlassung in der Regel nur zum **Ende eines Schulhalbjahres** moeglich
- **Beamte auf Probe:** Entlassung mit 6-Wochen-Frist moeglich
- **Beamte auf Widerruf (Referendare):** Jederzeit entlassbar

#### Besonderheiten im Offboarding-Prozess bei Beamten
- **Keine Sozialversicherungsabmeldung** (Beamte sind nicht sozialversicherungspflichtig)
- **Beihilfe:** Endet mit Dienstverhaeltnis (Uebergang in PKV oder GKV beachten)
- **Pension:** Versorgungsansprueche pruefen (Mindestdienstzeit 5 Jahre)
- **Nachversicherung:** Bei Ausscheiden ohne Versorgungsanspruch muss in der gesetzlichen Rentenversicherung nachversichert werden (SS8 SGB VI)
- **Amtliche Dokumente:** Dienstausweis, Urkunden zurueckgeben
- **Verschwiegenheitspflicht:** Gilt auch nach Dienstende weiter (SS37 BeamtStG)
- **Nebentaetigkeitsgenehmigungen:** Erloeschen mit Dienstende

**Anforderung ans System:** Eigener Workflow fuer Beamte mit angepassten Schritten (keine SV-Abmeldung, stattdessen Nachversicherung; keine Kuendigungsfrist-Berechnung nach BGB, sondern nach Beamtenrecht).

### 9.2 Minijobber (geringfuegig Beschaeftigte)

#### Kuendigungsfristen
- Gesetzliche Fristen gemaess SS622 BGB gelten auch fuer Minijobber
- In Bildungseinrichtungen haeufig: Mensapersonal, Reinigungskraefte, Nachmittagsbetreuung

#### Vereinfachtes Offboarding

| Aspekt | Besonderheit |
|--------|-------------|
| Sozialversicherung | Abmeldung bei der **Minijob-Zentrale** (nicht Krankenkasse) |
| Lohnsteuer | Pauschalsteuer: Nur jaehrliche Meldung |
| Zeugnis | Anspruch besteht auch bei Minijobbern |
| Arbeitszeit | Arbeitszeitgesetz gilt voll |
| Kuendigungsschutz | KSchG gilt (Wartezeit 6 Monate, Betriebsgroesse > 10) |

**Anforderung ans System:** Vereinfachte Checkliste fuer Minijobber. Andere Meldestelle (Minijob-Zentrale statt Krankenkasse). Weniger Pflichtschritte.

### 9.3 Befristete Vertraege

#### Arten der Befristung
- **Sachgrundbefristung** (SS14 Abs. 1 TzBfG): Z.B. Schwangerschaftsvertretung, Projektbefristung, Elternzeitvertretung
- **Sachgrundlose Befristung** (SS14 Abs. 2 TzBfG): Max. 2 Jahre, max. 3 Verlaengerungen

#### Ende des befristeten Vertrages
- Automatisches Ende mit Ablauf der Befristung (SS15 TzBfG)
- **Keine Kuendigung erforderlich**
- Arbeitgeber muss Mitarbeiter aber rechtzeitig informieren, ob Verlaengerung/Entfristung geplant ist

#### Besondere Pflichten
- **SS15 Abs. 2 TzBfG:** Zweckbefristung endet 2 Wochen nach schriftlicher Unterrichtung ueber Zweckerreichung
- **SS18 TzBfG:** Arbeitgeber hat ueber unbefristete Arbeitsplaetze zu informieren

#### In Bildungseinrichtungen besonders relevant
- Vertretungsstellen (sehr haeufig im Schuldienst)
- Schwangerschaftsvertretungen in Kitas
- Projektbezogene Stellen (Integrationshilfe, Schulsozialarbeit)
- Referendare (Beamte auf Widerruf -- eigene Regelungen)

**Anforderung ans System:**
- Automatische Erinnerung vor Befristungsende (z.B. 3 Monate, 6 Wochen, 2 Wochen vorher)
- Entscheidungs-Workflow: Verlaengern / Entfristen / Auslaufen lassen
- Bei Auslaufen: Automatischer Start des Offboarding-Prozesses
- Kettenbefristungs-Pruefung: System warnt bei mehr als 3 Verlaengerungen oder > 2 Jahre (sachgrundlose Befristung)

### 9.4 Sonderfaelle

#### Elternzeit / Mutterschutz
- Kuendigung durch AG waehrend Mutterschutz/Elternzeit nur mit Genehmigung der zustaendigen Behoerde moeglich (SS17 MuSchG, SS18 BEEG)
- Bei Kuendigung durch AN: Kuendigungsfrist 3 Monate zum Ende der Elternzeit (SS19 BEEG)

#### Schwerbehinderte
- Zustimmung des Integrationsamtes erforderlich (SS168 SGB IX)
- Kuendigungsfrist mindestens 4 Wochen (SS169 SGB IX)
- Praevention: BEM-Verfahren vor Kuendigung

#### Auszubildende
- Waehrend der Probezeit (1-4 Monate): Jederzeit ohne Frist kuendbar
- Nach der Probezeit: Nur ausserordentlich aus wichtigem Grund (SS22 BBiG)
- Bei vorzeitiger Beendigung: Bescheinigung ueber Ausbildungszeit ausstellen

#### Arbeitnehmer in Insolvenz
- Kuendigungsfrist max. 3 Monate zum Monatsende (SS113 InsO)
- Insolvenzverwalter ist zustaendig

---

## 10. Employer Branding durch Offboarding

### 10.1 Der Zusammenhang

- **78%** der Mitarbeiter teilen ihre Kuendigungserfahrung mit Freunden und Bekannten (Harvard Business Review)
- **Kununu, Glassdoor und Co.:** Ehemalige Mitarbeiter bewerten den Arbeitgeber oeffentlich
- In der Bildungsbranche: **Kleine Netzwerke**, Lehrkraefte und Erzieher kennen sich -- schlechte Erfahrungen sprechen sich schnell herum
- **Fachkraeftemangel:** Besonders bei Erziehern und Lehrkraeften ist ein guter Ruf entscheidend fuer die Personalgewinnung

### 10.2 Alumni-Management

#### Warum Alumni-Programme?
- **Boomerang-Hiring:** 15-20% der ehemaligen Mitarbeiter kehren zurueck (LinkedIn-Daten)
- **Empfehlungen:** Zufriedene Ehemalige empfehlen den Arbeitgeber weiter
- **Netzwerk:** Ehemalige koennen Kooperationspartner, Kunden oder Foerderer werden
- **Wissensrueckfluss:** Ehemalige bringen neue Perspektiven mit zurueck

#### Massnahmen
- Alumni-Newsletter (quartalsweise, Opt-in)
- Einladung zu Firmenfeiern / Schulevents
- LinkedIn-/XING-Gruppe fuer Ehemalige
- Wiedereinstellungs-Bonus fuer Boomerang-Mitarbeiter
- Jubi1aeumsgruesse auch an Ehemalige

### 10.3 Positive Offboarding-Erlebnisse schaffen

| Massnahme | Wirkung |
|-----------|---------|
| Persoenliches Dankesschreiben der Fuehrung | Wertschaetzung |
| Abschiedsfeier / gemeinsames Essen | Emotionaler Abschluss |
| Professionelles, zeitnah erstelltes Zeugnis | Rechtssicherheit, Zufriedenheit |
| Offene Kommunikation im Team | Keine Geruechte, professionelle Kultur |
| Alumni-Angebot | Tueren offenhalten |
| Exit-Interview mit echtem Interesse | Zeigt, dass Meinung zaehlt |
| Saubere Administration (keine Verzoegerungen) | Professionalitaet |
| Hilfe bei der beruflichen Neuorientierung (optional) | Aussergewoehnliche Wertschaetzung |

### 10.4 Dont's -- Was das Employer Branding beschaedigt

- Mitarbeiter nach Kuendigung ignorieren oder schlechter behandeln
- Zeugnis als Druckmittel einsetzen
- IT-Zugaenge sofort sperren (bei ordentlicher Kuendigung -- wirkt wie Misstrauen)
- Keine Verabschiedung, kein Abschluss
- Unvollstaendige oder verspaetete Arbeitspapiere
- Oeffentliche Kritik am Ausscheidenden
- Druck auf verbleibende Mitarbeiter, keinen Kontakt mehr zu halten

### 10.5 Messbarkeit

- **Kununu-/Glassdoor-Bewertungen** von Ehemaligen tracken
- **Boomerang-Rate:** Anteil Wiedereinstellungen an Gesamteinstellungen
- **Empfehlungsrate:** Ehemalige als Quelle fuer Bewerbungen
- **Exit-Interview-Score:** Weiterempfehlungsbereitschaft (Skala 1-10)

---

## 11. Datenmodell-Empfehlung fuer das HR-Portal

### 11.1 Zusammenfassung der System-Anforderungen

Basierend auf der gesamten Recherche ergeben sich folgende Kernanforderungen fuer das Offboarding-Modul:

#### Must-Have (MVP)
1. **Offboarding-Workflow-Engine** mit phasenbasiertem Prozess
2. **Dynamische Checklisten** je nach Beendigungsart und Beschaeftigtengruppe
3. **Automatische Fristberechnung** (BGB, TVoeD, TV-L, individuell)
4. **Zeugnisgenerator** mit Textbausteinen und Notensystem
5. **Rueckgabeverwaltung** fuer Arbeitsmittel
6. **DSGVO-Loeschfristen-Management**
7. **Meldepflichten-Tracking** (SV-Abmeldung, Lohnsteuer, etc.)
8. **Exit-Interview-Modul** (Fragebogen, Auswertung)
9. **Dokumentengenerierung** (Bestaetigung, Bescheinigungen)
10. **Benachrichtigungssystem** (Erinnerungen, Eskalationen)

#### Should-Have
11. **Wissenstransfer-Modul** (Uebergabedokumentation, Tracking)
12. **IT-Integration** (automatische Zugangsdeaktivierung)
13. **Self-Service-Portal** fuer ausscheidende Mitarbeiter
14. **Reporting-Dashboard** mit KPIs
15. **Bildungseinrichtungs-Spezifika** (Betreuungsschluessel-Check, Elternbrief-Vorlage)

#### Nice-to-Have
16. **Alumni-Management**
17. **Boomerang-Hiring-Tracking**
18. **Benchmark-Analyse** (intern zwischen Standorten)
19. **Predictive Analytics** (Fluktuationsprognose)
20. **Mobile App** fuer Checklisten-Bearbeitung

### 11.2 Bildungseinrichtungs-spezifische Erweiterungen

Das System sollte folgende Konfigurationsoptionen bieten:

```
Einrichtungstyp:
  - Kita / Kindergarten
  - Grundschule
  - Weiterfuehrende Schule
  - Berufsschule
  - Sonderschule / Foerderschule
  - Verwaltung

Beschaeftigtengruppe:
  - Beamte (Lehrkraft)
  - Angestellte Lehrkraft (TV-L)
  - Erzieher/in (TVoeD-SuE)
  - Verwaltungsangestellte/r (TVoeD)
  - Sozialpädagoge/in
  - Schulbegleiter/in
  - Hausmeister/in
  - Reinigungskraft
  - Praktikant/in / FSJ / BFD
  - Minijobber/in
  - Honorarkraft

Traegerart:
  - Oeffentlich (Kommune/Land)
  - Kirchlich (katholisch/evangelisch)
  - Frei (gemeinnuetzig)
  - Privat

Tarifvertrag:
  - TVoeD
  - TVoeD-SuE
  - TV-L
  - AVR Caritas
  - AVR Diakonie
  - Haustarifvertrag
  - Kein Tarifvertrag
```

Je nach Kombination dieser Parameter generiert das System die passende Checkliste, berechnet die korrekten Fristen und zeigt die relevanten Meldepflichten an.

---

## Anhang A: Quellen und Referenzen

### Gesetze und Verordnungen
- Buergerliches Gesetzbuch (BGB), insb. SSSS 611a-630, SS622, SS626
- Kuendigungsschutzgesetz (KSchG)
- Teilzeit- und Befristungsgesetz (TzBfG)
- Betriebsverfassungsgesetz (BetrVG)
- Gewerbeordnung (GewO), SS109
- Sozialgesetzbuch III (SGB III), SS38, SS312
- Sozialgesetzbuch IV (SGB IV), SS28a, SS28f
- Sozialgesetzbuch VI (SGB VI), SS8 (Nachversicherung)
- Sozialgesetzbuch VIII (SGB VIII), SS45, SS72a
- Sozialgesetzbuch IX (SGB IX), SSSS168-169
- Bundeselterngeld- und Elternzeitgesetz (BEEG), SSSS18-19
- Mutterschutzgesetz (MuSchG), SS17
- Berufsbildungsgesetz (BBiG), SS22
- Bundesurlaubsgesetz (BUrlG), SS6
- Arbeitszeitgesetz (ArbZG), SS16
- Einkommensteuergesetz (EStG), SS41
- Handelsgesetzbuch (HGB), SS257
- Datenschutz-Grundverordnung (DSGVO), Art. 6, 9, 13, 17
- Kunsturhebergesetz (KUG), SS22
- Allgemeines Gleichbehandlungsgesetz (AGG), SS15
- Bundesbeamtengesetz (BBG)
- Beamtenstatusgesetz (BeamtStG)
- Insolvenzordnung (InsO), SS113
- Infektionsschutzgesetz (IfSG), SS43

### Tarifvertraege
- TVoeD (Tarifvertrag fuer den oeffentlichen Dienst)
- TVoeD-SuE (Sozial- und Erziehungsdienst)
- TV-L (Tarifvertrag der Laender)
- AVR Caritas / AVR Diakonie

### Fachliteratur und Standards
- SHRM (Society for Human Resource Management): Offboarding Best Practices
- DGFP (Deutsche Gesellschaft fuer Personalfuehrung): Leitfaden Trennungsmanagement
- Haufe Personal Office: Offboarding-Checklisten und Praxisleitfaeden
- Personio HR-Lexikon: Offboarding
- Kienbaum: Studien zu Fluktuation und Employer Branding
- BITKOM: Leitfaden IT-Offboarding und Datensicherheit

---

## Anhang B: Glossar

| Begriff | Erklaerung |
|---------|-----------|
| **Offboarding** | Strukturierter Prozess des Mitarbeiteraustritts |
| **Exit-Interview** | Abschlussgespraech mit dem ausscheidenden Mitarbeiter |
| **Boomerang-Hiring** | Wiedereinstellung ehemaliger Mitarbeiter |
| **Aufhebungsvertrag** | Einvernehmliche Beendigung des Arbeitsverhaeltnisses |
| **Sperrzeit** | Zeitraum, in dem ALG I nach Eigenkuendigung/Aufhebungsvertrag nicht gezahlt wird |
| **TVoeD-SuE** | Tarifvertrag fuer den Sozial- und Erziehungsdienst |
| **MAV** | Mitarbeitervertretung (kirchliche Einrichtungen) |
| **BEM** | Betriebliches Eingliederungsmanagement |
| **Alumni-Netzwerk** | Netzwerk ehemaliger Mitarbeiter |
| **Nachversicherung** | Nachtraegliche Versicherung von Beamten in der gesetzlichen RV bei Ausscheiden ohne Pensionsanspruch |
| **Kettenbefristung** | Mehrere aufeinanderfolgende befristete Vertraege |
| **Abgabegrund 30** | Code fuer SV-Abmeldung bei Beschaeftigungsende |

---

*Dieser Bericht dient als fachliche Grundlage fuer die Implementierung des Offboarding-Moduls im HR-Portal CREDO. Alle rechtlichen Angaben sind nach bestem Wissen erstellt, ersetzen jedoch keine individuelle Rechtsberatung.*
