# Self-Service S0 „Personalstamm aus DokuBit“ — Übergabe

> **Stand:** 17.10.2026, abends · **Zweig:** `feat/selfservice-s0-personalstamm` · **Commit:** `24a8d11`
> „Self-Service S0: Personalstamm aus DokuBit“, dazu diese Übergabe.
> **Nicht deployt.** Der n8n-Ablauf ist nicht eingerichtet. Beim Schreiben war der Zweig noch nicht
> gepusht; Push und Pull Request folgen mit dieser Übergabe (Abschnitt 8.4).
> **Zweck:** In einer neuen Sitzung ohne Vorwissen weitermachen können: was gebaut ist, was
> entschieden und geprüft wurde, was vor dem ersten Produktivlauf fehlt und wie es nach Plan weitergeht.

Die Dokumente zu S0:

| Dokument | Inhalt |
|---|---|
| `docs/module/selfservice/README.md` | Einstieg in den Feature-Ordner, Stand je Paket |
| `docs/module/selfservice/selfservice-portal-plan.html` | Konzeptplan (Fassung 6). Für S0 maßgeblich: 5.1, 11.1, 12.3, Abschnitt 13 (Zeile S0) und die Entscheidungen E-S10, E-S11, E-S15 |
| `docs/module/selfservice/s0-personalstamm-n8n.md` | Betriebsanleitung: SQL-Abfrage, Einrichtung in n8n, Grundcodes mit Abhilfe, Rücknahme, Bestandsprüfung, Checkliste |
| `docs/module/selfservice/s0-testdaten.json` | Erfundene Testdaten für den lokalen Webhook (Abschnitt 8.3) |
| `src/lib/personalstamm/abgleich.ts`, Kopfkommentar | Die Regeln des Abgleichs in Kurzform. Vor jeder Änderung an Identität oder Zugang lesen |
| `docs/historie/s0-bauvorgabe-2026-10.md` | Archiv der Bauvorgabe vom 17.10.2026 mit Markierung, was später ersetzt wurde. Nicht mehr maßgeblich |
| `docs/historie/codereview-s0-personalstamm-2026-10.md` | Prüfprotokoll von S0: Befunde je Runde mit Schwere und Ergebnis, Entscheidungen mit Urheber, Restrisiken |
| `docs/historie/codereview-selfservice-plan-2026-10.md` | Code-Review des Konzeptplans (F1–F83), auf das Plan und Code verweisen |

---

## 1 · Stand in einem Absatz

Das Konzept für das Mitarbeiterportal ist seit PR #4 in `main` (`ac3535a`). Personalabteilung,
Datenschutzbeauftragter und MAV haben dem Plan am 17.10.2026 zugestimmt. Paket S0 ist danach auf
dem Zweig `feat/selfservice-s0-personalstamm` gebaut worden. Es enthält einen Webhook, über den n8n
jede Nacht die Verträge aus DokuBit schickt, und die Abgleichlogik dahinter. Dazu kommen eine
Leseansicht „Personen“ mit dem Block „Zu prüfen“ sowie Protokoll und Löschfrist. Grundlage sind
die DokuBit-Abfragen und die Entscheidungen des Auftraggebers vom selben Tag. `npm run pruefen` ist
grün. Der Abgleich ist in drei Review- und vier Gegenprüfrunden geprüft und Ende-zu-Ende gegen eine
lokale Datenbank mit erfundenen Daten geprobt. Produktiv laufen darf S0 erst, wenn die
organisatorischen Punkte aus Abschnitt 5 erledigt sind, vor allem E-S25 und E-S27 mit dem DSB.
Danach geht es nach Plan mit S1 (parallel möglich) und S3/S3b weiter (Abschnitt 7).

## 2 · Was S0 enthält

### 2.1 Grundregeln in fünf Sätzen

- **Eine DokuBit-Zeile ist ein Vertrag.** Sie wird genau eine `Employment`-Zeile, eindeutig über
  Mandant + Abrechnungskreis + MANR. Die MANR allein ist kein Personenschlüssel.
- **Die dienstliche Adresse ist die Person.** Ein Datensatz wird nie auf einen anderen Menschen
  umgeschrieben; bei neuer Adresse wandert der Vertrag.
- **Ein Vertrag läuft bis einschließlich `VERTRAGSENDE`** (Berliner Kalendertag). Aktiv ist eine
  Person, solange einer ihrer vom Abgleich verwalteten Verträge läuft.
- **Stillgelegt wird nur ausdrücklich**, über eine gelieferte Zeile, nie aus dem Fehlen in einer
  Lieferung.
- **Ein Zweifel verschafft nie Zugang.** Ein Vertragsende kommt immer an, ein Zweifelsfall
  verlängert oder entfristet nichts.

Die Einzelheiten stehen in `s0-personalstamm-n8n.md`, Abschnitte 1 und 4.

### 2.2 Routen und Ansicht

| Route / Seite | Wer | Zweck |
|---|---|---|
| `POST /api/webhooks/personalstamm` | n8n, `Authorization: Bearer <PERSONALSTAMM_SECRET>` | Ein Eintrag oder ein Stapel bis 200 Zeilen, Körper bis 1 MiB. Antwort immer 200 mit Ergebnis je Zeile, ohne Namen und Adressen; 400/401/413/500 nur, wenn der ganze Aufruf scheitert. Gleichzeitige Aufrufe laufen nacheinander |
| `GET /api/personalstamm/personen` | SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER (ohne SERVICE) | Schlanke Liste für die Ansicht: nur die angezeigten Felder, Suche über Name, Adresse und MANR, nie über die LOGA-Nummer |
| `GET /api/personalstamm/pruefen` | dieselben drei Rollen | „Zu prüfen“: nicht gelieferte aktive Personen, Meldungen der letzten 24 Stunden je Vertrag und Grundcode, ab S1/S2 abgewiesene Anmeldungen; dazu die Hinweiszeile |
| `/personen` | dieselben drei Rollen | Leseansicht mit Hinweiszeile (rot, solange eine aktive Person seit mehr als 26 Stunden nicht geliefert wurde, sonst gelb bei offenen Einträgen), „Zu prüfen“ und Liste. Keine Bearbeitung, keine Zuordnung von Hand |

### 2.3 Dateien

Neu:

| Datei | Inhalt |
|---|---|
| `src/app/api/webhooks/personalstamm/route.ts` | Webhook: Geheimnis prüfen (zeitkonstant, mind. 24 Zeichen, nicht gleich `CRON_SECRET`), Körper lesen, an den Abgleich reichen |
| `src/lib/personalstamm/abgleich.ts` | Abgleichlogik: Vorlauf, je Zeile eine Transaktion, Aktiv-Stand am Ende des Stapels, Protokoll |
| `src/lib/personalstamm/pruefen.ts` | Rechnung für „Zu prüfen“ und die Hinweiszeile |
| `src/lib/validations/personalstamm.ts` | Zod-Schema der Zeile (Zahl oder Text, `.strip()`), Vertragsschlüssel |
| `src/app/api/personalstamm/personen/route.ts` | Leseroute der Liste |
| `src/app/api/personalstamm/pruefen/route.ts` | Leseroute „Zu prüfen“ |
| `src/app/(portal)/personen/page.tsx`, `personen-content.tsx` | Seite „Personen“ |
| `src/components/personen/zu-pruefen.tsx` | Hinweiszeile und Block „Zu prüfen“ |
| `docs/module/selfservice/s0-personalstamm-n8n.md`, `.json` | Anleitung und Importvorlage des n8n-Stammablaufs (n8n 2.x, ohne Credentials) |
| Tests | `src/__tests__/lib/personalstamm-abgleich.test.ts`, `personalstamm-validierung.test.ts`, `personalstamm-n8n-stapel.test.ts`, `wartung-personalstamm.test.ts`; `src/__tests__/api/personalstamm-webhook.test.ts`, `personalstamm-personen.test.ts`, `personalstamm-pruefen.test.ts`; `src/__tests__/components/personen-ansicht.test.tsx`; Fake-Datenbank `src/__tests__/hilfen/personalstamm-fake-db.ts` |

Geändert:

| Datei | Änderung |
|---|---|
| `prisma/schema.prisma` | Schema-Delta, Abschnitt 2.4 |
| `src/lib/constants.ts` | Block „Personalstamm aus DokuBit“: Quelle `DOKUBIT`, Grundcodes, Zeilenstatus, Audit-Aktionen und -Beschriftungen, `PERSONALSTAMM_ANSCHLUSS_TAGE` (30), `PERSONALSTAMM_AUFBEWAHRUNG_TAGE` (365) |
| `src/lib/laeufe/wartung.ts`, `src/lib/zeitplaner/katalog.ts`, `src/lib/zeitplaner/bericht.ts` | Lauf „Wartung“ löscht Protokolleinträge des Abgleichs nach 365 Tagen; Probelauf zählt nur |
| `src/lib/laeufe/cron-anmeldung.ts` | `gleichZeitkonstant` exportiert, damit der Webhook ihn nutzt |
| `src/middleware.ts` | `/personen` zählt als Portalseite (Sitzung nötig) |
| `src/components/portal-header.tsx` | Menüpunkt „Personen“ für die drei HR-Rollen |
| `src/app/(portal)/audit-log/audit-log-content.tsx` | Beschriftungen der neuen Audit-Aktionen |
| `src/__tests__/components/audit-log-labels.test.tsx` | Test: jede neue Audit-Aktion ist beschriftet und überschreibt keine bestehende |
| `.env.example`, `.env.production.example`, `README.md` | `PERSONALSTAMM_SECRET`, Abschnitt zum eingehenden Webhook |
| `docs/README.md`, Plan, Designkonzept | Plan 5.1, 11.1, 12.3, 13 und E-S10, E-S11, E-S15 nachgeführt; im Designkonzept rund 340 statt 600 Beschäftigte; in `docs/README.md` die n8n-Anleitung eingetragen |

### 2.4 Schema-Delta

| Modell | Änderung |
|---|---|
| `Employment` | neu `abrechnungskreis String?` und `personalNumber String?` (DokuBit-MANR), dazu `@@unique([mandantNumber, abrechnungskreis, personalNumber], map: "employments_dokubit_vertrag_key")` |
| `Employee` | nur Kommentar: `importSource` = `"DOKUBIT"` heißt „vom Abgleich verwaltet“ |
| `AuditLog` | nur Kommentar: `processType` = `"PERSONALSTAMM"` |

- Rein additiv und nullbar. Bestandsanstellungen haben in beiden Spalten `null`; sie stören den
  eindeutigen Index nicht und zählen nicht für den Aktiv-Stand.
- `Employee.personalNumber` (LOGA-Nummer, global eindeutig) wird weder gelesen noch geschrieben.
- Lokal mit `npx prisma db push` angelegt. In Produktion legt der Entrypoint das Delta per `db push`
  an. **Kein Code-Rollback unter das Delta:** Mit dem alten Schema löschte `db push --accept-data-loss`
  die neuen Spalten samt Inhalt.

### 2.5 Protokoll und Löschung

- Jeder Aufruf schreibt genau einen Eintrag `PERSONALSTAMM_LAUF` mit Zahlen, Vertragsschlüssel und
  Grundcode, auch wenn der ganze Stapel scheitert.
- Eigene Einträge bekommen: Übernahme einer Bestandsperson, Vertrag zu anderer Person, Namensänderung,
  Stilllegen und Reaktivieren.
- Kein Eintrag enthält Namen oder Adressen; in die Konsole kommen nur Zeilenindex und Fehlerkennung.
- Der Lauf „Wartung“ löscht alle Einträge mit `processType` `PERSONALSTAMM` nach 365 Tagen.

## 3 · Entscheidungen

### 3.1 Zustimmung und Entscheidungen des Auftraggebers

| Datum | Entscheidung | Begründung |
|---|---|---|
| 17.10.2026 | Zustimmung von Personalabteilung, DSB und MAV zum Plan | Vorbedingung für S0 (Plan 13). Offen bleiben E-S25 (Gremium der drei GmbHs, ggf. Betriebsrat statt MAV) und E-S27 (DSG-EKD oder BDSG je juristische Person) |
| 17.10.2026 | `VERTRAGSENDE` ist der letzte Arbeitstag. Eine Verlängerung oder Entfristung kommt in DokuBit als neue Zeile | `MASTATUS` ist überall leer, eine Austrittsspalte gibt es nicht. Ausgetreten wird deshalb über das Vertragsende |
| 17.10.2026 | Schlüssel Mandant + Abrechnungskreis + MANR; die Person über die dienstliche Adresse | Die MANR ist je Person nicht eindeutig: 222 MANR tragen mehrere Namen, 192 Adressen gehören zu mehreren MANR. Eine Person kann mehrere Anstellungen haben; 18 Personen haben mehrere laufende Verträge |
| 17.10.2026 | Rund 340 aktive Beschäftigte passt (343 laut DokuBit, mit 362 laufenden Verträgen) | Zählung je Adresse. Die frühere Zahl 238 war je MANR gezählt und falsch |
| 17.10.2026 | **„Die Adresse ist die Person“:** Bei neuer Adresse wandert der Vertrag, eine Identität wird nie umgeschrieben. Heirat mit neuer Adresse ergibt einen neuen Datensatz; die Verknüpfung alter Anliegen kommt in S3 | Ein auf einen anderen Menschen umgeschriebener Datensatz gäbe ihm Zugang zu fremden Daten. Ein zweiter Datensatz ist dagegen harmlos und später verknüpfbar (Plan E-S10) |
| 17.10.2026 | **R1:** Umbenennen nur, wenn Vor- oder Nachname bleibt | Eine Heirat ändert einen Namensteil. Ein ganz anderer Name ist ein anderer Mensch |
| 17.10.2026 | **R2:** Anschluss nach dem jüngsten Ende, höchstens 30 Tage, Vorname gleich | Heirat mit Anschlussvertrag soll ankommen. Die 30 Tage passen zum Fenster der n8n-Abfrage |
| 17.10.2026 | **F:** Der Anschluss nur mit Nachweis: Im selben Stapel kommt unter derselben Adresse die Zeile eines alten Vertrags der Person, die ihn in den letzten 30 Tagen enden lässt. Weil alle Zeilen einer Adresse denselben Namen tragen müssen, trägt sie den neuen Namen | Unterscheidet die Heirat von einer Nachfolgerin, der DokuBit das Postfach gibt |
| 17.10.2026 | **P2:** Zweifelsfälle verschaffen nie Zugang; ein Vertragsende kommt immer an | Der teure Fehler ist ein Zugang, der nicht mehr bestehen dürfte. Ein Zweifel darf deshalb nichts verlängern, entfristen oder reaktivieren |
| 17.10.2026 | Löschfrist der Protokolleinträge 1 Jahr, mit dem DSB zu bestätigen | Die Einträge tragen MANR und Personenkennungen. Ohne Frist blieben sie unbefristet (Plan 12.3) |
| 17.10.2026 | Verknüpfung mit dem Onboarding aus S0 herausgenommen | Das Onboarding kennt nur die Adresse, weder MANR noch Abrechnungskreis; eine Regel fehlt. Vor S3 zu entscheiden (Plan 13, E-S11) |
| 17.10.2026 | Im Portal stehen schon Beschäftigtendatensätze unbekannter Herkunft. Sie werden vor dem ersten Produktivlauf geprüft, nicht vor dem Bau | Der Abgleich übernimmt Altbestand nur bei eindeutiger Adresse und passendem Namen und meldet alles andere. Die Abfragen stehen in `s0-personalstamm-n8n.md`, Abschnitt 6 |

### 3.2 Von Claude nach diesen Grundsätzen entschieden

Diese Punkte hat der Auftraggeber nicht einzeln entschieden. Sie folgen aus den Grundsätzen oben und
sind im Code und in der Anleitung so umgesetzt. Welcher Befund sie ausgelöst hat, steht im
Prüfprotokoll [`codereview-s0-personalstamm-2026-10.md`](codereview-s0-personalstamm-2026-10.md).

| Datum | Entscheidung | Begründung |
|---|---|---|
| 17.10.2026 | **D1:** Hängt ein bekannter Vertrag an einer Person mit Quelle `MANUELL` oder `LOGA`, bleibt die Person unberührt (Adresse, Name, Aktiv-Status). Gemeldet wird `MANUELLER_DATENSATZ` bzw. `FREMDE_QUELLE`; für den Vertrag gilt P2 | Von Hand oder aus LOGA geführte Personen gehören nicht dem Abgleich. HR entscheidet, ob sie auf `DOKUBIT` umgestellt werden |
| 17.10.2026 | Die Leserouten „Personen“ und „Zu prüfen“ nur für SUPER_ADMIN, HR_LEITUNG und HR_SACHBEARBEITER, ohne SERVICE | Die Antworten nennen Namen. Der gemeinsame n8n-Schlüssel braucht sie nicht |
| 17.10.2026 | Eigene Leseroute statt `GET /api/employees` | Datenminimierung: keine private Adresse, kein Geburtsdatum, kein Telefon, keine LOGA-Nummer im Browser |
| 17.10.2026 | Der gespeicherte Vertragsbeginn als Merkmal: Umbenennen nur, wenn die Zeilen im Konsens ihn nennen; als Nachweis nach F zählt nur eine Zeile mit ihm. Im Zweifel ändert der Abgleich den Beginn nie, und nennt eine zweifelhafte Zeile einen anderen Beginn, übernimmt er weder Stunden noch Organisation | Gleicher Schlüssel mit anderem Beginn heißt vermutlich: DokuBit hat den Schlüssel an einen anderen Menschen neu vergeben |
| 17.10.2026 | Schutz vor Stilllegung nur bei eigener Adresse **und** eigenem Namen. Er greift auch, wenn der eigene Vertrag im Portal schon beendet ist (hält nur einen bestehenden Zugang aufrecht, schafft keinen neuen) | Die Zeile eines anderen Namens mit derselben Adresse (Nachfolger, geteiltes Postfach) darf niemanden aktiv halten (P2) |

## 4 · Verifikation

**Gates (17.10.2026, Endstand `24a8d11`):** `npm run pruefen` grün: Typprüfung und Lint ohne Fehler
(die 5 bekannten Warnungen in fremden Bestandsdateien), **244 Suites, 7.487 Tests**.

**Review und Gegenprüfung.** Drei Review-Runden und vier adversariale Gegenprüfrunden, so die
Zählung im Commit. Das Prüfprotokoll
[`codereview-s0-personalstamm-2026-10.md`](codereview-s0-personalstamm-2026-10.md) zählt sechs
Runden nach Gegenstand und führt alle 77 Befunde (2 CRITICAL, 23 MAJOR, 52 MINOR) mit Ergebnis;
kein CRITICAL- oder MAJOR-Befund ist offen. In den Fixrunden wurden Befunde als Test nachgestellt,
bevor sie behoben wurden. Danach wurden Fixes und Regeln gezielt wieder ausgebaut, um zu sehen, ob
ein Test es bemerkt (Mutationsprobe). Einzelne Befunde sind mit Begründung bewusst nicht umgesetzt.
Die Rohdaten lagen nur in der temporären Ablage der Sitzung vom 17.10.2026 (`…/scratchpad/s0/`)
und sind nicht Teil des Repos:

| Datei | Inhalt |
|---|---|
| `review-befunde.json`, `review-fixer.md` | Runde 1: Review, fünf Bereiche (Abgleich, Sicherheit, Oberfläche, Tests, Doku), 40 Befunde; Umsetzung samt D1–D4, 7 Mutationen erkannt |
| `gegenpruefung.json` | Runde 2: Gegenprüfung (Stapel, Identität, Zugang; im Plan „zweite Gegenprüfung“), 13 Befunde. Führte zum Umbau „Die Adresse ist die Person“ |
| `umbau-v3.json` | Runde 3: Umbau mit Gegenprüfung (Wandern, Identität, Zugang), 12 Befunde. Ergebnis: Schutz vor Stilllegung nur bei eigenem Namen, Aktiv-Stand einmal am Stapelende |
| `r2-ergebnis.json` | Runde 4: Anschlussregel R2 mit Gegenprüfung, 5 Befunde. Die Lücken bei der Nachfolgerin gleichen Vornamens führten zu den Entscheidungen F und P2 |
| `fp2-ergebnis.json` | Runde 5: F und P2 mit Gegenprüfung, 7 Befunde, 21 Mutationen erkannt |

Runde 6, ohne eigene Gegenprüfung: `imKonsens` prüft den gespeicherten Beginn, und
`vertragsAenderung` lässt im Zweifel bei anderem Beginn Stunden und Organisation stehen.

**Ende-zu-Ende** gegen die lokale Postgres-Datenbank (Abschnitt 8.2) mit den erfundenen Daten aus
`docs/module/selfservice/s0-testdaten.json` und gezielten Abwandlungen:

| Fall | Ergebnis |
|---|---|
| Erstlauf (11 Zeilen) | 5 Verträge angelegt, 2 übersprungen, 2 Zweifelsfälle, 2 Fehler, wie in Abschnitt 8.3 erwartet |
| derselbe Stapel noch einmal | unverändert |
| einer von zwei laufenden Verträgen einer Person beendet | Person bleibt aktiv |
| neue Adresse beim einzigen laufenden Vertrag einer Person | Vertrag wandert zu einer neu angelegten Person; die alte hat keinen laufenden Vertrag mehr und wird stillgelegt; protokolliert ohne Adressen |
| Heirat bei gleicher Adresse | umbenannt |
| neu vergebener Schlüssel mit anderem Beginn | Zweifelsfall (`EMAIL_ANDERER_NAME`), nicht umbenannt, Beginn unverändert |

Stand der lokalen Datenbank danach: 5 Personen aus DokuBit (4 aktiv), 5 verwaltete Anstellungen
(4 laufend), 6 Laufeinträge, je Fall einer.

**Sichtprüfung** der Ansicht „Personen“ im Browser, auf dem Desktop und bei 375 Pixeln Breite.

## 5 · Checkliste vor dem ersten Produktivlauf

Überwiegend organisatorisch. Die Einzelheiten stehen in `s0-personalstamm-n8n.md`, Abschnitt 7.

- [ ] **E-S25 und E-S27 mit dem DSB klären:** welches Gremium für die drei GmbHs zustimmt, und
      DSG-EKD oder BDSG je juristische Person.
- [ ] **Löschfrist von 1 Jahr mit dem DSB bestätigen** (`PERSONALSTAMM_AUFBEWAHRUNG_TAGE`).
- [ ] **Verzeichnis der Verarbeitungstätigkeiten:** Betreiber und Standort von n8n, Aufbewahrung der
      Ausführungen, feste Spaltenliste nachtragen. Ist der Betreiber nicht der Träger selbst, braucht
      es einen Vertrag nach Art. 28 DSGVO.
- [ ] **Bestand der Portal-Datenbank prüfen** (Anleitung Abschnitt 6, Abfragen 1–4): Herkunft der
      vorhandenen Datensätze, doppelte Adressen. Dubletten vorher bereinigen, nie per DELETE.
- [ ] **In DokuBit bereinigen:** die 5 Adressen mit fremder Domäne und die 1 Adresse mit zwei Namen.
- [ ] **Pull Request gemergt und deployt.** Für den Deploy einen Ablaufplan nach dem Muster der
      bisherigen Deploys anlegen (`docs/historie/deploy-*.md`).
- [ ] **`PERSONALSTAMM_SECRET` setzen** (mind. 24 Zeichen, nicht gleich `CRON_SECRET`) und das
      n8n-Credential nur im Stammablauf anlegen. Wert nie in Chat, Doku oder Log.
- [ ] **Lauf „Wartung“** unter Einstellungen → Automatische Läufe eingeschaltet, sonst greift die
      Löschfrist nicht.
- [ ] **n8n-Importvorlage einmal prüfen:** Die Verdrahtung des Knotens „Loop Over Items“ ist nicht
      gegen eine echte n8n-Instanz getestet (Soll in der Anleitung, Abschnitt 3.2). Einstellungen nach
      3.3: Zeitzone Europe/Berlin, erfolgreiche Ausführungen nicht speichern.
- [ ] **Erster Lauf von Hand,** dann „Personen“ und Abfrage 5 ansehen, erst danach aktiv schalten.
      Einen Probelauf gibt es nicht; schon der erste Aufruf schreibt.

## 6 · Offene Punkte und Restrisiken

**Beim Auftraggeber bzw. der Personalabteilung:**

- **`EVTLLDA`:** Bedeutung offen, die Personalabteilung fragt nach. 219 von 265 Werten liegen vor dem
  Vertragsbeginn. Die Spalte wird nicht abgefragt. Das Platzhalter-Label „Evtl. letzter Arbeitstag“
  (`src/lib/placeholder-catalog.ts`) ist vermutlich falsch.
- **Ausnahme beim Schutz vor Stilllegung** (Anleitung Abschnitt 4): Eine zweifelhafte laufende Zeile
  mit eigener Adresse und eigenem Namen hält die Person aktiv, auch wenn ihr Vertrag im Portal schon
  beendet ist. Am 17.10.2026 so entschieden (hält nur einen bestehenden Zugang aufrecht); kann der
  Auftraggeber jederzeit umkehren lassen.
- **Restrisiko:** Benennt DokuBit die Zeile des alten Vertrags fälschlich auf eine Nachfolgerin mit
  gleichem Vornamen um, ohne den Beginn zu ändern, lässt sich das nicht von einer Heirat
  unterscheiden; der Anschluss greift. Dasselbe gilt für einen samt Postfach neu vergebenen
  Schlüssel, solange der Vertrag im Portal noch läuft und es der einzige laufende der Person ist,
  wenn der neue Name einen Namensteil teilt und die Zeile den gespeicherten Beginn nennt (Anleitung
  Abschnitt 4, „Restrisiko“).

**Im Code, außerhalb von S0:**

- **Vertragsende-Webhook** (`src/app/api/webhooks/contract-end/route.ts`): sucht offene Vorgänge je
  Mandant über die MANR (ohne Abrechnungskreis) und verknüpft die Person über
  `Employee.personalNumber` = MANR. Die MANR ist je Person aber nicht eindeutig, und S0 schreibt sie
  bewusst nicht dorthin. Der Adressvergleich dort läuft außerdem ohne Maskierung (`_` wirkt als
  Platzhalter). Als eigene Aufgabe vorgeschlagen.
- **Vor S1:** `PATCH /api/employees/[id]` und `PATCH /api/employees/[id]/employments/[employmentId]`
  sind für vom Abgleich verwaltete Datensätze nicht gesperrt, erlauben SERVICE und protokollieren
  nichts. Ab S1 hängen Zugang und Zuordnung an `Employee.email` und `Employee.isActive` (Plan 13,
  Zeile S1).
- **`GET /api/employees`** liefert volle Datensätze an den Browser. S0 umgeht das mit der eigenen
  Leseroute; die Bestandsroute ist unverändert.
- **`BESCHAEFTIGUNGSGRUPPE`** ist in DokuBit leer. Die Sichtbarkeit der Arbeitsbefreiung in S4
  braucht eine andere Quelle.
- **Kontrast `text-credo-rot`** auf hellem Rot in der Hinweiszeile: Hausmuster, eine dunklere
  Rot-Stufe wäre eine Hausentscheidung.

**Bekannte Grenzen des Abgleichs** (Anleitung Abschnitt 2): Ein Vertragsende, das nachträglich mehr
als 30 Tage zurück eingetragen wird, und eine in DokuBit gelöschte Zeile erreichen das Portal nie.
Die vollständige Liste der Restrisiken steht im Prüfprotokoll, Abschnitt „Restrisiken“.

## 7 · Nächste Schritte nach Plan

Reihenfolge laut Plan, Abschnitt 13: **S1 und S0 parallel, dann S3 und S3b, danach S2 und S4,
zuletzt S5.** S3 und S3b nützen allen Beschäftigten, ohne dass sich jemand anmeldet; S2 hat die
meisten Voraussetzungen.

| Paket | Inhalt | Umfang | Vorbedingungen | Stand |
|---|---|---|---|---|
| S0 | Personalstamm aus DokuBit | 4–6 Tage | Zustimmung DSB und MAV (erteilt 17.10.2026); Checkliste in Abschnitt 5 | gebaut, nicht deployt |
| S1 | Keycloak und Anmeldung des HR-Teams | 6–8 Tage | unabhängig von S0, parallel möglich. App-Registrierung durch die IT (E-S5). Vorbedingung aus S0: PATCH-Routen absichern (Abschnitt 6) | geplant |
| S3 | Ticketsystem | 12–16 Tage | S0 im Betrieb; Versand auf OAuth2 umgestellt (eigene Aufgabe, fällig bis Ende Dezember 2026); Zweig `ux-umbau` nach `main`; zwei Personen für vertrauliche Anliegen benannt (E-S29); E-S28 entschieden. Außerdem vor S3: Onboarding-Verknüpfung oder Hauptarbeitgeber je Person (E-S11) und Verknüpfung alter Anliegen nach Heirat mit neuer Adresse (E-S10) | geplant |
| S3b | HR-Postfach als zweiter Eingang | 7–9 Tage | S0 (sonst wird jede Mail „Person nicht zugeordnet“) und das Ticketsystem aus S3; Vorlauf von einem halben Tag an echten Mails; doppelte Berechtigungsprüfung nach Plan 10.1 vor dem Einschalten | geplant |
| S2 | Mitarbeiterportal | 5–7 Tage | S0, S1, `ux-umbau` in `main`, Formulare aus S3. Vor S2 zu entscheiden: wie die Anmeldung nach einer Heirat mit neuer Adresse auf den neuen Datensatz übergeht (E-S10, Plan 11.1) | geplant |
| S4 | Welle 1 vollständig | 9–13 Tage | S3; Quelle der Beschäftigungsgruppe | geplant |
| S5 | Betrieb und Einführung | 3–4 Tage | S3 (die Lastansicht zählt Anliegen), für die Einführung S2 | geplant |

Für jedes Paket gilt dieselbe Abnahme: `npm run pruefen` grün, bei Schemaänderungen
`npx prisma validate` und `npx prisma generate` fehlerfrei, die UI-Sperrklinke steigt nicht.

**Unmittelbar als Nächstes:** Pull Request zu S0 prüfen und mergen, Deploy-Ablaufplan schreiben,
Checkliste aus Abschnitt 5 abarbeiten. Parallel kann S1 beginnen; vorher die PATCH-Routen absichern.

## 8 · Wiedereinstieg

### 8.1 Zweige

| Zweig | Stand |
|---|---|
| `main` | `ac3535a`, Merge von PR #4 (Konzeptplan) |
| `feat/selfservice-s0-personalstamm` | S0, `24a8d11`, dazu diese Übergabe. Ob gemergt, zeigt `git log --oneline origin/main` |
| `feat/selfservice-portal-plan` | in PR #4 gemergt, nur noch Historie |
| `ux-umbau` | nicht in `main`; Vorbedingung für S3 und S2 |

**Die neue Sitzung im Ordner `HR_Portal_CREDO` starten.** Die Sitzung vom 17.10.2026 lief
versehentlich im Ordner `Finance_portal`. Ihre Notizen für Claude liegen seither im Gedächtnis des
Projekts HR_Portal_CREDO (`hr-portal-selfservice-stand`, `hr-portal-dokubit-befunde`,
`hr-portal-git-umgebung`). Nur im richtigen Ordner lädt Claude sie, und nur dort lässt sich ein
Pull Request an die Sitzung binden.

### 8.2 Lokale Umgebung

- **Datenbank:** Docker-Container `credo-hr-db-dev` (`postgres:16-alpine`, Port 5433), am 17.10.2026
  neu angelegt. Schema per `npx prisma db push`, Grunddaten per `npx prisma db seed`. Die Testdaten
  aus Abschnitt 4 sind enthalten. Start: `docker start credo-hr-db-dev`.
- **Dev-Server:** wie in `../CLAUDE.md`, Abschnitt „Dev-Umgebung starten“ (dort stehen die
  Umgebungsvariablen und der Testzugang). Zusätzlich vor `npx next dev -p 3000`:

  ```bash
  export PERSONALSTAMM_SECRET="<mindestens 24 Zeichen, nicht gleich CRON_SECRET>"
  # z. B. erzeugen mit: openssl rand -base64 24
  ```

  Ohne gültiges Geheimnis antwortet der Webhook mit 500 „Konfigurationsfehler“.
- **Prüfen:** `npm run pruefen` (Typen, Lint, Tests). Nach Schemaänderungen `npx prisma generate`.
- **Ansicht:** `http://localhost:3000/personen`, angemeldet mit einer der drei HR-Rollen.

### 8.3 Testdaten an den Webhook schicken

`docs/module/selfservice/s0-testdaten.json` enthält elf erfundene Zeilen. Personen, Adressen und
Nummern sind ausgedacht. Im Repo-Ordner, bei laufendem Dev-Server:

```bash
curl -sS -X POST http://localhost:3000/api/webhooks/personalstamm \
  -H "Authorization: Bearer <PERSONALSTAMM_SECRET>" \
  -H "Content-Type: application/json" \
  --data-binary @docs/module/selfservice/s0-testdaten.json
```

Im selben Terminal, in dem das Geheimnis exportiert ist, geht statt des Platzhalters auch
`"Authorization: Bearer $PERSONALSTAMM_SECRET"`. Die Antwort zeigt `summary` und je Zeile `status`
und `code`.

Wofür die Zeilen gedacht sind:

| Zeilen | Fall | Erwartet |
|---|---|---|
| „Anna Beispiel“, drei Verträge | eine Person mit mehreren Anstellungen; Adresse in gemischter Schreibung; Stunden als Text mit Komma; ein kürzlich beendeter, dem Portal unbekannter Vertrag | zwei Verträge angelegt, eine Person; der beendete `uebersprungen` |
| „Bernd Muster“ | einfacher unbefristeter Vertrag | angelegt |
| „Clara Ende“ | beendeter, unbekannter Vertrag | `uebersprungen` |
| „Dora Format“ | Schlüssel `vertragsende` fehlt | `fehler`, `FORMATFEHLER` |
| „Emil Fremd“ | Mandant 999 gibt es im Seed nicht | `fehler`, `MANDANT_UNBEKANNT` |
| „Frank“ und „Franziska Doppel“ | eine Adresse bei zwei Namen | `zweifelsfall`, `EMAIL_ANDERER_NAME`, nichts angelegt |
| zweimal „Jan Schmidt“ | gleicher Name, zwei Adressen, die sich nur in `.` und `_` unterscheiden (Probe gegen `_` als Platzhalter im Datenbankvergleich) | zwei Personen |

Der Erstlauf am 17.10.2026 ergab genau das (Lauf-Eintrag: 5 angelegt, 2 übersprungen,
2 Zweifelsfälle, 2 Fehler). Ob ein Vertrag läuft, hängt vom Tagesdatum ab. Nach dem 31.07.2027 ist
auch der zweite Vertrag von „Anna Beispiel“ beendet, und die Zahlen verschieben sich.

Die Folgefälle aus Abschnitt 4 entstehen durch Abwandeln einzelner Zeilen, etwa eine neue Adresse
(Vertrag wandert), ein neuer Nachname bei allen laufenden Zeilen einer Adresse (Heirat) oder ein
anderer `vertragsbeginn` unter bekanntem Schlüssel (Zweifelsfall). Wer wieder bei null anfangen will,
setzt die lokale Datenbank neu auf (Container neu, `db push`, `db seed`).

### 8.4 Wie Pull Requests hier laufen

- `gh` ist nicht installiert. Der Pull Request entsteht über die vorausgefüllte Vergleichsseite:
  `https://github.com/Penknife5550/HR_Portal_CREDO/compare/main...<zweig>?expand=1&title=…&body=…`
  (Titel und Text URL-kodiert), im Browser mit `open` öffnen. Der Auftraggeber klickt „Create pull
  request“.
- **Gemergt wird per Knopf auf GitHub.** Ein lokaler Merge nach `main` wird von der
  Claude-Code-Sicherheitsprüfung blockiert.
- Gepusht wird nur auf ausdrückliche Freigabe; das Repo ist öffentlich. Deshalb gehören weder Namen
  echter Beschäftigter noch Geheimnisse in Commits, Doku oder Testdaten.
- Nach dem Merge: `git fetch`, dann `git checkout main` und `git pull --ff-only`.

### 8.5 Falle: „ 2“-Duplikate

Der Repo-Ordner liegt auf dem synchronisierten Schreibtisch. Die Synchronisierung legt Kopien mit
„ 2“ im Namen an, auch in `.git` (etwa `refs/heads/main 2`). Ein Ref-Name mit Leerzeichen lässt
`git fetch` mit „bad object“ scheitern. Duplikate in `.next/` können `tsc` stören.

- Am 17.10.2026 wurden 19 Dateien und 2 `.git`-Duplikate nach Prüfung verschoben. Alle waren
  byte-gleich mit dem Original oder in der Git-Historie enthalten.
- Prüfen:
  `find . -path ./node_modules -prune -o -path ./.next -prune -o -name '* 2*' -print` und
  `find .git -name '* 2*'`.
- Vor dem Verschieben mit `cmp` vergleichen und den Auftraggeber fragen. Nicht löschen, sondern in
  eine Sicherung verschieben.
