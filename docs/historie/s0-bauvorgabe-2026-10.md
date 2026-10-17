# Self-Service S0 „Personalstamm aus DokuBit“ — Bauvorgabe (Archiv)

> **Stand:** 17.10.2026 · **Zweig:** `feat/selfservice-s0-personalstamm`, abgezweigt von `main`
> `ac3535a` (Merge von PR #4, Konzeptplan) und committet als `24a8d11` „Self-Service S0:
> Personalstamm aus DokuBit“.
> **Zweck:** Archiv der Bauvorgabe, nach der S0 am 17.10.2026 gebaut wurde. Zusammengeführt sind
> die erste Fassung (Teil A) und der Nachtrag v3 „Die Adresse ist die Person“ (Teil B), beide im
> Wortlaut des Bautags. Geändert sind nur die Gliederung und die Verweise: Pfade auf Arbeitsdateien
> der Sitzung und Verweise auf das Gespräch sind entfernt oder durch Pfade im Repository ersetzt.
> So bleibt nachvollziehbar, was vorgegeben war und warum der Code an manchen Stellen anders arbeitet.
> **Nicht mehr maßgeblich.** Der gültige Stand steht im Plan
> [`selfservice-portal-plan.html`](../module/selfservice/selfservice-portal-plan.html), Abschnitt 5.1
> und Entscheidung E-S10, und in der Anleitung
> [`s0-personalstamm-n8n.md`](../module/selfservice/s0-personalstamm-n8n.md). Weicht dieses Archiv
> davon ab, gelten Plan und Anleitung. Die Regeln im Code fasst der Kopfkommentar von
> `src/lib/personalstamm/abgleich.ts` zusammen.
> **Prüfprotokoll:** [`codereview-s0-personalstamm-2026-10.md`](codereview-s0-personalstamm-2026-10.md),
> mit den Befunden je Runde und dem Urheber jeder Entscheidung.

---

## 0 · So ist dieses Archiv zu lesen

Stellen, die durch spätere Entscheidungen nicht mehr oder nicht mehr allein gelten, sind im Text
markiert:

> **Ersetzt** — die Stelle gilt nicht mehr. Was stattdessen gilt, steht in der Markierung.

> **Ergänzt** — die Stelle gilt weiter, aber mit Zusätzen oder Einschränkungen.

### 0.1 Reihenfolge am 17.10.2026

1. Der Auftraggeber hat die DokuBit-Abfragen über n8n ausgeführt und nur aggregierte Ergebnisse
   weitergegeben. Sie stehen in Teil A, Abschnitt A.1.
2. Teil A, die erste Fassung der Bauvorgabe, entstand auf dieser Grundlage. S0 wurde danach mit
   parallelen Agenten gebaut.
3. In der ersten Code-Review-Runde kamen die Festlegungen D1 bis D4 hinzu (Abschnitt 0.4).
4. Die zweite Gegenprüfung des Codes (im Prüfprotokoll Runde 2) zeigte: Die Regel, eine neue
   Adresse oder einen neuen Namen in den bestehenden Datensatz zu übernehmen (E4 mit D2), übernimmt
   in Einzelfällen die Identität eines anderen Menschen. Darauf hat der Auftraggeber „Die Adresse ist
   die Person“ entschieden. Das ist Teil B, der E4 und D2 ersetzt.
5. Nach den weiteren Gegenprüfungen hat der Auftraggeber die Zweifelsregeln R1, R2, F und P2
   ergänzt. Claude hat dazu die Beginn-Sicherungen festgelegt (Abschnitt 0.3).
6. Danach folgte der Commit `24a8d11`. Insgesamt liefen drei Review-Runden und vier adversariale
   Gegenprüfrunden (so die Zählung im Commit; das Prüfprotokoll zählt sechs Runden nach
   Gegenstand).

### 0.2 Was später ersetzt oder ergänzt wurde

| Stelle | Art | Ersetzt oder ergänzt durch | Gültig beschrieben in |
|---|---|---|---|
| A · E4 Ablauf je Zeile | ersetzt | Teil B, V1–V5 | Plan 5.1; Anleitung §1, §4 |
| D2 Übernahme im Konsens (Code-Review) | ersetzt | Teil B | Plan E-S10 |
| A · E2 Suche mit `mode: "insensitive"` | ersetzt | B · V1.4, Verzeichnis im Speicher | Kopf von `abgleich.ts` |
| A · E3, E5 Aktiv-Status und Stilllegung | ergänzt | B · V4; Schutz nur bei eigener Adresse und eigenem Namen | Anleitung §1 |
| A · E6 Adressen im Eintrag `EMAIL_GEAENDERT` | ersetzt | B · V6: die Aktion entfällt; kein Eintrag enthält Adressen | Anleitung §1 |
| A · E7 Webhook | ergänzt | 413 über 1 MiB; 500 auch bei gleichem `CRON_SECRET`; Aufrufe nacheinander | Anleitung §4 |
| A · E8 Liste aus `GET /api/employees` | ersetzt | eigene Leseroute `GET /api/personalstamm/personen` | Abschnitt 0.3 |
| A · E9 Konstanten „nur importieren“ | ergänzt | B · V6, D4, R2 | `src/lib/constants.ts` |
| A · E12 HTTP-Option „Batching“ | ersetzt | Schleife „Loop Over Items“ | Anleitung §3.2 |
| A · E12 Checkliste Nr. 1 | ersetzt | Bestandsabfragen 1–4 | Anleitung §6, §7 |
| A · 3 Zod-Schema | ergänzt | Steuerzeichen und einzelne UTF-16-Surrogate sind Formatfehler; ungültige Adresse nach B · V2.b | Anleitung §4 |
| A · 5 Tests | ergänzt | B · V7 und weitere Tests für R1, R2, F, P2 | Testdateien in `src/__tests__` |
| B · V2.b–e „nur auffrischen“ | ergänzt | P2: ein Zweifel verschafft nie Zugang | Plan E-S10; Anleitung §4 |
| B · V2.e und V3 Umbenennen | ergänzt | R1, R2, F und die Beginn-Sicherungen | Plan 5.1, E-S10; Anleitung §1, §4 |
| B · V2.f `lastSyncAt` | ergänzt | P2 | Anleitung §4 |
| B · V4 Schutz vor Stilllegung | ergänzt | nur bei eigener Adresse und eigenem Namen | Anleitung §1 |

### 0.3 Entscheidungen nach der ersten Fassung

**Vom Auftraggeber am 17.10.2026 entschieden:**

- **Die Adresse ist die Person** (Teil B). Hat ein Vertrag eine neue Adresse, wandert er zur Person
  mit dieser Adresse. Eine Identität wird nie umgeschrieben. Nach einer Heirat mit neuer Adresse
  gibt es einen neuen Datensatz; die alten Anliegen werden erst in S3 verknüpft.
- **R1:** Umbenannt wird nur, wenn Vor- oder Nachname bleibt. Ein ganz anderer Name ist ein anderer
  Mensch.
- **R2:** Hat die Person keinen laufenden Vertrag, benennt auch ein laufender Anschlussvertrag sie
  um. Bedingungen: Ihr jüngster Vertrag endete höchstens 30 Tage vor heute, und der Vorname bleibt
  gleich.
- **F:** R2 greift nur mit Nachweis. Im selben Stapel muss unter derselben Adresse die Zeile eines
  alten Vertrags der Person kommen, die ihn in diesen 30 Tagen enden lässt. Diese Zeile trägt dann
  den neuen Namen.
- **P2:** Ein Zweifel verschafft nie Zugang. Ein Vertragsende kommt immer an.
- **Löschfrist** der Protokolleinträge des Abgleichs: 1 Jahr, mit dem DSB zu bestätigen.
- **Die Verknüpfung mit dem Onboarding** ist aus S0 herausgenommen.
- **Bestand:** Im Portal gibt es schon Beschäftigtendatensätze, deren Herkunft unbekannt ist. Sie
  werden vor dem ersten Produktivlauf geprüft (Anleitung §6). Für den Bau ist das nicht kritisch.
- **Bestätigt** und schon in A.1 enthalten: `VERTRAGSENDE` ist der letzte Arbeitstag; eine
  Verlängerung oder Entfristung ist eine neue Zeile. Der Schlüssel ist Mandant + Abrechnungskreis +
  MANR. Die Person wird über die dienstliche Adresse erkannt; der Auftraggeber hat selbst drei
  Anstellungen. Rund 340 aktive Beschäftigte passt (343 laut DokuBit).

**Von Claude nach diesen Grundsätzen entschieden.** Diese Punkte hat der Auftraggeber nicht einzeln
entschieden. Sie stehen so im Code und in der Anleitung und lassen sich ändern, wenn er anders
entscheidet.

- **D1:** Ein bekannter Vertrag hängt an einer Person mit der Quelle `MANUELL` oder einer fremden
  Quelle, etwa `LOGA`. Dann bleibt die Person unberührt: Adresse, Name, Aktiv-Status und
  `lastSyncAt`. Die Zeile wird gemeldet, mit `MANUELLER_DATENSATZ` oder `FREMDE_QUELLE`. Der Vertrag
  bleibt, wo er ist; aufgefrischt wird er nur nach P2.
- **Leserouten nur für HR:** „Zu prüfen“ (`GET /api/personalstamm/pruefen`) und „Personen“
  (`GET /api/personalstamm/personen`) sind nur für `SUPER_ADMIN`, `HR_LEITUNG` und
  `HR_SACHBEARBEITER` freigegeben, ohne `SERVICE` (`authHandler`).
- **Eigener Leseendpunkt statt `GET /api/employees`:** Er liefert nur die angezeigten Felder, also
  keine private Adresse, kein Geburtsdatum, kein Telefon und keine LOGA-Nummer
  (Datenminimierung). `GET /api/employees` bleibt unverändert.
- **Beginn-Sicherungen:** Umbenannt wird nur, wenn jede Konsens-Zeile den gespeicherten
  Vertragsbeginn nennt (`imKonsens`). Dasselbe gilt für den Nachweis nach F. Nennt eine
  zweifelhafte Zeile einen anderen Beginn, übernimmt der Abgleich weder Stunden noch eine andere
  Organisation (`vertragsAenderung`). Der Schlüssel ist dann vermutlich neu vergeben, und die Zeile
  beschreibt den Vertrag eines anderen Menschen.
- **Schutz vor Stilllegung** nur, wenn die zweifelhafte laufende Zeile die Adresse **und** den Namen
  der Person trägt. Die Zeile eines anderen Namens mit derselben Adresse schützt nicht, etwa die
  eines Nachfolgers oder eines geteilten Postfachs.

### 0.4 Festlegungen der ersten Code-Review-Runde

- **D1:** siehe Abschnitt 0.3, in der Fassung nach Teil B (ohne `lastSyncAt`).
- **D2** (ersetzt durch Teil B): Adresse oder Name sollten in den bestehenden Datensatz übernommen
  werden, wenn jeder vor dem Lauf laufende verwaltete Vertrag der Person sie im Stapel nennt. Dazu
  gehörten die Codes `EMAIL_ABWEICHEND`, `NAME_ABWEICHEND` und `EMAIL_KONFLIKT`.
- **D3:** Den Leerzustand „Noch keine Personen“ zeigt die Ansicht nur, wenn es gar keine Person
  gibt (`bestandLeer` aus der Leseroute). Sonst steht dort „Keine Treffer für diese Suche oder
  diesen Filter.“
- **D4:** `IMPORT_QUELLE_MANUELL` und `PERSONALSTAMM_NICHT_GELIEFERT_LISTE` (50) stehen in
  `src/lib/constants.ts`. Technische Grenzen bleiben lokal: die Mindestlänge des Geheimnisses, die
  1 MiB und die Lesegrenze des Protokolls.
- **Adressvergleich:** Prisma setzt `mode: "insensitive"` als `ILIKE` ohne Maskierung um, ein `_`
  in der Adresse trifft dann jedes Zeichen. Das wurde zuerst maskiert. Mit Teil B (V1.4) entfällt
  die Abfrage ganz.

### 0.5 Prüfung beim Commit

- `npm run pruefen` grün: 244 Test-Suites, 7.487 Tests.
- Aus den offenen Fragen der letzten Gegenprüfrunde folgten zwei Änderungen: `imKonsens` prüft
  den Vertragsbeginn, und `vertragsAenderung` übernimmt im Zweifel bei anderem Beginn weder Stunden
  noch Organisation.
- Ende-zu-Ende gegen eine lokale Postgres-Datenbank mit erfundenen Testdaten:
  - Erstlauf: 5 Verträge angelegt.
  - Wiederholung: unverändert.
  - Ende eines von zwei laufenden Verträgen: Die Person bleibt aktiv.
  - Adresswechsel beim einzigen laufenden Vertrag: Der Vertrag wandert zu einer neu angelegten
    Person, die alte wird stillgelegt.
  - Heirat bei gleicher Adresse: umbenannt.
  - Neu vergebener Schlüssel mit anderem Beginn: Zweifelsfall.
- Die Ansicht „Personen“ wurde im Browser angesehen, am Desktop und bei 375 px Breite.

Die Arbeitsunterlagen der Reviews und Gegenprüfungen sind nicht im Repository archiviert. Die
Befunde je Runde stehen im Prüfprotokoll `codereview-s0-personalstamm-2026-10.md`.

### 0.6 Offen, soweit diese Vorgabe es berührt

- **`EVTLLDA`** (A.1): Die Personalabteilung fragt nach der Bedeutung. Die Beschriftung des
  Platzhalters „Evtl. letzter Arbeitstag“ (`src/lib/placeholder-catalog.ts`) ist vermutlich
  falsch.
- **`BESCHAEFTIGUNGSGRUPPE`** ist in DokuBit leer (A.1). S4 braucht für die Gruppe eine andere
  Quelle.
- **Vertragsende-Webhook** (Vorbild in E7): Er ordnet allein über die MANR zu, und die MANR ist
  kein Personenschlüssel (A.1). Dafür ist eine eigene Aufgabe vorgeschlagen.
- **Vor S1** müssen die PATCH-Routen der Beschäftigtendaten abgesichert werden. Außerdem liefert
  `GET /api/employees` volle Datensätze.
- **n8n-Importvorlage** (E12): Sie ist nicht gegen eine echte n8n-Instanz getestet.
- **Schutz vor Stilllegung** (B · V4): Entschieden am 17.10.2026 nach den Grundsätzen: Eine
  zweifelhafte laufende Zeile mit Adresse und Namen der Person hält sie auch dann aktiv, wenn ihr
  Vertrag im Portal schon beendet ist; sie hält nur einen bestehenden Zugang aufrecht (Anleitung §4).
- **Restrisiko** (B · V2.e): Ändert ein Fehler in DokuBit die Zeile des alten Vertrags auf eine
  Nachfolgerin mit gleichem Vornamen, ist das von einer Heirat nicht zu unterscheiden
  (Anleitung §4).
- **Vor dem ersten Produktivlauf:** die Checkliste in Anleitung §7, darunter E-S25 und E-S27.

---

## Teil A · Bauvorgabe S0 „Personalstamm aus DokuBit“ (erste Fassung, verbindlich zum Bauzeitpunkt)

Repository `HR_Portal_CREDO`, Zweig `feat/selfservice-s0-personalstamm` (von main `ac3535a`).

Als Hintergrund zum Bestandscode lagen Karten mit Zeilennummern vor, je eine zu Plan, Webhook,
Datenmodell und Oberfläche. Sie waren Arbeitsunterlagen und sind nicht archiviert.

Diese Bauvorgabe **ersetzt** den Plan dort, wo sie abweicht. Grund: Die echten DokuBit-Daten wurden
am 17.10.2026 abgefragt, und der Auftraggeber hat die Ergebnisse bestätigt.

> **Ergänzt:** Der Plan ist im Commit `24a8d11` an den gebauten Stand angeglichen. Heute gilt
> deshalb umgekehrt: Plan und Anleitung sind maßgeblich, nicht dieses Archiv.

### A.1 Was die DokuBit-Daten ergeben haben (Fakten, nicht ändern)

**Quelle:** `[DokuBit].[dbo].[dokubitmitarbeiter]` (MS SQL). Die Tabelle hat 1.257 Zeilen. **Eine
Zeile ist ein Vertrag**, beendete Verträge stehen ebenfalls darin.

**Schlüssel eines Vertrags: `MANDANTENNUMMER` + `ABRECHNUNGSKREIS` + `MANR`.**
- Die Kombination ist je Zeile eindeutig und hat nie mehrere Namen.
- **MANR allein ist kein Personenschlüssel:**
  - 222 MANR stehen für verschiedene Menschen.
  - 221 Menschen haben mehrere MANR.
  - Ein Anschlussvertrag ist eine neue Zeile mit eigenem Schlüssel.

**Die Person wird über die dienstliche Adresse `MAEMAIL` erkannt (Microsoft-365-Konto).**
- 343 Personen mit 362 laufenden Verträgen; der Auftraggeber hat die Zahl bestätigt.
- Alle laufenden Verträge haben eine Adresse.
- 18 Personen haben mehrere laufende Verträge. Der Auftraggeber selbst hat 3.
- Sonderfälle unter den laufenden Verträgen:
  - 1 Adresse steht bei 2 verschiedenen Namen.
  - 5 Namen haben jeweils 2 Adressen.

**`VERTRAGSENDE` ist der letzte Arbeitstag** (Aussage des Auftraggebers).
- Ein Vertrag **läuft**, wenn `VERTRAGSENDE` leer ist oder auf heute oder später (Europe/Berlin) fällt.
- Verlängerung oder Entfristung bedeutet: neue Zeile.

**Leer in allen Zeilen:** `MASTATUS`, `BESCHAEFTIGUNGSGRUPPE`, `MAPOSITION`, `VERTRAGSART`, `MABENUTZER`, `ARCHIVDATUM`.
- Damit fallen weg: die Statuswertliste, die Gruppenwertliste und die Spalte `Employment.beschaeftigungsgruppe`.
- Die Grundcodes `STATUS_UNBEKANNT` und `GRUPPE_UNBEKANNT` entfallen ebenfalls.

**`EVTLLDA` ist kein letzter Arbeitstag.** 219 von 265 Werten liegen vor dem Vertragsbeginn. Die
Bedeutung klärt die Personalabteilung noch. **S0 nutzt und übernimmt EVTLLDA nicht.**

**Typen**
- `MANDANTENNUMMER` ist int.
- `MANR` und `ABRECHNUNGSKREIS` sind varchar.
- `TEILZEITSTUNDEN` ist decimal.
- Datumsfelder sind datetime.

**Mandantennummern**
- Alle 16 Mandantennummern der laufenden Verträge stimmen mit dem Portal überein: 712, 719, 721,
  728, 734, 735, 736, 737, 742, 743, 747, 764, 766, 767, 768, 769.
- 12 Mandanten haben 2 Abrechnungskreise.

**Domains der Adressen:** fes-minden.de, cfh-minden.de, mvs-minden.de, fes-credo.de. 5 Personen
haben eine andere Domain, vermutlich eine private Adresse.

### A.2 Entscheidungen (verbindlich)

#### E1 · Vertrag

- Jeder DokuBit-Vertrag wird genau eine `Employment`-Zeile.
- Schlüssel: `mandantNumber` (normalisiert, ohne führende Nullen), `abrechnungskreis` (getrimmt) und `personalNumber` (MANR, getrimmt).
- Die neuen Spalten sind `Employment.abrechnungskreis` und `Employment.personalNumber`, abgesichert durch `@@unique([mandantNumber, abrechnungskreis, personalNumber])`. Das ist schon im Schema eingetragen.
- `Employment.isActive` ist genau dann true, wenn der Vertrag läuft.
- Weitere Felder:
  - `startDate` = `VERTRAGSBEGINN`
  - `endDate` = `VERTRAGSENDE`, null bedeutet unbefristet
  - `workingHoursWeek` = `TEILZEITSTUNDEN`
- Gespeichert wird das Datum über `kalendertagAlsDatum` aus `src/lib/kalendertag.ts`; gelesen über `ablaufKalendertag`.
- **`vertragsende` ist autoritativ:** Ein `null` in der Zeile ist ein Wert (unbefristet) und überschreibt ein vorhandenes Ende. Die Regel „leere Felder löschen nichts“ gilt hier ausdrücklich nicht. Sie gilt nur für `teilzeitstunden`, Vor- und Nachname.
- Der Schlüssel `vertragsende` muss im Eintrag vorhanden sein, Wert `null` ist erlaubt. Fehlt er, ist das ein `FORMATFEHLER`.

> **Ergänzt** (P2): In einer Zweifelsfall- oder Fehlerzeile ist `vertragsende` nur noch so weit
> autoritativ, wie es keinen Zugang verschafft. Ein Ende oder ein früheres Ende kommt an. Ein
> späteres oder leeres Ende übernimmt der Abgleich dort nicht (Teil B, Markierung bei V2).

#### E2 · Person (`Employee`)

- Erkannt wird sie über die dienstliche Adresse, verglichen nach `trim().toLowerCase()`, in Prisma mit `mode: "insensitive"`.
- Neue Personen bekommen:
  - `importSource = "DOKUBIT"`
  - `importedAt` = jetzt
  - `lastSyncAt` = jetzt
  - `email` kleingeschrieben und getrimmt
- **`Employee.personalNumber` wird nie geschrieben und nie gelesen.** Dort steht die LOGA-Nummer, global eindeutig.

> **Ersetzt** (B · V1.4): keine Abfragen mit `mode: "insensitive"` mehr. Der Vorlauf liest alle
> Personen mit Adresse einmal und vergleicht im Speicher, getrimmt und kleingeschrieben
> (Abschnitt 0.4, „Adressvergleich“).

#### E3 · Wann ist die Person aktiv?

- Eine Person mit `importSource = "DOKUBIT"` ist aktiv, solange mindestens eine ihrer **vom Abgleich verwalteten** Anstellungen läuft. Verwaltet heißt: `abrechnungskreis` und `personalNumber` sind gesetzt.
- Bestandsanstellungen ohne Schlüssel zählen dafür **nicht**; sie bleiben unberührt. Sonst bliebe ein Ausgeschiedener über eine alte Bestandsanstellung ewig aktiv.
- Stilllegen und Reaktivieren schreiben je einen AuditLog-Eintrag, siehe E9.

> **Ergänzt** (B · V4): Gerechnet wird einmal am Ende des Stapels. „Läuft“ heißt `isActive` und
> (`endDate` null oder ≥ heute). Es gilt der Schutz vor Stilllegung, nur bei eigener Adresse und
> eigenem Namen (Abschnitt 0.3).

#### E4 · Ablauf je Zeile (sequenziell, je Zeile eine interaktive `$transaction`)

> **Ersetzt als Ganzes** durch Teil B (V1–V5), Entscheidung „Die Adresse ist die Person“. Der Text
> bleibt nur zur Nachvollziehbarkeit stehen. Insbesondere gilt nicht mehr: Adresswechsel in den
> bestehenden Datensatz (Schritt 5), die Codes `EMAIL_ABWEICHEND`, `EMAIL_KONFLIKT` und
> `NAME_ABWEICHEND` sowie die Aktion `PERSONALSTAMM_EMAIL_GEAENDERT`. Gleichzeitige Aufrufe arbeitet
> das Portal heute nacheinander ab (Anleitung §3.2, Kasten „Warum die Schleife“).

1. Rohzeile prüfen (Zod, Abschnitt A.3). Bei einem Fehler: Status `fehler`, Code `FORMATFEHLER`. Den Schlüssel, soweit lesbar, vorher aus der Rohzeile holen.
2. Mandant über die normalisierte Nummer suchen. Unbekannt: `fehler`, Code `MANDANT_UNBEKANNT`.
3. `heute = heuteInBerlin(jetzt)` und `laeuft = vertragsende === null || vertragsende >= heute` (Vergleich der Zeichenketten `YYYY-MM-DD`).
4. Vertrag über den Schlüssel suchen (`findUnique` über den zusammengesetzten Schlüssel).
5. **Vertrag bekannt.** Seine Person P ist gesetzt.
   - **Adresse weicht ab** (normalisiert verglichen). Ist eine Adresse in der Zeile:
     - Hat P genau 1 verwalteten Vertrag (diesen), ist es ein Adresswechsel:
       - Hat eine andere Person diese Adresse schon: `zweifelsfall`, Code `EMAIL_KONFLIKT`, keine Änderung an der Adresse.
       - Sonst `P.email` setzen und `PERSONALSTAMM_EMAIL_GEAENDERT` protokollieren, mit `{ employeeId, alt, neu }`.
     - Hat P mehrere verwaltete Verträge: `zweifelsfall`, Code `EMAIL_ABWEICHEND`, keine Änderung an der Adresse.
     - In beiden Zweifelsfällen wird der Vertrag selbst trotzdem aufgefrischt (Datum, Stunden, Aktiv).
   - **Name weicht ab** (nicht leer, getrimmt, ohne Rücksicht auf Groß- und Kleinschreibung):
     - Bei genau 1 verwaltetem Vertrag: Namen setzen und `PERSONALSTAMM_NAME_GEAENDERT` protokollieren, mit `{ employeeId }`, ohne Namen.
     - Sonst `zweifelsfall`, Code `NAME_ABWEICHEND`.
   - **Vertrag auffrischen:** `isActive = laeuft`, `startDate`, `endDate` (autoritativ, E1), `workingHoursWeek` (nur wenn geliefert), `organizationId` und `mandantNumber`, falls verschieden.
6. **Vertrag unbekannt:**
   - Läuft er nicht: `uebersprungen`. Ein beendeter Vertrag einer unbekannten Person oder ein unbekannter beendeter Vertrag wird nicht angelegt.
   - Läuft er, ohne Adresse in der Zeile: `zweifelsfall`, Code `MAIL_FEHLT`. Es wird nichts angelegt; die Namensstufe führt nie zusammen und legt hier auch nicht an.
   - Läuft er, mit Adresse: Personen mit dieser Adresse suchen (`findMany`, `take: 2`).
     - **0 Treffer:** Person anlegen (E2), Vertrag anlegen. Status `angelegt`.
     - **2 oder mehr Treffer:** `zweifelsfall`, Code `EMAIL_MEHRDEUTIG`.
     - **1 Treffer P:**
       - `P.importSource === "MANUELL"`: `zweifelsfall`, Code `MANUELLER_DATENSATZ`, nichts anfassen.
       - `P.importSource` ist ein anderer Wert als null oder `"DOKUBIT"`, etwa `"LOGA"`: `zweifelsfall`, Code `FREMDE_QUELLE`, nichts anfassen.
       - Name von P weicht vom Namen der Zeile ab (Vergleich wie oben): `zweifelsfall`, Code `EMAIL_ANDERER_NAME`, nichts anfassen. Grund: eine Adresse mit zwei Namen kann ein geteiltes Postfach sein.
       - `P.importSource === null` (Altbestand): übernehmen. `importSource = "DOKUBIT"`, `importedAt` setzen, falls leer; `PERSONALSTAMM_PERSON_UEBERNOMMEN` mit `{ employeeId }` protokollieren. Danach wie beim Wert „DOKUBIT“.
       - `"DOKUBIT"`: Vertrag an P anlegen. Status `angelegt`.
7. Bei jeder Zeile, die eine Person erreicht (Vertrag bekannt, angelegt oder an P gehängt): `P.lastSyncAt = jetzt`. Danach `P.isActive` nach E3 neu berechnen; ändert er sich, ein Eintrag STILLGELEGT oder REAKTIVIERT.
8. **Status der Zeile**
   - `angelegt`: neuer Vertrag
   - `aktualisiert`: geänderte Felder an Vertrag oder Person, `lastSyncAt` ausgenommen
   - `unveraendert`: sonst
   - `zweifelsfall` hat Vorrang vor `aktualisiert` und `unveraendert`. Gibt es einen Zweifelsfall und ist trotzdem etwas aufgefrischt worden, steht der Status auf `zweifelsfall`, `aktualisiert` wird aber gezählt, siehe die Zählung in Abschnitt A.4.
9. **Ausnahme in einer Zeile:** `fehler` mit Code `INTERNER_FEHLER`. Ins Log nur Index und Prisma-Fehlercode (`err.code`), **nie** das Fehlerobjekt mit Daten. P2002 bei parallelen Aufrufen landet ebenfalls hier; der nächste Lauf holt die Zeile nach.

#### E5 · Wiederholbarkeit

- Derselbe Stapel zweimal ändert nichts außer `lastSyncAt`; die Zeilen stehen dann auf `unveraendert`.
- Ein leerer, halber oder fehlerhafter Stapel legt **nie** jemanden still. Stillgelegt wird ausschließlich über eine Zeile, deren Vertrag nicht mehr läuft, und nur, wenn kein anderer verwalteter Vertrag der Person läuft.
- Reihenfolge innerhalb eines Stapels: sequenziell, kein `Promise.all`.

> **Ergänzt** (Teil B): Eine Person verliert einen Vertrag auch, wenn er zu einer anderen Adresse
> wandert, und wird dann stillgelegt, wenn ihr keiner bleibt. Scheitert der laufende
> Anschlussvertrag an einem Fehler, während der alte als beendet ankommt, wird die Person
> stillgelegt; der Lauf nach der Behebung reaktiviert sie. Einzige Ausnahme von der Wiederholbarkeit:
> Zieht im selben Lauf ein Vertrag der Person zu einer neuen Adresse um, folgt der Name am alten
> Datensatz erst im nächsten Lauf (Anleitung §1).

#### E6 · Protokoll des Aufrufs

- Jeder Aufruf, auch ein vollständig fehlerhafter, schreibt **einen** AuditLog-Eintrag:
  - `processType: "PERSONALSTAMM"`, `action: "PERSONALSTAMM_LAUF"`, `userId: null`
  - `details: { zahlen: {angelegt, aktualisiert, unveraendert, uebersprungen, stillgelegt, reaktiviert, zweifelsfall, fehler, zeilen}, meldungen: [{ schluessel: "742|AK|MANR", code }] }`
- Fehlt der Schlüssel (Formatfehler), steht dort `"zeile:<index>"`.
- **Keine Namen, keine Adressen** in `meldungen`. Adressen stehen nur im Eintrag EMAIL_GEAENDERT, weil der Plan das verlangt (C4).

> **Ersetzt** (B · V6): Die Aktion `EMAIL_GEAENDERT` entfällt. Kein Eintrag des Abgleichs enthält
> Namen oder Adressen, auch `VERTRAG_UMGEZOGEN` nicht (`{ schluessel, vonEmployeeId,
> nachEmployeeId }`). Das Schreiben des LAUF-Eintrags hat einen zweiten Versuch (B · V5).

#### E7 · Webhook `POST /api/webhooks/personalstamm`, Datei `src/app/api/webhooks/personalstamm/route.ts`

- **Anmeldung:** `Authorization: Bearer ${PERSONALSTAMM_SECRET}`.
  - Fehlt das Geheimnis oder hat es weniger als 24 Zeichen: 500 `{ error: "Konfigurationsfehler" }` und `console.error("[personalstamm] PERSONALSTAMM_SECRET fehlt oder ist zu kurz")`.
  - Vergleich mit `gleichZeitkonstant`. Dafür wird die Funktion in `src/lib/laeufe/cron-anmeldung.ts` exportiert, ohne sonstige Änderung.
  - Falscher oder fehlender Header: 401 `{ error: "Nicht autorisiert" }`. Das gilt auch für `Bearer ${CRON_SECRET}`.
- **Körper:** ein Objekt oder ein Array.
  - Unlesbares JSON oder etwas anderes als Objekt oder Array: 400 „Ungültiger Request-Body“.
  - Leeres Array: 400 „Leerer Stapel“.
  - Mehr als `PERSONALSTAMM_MAX_STAPEL`: 400 „Maximal 200 Einträge pro Aufruf“.
  - Größenbegrenzung des Körpers, falls einfach möglich: 1 MiB über `leseBodyBegrenzt` aus `src/lib/file-upload.ts`. Signatur vorher prüfen; ist der Einbau nicht einfach, weglassen und das im Bericht sagen.
- **Antwort:** immer 200 mit `{ success: fehler === 0, summary: zahlen, results: [{ index, status, schluessel?, code? }] }`. Das ist das Format des Vertragsende-Webhooks, so vom Plan gewollt. Keine Namen und keine Adressen in der Antwort.
- **Äußeres try/catch:** 500 `{ error: "Interner Serverfehler" }`, ins Log nur Name und Code des Fehlers.
- **Logik:** liegt in `src/lib/personalstamm/abgleich.ts`. Die Route ruft `personalstammAbgleichen(eintraege: unknown[], opts?: { jetzt?: Date })` auf, Rückgabe `Promise<PersonalstammStapelErgebnis>`.

> **Ergänzt:** Die Größenbegrenzung ist eingebaut; über 1 MiB antwortet die Route mit 413. Ist
> `PERSONALSTAMM_SECRET` gleich `CRON_SECRET`, antwortet sie ebenfalls mit 500
> „Konfigurationsfehler“, ohne den Wert zu loggen. Gleichzeitige Aufrufe laufen im Portal
> nacheinander. In den Ergebnissen steht bei `FORMATFEHLER` zusätzlich `feld`.

#### E8 · Leseansicht „Personen“ (Bestands-Look von main, kein ux-umbau)

> **Ersetzt** (Claude, Datenminimierung, Abschnitt 0.3): Die Liste kommt nicht aus
> `GET /api/employees`, sondern aus der eigenen Leseroute `GET /api/personalstamm/personen`
> (`src/app/api/personalstamm/personen/route.ts`). Sie hat nur die drei HR-Rollen, ohne `SERVICE`,
> und liefert nur die angezeigten Felder sowie `bestandLeer`. Die Suche trifft Name, dienstliche
> Adresse und die MANR der Verträge, nie die LOGA-Nummer.
>
> **Ergänzt** (Code-Review): Den Leerzustand regelt D3. Je Anstellung zeigt die Ansicht den
> Vertragsschlüssel (Mandant · AK · MANR), laufende zuerst; eine Bestandsanstellung an einer
> DokuBit-Person steht gedämpft mit dem Hinweis, dass sie nicht für den Status zählt. Dazu kommen
> „Erneut laden“ im Fehlerfall und Hilfen für die Barrierefreiheit. Maßgeblich für die Einzelheiten
> ist der Code (`src/app/(portal)/personen/`, `src/components/personen/zu-pruefen.tsx`).

- **Seite** `src/app/(portal)/personen/page.tsx`: Server-Komponente nach dem Vorbild `audit-log/page.tsx`. Rollen `SUPER_ADMIN`, `HR_LEITUNG`, `HR_SACHBEARBEITER`, sonst `redirect("/dashboard")`. Dazu `personen-content.tsx` (`"use client"`).
- **Inhalt:**
  - Kopf „Personen“ mit einem Untertitel, der erklärt, dass die Daten aus DokuBit kommen und nur dort geändert werden.
  - Die Hinweiszeile (siehe unten), der Block „Zu prüfen“ und die Liste aus `GET /api/employees`:
    - Suche und Filter aktiv/inaktiv/alle; Blättern über die vorhandenen Parameter.
    - Spalten: Name; dienstliche Adresse; Anstellungen als Liste „Mandantenname · läuft / läuft bis TT.MM.JJJJ / beendet am TT.MM.JJJJ“; Status-Pille aktiv/inaktiv; Quelle „DokuBit“, „Bestand“ (null) oder „Von Hand“ (MANUELL), anderes roh; „zuletzt geliefert“ (`formatZeitpunktDE`, sonst „—“).
- **Keine** Bearbeitung und **keine** Zuordnung von Hand.
- **Lade-, Fehler- und Leerzustände:**
  - Leerzustand mit lucide-Symbol und Hinweis, etwa „Noch keine Personen — der erste Abgleich aus DokuBit legt sie an.“
  - Laden als Text.
  - Fehler als rotes Banner.
- **Neue Leseroute** `GET /api/personalstamm/pruefen` (`src/app/api/personalstamm/pruefen/route.ts`), mit `authHandler`, also nur die drei HR-Rollen, ohne SERVICE. Rechenlogik in `src/lib/personalstamm/pruefen.ts`.
- **Antwort** `{ data: { nichtGeliefert, meldungen, abgewieseneAnmeldungen, letzterLauf, hinweis } }`:
  - `nichtGeliefert`: aktive Personen mit `importSource "DOKUBIT"` und `lastSyncAt` älter als `WAECHTER_STUNDEN` (26 h, aus `src/lib/zeitplaner/katalog.ts`).
    - Form `{ anzahl, personen: [{ id, name, lastSyncAt }] }`, höchstens 50.
    - Namen sind hier erlaubt, weil die Ansicht nur für HR ist.
  - `meldungen`: aus den `PERSONALSTAMM_LAUF`-Einträgen der letzten `PERSONALSTAMM_MELDUNGEN_STUNDEN`.
    - Je Kombination aus `schluessel` und `code` einmal, mit dem letzten Zeitpunkt und der Anzahl.
    - Code mit Beschriftung aus `PERSONALSTAMM_GRUNDCODE_LABELS`.
    - Eine Meldung, deren Vertrag im späteren Lauf ohne diesen Code durchlief, entfällt. Prüfung über die `meldungen` des jüngsten Laufs, der den Schlüssel enthielt; geht das nicht sauber, reicht „im jüngsten Lauf nicht mehr gemeldet“. Ein Vertrag, der im jüngsten Lauf gar nicht vorkam, bleibt stehen.
  - `abgewieseneAnmeldungen`: AuditLog `action = ANMELDUNG_ABGEWIESEN_ACTION`, letzte 14 Tage, je `details.email` zusammengefasst mit Anzahl und letztem Zeitpunkt. Heute leer, ab S1/S2 befüllt.
  - `letzterLauf`: `createdAt` des jüngsten `PERSONALSTAMM_LAUF` oder null.
  - `hinweis`: `"rot"`, wenn `nichtGeliefert.anzahl > 0`; sonst `"gelb"`, wenn Meldungen oder abgewiesene Anmeldungen vorhanden sind; sonst null.
- **Hinweiszeile:**
  - rot: `rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot`
  - gelb: `rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-4 py-2 text-sm`
  - Text rot: „X aktive Personen wurden seit mehr als 26 Stunden nicht aus DokuBit geliefert. Läuft der Abgleich?“
  - Text gelb: „X Einträge zu prüfen.“
  - Zusätzlich neutral „Letzter Abgleich: …“ oder „Noch kein Abgleich gelaufen.“
- **Navigation:** in `src/components/portal-header.tsx` ein Direktlink „Personen“ (`/personen`) für die drei HR-Rollen, nach BEM; der Kopfkommentar wird ergänzt. In `src/middleware.ts` kommt `/personen` in `isPortalRoute`, **nicht** in `adminRoutes`.
- **Audit-Log-Beschriftungen:** `PERSONALSTAMM_AUDIT_LABELS` in `ACTION_LABELS` (`src/app/(portal)/audit-log/audit-log-content.tsx`) einspreizen, wie die anderen `*_AUDIT_LABELS`.
- **UI-Sperrklinke** (`src/__tests__/lib/ui-sperrklinke.test.ts`) muss grün bleiben:
  - kein `<svg`, stattdessen lucide-react
  - kein `toLocale*String`, stattdessen `formatDatumDE` und `formatZeitpunktDE` aus `src/lib/format.ts`
  - keine Hex- oder Tailwind-Palettenfarben, nur Theme-Tokens
  - kein `fixed inset-0`, kein `confirm` und kein `alert`
  - Buttons und Inputs nach CLAUDE.md: `rounded-lg`

#### E9 · AuditLog-Aktionen und -Konstanten

Sie stehen schon in `src/lib/constants.ts` (Abschnitt „Personalstamm aus DokuBit“) und werden dort
nur **importiert**, nicht geändert:
- `PERSONALSTAMM_PROCESS_TYPE`, `PERSONALSTAMM_QUELLE`, `PERSONALSTAMM_MAX_STAPEL`, `PERSONALSTAMM_AUFBEWAHRUNG_TAGE` (365)
- `PERSONALSTAMM_MELDUNGEN_STUNDEN`, `PERSONALSTAMM_ABGEWIESEN_TAGE`
- `PERSONALSTAMM_ACTIONS` (LAUF, PERSON_UEBERNOMMEN, EMAIL_GEAENDERT, NAME_GEAENDERT, STILLGELEGT, REAKTIVIERT), `ANMELDUNG_ABGEWIESEN_ACTION`
- `PERSONALSTAMM_AUDIT_LABELS`, `PERSONALSTAMM_GRUNDCODES`, `PersonalstammGrundcode`, `PERSONALSTAMM_FEHLERCODES`, `PERSONALSTAMM_GRUNDCODE_LABELS`
- `PERSONALSTAMM_ZEILENSTATUS`, `PersonalstammZeilenstatus`

> **Ergänzt:** Der Abschnitt wurde später doch geändert. Entfallen sind `PERSONALSTAMM_FEHLERCODES`
> (ungenutzt; der Kommentar an `PERSONALSTAMM_GRUNDCODES` nennt die Fehlercodes), die Aktion
> `EMAIL_GEAENDERT` und die Codes `EMAIL_ABWEICHEND`, `EMAIL_KONFLIKT` und `NAME_ABWEICHEND`
> (B · V6). Neu sind `PERSONALSTAMM_ACTIONS.VERTRAG_UMGEZOGEN` (B · V6), `IMPORT_QUELLE_MANUELL` und
> `PERSONALSTAMM_NICHT_GELIEFERT_LISTE` (D4) sowie `PERSONALSTAMM_ANSCHLUSS_TAGE` (30, R2 und F).

#### E10 · Löschfrist

- In `src/lib/laeufe/wartung.ts` werden AuditLog-Einträge mit `processType = "PERSONALSTAMM"` und `createdAt` älter als `PERSONALSTAMM_AUFBEWAHRUNG_TAGE` gelöscht.
- Der Probelauf zählt nur. Ergebnisfeld `personalstammProtokolle`. Der Kopfkommentar wird ergänzt.
- Dazu ein Test.

> **Ergänzt:** Die Frist von 1 Jahr hat der Auftraggeber entschieden; der DSB muss sie noch
> bestätigen. Durchgesetzt wird sie nur, wenn der Lauf „Wartung“ eingeschaltet ist (Anleitung §7).

#### E11 · Umgebung und Doku

- `PERSONALSTAMM_SECRET` in `.env.example` (Platzhalter mit Hinweis `openssl rand -base64 24`), `.env.production.example` neben `CRON_SECRET`, in die Variablentabelle der `README.md` und dort zu den Routen den neuen Webhook.
- Kein FATAL in `entrypoint.sh`.

#### E12 · n8n

- Neue Datei `docs/module/selfservice/s0-personalstamm-n8n.md`. Inhalt:
  - die SQL-Abfrage unten
  - die Einrichtung des Ablaufs:
    - Zeitplan täglich 02:30
    - Knoten „Microsoft SQL“ mit der Abfrage
    - Code-Knoten, der Stapel von höchstens 200 Zeilen bildet und alle Zeilen derselben Adresse im selben Stapel hält
    - HTTP-Request-Knoten mit einem Header-Auth-Credential `Authorization: Bearer …` nur für diesen Ablauf, Stapel **nacheinander**: Option „Batching“ mit 1 Item je Batch und 1 s Abstand
    - Einstellung „Save successful production executions“ aus
  - die Rücknahme: Ablauf ausschalten
  - die Checkliste vor dem ersten Produktivlauf, siehe unten
- Dazu optional eine importierbare Datei `docs/module/selfservice/s0-personalstamm-n8n.json` für n8n 2.x, ohne Credentials, mit Platzhalter-URL `https://HR-PORTAL/api/webhooks/personalstamm`. Nur beilegen, wenn sie schlüssig ist, sonst weglassen.

> **Ersetzt** (Code-Review): Die Option „Batching“ staffelt nur den Start der Aufrufe und wartet
> nicht auf die Antwort. Stattdessen schickt eine Schleife „Loop Over Items“ mit Batch Size 1 den
> nächsten Stapel erst nach der Antwort (Anleitung §3.2).
>
> **Ergänzt:** Der Code-Knoten legt zusätzlich die Zeilen mit demselben Vertragsschlüssel und mit
> demselben Namen in denselben Stapel (Anleitung §3.2). Die JSON-Vorlage liegt bei, ist aber nicht
> gegen eine echte n8n-Instanz getestet.

```sql
SELECT
  CAST(MANDANTENNUMMER AS varchar(10))      AS mandantNummer,
  LTRIM(RTRIM(ABRECHNUNGSKREIS))            AS abrechnungskreis,
  LTRIM(RTRIM(MANR))                        AS personalNr,
  LTRIM(RTRIM(MAVONAME))                    AS vorname,
  LTRIM(RTRIM(MANANAME))                    AS nachname,
  NULLIF(LOWER(LTRIM(RTRIM(MAEMAIL))), '')  AS email,
  TEILZEITSTUNDEN                           AS teilzeitstunden,
  CONVERT(char(10), VERTRAGSBEGINN, 23)     AS vertragsbeginn,
  CONVERT(char(10), VERTRAGSENDE, 23)       AS vertragsende
FROM [DokuBit].[dbo].[dokubitmitarbeiter]
WHERE VERTRAGSENDE IS NULL
   OR CAST(VERTRAGSENDE AS date) >= DATEADD(day, -30, CAST(GETDATE() AS date))
ORDER BY email, mandantNummer, abrechnungskreis, personalNr;
```

**Checkliste vor dem ersten Produktivlauf** (organisatorisch, kein Code):
1. Bestand der Portal-Datenbank prüfen: Herkunft und Dubletten der Adressen. Die Befehle stehen in der Doku.
2. Zum Verzeichnis der Verarbeitungstätigkeiten die drei n8n-Angaben nachtragen: Betreiber und Standort, Aufbewahrung der Ausführungen, feste Spaltenliste.
3. E-S25 und E-S27 klären, beide mit dem DSB.
4. Die Löschfrist von 1 Jahr mit dem DSB bestätigen.
5. Die 5 Adressen mit fremder Domain und die 1 Adresse mit zwei Namen in DokuBit bereinigen.
6. `PERSONALSTAMM_SECRET` setzen; das n8n-Credential nur im Stammablauf anlegen.

> **Ersetzt** (Nr. 1): In der Fassung des Bautags verwies Nr. 1 auf zwei Abfragen aus dem Gespräch.
> Heute stehen die lesenden Bestandsabfragen in der Anleitung, Abschnitt 6 (Abfragen 1–4). Die
> gültige Checkliste steht in Abschnitt 7 der Anleitung.

### A.3 Zod-Schema `src/lib/validations/personalstamm.ts` (zod 3, `import { z } from "zod"`)

Ein Eintrag mit `.strip()`. n8n und MS SQL können Zahlen statt Text liefern; deshalb kontrolliert
umwandeln, nie ganze Zeilen an Typfragen scheitern lassen:
- `mandantNummer`: string oder number → String, trim, führende Nullen entfernen (wie `normalisiereMandantNummer` in `prisma/seed-check.js:977`), muss danach `^\d{1,6}$` erfüllen. Pflicht.
- `abrechnungskreis`: string oder number → String, trim, 1–50 Zeichen. Pflicht.
- `personalNr`: string oder number → String, trim, 1–20 Zeichen. Pflicht.
- `vorname`, `nachname`: string, trim, je 1–100 Zeichen. Pflicht.
- `email`: string oder null oder undefined; trim und lowercase; leer → null.
  - Ist ein Wert da, muss er eine gültige Adresse sein, sonst `FORMATFEHLER`.
  - Die Zeile scheitert dann ganz. Das ist so gewollt: Eine kaputte Adresse wäre ein falscher Personenschlüssel.
- `teilzeitstunden`: number, oder string mit Komma oder Punkt, oder null oder undefined → number oder null; 0–80 Stunden.
- `vertragsbeginn`: string; die ersten 10 Zeichen müssen `istKalendertag` erfüllen. Pflicht.
- `vertragsende`: string (die ersten 10 Zeichen `istKalendertag`) oder `null`. Der **Schlüssel ist Pflicht**, siehe E1.

Export: `personalstammEintragSchema`, `type PersonalstammEintrag` (der Ausgabetyp mit normalisierten
Werten) und eine Hilfe `schluesselAusRohzeile(raw: unknown): string | null`, die `"mandant|ak|manr"`
liefert, wenn die drei Werte lesbar sind.

Fehlermeldung je Zeile: Grundcode `FORMATFEHLER` und der Pfad des ersten Zod-Fehlers
(`issues[0].path.join(".")`), ohne Werte.

> **Ergänzt:** Steuerzeichen (`\u0000`–`\u001F`) in Text-Pflichtfeldern und einzelne
> UTF-16-Surrogate sind `FORMATFEHLER` (B · V1.1, Anleitung §4). `schluesselAusRohzeile` entfernt
> Steuerzeichen. `vertragsSchluessel` steht ebenfalls in dieser Datei; `abgleich.ts` exportiert es
> weiter.
>
> **Ersetzt** („Die Zeile scheitert dann ganz“): Ist nur die Adresse ungültig, wird ein bekannter
> Vertrag trotzdem aufgefrischt, damit ein Vertragsende ankommt; Status `fehler`, Code
> `FORMATFEHLER`, `feld: "email"` (B · V2.b, eingeschränkt durch P2).

### A.4 Typen der Bibliothek `src/lib/personalstamm/abgleich.ts`

```ts
export interface PersonalstammZeilenErgebnis {
  index: number;
  status: PersonalstammZeilenstatus;
  schluessel?: string;          // "742|AK|MANR"
  code?: PersonalstammGrundcode;
  feld?: string;                // nur bei FORMATFEHLER: Pfad, ohne Wert
}
export interface PersonalstammZahlen {
  zeilen: number; angelegt: number; aktualisiert: number; unveraendert: number;
  uebersprungen: number; stillgelegt: number; reaktiviert: number;
  zweifelsfall: number; fehler: number;
}
export interface PersonalstammStapelErgebnis {
  success: boolean;             // fehler === 0
  summary: PersonalstammZahlen;
  results: PersonalstammZeilenErgebnis[];
}
export function personalstammAbgleichen(eintraege: unknown[], opts?: { jetzt?: Date }): Promise<PersonalstammStapelErgebnis>;
export function vertragLaeuft(vertragsende: string | null, heute: string): boolean;   // rein
export function vertragsSchluessel(e: { mandantNummer: string; abrechnungskreis: string; personalNr: string }): string; // rein
```

**Zählung:**
- `aktualisiert` zählt jede Zeile, bei der etwas geändert wurde, auch wenn ihr Status `zweifelsfall` ist.
- `stillgelegt` und `reaktiviert` zählen Personen.
- `zweifelsfall` und `fehler` zählen Zeilen nach ihrem Status.

> **Ergänzt** (B · V2.g, V4): `aktualisiert` zählt auch Zeilen mit Status `fehler`, wenn sich etwas
> geändert hat. Scheitert am Ende des Stapels das Schreiben des Aktiv-Status einer Person, zählt
> `fehler` hoch, mit Schlüssel `person`.

### A.5 Tests (Jest 30, node, TZ=UTC; Prisma-Mock nach dem Muster `jest.mock("@/lib/db", () => ({ prisma: mockPrisma }))`)

> **Ergänzt** (B · V7): Die Tests zum alten Adress- und Namensverhalten (Adresswechsel in den
> bestehenden Datensatz, `EMAIL_ABWEICHEND`, `EMAIL_KONFLIKT`, `NAME_ABWEICHEND`) sind auf Teil B
> umgeschrieben, nicht gelöscht. Dazu kamen Tests für R1, R2, F, P2 und die Beginn-Sicherungen in
> `personalstamm-abgleich.test.ts` sowie neue Testdateien: `src/__tests__/api/personalstamm-personen.test.ts`,
> `src/__tests__/components/personen-ansicht.test.tsx` und
> `src/__tests__/lib/personalstamm-n8n-stapel.test.ts` (Code-Knoten der Anleitung). Die
> Webhook-Tests prüfen zusätzlich 413 und die Gleichheit mit `CRON_SECRET`.

**`src/__tests__/lib/personalstamm-abgleich.test.ts`** mit eigenem kleinen In-Memory-Fake für
employee, employment, organization und auditLog, einschließlich `$transaction(fn)` in interaktiver
Form. Wiederverwendbar unter `src/__tests__/hilfen/personalstamm-fake-db.ts`. Fälle:
- **Anlegen:** neue Person und neuer Vertrag. Danach `importSource`, `importedAt`, `lastSyncAt` gesetzt, die Adresse kleingeschrieben.
- **Mehrere Verträge, eine Person:** zwei laufende Verträge mit derselben Adresse bei verschiedenen Mandanten ergeben eine Person mit zwei Verträgen. Das ist der Fall des Auftraggebers.
- **Gleiche MANR, verschiedene Mandanten oder Abrechnungskreise:** Mit verschiedenen Adressen entstehen zwei verschiedene Personen, nie eine zusammengeführte.
- **Austritt und Mehrfachanstellung:**
  - Ein Vertragsende gestern bei einem von zwei Verträgen: Der Vertrag ist inaktiv, die Person bleibt aktiv.
  - Beide Verträge beendet: Die Person wird stillgelegt, mit Eintrag STILLGELEGT.
  - Kommt der Vertrag wieder als laufend: Die Person wird reaktiviert, mit Eintrag REAKTIVIERT.
- **Vertragsende heute** gilt noch als laufend. Über Mitternacht in Berlin prüfen, mit `jetzt` als Zeitpunkt UTC 22:30 am Vortag beziehungsweise am Tag selbst.
- **Vertragsende wird null:** Der Wert wird übernommen, aus inaktiv wird aktiv.
- **Leere Felder löschen nichts:** Fehlende Stunden lassen alte Stunden stehen.
- **Wiederholung:** Derselbe Stapel zweimal ergibt beim zweiten Mal überall `unveraendert`, nur `lastSyncAt` neu.
- **Was nie stilllegt:** Ein leerer Stapel, ein Stapel ohne eine bestimmte Person und eine Zeile mit Formatfehler legen niemanden still.
- **Unbekannter beendeter Vertrag:** `uebersprungen`, nichts angelegt.
- **Grundcodes:**
  - `MANDANT_UNBEKANNT`
  - `MAIL_FEHLT`
  - `EMAIL_MEHRDEUTIG`, wenn zwei Personen dieselbe Adresse haben
  - `EMAIL_ANDERER_NAME`
  - `MANUELLER_DATENSATZ` und `FREMDE_QUELLE` (`"LOGA"`): jeweils nichts angefasst
- **Altbestand mit `importSource` null** wird über die Adresse übernommen, mit Eintrag PERSON_UEBERNOMMEN. `Employee.personalNumber` bleibt unverändert.
- **Adresswechsel:**
  - bei genau einem Vertrag: übernommen, mit Eintrag `{alt, neu}`
  - bei mehreren Verträgen: `EMAIL_ABWEICHEND`, Adresse unverändert
  - Ziel-Adresse gehört schon einer anderen Person: `EMAIL_KONFLIKT`
- **Namensänderung:**
  - bei einem Vertrag: übernommen, Eintrag ohne Namen
  - bei mehreren Verträgen: `NAME_ABWEICHEND`
- **Bestandsanstellung ohne Schlüssel** an einer übernommenen Person zählt nicht für den Aktiv-Status.
- **Lauf-Protokoll:** genau ein `PERSONALSTAMM_LAUF` je Aufruf, mit Zahlen und Meldungen, ohne Namen und Adressen. Prüfung über `JSON.stringify(details)` gegen die Testnamen und Testadressen.
- **Interner Fehler:** Eine Ausnahme in einer Zeile ergibt `INTERNER_FEHLER`, die übrigen Zeilen laufen weiter.

**`src/__tests__/lib/personalstamm-validierung.test.ts`:**
- Zahl oder Text bei Mandant, MANR, Abrechnungskreis und Stunden („25,5“)
- führende Nullen beim Mandanten
- Datumsangaben: `2026-02-31` scheitert; `2026-07-31T00:00:00.000Z` ergibt `2026-07-31`
- fehlender Schlüssel `vertragsende` scheitert, `null` ist erlaubt
- ungültige Adresse scheitert; leere Adresse ergibt null
- `.strip()` verwirft unbekannte Felder

**`src/__tests__/api/personalstamm-webhook.test.ts`** nach dem Vorbild
`src/__tests__/api/contract-end-webhook.test.ts`, die Bibliothek gemockt:
- 500 ohne oder mit zu kurzem Geheimnis
- 401 ohne Header, mit falschem Header und mit `CRON_SECRET`, wenn beide Variablen gesetzt und verschieden sind
- 400 bei unlesbarem Körper, leerem Stapel und 201 Einträgen
- ein einzelnes Objekt wird zum Stapel
- die Antwort gibt das Ergebnis der Bibliothek durch
- keine Namen im Log

**`src/__tests__/api/personalstamm-pruefen.test.ts`:**
- 401 ohne Sitzung
- 403 für Rollen außerhalb von HR, auch SERVICE
- Berechnung der Hinweise rot, gelb und null
- Meldungen zusammengefasst je Schlüssel und Code

**`src/__tests__/lib/wartung-personalstamm.test.ts`:** Löschgrenze bei 365 Tagen, Probelauf zählt nur.

### A.6 Konventionen

- Deutsch in UI-Texten und Fehlermeldungen. Kommentare in Dateien wie im Bestand (ASCII-Umschrift ue/oe/ae in Kommentaren üblich). Named Exports.
- Keine Gendersprache (CLAUDE.md).
- Keine neuen Abhängigkeiten.
- Nichts außerhalb der eigenen Dateien ändern. Wer eine Änderung in einer fremden Datei braucht, schreibt sie in seinen Bericht und ändert sie nicht.
- **Nicht** `npm run pruefen` als Ganzes laufen lassen, solange andere parallel bauen. Nur die eigenen Tests: `npx jest <pfad>`. Dazu `npx tsc --noEmit -p .`; Fehler in fremden, noch unfertigen Dateien ignorieren und nur die eigenen beheben.
- Nicht committen.

> **Ergänzt:** Die letzten beiden Punkte galten für den Bau mit parallelen Agenten. Vor dem Commit
> `24a8d11` lief `npm run pruefen` vollständig und grün (Abschnitt 0.5).

---

## Teil B · Nachtrag v3: „Die Adresse ist die Person“ (verbindlich zum Bauzeitpunkt, ersetzt E4 und D2)

Entscheidung des Auftraggebers vom 17.10.2026, nach der zweiten Gegenprüfung:
- Ein Personendatensatz wird **nie** auf einen anderen Menschen umgeschrieben.
- Die dienstliche Adresse (getrimmt und kleingeschrieben) ist die Person.
- Steht bei einem Vertrag eine andere Adresse, **wandert der Vertrag** zur Person mit dieser Adresse. Gibt es sie nicht, wird sie angelegt.
- Nach einer Heirat mit neuer Adresse gibt es zwei Datensätze, der alte wird inaktiv. Anliegen am alten Datensatz verknüpfen wir erst in S3.

Weiter gelten: Teil A (E1–E3, E5–E12, Abschnitte A.3–A.6), die Korrekturen der ersten
Code-Review-Runde und D1, D3, D4 (Abschnitt 0.4), sofern dieser Nachtrag nichts anderes sagt. Die
Befunde der Gegenprüfung lagen als Arbeitsunterlage vor (nicht archiviert). Jeder einzelne ist hier
abgedeckt und braucht einen Test.

> **Ergänzt** nach den weiteren Gegenprüfungen: R1, R2, F, P2 und die Beginn-Sicherungen
> (Abschnitt 0.3). Die Markierungen unten zeigen, wo sie eingreifen.

### V1 · Vorlauf (`stapelLesen`), ganz in try/catch

1. **Jede Rohzeile prüfen** (Zod).
   - Auch aus ungültigen Zeilen locker lesen, soweit möglich: Schlüssel, normalisierte Adresse sowie Vor- und Nachname. Grund: Eine Zeile mit Formatfehler darf die Sperre für geteilte Adressen nicht umgehen.
   - Steuerzeichen (`\u0000`–`\u001F`) in Text-Pflichtfeldern führen zu FORMATFEHLER.
   - `schluesselAusRohzeile` entfernt Steuerzeichen.
2. **Doppelte Schlüssel im Stapel:** Alle Zeilen dieses Schlüssels werden `fehler`, Code FORMATFEHLER, `feld: "schluessel"`. Keine davon wird verarbeitet.
3. **`namenJeAdresse`:** normalisierte Adresse → Menge der normalisierten Namen (`vorname|nachname`, getrimmt, kleingeschrieben), gebildet aus **allen** lesbaren Zeilen.
4. **Personenverzeichnis**
   - Einmal `employee.findMany` über alle Personen mit Adresse, nur `select` der nötigen Felder: id, email, firstName, lastName, importSource, isActive.
   - Daraus eine Map: Adresse nach `trim().toLowerCase()` → Liste von Personen.
   - **Keine `mode: "insensitive"`-Abfragen mehr.** `adresseGleich` und die ILIKE-Maskierung entfallen.
   - Die Map wird im Lauf nachgeführt, wenn Personen angelegt werden.
5. **Bekannte Verträge** über die Schlüssel des Stapels lesen.
6. **Laufende verwaltete Verträge je betroffener Person vor dem Lauf.** Bedingung wie E3: `isActive` und (`endDate` null oder ≥ heute). Gebraucht für die Umbenennung, siehe V3.
7. **Scheitert der Vorlauf:** Alle Zeilen werden `fehler`, Code INTERNER_FEHLER. Den LAUF-Eintrag trotzdem schreiben.

Reihenfolge der Verarbeitung: Zeilen mit bekanntem Schlüssel zuerst, `results` am Ende nach `index` sortiert.

> **Ergänzt** (Beginn-Sicherungen, zu V1.5 und V1.6): Der Vorlauf hält je bekanntem Vertrag auch den
> gespeicherten Beginn fest. Ihn brauchen der Konsens (V3) und der Nachweis nach F.

### V2 · Je Zeile (interaktive Transaktion; `heute = heuteInBerlin(jetzt)`; `laeuft` wie E1)

> **Ergänzt** (P2, gilt für jedes „nur auffrischen“ in b bis e): Ein Zweifel verschafft nie Zugang.
> Endet die Zeile eines bekannten Vertrags als Zweifelsfall oder Fehler, wechselt der Vertrag nie die
> Person, und „auffrischen“ heißt nur noch:
> - Beendet die Zeile den Vertrag, kommt nur das Ende an, und der Vertrag wird inaktiv. Beginn und
>   Stunden übernimmt der Abgleich nicht.
> - Läuft die Zeile und der Vertrag auch im Portal, übernimmt der Abgleich die Stunden und ein
>   früheres Ende. Ein späteres oder leeres Ende übernimmt er nicht, den Beginn ändert er nie.
> - Nennt die Zeile einen anderen Beginn als gespeichert, übernimmt er auch keine Stunden und keine
>   andere Organisation (Beginn-Sicherung).
> - Ist der Vertrag im Portal nicht laufend (beendet oder inaktiv), bleibt er unberührt, auch wenn
>   die Zeile ihn laufen lässt. Dann gibt es auch kein neues `lastSyncAt`.
>
> Einzelheiten stehen in Anleitung §4 unter „Zweifel verschafft nie Zugang“.

**a. Mandant unbekannt:** `fehler`, Code MANDANT_UNBEKANNT.

**b. Adresse ungültig** (Zod meldet nur die Adresse als Fehler; also Adressfeld locker parsen und Ungültigkeit als Kennzeichen führen):
- Bekannter Vertrag: **nur den Vertrag auffrischen** (Daten, Stunden, `isActive`). Er bleibt bei seiner Person, kein Name wird geändert. Status `fehler`, Code FORMATFEHLER, `feld: "email"`. Grund: Das Vertragsende einer Kündigung muss ankommen.
- Unbekannter Vertrag: nichts tun, `fehler` FORMATFEHLER `email`.

**c. Keine Adresse:**
- Bekannter Vertrag: nur den Vertrag auffrischen, kein Name wird geändert. Status `zweifelsfall` MAIL_FEHLT.
- Unbekannter Vertrag, läuft: `zweifelsfall` MAIL_FEHLT.
- Unbekannter Vertrag, beendet: `uebersprungen`.

**d. Adresse X, im Stapel mit mehreren Namen** (`namenJeAdresse.get(X).size > 1`):
- Status `zweifelsfall` EMAIL_ANDERER_NAME.
- Bekannter Vertrag: nur den Vertrag auffrischen, er wandert nicht und kein Name wird geändert.
- Unbekannter Vertrag: nichts.
- Läuft die Zeile, X in `offeneLaufendeAdressen` aufnehmen (siehe V4).

**e. Adresse X mit eindeutigem Namen N.** Personen mit X aus dem Verzeichnis:
- **2 oder mehr:** `zweifelsfall` EMAIL_MEHRDEUTIG.
  - Bekannter Vertrag: nur auffrischen, er wandert nicht.
  - Unbekannter Vertrag: nichts.
  - Läuft die Zeile, X in `offeneLaufendeAdressen` aufnehmen.
- **0:**
  - Bekannter Vertrag, **läuft**: neue Person anlegen (X, N, DOKUBIT, `importedAt`, `lastSyncAt`), den Vertrag zu ihr umhängen und auffrischen.
    - Eintrag `PERSONALSTAMM_VERTRAG_UMGEZOGEN`, details `{ schluessel, vonEmployeeId, nachEmployeeId }`, ohne Namen und ohne Adressen.
    - Status `aktualisiert`.
    - Die alte Person wird in V4 neu bewertet.
  - Bekannter Vertrag, **beendet**: nur auffrischen und bei der bisherigen Person lassen.
  - Unbekannter Vertrag, läuft: Person und Vertrag anlegen, Status `angelegt`.
  - Unbekannter Vertrag, beendet: `uebersprungen`.
- **1, Person Q:**
  - **Q.importSource === "MANUELL":** `zweifelsfall` MANUELLER_DATENSATZ. Ist Q eine andere Quelle außer null und DOKUBIT: FREMDE_QUELLE.
    - Bekannter Vertrag: nur auffrischen, er wandert nicht.
    - Unbekannter Vertrag: nichts.
    - Läuft die Zeile, X in `offeneLaufendeAdressen` aufnehmen.
  - **Q.importSource === null (Altbestand):** übernehmen nur, wenn der Name von Q gleich N ist (normalisiert). Dann `importSource = "DOKUBIT"`, `importedAt` setzen, falls leer, Eintrag PERSON_UEBERNOMMEN. Sonst behandeln wie „Name passt nicht“ (unten).
  - **Q ist DOKUBIT:**
    - **Name von Q ungleich N:** Umbenennen ist nur erlaubt, wenn Q vor dem Lauf mindestens einen laufenden verwalteten Vertrag hat und **jeder** davon im Stapel mit Adresse X vorkommt. Denn alle Zeilen von X tragen N, weil `namenJeAdresse` eindeutig ist. Das ist der Fall einer Heirat bei gleicher Adresse.
      - Dann den Namen von Q setzen, Eintrag NAME_GEAENDERT `{ employeeId }`.
      - Sonst `zweifelsfall` EMAIL_ANDERER_NAME. Bekannter Vertrag: nur auffrischen, er wandert nicht. Unbekannter Vertrag: nichts. Läuft die Zeile, X in `offeneLaufendeAdressen` aufnehmen.
      - Damit ist auch die Wiederverwendung einer Adresse für einen Nachfolger abgedeckt, etwa bei einer ausgeschiedenen Person Q ohne laufenden Vertrag.
    - **Vertrag:**
      - Bekannt und bei Q: auffrischen.
      - Bekannt und bei einer anderen Person P, **läuft**: zu Q umhängen und auffrischen, Eintrag VERTRAG_UMGEZOGEN, Status `aktualisiert`. P wird in V4 neu bewertet.
      - Bekannt bei P, **beendet**: nur auffrischen, bleibt bei P.
      - Unbekannt und läuft: bei Q anlegen, Status `angelegt`.
      - Unbekannt und beendet: `uebersprungen`.

> **Ergänzt** (zu „Q.importSource === MANUELL“ und fremder Quelle): D1 in der Fassung nach Teil B;
> die Person bleibt ganz unberührt, auch `lastSyncAt` (V2.f).
>
> **Ergänzt** (zu „Name von Q ungleich N“), zusätzlich zum Konsens:
> - **R1:** Umbenannt wird nur, wenn Vor- oder Nachname bleibt. Ein ganz anderer Name ist ein
>   anderer Mensch, dann `EMAIL_ANDERER_NAME`.
> - **Beginn-Sicherung:** Jede Konsens-Zeile muss den gespeicherten Vertragsbeginn ihres Vertrags
>   nennen. Sonst gilt der Schlüssel als neu vergeben, und es wird gemeldet.
> - **R2 und F** ändern den letzten Punkt („ausgeschiedene Person Q ohne laufenden Vertrag“): Hat Q
>   vor dem Lauf keinen laufenden Vertrag, benennt eine laufende Zeile sie trotzdem um und hängt den
>   Vertrag an. Bedingungen: Q kommt aus DokuBit (nie Altbestand), der Vorname bleibt gleich, und als
>   Nachweis kommt im selben Stapel unter X die Zeile eines Vertrags von Q, die ihn höchstens
>   `PERSONALSTAMM_ANSCHLUSS_TAGE` (30) vor heute enden lässt und den gespeicherten Beginn nennt.
>   Ohne Nachweis bleibt es bei `EMAIL_ANDERER_NAME`, und Q bleibt unverändert und inaktiv.
> - **Restrisiko, offen:** Ändert ein Fehler in DokuBit die Zeile des alten Vertrags auf eine
>   Nachfolgerin mit gleichem Vornamen, ohne den Beginn zu ändern, ist das von einer Heirat nicht zu
>   unterscheiden (Anleitung §4).

**f. `lastSyncAt`:** setzen für die Person, bei der der Vertrag nach der Zeile hängt. Gilt auch beim
reinen Auffrischen in den Zweifelsfall-Zweigen, aber nicht bei Personen mit Quelle MANUELL oder einer
fremden Quelle (D1).

> **Ergänzt** (P2): Kein neues `lastSyncAt`, wenn eine zweifelhafte laufende Zeile auf einen im
> Portal nicht laufenden Vertrag trifft (Markierung bei V2).

**g. `aktualisiert`:** zählt jede Zeile mit einer echten Änderung, auch wenn ihr Status `zweifelsfall` oder `fehler` ist.

**h. Ausnahme in einer Zeile:** `fehler` INTERNER_FEHLER. Die Transaktion der Zeile wird zurückgerollt.

### V3 · Umbenennen ohne Adresswechsel

Nur nach V2.e: Konsens über alle laufenden verwalteten Verträge von Q im Stapel. Eine Zeile ohne
Adresse oder mit ungültiger Adresse ändert **nie** einen Namen.

> **Ergänzt** durch R1 (Vor- oder Nachname bleibt), die Beginn-Sicherung (jede Konsens-Zeile nennt
> den gespeicherten Beginn) und als einzige Ausnahme ohne laufenden Vertrag R2 mit Nachweis nach F
> (Markierung bei V2.e). Zieht im selben Lauf ein Vertrag der Person zu einer neuen Adresse um, folgt
> der Name am alten Datensatz erst im nächsten Lauf, weil der Konsens den Stand vor dem Lauf liest.

### V4 · Aktiv-Status (E3) am Ende des Stapels, je betroffener Person einmal

**Betroffen** ist jede Person, die in diesem Stapel einen Vertrag bekommen, verloren oder aufgefrischt hat.

**Regel:** Für Personen mit Quelle DOKUBIT gilt `isActive` = es gibt einen verwalteten Vertrag mit `isActive` und (`endDate` null oder ≥ heute).

**Schutz vor falscher Stilllegung:**
- Ergibt die Regel inaktiv, war die Person aber aktiv und steht ihre Adresse in `offeneLaufendeAdressen`, dann **nicht** stilllegen.
- Grund: Im Stapel gab es einen laufenden Vertrag mit ihrer Adresse, der nur wegen eines Zweifelsfalls nicht zugeordnet werden konnte.
- Die Zeile ist schon gemeldet.

**Ausgang:** Ändert sich der Status, je ein Eintrag STILLGELEGT oder REAKTIVIERT. Je Person eine
eigene Transaktion mit try/catch. Ein Fehler dort zählt `fehler` hoch und kommt mit
`schluessel: "person"` und INTERNER_FEHLER in die Meldungen; ins Log nur der Code.

Weil die Bewertung erst am Ende des Stapels läuft, flattern STILLGELEGT und REAKTIVIERT innerhalb
eines Stapels nicht mehr.

> **Ergänzt** (Claude, Abschnitt 0.3): Der Schutz greift nur, wenn die zweifelhafte laufende Zeile
> die Adresse **und** den Namen der Person trägt. Die Zeile eines anderen Namens mit derselben
> Adresse schützt nicht, etwa die eines Nachfolgers oder eines geteilten Postfachs. **Betroffen** ist
> zusätzlich jede Person, deren Adresse in einer verarbeiteten Zeile steht; so endet ein Schutz mit
> seinem Grund.
>
> **Entschieden am 17.10.2026:** Eine solche Zeile schützt die Person auch dann, wenn ihr Vertrag im
> Portal schon beendet ist und die Zeile nach P2 nichts an ihm ändert (Anleitung §4, „Ausnahme“).

### V5 · Lauf-Protokoll

**Immer** genau ein LAUF-Eintrag, auch wenn Vorlauf oder alle Zeilen scheitern. Das Schreiben in
try/catch: Schlägt es fehl, ein zweiter Versuch nur mit `zahlen` ohne Meldungen; schlägt auch der
fehl, nur loggen (Code). Keine Namen und keine Adressen.

### V6 · Konstanten (`src/lib/constants.ts`)

**Entfallen:**
- die Codes `EMAIL_ABWEICHEND`, `EMAIL_KONFLIKT`, `NAME_ABWEICHEND`
- die Aktion `EMAIL_GEAENDERT`
- `IMPORT_QUELLE_MANUELL` bleibt

**Neu:**
- `PERSONALSTAMM_ACTIONS.VERTRAG_UMGEZOGEN = "PERSONALSTAMM_VERTRAG_UMGEZOGEN"` mit dem Label „Personalstamm: Vertrag einer anderen Person zugeordnet (neue Adresse)“

**Beschriftungen:**
- EMAIL_ANDERER_NAME: „Adresse und Name passen nicht zu derselben Person — in DokuBit prüfen“
- EMAIL_MEHRDEUTIG: „Adresse gehört im Portal zu mehreren Personen“

Alle Verwendungen nachziehen: UI, Labels, Tests und der Test der Audit-Log-Labels.

> **Ergänzt** (R2 und F): `PERSONALSTAMM_ANSCHLUSS_TAGE = 30`, passend zum Fenster der Abfrage.

### V7 · Tests (Pflicht, jeder als eigener Fall; gegen den Fake, plus die echten Postgres-Eigenheiten, wo nötig)

1. **Adresswechsel bei einem Vertrag:** neue Person, Vertrag umgehängt, alte Person stillgelegt, Eintrag UMGEZOGEN ohne Adressen. Ein zweiter Lauf ändert nichts.
2. **Heirat bei gleicher Adresse und 2 Verträgen,** beide im Stapel: Name geändert, Eintrag NAME_GEAENDERT. Nur einer im Stapel: EMAIL_ANDERER_NAME, keine Änderung.
3. **Heirat mit neuer Adresse:** neue Person aktiv, alte inaktiv, keine Identität umgeschrieben. Die alte Person behält ihren Namen und ihre Adresse.
4. **Falsche Zeile in DokuBit bearbeitet:** Adresse und Name einer bestehenden Person Q. Der Vertrag wandert zu Q. Nach der Korrektur wandert er zurück, P wird reaktiviert.
5. **Wiederverwendeter Schlüssel für einen neuen Kollegen** (neue Adresse, neuer Name): neue Person, die alte verliert den Vertrag, nichts umgeschrieben.
6. **Geteilte Adresse im Stapel:**
   - Bekannter Vertrag ohne Wandern und ohne Namensänderung.
   - Kein Anlegen.
   - Der Schutz vor Stilllegung greift, wenn der Anschlussvertrag der Person deshalb nicht zugeordnet wird. Das ist das Szenario „zugang 1“ aus der Gegenprüfung.
7. **Adresse eines ausgeschiedenen Q für einen Nachfolger** mit anderem Namen: EMAIL_ANDERER_NAME, Q bleibt unverändert und inaktiv.
8. **Altbestand:** Übernahme nur bei gleichem Name. Anderer Name ergibt EMAIL_ANDERER_NAME. Gespeicherte Adresse „ Anna@X.de “ mit Leerzeichen und Großbuchstaben wird gefunden.
9. **Bekannter Vertrag ohne Adresse:** MAIL_FEHLT, das Vertragsende kommt an, die Person wird stillgelegt.
10. **Bekannter Vertrag mit ungültiger Adresse:** FORMATFEHLER `email`, das Vertragsende kommt an, die Person wird stillgelegt.
11. **Doppelter Schlüssel:** beide Zeilen FORMATFEHLER `schluessel`, nichts verarbeitet.
12. **Formatfehler-Zeile mit gleicher Adresse und anderem Namen** sperrt das Anlegen der gültigen Zeile.
13. **NUL in MANR:** FORMATFEHLER. Der LAUF-Eintrag wird geschrieben, `schluessel` ohne Steuerzeichen.
14. **Vorlauf wirft:** alle INTERNER_FEHLER, LAUF geschrieben, keine Ausnahme nach außen.
15. **Anschlussvertrag hinter dem beendeten Vorgänger im Stapel:** kein STILLGELEGT/REAKTIVIERT-Paar.
16. **Wiederholung:** jeder obige Endzustand ist idempotent.
17. **Bestehende Tests:** alle weiter grün, außer sie testen ausdrücklich das alte Adressänderungs-Verhalten. Solche Tests auf V2 umschreiben, nicht löschen.

> **Ergänzt:** Fall 6 gilt in der engeren Fassung: Der Schutz greift nur für die Person mit
> derselben Adresse und demselben Namen (Markierung bei V4). Fall 7 gilt weiter; bei gleichem
> Vornamen nur, solange der Nachweis nach F fehlt. Dazu kamen Fälle für R1, R2 mit und ohne Nachweis, P2 (kein Verlängern, kein
> Reaktivieren über eine zweifelhafte Zeile) und die Beginn-Sicherungen.
