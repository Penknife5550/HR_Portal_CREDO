# Prüfprotokoll S0 „Personalstamm aus DokuBit“ — Oktober 2026

> **Stand:** 17.10.2026 · Zweig `feat/selfservice-s0-personalstamm`, Commit `24a8d11`
> „Self-Service S0: Personalstamm aus DokuBit“ (beim Schreiben noch nicht gepusht; Push und
> Pull Request folgen)
> **Grundlage:** Konzeptplan Fassung 6, gemergt mit PR #4 (`main` = `ac3535a`); Zustimmung von
> Personalabteilung, DSB und MAV am 17.10.2026
> **Regeln im Detail:** [`s0-personalstamm-n8n.md`](../module/selfservice/s0-personalstamm-n8n.md)
> (Abschnitte 1 und 4) und Plan 5.1 und E-S10
> **Bauvorgabe (Archiv):** [`s0-bauvorgabe-2026-10.md`](s0-bauvorgabe-2026-10.md), dort auch V1–V7
> des Nachtrags v3

Dieses Dokument hält fest, wie der Code von S0 vor dem Commit geprüft wurde: welche Befunde jede
Runde ergab, was aus ihnen wurde und welche Entscheidungen sie ausgelöst haben. Was der Abgleich
heute tut, steht in der n8n-Anleitung. Hier steht, warum er es so tut.

---

## Überblick

### Runden

| Runde | Gegenstand | Prüfer (Blickwinkel) | Befunde C / M / m | `npm run pruefen` danach |
|---|---|---|---|---|
| 1 | Review des ersten Baus | 5: Abgleich, Sicherheit, Oberfläche, Tests, Doku | 40: 2 / 13 / 25 | 243 Suites, 7.377 Tests |
| 2 | Gegenprüfung 1 des korrigierten Baus | 3: Stapel und Reihenfolge, Identität, Zugang | 13: 0 / 3 / 10 | — (führte zum Umbau v3) |
| 3 | Umbau v3 „Die Adresse ist die Person“ und Gegenprüfung | 3: Wandern, Identität, Zugang | 12: 0 / 2 / 10 | 243 Suites, 7.419 Tests |
| 4 | Anschlussregel R2 und Gegenprüfung | 2: Identität, Zugang | 5: 0 / 3 / 2 | 243 Suites, 7.438 Tests |
| 5 | Nachweis F, Zweifelsregel P2 und Gegenprüfung | 2: Identität, Zugang | 7: 0 / 2 / 5 | 244 Suites, 7.483 Tests |
| 6 | Letzte Beginn-Sicherungen | keine eigene Gegenprüfung | — | 244 Suites, 7.487 Tests |
| | **Summe** | | **77: 2 / 23 / 52** | |

C = CRITICAL, M = MAJOR, m = MINOR. Plan E-S10 nennt Runde 2 „zweite Gegenprüfung des S0-Codes“,
weil dort das Review als erste zählt. Der Commit `24a8d11` fasst die Prüfung als drei Review- und
vier Gegenprüfrunden zusammen; dieses Protokoll zählt die Runden nach Gegenstand. Kürzel in diesem
Dokument: Runde.Nummer, also `1.01` bis `5.07`.

### Methode

- **Adversarial und belegt.** Die Prüfer einer Runde arbeiteten parallel, jeder aus einem
  Blickwinkel. Ihr Auftrag war, die Regeln mit konkreten Abläufen zu brechen. Befunde zum
  Verhalten des Codes sind mit Wegwerf-Tests gegen die Test-Datenbank (Fake) belegt. Gegen die
  lokale Dev-Datenbank liefen nur lesende Abfragen; so wurde etwa nachgewiesen, dass Prisma den
  Adressvergleich als unmaskiertes `ILIKE` schickt. Die Wegwerf-Tests sind danach gelöscht, das
  Repository blieb unverändert (geprüft über `git status` und Prüfsummen).
- **Ein Fixer je Runde.** Ab Runde 3 schrieb er jeden Befund zuerst als Test gegen den alten Code
  (der Test musste rot sein), baute dann den Fix und nahm jeden Fix einzeln wieder zurück. Jede
  dieser Proben musste mindestens einen Test rot färben.
- **Mutationstests.** Runde 1 (Prüfer Tests): 78 Mutationen, 53 erkannt; die überlebenden waren
  Testlücken an richtigem Code (1.21–1.25, 1.30). Fixer Runde 1: 7 von 7. Umbau v3: 16 von 16
  (eine erst nach einem ergänzten Test). R2: 10 von 10. F und P2: 21 von 21. Fixer Runde 5: alle
  22 neuen oder verschärften Tests am alten Code rot.
- **Spezifikationsfragen entschied kein Fixer.** Sie gingen an den Auftraggeber oder wurden von
  Claude nach dessen Grundsätzen entschieden (Abschnitt „Entscheidungen“).
- **Plan-HTML:** Nach jeder Änderung wurde die Tag-Bilanz geprüft; zuletzt ausgeglichen, 0 Fehler.

### Endstand

- `npm run pruefen` grün: Typprüfung und Lint ohne Fehler (5 Warnungen, alle in fremden
  Bestandsdateien), 244 Suites, 7.487 Tests.
- Keine offenen CRITICAL- oder MAJOR-Befunde.
- Offen sind die Restrisiken, zwei Punkte, die Plan (E-S10) und Anleitung (Abschnitt 4) als offen
  beim Auftraggeber führen, und Aufgaben außerhalb S0 (beides am Ende).
- Ende-zu-Ende-Lauf gegen eine lokale Postgres-Datenbank mit erfundenen Testdaten und Sichtprüfung
  der Ansicht „Personen“ (Abschnitt unten).

---

## Rahmen: Entscheidungen vor dem Bau

Der Auftraggeber hat am 17.10.2026 nach den DokuBit-Abfragen (vom Auftraggeber über n8n
ausgeführt, nur aggregierte Ergebnisse) festgelegt:

- Eine DokuBit-Zeile ist ein Vertrag. Schlüssel ist Mandant + Abrechnungskreis + MANR; die Person
  wird über die dienstliche Adresse erkannt. Eine Person kann mehrere Anstellungen haben.
- `VERTRAGSENDE` ist der letzte Arbeitstag. Verlängerung oder Entfristung ist eine neue Zeile.
- Rund 340 aktive Beschäftigte passen zum Befund (343 laut DokuBit).
- Löschfrist für das Protokoll des Stammabgleichs: 1 Jahr, mit dem DSB zu bestätigen.
- Die Onboarding-Verknüpfung ist aus S0 herausgenommen.
- Im Portal gibt es bereits Beschäftigtendatensätze unbekannter Herkunft. Die Bestandsprüfung
  (Anleitung Abschnitt 6) läuft vor dem ersten Produktivlauf; für den Bau ist das nicht kritisch.

---

## Runde 1 — Review mit fünf Blickwinkeln

Geprüft wurde der erste Bau nach der Bauvorgabe. **Gehalten hat:** Eine Person mit drei Verträgen
bei drei Mandanten bleibt eine Person und wird erst mit dem letzten Vertrag stillgelegt. Gleiche
MANR bei verschiedenen Mandanten ergibt zwei Personen. „Heute“ ist der Berliner Kalendertag, auch an
beiden Zeitumstellungen. Ein zweiter identischer Lauf ändert nur `lastSyncAt`. Ein interner Fehler
rollt nur seine Zeile zurück. Das Protokoll enthält keine Namen und keine Adressen. Der Webhook
vergleicht das Geheimnis zeitkonstant, verlangt 24 Zeichen, liest höchstens 1 MiB und entfernt
fremde Felder (`.strip()`). SQL, Feldnamen und Code-Knoten der n8n-Anleitung stimmen überein.

**Wichtigster Befund:** Drei Prüfer fanden unabhängig dieselbe Lücke (1.01, 1.06, 1.19). Prisma
macht aus `equals` mit `mode: "insensitive"` ein `ILIKE` ohne Maskierung; ein Unterstrich in der
Adresse passt auf jedes Zeichen. Ein Namensvetter mit `_` statt `.` in der Adresse wäre still der
falschen Person zugeordnet worden. Der Fake verglich exakt und verdeckte das.

| Kürzel | Blickwinkel | Schwere | Befund | Ergebnis |
|---|---|---|---|---|
| 1.01 | Abgleich | MAJOR | Adressvergleich über unmaskiertes `ILIKE` | behoben (Maskierung, Fake bildet `ILIKE` nach); in Runde 3 durch das Personenverzeichnis ohne `ILIKE` ersetzt |
| 1.02 | Abgleich | MAJOR | Beendete Verträge zählen mit; nach jeder Verlängerung werden Namens- und Adressänderungen nie mehr übernommen | behoben über D2; mit v3 abgelöst |
| 1.03 | Abgleich | MAJOR | Ergebnis hängt von der Zeilenfolge ab (Adresswechsel und neuer Vertrag in einer Nacht ergeben eine zweite Person) | behoben: bekannte Verträge zuerst. Ausgelassen: Aktiv-Status erst am Stapelende (nur Protokollrauschen); mit v3 doch umgesetzt |
| 1.04 | Abgleich | MAJOR | Weichen Adresse und Name zugleich ab, wird die Identität umgeschrieben | behoben mit enger Regel (nur bei neuer Adresse, neuem Vor- und Nachnamen gesperrt); die Lücke belegte Runde 2, gelöst durch v3 |
| 1.05 | Abgleich | MINOR | Aktiv-Status zählt das gespeicherte `isActive`, nicht ob der Vertrag läuft | behoben (zusätzlich Ende nicht vor heute) |
| 1.06 | Sicherheit | CRITICAL | `ILIKE` wie 1.01, auch bei der Prüfung auf fremde Adressen | behoben wie 1.01. Dasselbe Muster im Bestand: `src/app/api/webhooks/contract-end/route.ts:100`, offen |
| 1.07 | Sicherheit | MINOR | Ist `PERSONALSTAMM_SECRET` gleich `CRON_SECRET`, öffnet auch dieses den Webhook | behoben: 500 „Konfigurationsfehler“, Test |
| 1.08 | Sicherheit | MINOR | Ansicht lädt über `GET /api/employees` volle Personenzeilen samt privater Adresse, Geburtsdatum, Telefon | behoben: eigene Leseroute `/api/personalstamm/personen` mit `select`, nur die drei HR-Rollen; `GET /api/employees` unverändert |
| 1.09 | Sicherheit | MINOR | PATCH-Routen für Personen und Anstellungen ohne Sperre und Protokoll (Bestand) | ausgelassen: Bestand, trifft gemeinsam genutzte n8n-Abläufe; im Plan als Vorbedingung von S1. **Nachgeholt am 17.10.2026** nach Auskunft des Auftraggebers (kein n8n-Ablauf schreibt dorthin): Schreibschutz `src/lib/personalstamm/schreibschutz.ts`, `SERVICE` schreibt nicht mehr, AuditLog je Änderung; Mutationsprobe 6 von 6 erkannt |
| 1.10 | Oberfläche | MAJOR | Bestandsanstellungen ohne Schlüssel erscheinen als „läuft“ und widersprechen der Status-Pille | behoben: laufende zuerst, beendete gedämpft, Zusatz „Bestand, zählt nicht für den Status“ |
| 1.11 | Oberfläche | MAJOR | Meldungen unter „Zu prüfen“ lassen sich keiner Zeile zuordnen; die Suche nach einer MANR trifft die LOGA-Nummer | behoben: Schlüssel je Anstellung sichtbar, Suche über die MANR der Verträge. Ausgelassen: Mandantenname in „Zu prüfen“ |
| 1.12 | Oberfläche | MINOR | Rote Hinweiszeile nur 4,14:1 Kontrast | ausgelassen: Hausmuster; Hausentscheidung offen |
| 1.13 | Oberfläche | MINOR | Laden und Treffer werden Screenreadern nicht angesagt, Liste ohne Überschrift | behoben (`role="status"`, `aria-busy`, Caption, Überschriften) |
| 1.14 | Oberfläche | MINOR | Tabelle springt beim Nachladen | behoben: Zeilen bleiben gedämpft stehen. Ausgelassen: Scrollen an den Listenanfang |
| 1.15 | Oberfläche | MINOR | Formatfehler-Zeilen werden über Stapel zusammengezählt | behoben: je Lauf, mit Zeilennummer im Stapel |
| 1.16 | Oberfläche | MINOR | Viele Anstellungen ohne Gewichtung | teilweise behoben (sortiert, gedämpft). Ausgelassen: Einklappen |
| 1.17 | Oberfläche | MINOR | Datenminimierung wie 1.08 | behoben wie 1.08 |
| 1.18 | Oberfläche | MINOR | Fehlerzustand ohne erneuten Versuch | behoben: „Erneut laden“, Blätterleiste bleibt |
| 1.19 | Tests | CRITICAL | Fake vergleicht exakt und verdeckt `ILIKE` | behoben (Fake, Tests mit Unterstrich) |
| 1.20 | Tests | MAJOR | `vertragsende ?? null` im n8n-Code-Knoten macht aus einer fehlenden Spalte „unbefristet“; kürzlich Ausgeschiedene würden still reaktiviert | behoben in Anleitung und JSON-Vorlage |
| 1.21 | Tests | MAJOR | Reaktivieren (Anschlussvertrag, inaktiver Altbestand) ungetestet | behoben, zwei Tests |
| 1.22 | Tests | MAJOR | Stilllegung über eine Zweifelsfall-Zeile ungetestet | behoben |
| 1.23 | Tests | MAJOR | Aktiv-Status nur für DokuBit-Personen ungetestet | behoben (über den D1-Test) |
| 1.24 | Tests | MAJOR | Konfliktprüfung ohne gemischte Schreibung getestet | behoben; der Code entfiel mit v3 |
| 1.25 | Tests | MINOR | Zählweise der verwalteten Verträge ungetestet | behoben über die D2-Tests |
| 1.26 | Tests | MINOR | Auffrischen des Vertragsbeginns ungetestet; ein Zweig unerreichbar | behoben: Test, toter Zweig entfernt |
| 1.27 | Tests | MINOR | Kommentar „von Hand angelegte Person wird nie überschrieben“ stimmt nicht | behoben: stimmt durch D1 |
| 1.28 | Tests | MINOR | Zahlen und Texte gehören nach `constants.ts` | behoben nach D4 |
| 1.29 | Tests | MINOR | `PERSONALSTAMM_FEHLERCODES` ungenutzt, zweite Wahrheit | behoben: entfernt |
| 1.30 | Tests | MINOR | Grenzwerte ungetestet (24 Zeichen, MANR 20, Abrechnungskreis 50, Namen 100) | behoben |
| 1.31 | Tests | MINOR | Abfrage des letzten Laufs und gelber Hinweistext ungeprüft | behoben |
| 1.32 | Tests | MINOR | Protokolldetails nur mit `toMatchObject` geprüft | behoben (`toEqual`); die Aktion entfiel mit v3 |
| 1.33 | Tests | MINOR | Format des Vertragsschlüssels doppelt gebaut | behoben: eine Quelle in `validations/personalstamm.ts` |
| 1.34 | Doku | MAJOR | Adresse mit zwei Namen: die erste Zeile legt still an, nur die zweite wird gemeldet | behoben in Code und Doku: keine Anlage, wenn eine Adresse im Stapel mehrere Namen hat |
| 1.35 | Doku | MAJOR | „Batching“ im HTTP-Knoten ist nicht nacheinander; überlappende Stapel ergeben still einen falschen Aktiv-Status | behoben: „Loop Over Items“ mit Größe 1; JSON-Vorlage nicht live getestet |
| 1.36 | Doku | MINOR | Nachträglich eingetragenes Ende älter als 30 Tage oder gelöschte Zeile erreicht das Portal nie | behoben: Anleitung Abschnitte 2 und 5 |
| 1.37 | Doku | MINOR | Zwei Quellen für den Hauptarbeitgeber im Plan | behoben: offene Wahl vor S3 |
| 1.38 | Doku | MINOR | Herleitung der Zahl 600 unbelegt | behoben: als Schätzung formuliert |
| 1.39 | Doku | MINOR | Bereinigung bei `EMAIL_MEHRDEUTIG` verweist auf einen nur lesenden Abschnitt | behoben: Weg über `PATCH`, Warnung vor `DELETE` |
| 1.40 | Doku | MINOR | n8n-Anleitung fehlt im Index `docs/README.md` | behoben |

**Festlegungen für die Fixrunde (D1–D4).**
- **D1:** Ein bekannter Vertrag an einer Person mit Quelle `MANUELL` oder einer fremden Quelle
  (z. B. LOGA) lässt die Person unberührt (Adresse, Name, Aktiv-Status) und wird gemeldet
  (`MANUELLER_DATENSATZ`, `FREMDE_QUELLE`).
- **D2:** Adresse und Name nur im Konsens aller laufenden Verträge übernehmen. Mit v3 abgelöst.
- **D3:** „Noch keine Personen“ nur, wenn es gar keine Person gibt; sonst „Keine Treffer“.
- **D4:** Konstanten nach Bestandsmuster: fachliche Werte nach `constants.ts`, technische Grenzen
  bleiben lokal.

---

## Runde 2 — Gegenprüfung 1

Geprüft wurde der Stand nach Runde 1. **Gehalten hat:** Rückordnung der Ergebnisse, Zusammenfassung,
„bekannte zuerst“, Formatfehler und leere Stapel legen niemanden still, der Code-Knoten hält alle
Zeilen einer Adresse in einem Stapel, die Maskierung wirkt (lesend gegen die Dev-Datenbank
bestätigt).

**Nicht gehalten haben die Regeln zur Identität.** Die Konsens-Regel (D2) und der enge
Identitätsschutz (1.04) schrieben in Einzelfällen einen Datensatz auf einen anderen Menschen um:
bei einer in DokuBit versehentlich bearbeiteten falschen Zeile, bei einem wiederverwendeten
Vertragsschlüssel, bei einem geteilten Postfach. Nach der Korrektur in DokuBit heilte das nicht.
Daraus folgte die Entscheidung des Auftraggebers „Die Adresse ist die Person“ und die Bauvorgabe
v3 (V1–V7). Sie deckt jeden Befund dieser Runde mit einem Pflichttest ab.

| Kürzel | Blickwinkel | Schwere | Befund | Ergebnis |
|---|---|---|---|---|
| 2.01 | Stapel | MAJOR | Konsens ist bei leerem Stand vor dem Lauf immer wahr; bei einer stillgelegten Person kippt die Adresse jede Nacht hin und her | v3: Adresse wird nie umgeschrieben; umbenannt nur mit mindestens einem laufenden Vertrag vor dem Lauf |
| 2.02 | Stapel | MINOR | Doppelte Vertragsschlüssel im Stapel werden nicht erkannt, der Endstand hängt von der Folge ab | v3 V1.2: alle Zeilen `FORMATFEHLER` mit `feld` = `schluessel` (Test V7.11) |
| 2.03 | Stapel | MINOR | Zeilen mit Formatfehler fehlen bei „Adresse mit mehreren Namen“; die Sperre lässt sich umgehen | v3 V1.1/V1.3: auch ungültige Zeilen werden locker gelesen (V7.12) |
| 2.04 | Stapel | MINOR | Stand vor dem Lauf zählt Verträge anders als der Aktiv-Status | v3 V1.6: dieselbe Bedingung |
| 2.05 | Stapel | MINOR | Ein NUL-Zeichen kippt den ganzen Aufruf ohne Lauf-Eintrag; die n8n-Schleife bricht ab | v3: Steuerzeichen sind `FORMATFEHLER`, Lauf-Eintrag immer (V7.13) |
| 2.06 | Identität | MAJOR | Adresswechsel eines bekannten Vertrags ohne Prüfung auf geteilte Adresse; ein fremdes Postfach wandert still auf eine Person | v3 V2.d: bekannter Vertrag bleibt, wird nur aufgefrischt (V7.6) |
| 2.07 | Identität | MAJOR | Identitätsschutz greift nicht bei gleichem Vornamen oder Zeile ohne Adresse; zwei Menschen werden dauerhaft zusammengeführt | Entscheidung „Die Adresse ist die Person“; eine Zeile ohne Adresse ändert nie einen Namen (V7.4, V7.5, V7.9) |
| 2.08 | Identität | MINOR | Konflikt mit fremder Adresse hält die Namensübernahme nicht auf | v3: Konfliktcode entfallen, der Vertrag wandert zur Person mit der Adresse (V7.4) |
| 2.09 | Identität | MINOR | Gespeicherte Adresse mit Leerzeichen wird nicht gefunden (`ILIKE` trimmt nicht) | v3 V1.4: Personenverzeichnis in JS, getrimmt und kleingeschrieben; kein `ILIKE` mehr (V7.8) |
| 2.10 | Identität | MINOR | Wie 2.03, aus Sicht des geteilten Postfachs | v3 V1.3 (V7.12) |
| 2.11 | Zugang | MINOR | Sperre „Adresse mit mehreren Namen“ verhindert den Anschluss, der beendete Vorgänger legt die Person still | v3 V4: Schutz vor falscher Stilllegung (V7.6) |
| 2.12 | Zugang | MINOR | Ungültige Adresse in der Kündigungszeile eines bekannten Vertrags: das Ende kommt nie an | v3 V2.b: Vertrag wird trotzdem aufgefrischt (V7.10) |
| 2.13 | Zugang | MINOR | Vorlauf und Lauf-Eintrag ungeschützt; ein Fehler kippt den Stapel ohne Protokoll | v3 V1.7, V5: Vorlauf in try/catch, Lauf-Eintrag mit zweitem Versuch (V7.14) |

Als **Restrisiko ohne Befund** benannte der Prüfer Identität: Vergibt Microsoft 365 eine Adresse
mit gleichem Namen neu, ist das ohne Geburtsdatum in DokuBit von einer Wiedereinstellung nicht zu
unterscheiden.

---

## Runde 3 — Umbau v3 und Gegenprüfung

**Umbau.** `abgleich.ts` ist weitgehend neu geschrieben. Ein Vorlauf in try/catch liest alle
Zeilen, auch ungültige, und den Stand vor dem Lauf. Personen werden über ein Verzeichnis nach
getrimmter, kleingeschriebener Adresse gefunden. Nennt ein laufender Vertrag eine andere Adresse,
wandert er (`PERSONALSTAMM_VERTRAG_UMGEZOGEN`, ohne Namen und Adressen). Der Aktiv-Status wird
einmal am Stapelende berechnet, mit Schutz vor falscher Stilllegung. Der Lauf-Eintrag wird immer
geschrieben. Entfallen sind `EMAIL_ABWEICHEND`, `EMAIL_KONFLIKT`, `NAME_ABWEICHEND` und die Aktion
`EMAIL_GEAENDERT`. 21 Pflichtfälle, jeder mit einer Wiederholung, die nichts ändern darf; die alten
Tests sind umgeschrieben, nicht gelöscht. Plan und Anleitung wurden nachgeführt, danach Code und
Doku gegeneinander geprüft.

**Gehalten hat:** Innerhalb eines Stapels ist der Endzustand unabhängig von der Zeilenfolge und
wiederholbar (6 Szenarien mit allen Folgen). Kein Protokolleintrag enthält Namen oder Adressen.
Der Lauf-Eintrag entsteht auch bei Totalausfall.

| Kürzel | Blickwinkel | Schwere | Befund | Ergebnis |
|---|---|---|---|---|
| 3.01 | Wandern | MAJOR | Schutz vor Stilllegung prüft nur die Adresse; bei Nachfolger oder geteiltem Postfach bleibt eine Ausgeschiedene aktiv | behoben: Schutz nur, wenn die blockierte Zeile Adresse **und** Namen der Person trägt |
| 3.02 | Wandern | MINOR | Umbenennen nach einem Umzug im selben Lauf erst im zweiten Lauf (nicht wiederholbar) | im Code ausgelassen (genauer Fix nicht risikoarm); dokumentiert, Test über drei Läufe. Kein Pendeln |
| 3.03 | Wandern | MINOR | Doppelter Schlüssel über Stapelgrenzen: der Vertrag pendelt jede Nacht | behoben im n8n-Code-Knoten: Gruppen mit gemeinsamem Schlüssel werden zusammengelegt |
| 3.04 | Wandern | MINOR | Doppelter Schlüssel mit fehlerhaftem Zwilling: die gültige Zeile wird verarbeitet | behoben: gezählt über alle Zeilen |
| 3.05 | Wandern | MINOR | Konsens erlaubt einen ganz anderen Namen (Spezifikation) | behoben als Verengung „Vor- oder Nachname bleibt“; vom Auftraggeber als R1 bestätigt |
| 3.06 | Wandern | MINOR | Heirat plus Anschluss nach dem Ende des Vorgängers wird nie zugeordnet (Spezifikation) | ausgelassen, Frage an den Auftraggeber; daraus R2 (Runde 4) |
| 3.07 | Identität | MINOR | Schutz hält länger als sein Grund | behoben über 3.01 und 3.10. Teil (a) „nur unbekannte Verträge schützen“ verworfen: die Namensprüfung genügt |
| 3.08 | Identität | MINOR | Wie 3.04 | behoben wie 3.04 |
| 3.09 | Identität | MINOR | Zwei gleichzeitige Läufe legen für einen umziehenden Vertrag dieselbe Adresse doppelt an | behoben anders als vorgeschlagen: Aufrufe laufen in einer Kette nacheinander statt mit Datenbanksperre (ein Prozess) |
| 3.10 | Zugang | MAJOR | Schutz verhindert eine nötige Stilllegung dauerhaft; nach dem 30-Tage-Fenster wird die Person nie wieder bewertet | behoben: bewertet wird auch jede Person, deren Adresse in einer verarbeiteten Zeile steht |
| 3.11 | Zugang | MINOR | Fehlerzeilen schützen nicht; die Zusage „eine fehlerhafte Zeile legt niemanden still“ stimmte nicht | Zusage in Kopfkommentar, Anleitung und Plan berichtigt; Test: Stilllegung, nach Behebung reaktiviert |
| 3.12 | Zugang | MINOR | Ein einzelnes UTF-16-Surrogat kippt den Stapel | behoben: `FORMATFEHLER`, Fake lehnt wie Prisma ab |

---

## Runde 4 — Anschlussregel R2 und Gegenprüfung

**Bau.** R2 benennt eine DokuBit-Person ohne laufenden Vertrag um und hängt den Anschluss an, wenn
(a) die Quelle DokuBit ist, (b) der Vorname bleibt, (c) das jüngste Ende höchstens 30 Tage zurückliegt
(`PERSONALSTAMM_ANSCHLUSS_TAGE`), (d) alle Zeilen der Adresse denselben Namen tragen und (e) die Zeile
läuft. Neuer Testblock mit 9 Fällen, 10 Mutationen erkannt.

**Gehalten hat:** Berliner Mitternacht als Fenstergrenze, Zeitumstellung, jüngstes Ende bei mehreren
Verträgen, Zusammenspiel mit Schutz und Wandern.

| Kürzel | Blickwinkel | Schwere | Befund | Ergebnis |
|---|---|---|---|---|
| 4.01 | Identität | MAJOR | (d) schützt nur, wenn die beendete Zeile der Vorgängerin unter derselben Adresse kommt. Ohne Adresse, mit anderer oder gelöscht, übernimmt eine Nachfolgerin mit gleichem Vornamen den Datensatz | Code zunächst nicht geändert (wäre Abweichung von R2), Doku berichtigt, Restrisiko-Tests; Frage an den Auftraggeber, daraus F (Runde 5) |
| 4.02 | Identität | MINOR | Vergibt DokuBit den Schlüssel samt Postfach an eine Nachfolgerin mit gleichem Vornamen neu, benennt R2 um | nur Doku; geschlossen durch P2 und den Beginn als Merkmal (Runde 5) |
| 4.03 | Zugang | MAJOR | Wie 4.01 aus Sicht des Zugangs: die Nachfolgerin erhielte ab S1 den Datensatz der Vorgängerin | wie 4.01 |
| 4.04 | Zugang | MAJOR | Dokumentierter Ausweg falsch: ein `PATCH` des Namens hilft nicht, solange die alte Zeile mit altem Namen kommt | behoben: Abhilfe ist der neue Name auch an der alten Zeile in DokuBit; `PATCH` nur für Restfälle |
| 4.05 | Zugang | MINOR | (c) nur aus dem Stand vor dem Lauf; ein korrigiertes Ende wirkt erst im zweiten Lauf | behoben: Ende in der Transaktion der Zeile gelesen; seit F aus der Zeile im Stapel selbst |

Der Fixer meldete zusätzlich: Wird ein Schlüssel samt Postfach später als 30 Tage nach dem Ende neu
vergeben, läuft der Vertrag wieder bei der ausgeschiedenen Person, und sie wird reaktiviert. Das
war Anlass für P2.

---

## Runde 5 — Nachweis F, Zweifelsregel P2 und Gegenprüfung

**Bau.** F: R2 greift nur, wenn im Stapel unter derselben Adresse die Zeile eines Vertrags kommt, der
vor dem Lauf an der Person hing, und diese Zeile ihn im Fenster enden lässt. P2: Ein Zweifelsfall
oder Fehler bei einem bekannten Vertrag verschafft nie Zugang; das Ende kommt immer an, ein im
Portal nicht laufender Vertrag bleibt unberührt. Beides sitzt an je einer zentralen Stelle. 27 neue
Tests, 21 Mutationen erkannt.

**Gehalten hat:** F wurde gezielt angegriffen (Nachweis aus doppeltem Schlüssel, Formatfehler,
ungültiger Adresse, fremdem Vertrag, laufender Zeile, Ende heute, wechselnde Reihenfolge,
Altbestand, `MANUELL`, LOGA). Ein Weg, über R2 einen Datensatz umzuschreiben, ohne dass DokuBit die
alte Zeile mit umbenennt, fand sich nicht.

| Kürzel | Blickwinkel | Schwere | Befund | Ergebnis |
|---|---|---|---|---|
| 5.01 | Identität | MAJOR | Bei im Portal noch laufendem Vertrag übernimmt eine Zweifelszeile ein späteres oder leeres Ende; die Vorgängerin bliebe dauerhaft aktiv | behoben: im Zweifel nie verlängern oder entfristen; ein früheres Ende kommt an |
| 5.02 | Identität | MINOR | R1 benennt um, wenn ein Schlüssel samt Postfach vorab neu vergeben wird und der Name einen Teil teilt (Entscheidungsfrage) | Doku berichtigt; in Runde 6 entschieden: Konsens nur mit gespeichertem Beginn |
| 5.03 | Identität | MINOR | Eine Zeile, die P2 unverändert lässt, schützt weiter vor Stilllegung (Entscheidungsfrage) | Code nicht geändert: Der Schutz greift weiter, wie seit 3.01 nur bei eigener Adresse und eigenem Namen. Nach Runde 6 von Claude nach den Grundsätzen entschieden: Er greift weiter, weil er nur einen bestehenden Zugang aufrechthält (Plan E-S10, Anleitung Abschnitt 4) |
| 5.04 | Identität | MINOR | Schutz hängt von den Stapelgrenzen ab, wenn die alte Zeile ohne Adresse kommt | behoben mit 5.07 |
| 5.05 | Zugang | MAJOR | Ein neu vergebener Schlüssel dient als Nachweis für F; eine beendende Zweifelszeile übernimmt Beginn, Stunden und Organisation der Nachfolgerin | behoben: beendende Zweifelszeile schreibt nur Ende und Aktiv-Stand; als Nachweis zählt nur eine Zeile mit gespeichertem Beginn; im Zweifel wird der Beginn nie geändert |
| 5.06 | Zugang | MINOR | Eine Zweifelszeile frischt einen laufenden Vertrag mit Daten eines anderen Menschen auf (Entscheidungsfrage) | Zugangsteil mit 5.01 behoben; Stunden und Organisation in Runde 6 entschieden |
| 5.07 | Zugang | MINOR | Eine Zeile ohne Postfach landet in einer eigenen n8n-Gruppe und legt die Person still, bevor ihr Anschluss sie schützen kann | behoben: Code-Knoten gruppiert zusätzlich über den Namen; neuer Test `personalstamm-n8n-stapel.test.ts` prüft Anleitung und Vorlage auf Gleichstand |

---

## Runde 6 — Letzte Beginn-Sicherungen

Beantwortet die drei offenen Fragen aus Runde 5 nach den Grundsätzen des Auftraggebers; 5.03 ohne
Codeänderung (der Schutz bleibt, er hält nur einen bestehenden Zugang aufrecht):

- `imKonsens` verlangt, dass jede Konsens-Zeile den gespeicherten Vertragsbeginn nennt. Mit anderem
  Beginn ist der Schlüssel vermutlich neu vergeben; dann wird gemeldet statt umbenannt (5.02).
- `vertragsAenderung` übernimmt im Zweifel bei anderem Beginn weder Stunden noch Organisation (5.06).
- Neuer Testblock „Anderer Beginn: Schlüssel vermutlich neu vergeben“, mit Gegenprobe (Heirat mit
  gespeichertem Beginn benennt um).

Eine eigene Gegenprüfrunde gab es dafür nicht. Abgesichert ist der Stand durch die Tests (244 Suites,
7.487 Tests) und den Ende-zu-Ende-Lauf.

---

## Entscheidungen aus den Befunden

Alle am 17.10.2026.

| Entscheidung | Inhalt | Anlass | Wer |
|---|---|---|---|
| „Die Adresse ist die Person“ | Ein Datensatz wird nie auf einen anderen Menschen umgeschrieben. Nennt ein laufender Vertrag eine andere Adresse, wandert er. Heirat mit neuer Adresse ergibt einen neuen Datensatz; die Verknüpfung alter Anliegen folgt in S3 | 2.06, 2.07, 2.08 (1.04) | Auftraggeber |
| R1 | Umbenannt wird nur, wenn Vor- oder Nachname bleibt | 3.05 | Auftraggeber |
| R2 | Anschluss nach dem jüngsten Ende: höchstens 30 Tage, Vorname gleich | 3.06 | Auftraggeber |
| F | R2 nur mit Nachweis am alten Vertrag unter derselben Adresse | 4.01, 4.03 | Auftraggeber |
| P2 | Zweifelsfälle verschaffen nie Zugang; das Ende kommt immer an | 4.02 und Beobachtung des Fixers in Runde 4 | Auftraggeber |
| D1 | Bekannter Vertrag an einer Person mit Quelle `MANUELL` oder LOGA: Person unberührt, Meldung | 1.27 | Claude |
| Leserechte | Leserouten „Personen“ und „Zu prüfen“ nur für die drei HR-Rollen, ohne `SERVICE` | 1.08 | Claude |
| Eigener Leseendpunkt | `/api/personalstamm/personen` mit `select` statt `GET /api/employees` (Datenminimierung) | 1.08, 1.17 | Claude |
| Schutz vor Stilllegung | Nur bei eigener Adresse **und** eigenem Namen; neu bewertet wird auch jede Person, deren Adresse im Stapel steht | 3.01, 3.10 | Claude |
| Beginn als Merkmal | Als Nachweis nach F zählt nur eine Zeile mit dem gespeicherten Beginn, und im Zweifel wird der Beginn nie geändert; umbenannt wird nur, wenn die Konsens-Zeilen den gespeicherten Beginn nennen; im Zweifel mit anderem Beginn keine Stunden und keine Organisation | 5.05, 5.02, 5.06 | Claude |

Die von Claude entschiedenen Punkte folgen den Grundsätzen des Auftraggebers: nie eine Identität
umschreiben, im Zweifel melden, ein Zweifel verschafft keinen Zugang. Offen beim
Auftraggeber sind, wie in Plan (E-S10) und Anleitung (Abschnitt 4) vermerkt, zwei Punkte: ob der
Schutz vor Stilllegung auch greift, wenn der eigene Vertrag im Portal schon beendet ist (5.03; der
Code tut es heute), und das verbleibende Restrisiko zu R1 (Restrisiko 2).

---

## Ende-zu-Ende-Prüfung und Sichtprüfung

**Umgebung.** Lokaler Container `credo-hr-db-dev` (`postgres:16-alpine`, Port 5433), am 17.10.2026
neu angelegt, Schema per `prisma db push`, Seed eingespielt. Dev-Server wie in `../CLAUDE.md`
beschrieben, zusätzlich `PERSONALSTAMM_SECRET` (mindestens 24 Zeichen, nicht gleich `CRON_SECRET`).
Werte stehen nicht in diesem Dokument. (Nachtrag 18.10.2026: `../CLAUDE.md` ist eine Datei außerhalb
des Repos; die Einrichtung ohne sie steht in
[`docs/entwicklung/lokale-umgebung.md`](../entwicklung/lokale-umgebung.md).)

**Testdaten.** [`s0-testdaten.json`](../module/selfservice/s0-testdaten.json), elf erfundene
Zeilen, keine echten Beschäftigten: eine Person mit drei Verträgen bei
verschiedenen Mandanten, gleiche MANR bei zwei Menschen, beendete Verträge, fehlendes Vertragsende,
unbekannter Mandant, geteiltes Postfach, Unterstrich in der Adresse.

| Fall | Ergebnis |
|---|---|
| Erstlauf | 5 Verträge angelegt; 2 übersprungen, 2 Zweifelsfälle, 2 Fehler |
| Wiederholung desselben Stapels | unverändert |
| Ende eines von zwei laufenden Verträgen | Person bleibt aktiv |
| Adresswechsel beim einzigen laufenden Vertrag | Vertrag wandert zu einer neu angelegten Person; die alte hat keinen laufenden Vertrag mehr und wird stillgelegt |
| Heirat bei gleicher Adresse | umbenannt |
| Neu vergebener Schlüssel mit anderem Beginn | Zweifelsfall (`EMAIL_ANDERER_NAME`), nichts umgeschrieben |

Jeder Fall war ein Aufruf. Die lokale Datenbank hält danach 6 Lauf-Einträge, 5 Personen aus DokuBit
(4 aktiv) und 5 verwaltete Anstellungen.

**Sichtprüfung.** Ansicht „Personen“ im Browser auf dem Desktop und bei 375 px Breite.

**Hinweis zur Prüfumgebung.** Der Repo-Ordner liegt auf dem synchronisierten Schreibtisch; dort
entstehen Duplikate mit „ 2“ im Namen, auch in `.git` und `.next/types`. Solche Dateien ließen die
Typprüfung scheitern. Sie wurden nach Prüfung verschoben, nicht gelöscht (alle byte-gleich oder in
der Git-Historie enthalten).

---

## Restrisiken

1. **Fehlerhafte Umbenennung in DokuBit.** Benennt DokuBit die Zeile des alten Vertrags fälschlich
   auf eine Nachfolgerin mit gleichem Vornamen um, ohne den Beginn zu ändern, ist das von einer
   Heirat nicht zu unterscheiden. R2 und F greifen, der Datensatz wird umgeschrieben.
2. **Vorab neu vergebener Schlüssel mit gleichem Beginn.** Teilt der neue Name Vor- oder Nachnamen
   und nennt die überschriebene Zeile den gespeicherten Beginn, gilt das als Heirat (R1). Mit
   anderem Beginn wird seit Runde 6 gemeldet.
3. **Schutz vor Stilllegung als Ausnahme von P2.** Eine zweifelhafte laufende Zeile mit eigener
   Adresse und eigenem Namen hält die Person aktiv, solange sie kommt, auch wenn ihr Vertrag im
   Portal schon beendet ist. So entschieden (5.03): Sie hält nur einen bestehenden Zugang aufrecht.
4. **Überschriebene Zeile ohne Ende.** Überschreibt DokuBit die Zeile eines unbefristeten Vertrags
   für einen anderen Menschen, ohne ein Ende einzutragen, erfährt das Portal das Ende nie. Die Person
   bleibt aktiv, bis der Zweifel aufgelöst ist.
5. **Außerhalb des 30-Tage-Fensters.** Ein nachträglich eingetragenes Ende, das älter als 30 Tage
   ist, und eine gelöschte Zeile erreichen das Portal nicht. Auffällig wird das nur über die
   Hinweiszeile „nicht geliefert“ (Anleitung Abschnitt 2).
6. **Fehlerhafter Anschluss.** Scheitert der laufende Anschluss an einem Fehler (Format, Mandant,
   Ausnahme), während der Vorgänger beendet ankommt, wird die Person bis zur Behebung stillgelegt.
7. **Name nach Umzug.** Zieht im selben Lauf ein Vertrag zu einer neuen Adresse, folgt der Name am
   alten Datensatz erst im nächsten Lauf.
8. **Wiederverwendete Microsoft-365-Adresse mit gleichem Namen** ist von einer Wiedereinstellung
   nicht zu unterscheiden; die alte Person wird reaktiviert.
9. **Stapelbildung.** Wächst eine Gruppe im Code-Knoten über 200 Zeilen, bricht der Knoten ab
   (dokumentiert).
10. **Gleichzeitige Aufrufe** laufen nur innerhalb eines Prozesses nacheinander. Bei mehreren
    Containern wäre das neu zu bewerten.
11. **Testgrundlage.** Der Fake bildet Sperren und Isolation der Datenbank nicht nach. Der
    Ende-zu-Ende-Lauf fand einmal lokal statt, nicht gegen echte DokuBit-Daten.

---

## Offen

**Vor dem ersten Produktivlauf**
- E-S25 (Gremium der drei GmbHs, ggf. Betriebsrat statt MAV) und E-S27 (DSG-EKD oder BDSG je
  juristische Person) entscheiden.
- Löschfrist des Protokolls (1 Jahr) mit dem DSB bestätigen.
- Bestandsprüfung der Portal-Datenbank (Anleitung Abschnitt 6) und Checkliste (Abschnitt 7).
- n8n-Importvorlage (Schleife, Gruppierung über Adresse, Schlüssel und Name) gegen eine echte
  n8n-Instanz testen.

**Außerhalb S0**
- Vertragsende-Webhook (`src/app/api/webhooks/contract-end/route.ts`): ordnet allein über die MANR
  zu und nutzt den unmaskierten `ILIKE`-Vergleich (Z. 100); eigene Aufgabe vorgeschlagen.
- Schreibrouten der Beschäftigtendaten vor S1 absichern (1.09): erledigt am 17.10.2026.
- `GET /api/employees` liefert volle Datensätze (S0 nutzt die eigene Leseroute).
- `EVTLLDA`: Bedeutung klärt die Personalabteilung; das Platzhalter-Label „Evtl. letzter
  Arbeitstag“ ist vermutlich falsch.
- `BESCHAEFTIGUNGSGRUPPE` ist in DokuBit leer; S4 braucht eine andere Quelle.
- Kontrast der roten Hinweiszeile (1.12): Hausentscheidung.
- Vor S2: wie die Anmeldung nach einer Heirat mit neuer Adresse auf den neuen Datensatz übergeht.
  Vor S3: Verknüpfung der Anliegen am alten Datensatz und Quelle des Hauptarbeitgebers.

---

Die Rohdaten der Runden (Befundlisten der Prüfer, Berichte der Fixer, Mutationsskripte, Logs)
lagen im Arbeitsverzeichnis der Sitzung außerhalb des Repositorys und sind nicht archiviert.
Maßgeblich sind dieses Protokoll, die archivierte Bauvorgabe, der Commit `24a8d11` und die Tests.
