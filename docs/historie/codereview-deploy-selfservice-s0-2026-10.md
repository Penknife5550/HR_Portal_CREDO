# Prüfprotokoll Ablaufplan „Server-Update mit Self-Service S0“ — Oktober 2026

> **Stand:** 18.10.2026 · Zweig `fix/verbeamtung-kacheln-deploy-s0` (PR #6, gemergt am 18.10.2026 als `82b58ce`) · Gegenstand:
> [`deploy-selfservice-s0-2026-10.md`](deploy-selfservice-s0-2026-10.md)
> **Grundlage:** `main` = `a43aa25` (S0, PR #5), Code-Stand des Deploys `0e1d8de` (Fix der
> Status-Kacheln der Verbeamtung)
> **Geprüft wurde nur das Dokument.** Auf dem Server lief nichts; der Plan ist am 18.10.2026 noch nicht
> ausgeführt (Nachtrag im Kopf des Ablaufplans).

Dieses Dokument hält fest, wie der Ablaufplan vor dem Commit geprüft wurde: welche Befunde jede Runde
ergab und was aus ihnen wurde. Was am Deploy-Tag zu tun ist, steht im Ablaufplan. Hier steht, warum
er an diesen Stellen so aussieht.

---

## Überblick

### Runden

| Runde | Gegenstand | Prüfer (Blickwinkel) | Befunde W / k | Ergebnis |
|---|---|---|---|---|
| 1 | Entwurf vom 17.10.2026 (Ziel noch `a43aa25`) | 3: Befehle, Ablauf, Vollständigkeit | 23: 10 / 13 | alle bestätigt und umgesetzt; 6 Teilvorschläge mit Grund verworfen |
| 2 | Nachführen auf den Code-Stand `0e1d8de` (18.10.2026) | 2: feste Stände (Hashes), Inhalt | 11: 4 / 7 | alle bestätigt und umgesetzt, nichts verworfen |
| | **Summe** | | **34: 14 / 20** | kein Befund offen |

Dazu der Abschnitt „Nachtrag 18.10.2026“ nach Runde 2 (Ausnahme in 3.2, Gegenprüfung der
Doku-Nachträge, Probe).

W = wichtig, k = klein. Einen kritischen Befund gab es in keiner Runde. Mehrere Prüfer fanden
dieselbe Lücke unabhängig; solche Befunde stehen einzeln in der Tabelle und haben dasselbe Ergebnis.
Kürzel in diesem Dokument: Runde.Nummer, also `1.01` bis `2.11`.

### Methode

- **Ein Entwurf, dann parallele Prüfer.** Jeder Prüfer las den Plan aus einem Blickwinkel und
  belegte seine Befunde an der Quelle: Code, `Dockerfile`, `entrypoint.sh`, `docker-compose.yml`,
  frühere Ablaufpläne und Git-Historie.
- **Eine Überarbeitung je Runde.** Sie prüfte jeden Befund an der Quelle nach und setzte ihn um oder
  verwarf ihn mit Grund. Fragen, die nur der Auftraggeber entscheiden kann, gingen an ihn.
- **Lokal nachgerechnet, nur lesend.** Alle SQL-Abfragen des Plans (19 im Entwurf) liefen mit
  `default_transaction_read_only` gegen die Entwicklungsdatenbank. Per Skript geprüft: Jeder
  Befehlskasten hat genau eine Zeile und höchstens ein Sternchen. Die Git-Befehle aus 3.2 und 8.1
  liefen gegen das Repo und in einem Wegwerf-Klon. Dort wurden der Doku-Commit und ein Merge wie über
  GitHub (`--no-ff`) nachgestellt, außerdem ein Squash-Merge als Gegenprobe.
- **Nicht gegen den Server.** Was nur dort messbar ist, steht im Kopf des Plans unter „Nicht gemessen“
  und unten bei den Restrisiken.

---

## Runde 1 — Entwurf mit drei Blickwinkeln

**Entwurf.** Elf Abschnitte (0 bis 10), 119 Befehlskästen, zwei Etappen: Etappe 1 rollt den Code aus
und lässt S0 ruhend, Etappe 2 nimmt es erst nach den Freigaben in Betrieb. Annahmen des Entwurfs:
Der Server steht noch auf dem Stand vom 14.10.2026 (sonst STOPP in 1.1/1.2). Das Rückfall-Etikett
wird über die gekürzte Image-ID gesetzt. Startprotokoll und Schema-Vorschau sind aus Code und Schemas
abgeleitet, eine Generalprobe mit gebautem Image gab es nicht. `PERSONALSTAMM_SECRET` kommt erst in
Etappe 2. Der Lauf „Wartung“ wird schon in Etappe 1b empfohlen. Der Entwurf meldete die Nebenwirkung
an den Status-Kacheln der Verbeamtung als Entscheidung vor dem Termin (behoben mit `0e1d8de`, Runde 2)
und ergänzte die Freigaben F8 (n8n-Instanz), F9 (Caddy-Log) und F10 (wer DokuBit-Daten im Editor
sieht).

**Wichtigster Befund:** Drei Prüfer fanden unabhängig dieselbe Lücke (1.01, 1.06, 1.15). Ab 4.2 gibt
es den alten Container nicht mehr, denn `up -d` legt ihn mit dem neuen Image neu an. Die Grundregel
„bei STOPP erst Befehl B“ hätte dann den neuen Container gestartet. Nach Befehl D hätte sie eine
Neustart-Schleife wieder angeworfen, mit einer neuen Sicherung und erneut scheiterndem `db push` bei
jedem Start.

| Kürzel | Prüfer | Schwere | Befund | Ergebnis |
|---|---|---|---|---|
| 1.01 | Befehle | wichtig | Grundregel: Befehl B startet ab 4.2 den neuen Container; „erst D, dann B“ wirft die Neustart-Schleife wieder an | umgesetzt: B nur zwischen dem Anhalten in 4.1 und dem Start in 4.2; ab 4.2 bei STOPP nichts starten, in einer Schleife nur D, nie danach B |
| 1.02 | Befehle | klein | 7.3 Weg A: „nur Befehl E“ ab Schritt 4 schließt in Schritt 11 Befehl D aus; E nach Schritt 10 entfernt die Override-Datei unter dem laufenden alten Container | umgesetzt: eigene Regel je Schrittgruppe (2–3 nichts, 4–5 nur E, 6a–9 E dann B, ab 10 weder E noch B, in einer Schleife nur D) |
| 1.03 | Befehle | klein | 6.1/6.3 begründen „nie löschen“ mit einer Cascade; `DELETE /api/employees/[id]` deaktiviert aber nur, Adresse und Dublette bleiben | umgesetzt im Plan; die Anleitung S0 berichtigt der Doku-Commit von PR #6 (2.04) |
| 1.04 | Befehle | klein | 3.2: Erwartung an `git log -3` passt nicht zum Merge über GitHub | umgesetzt: beide Formen beschrieben, keine ist ein STOPP |
| 1.05 | Befehle | klein | 3.3: Auch mit `npm ci` aus dem Zwischenspeicher laufen `npx esbuild@0.24` und `npm install -g prisma@6.9.0` neu und brauchen die npm-Registry | umgesetzt; dazu ein Befehl für die volle ID des neuen Images, verglichen in 5.1 und 8.1 |
| 1.06 | Ablauf | wichtig | wie 1.01 | umgesetzt mit 1.01 |
| 1.07 | Ablauf | wichtig | Etappe 2 legt den Container zweimal mit `--force-recreate` neu an, ohne Repo-Stand, Image und Override-Datei zu prüfen; ein fremdes Image führte `db push --accept-data-loss` nach dem ersten Lauf aus | umgesetzt: 8.1 und 8.8 prüfen Code-Anker, keine Override-Datei, laufendes Image = `latest` = Image aus Etappe 1, Schema-Vergleich 0. Teilvorschlag verworfen (unten) |
| 1.08 | Ablauf | wichtig | `ux-umbau` enthält S0 nicht; sein Deploy löschte die beiden S0-Spalten samt Index | umgesetzt in Abschnitt 0, 6.3, 7.1, Abschnitt 10 Punkt 9 und im Ausgangsstand; die Regel kommt schon mit Etappe 1 in CLAUDE.md |
| 1.09 | Ablauf | wichtig | Die Sicherung vor dem ersten Lauf entstand zu früh (vor Neustart und n8n-Einrichtung), ohne Schreibpause für HR | umgesetzt: neue Reihenfolge 8.2 Geheimnis, 8.3 n8n, 8.4 Sicherung direkt vor dem Lauf mit Schreibpause bis zum Ende von 8.6 und Zählung des Bestands |
| 1.10 | Ablauf | klein | Nach dem ersten Lauf verwies 7.3 auf die Sicherung aus 4.1 (verwirft alles seit Etappe 1); die Sicherung vor dem ersten Lauf kam in Abschnitt 7 nicht vor | umgesetzt: Weg B mit zwei Fällen; die Sicherung aus 4.1 gilt nur direkt nach Etappe 1 |
| 1.11 | Ablauf | klein | 4.2 wartet bis zu 3 Minuten, auch in einer Neustart-Schleife; die Rotation räumt dabei Sicherungen weg | umgesetzt: bei Prisma-Fehler oder zweitem Start sofort `Strg+C` und Befehl D |
| 1.12 | Ablauf | klein | wie 1.03 | umgesetzt mit 1.03 |
| 1.13 | Ablauf | klein | Die Log-Filter unterscheiden Groß- und Kleinschreibung; der Abgleich schreibt `[Personalstamm]`, die Route `[personalstamm]` | umgesetzt: `grep -i` im Log-Befehl von S0, `[Pp]ersonalstamm` in den kombinierten Filtern. Teil verworfen (unten) |
| 1.14 | Ablauf | klein | Die Probe „Stapel bilden“ lag hinter Credential und echter URL; ein Fehlklick startete den ersten Lauf | umgesetzt: Probe vor Header-Auth und URL. Alternative verworfen (unten) |
| 1.15 | Vollständigkeit | wichtig | wie 1.01 | umgesetzt mit 1.01; Befehl B neutral beschriftet |
| 1.16 | Vollständigkeit | wichtig | Für den Schreibschutz unter `/api/employees` gab es keine Nachkontrolle | umgesetzt: 5.3 optional der n8n-Schlüssel (erwartet 403), 8.6 ein `PATCH` aus der Browser-Konsole (erwartet 409) |
| 1.17 | Vollständigkeit | wichtig | wie 1.08 | umgesetzt mit 1.08 |
| 1.18 | Vollständigkeit | wichtig | `INTERNER_FEHLER` kommt mit HTTP 200; der Log-Befehl fand die Zeilen des Abgleichs nicht | umgesetzt: `INTERNER_FEHLER` ist in 8.5/8.6 ein STOPP; Log-Befehl wie 1.13 |
| 1.19 | Vollständigkeit | wichtig | Fehlt „tar OK“, sollten Fehlerzeilen an Claude gehen; ältere Speichernamen enthalten aber Originalnamen von Dateien | umgesetzt: Dateinamen nur auf dem Server ansehen; neuer Prüfbefehl zählt nur Fehlerarten ohne Pfade (lokal mit BusyBox-tar geprobt) |
| 1.20 | Vollständigkeit | klein | „Instanzweite Bereinigung der Ausführungen mit kurzer Frist“ war ohne Vorwissen nicht ausführbar | umgesetzt als Freigabe F11 mit zwei Wegen; Entscheidung bei Projektverantwortlichem und DSB. Teil verworfen (unten) |
| 1.21 | Vollständigkeit | klein | 6.2: Der Fall „Wartung an, aber als Probelauf“ fehlte; die Kontrolle am Folgetag stand nicht im Protokoll | umgesetzt: drei Ausgangslagen, Zeile „6.2 Folgetag“. Teil verworfen (unten) |
| 1.22 | Vollständigkeit | klein | wie 1.04 | umgesetzt mit 1.04 |
| 1.23 | Vollständigkeit | klein | „Nach dem Update (Claude)“ vergaß den Einstieg Self-Service und die Übergabe S0 | umgesetzt |

**Rückfragen an den Auftraggeber nach Runde 1:** Push und Pull Request (erledigt: PR #6 am
18.10.2026), Korrektur der Anleitung S0 im selben Doku-Commit (erledigt, 2.04) und F11 (offen).

**Rückfragen der Leser.** Vor der Prüfung lasen vier Leser den Entwurf (Umfang, Mechanik, Muster,
Inbetriebnahme) und stellten 32 Fragen. Die meisten beantwortet der Plan heute an einer festen Stelle:

| Thema | Wo im Plan |
|---|---|
| Serverstand seit dem 14.10.2026 | 1.1 und 1.2 prüfen ihn, ein anderer Stand ist ein STOPP; am 18.10.2026 noch nicht geprüft |
| `N8N_API_KEY`, Konten mit EINRICHTUNGSLEITUNG oder VORGESETZTER | 1.9, 1.7 |
| Merge-Art des Pull Requests | Abschnitt 0, „Vor dem Termin zu entscheiden“, Punkt 5 (Runde 2) |
| Status-Kacheln der Verbeamtung | Punkt 1, behoben mit `0e1d8de` |
| `PERSONALSTAMM_SECRET` mit dem Deploy oder später; Weg des Werts nach n8n | Punkt 2 (erst Etappe 2), 8.2 |
| Lauf „Wartung“ | Punkt 3 und 6.2 |
| n8n-Instanz, Erreichbarkeit, Betreiber; Caddy-Log | F8, F4, F9 |
| E-S25, Löschfrist | F1, F3 |
| Mandantennummern aus DokuBit im Portal | 8.1 |
| Rückweg nach dem ersten Lauf | 7.5 und Abschnitt 10 Punkt 8 (nicht geprobt) |
| Dubletten bereinigen | 6.1 und Abschnitt 10 Punkt 4 (Weg mit Claude festlegen) |
| Überwachung der Hinweiszeile | 8.7 Punkt 3 |
| Rückfall-Etikett, Uhrzeiten, Generalprobe | 2.1; Kopf „Uhrzeiten“; Kopf „Nicht gemessen“ |
| Offene Punkte vom 14.10.2026 | Punkt 4 und Abschnitt 10 Punkt 5 |

Nicht eigens behandelt ist die Frage, ob die `.env` auf dem Server Windows-Zeilenenden hat (ein CR am
Ende des Geheimnisses gäbe in n8n dauerhaft 401).

---

## Runde 2 — Nachführen auf `0e1d8de`

**Nachgeführt.** Der Auftraggeber entschied am 18.10.2026, die Nebenwirkung an den Status-Kacheln vor
dem Deploy zu beheben (`0e1d8de`). Danach hängt der Plan an diesem Code-Stand: im Kopf, in
Abschnitt 0 (Zählung `ea2d41d..0e1d8de`: 20 Commits, 6 Merges), in 3.2 (drei Formen von `git log -3`,
Prüfung mit vollem Hash), in 5.4 und 5.5, in 8.1 (Code-Anker), in den Protokollvorlagen und in
Abschnitt 10 Punkt 2. `a43aa25` bleibt überall dort, wo es um das S0-Schema geht. Alle lokal
ausführbaren Befehle lieferten, was der Plan erwartet.

| Kürzel | Prüfer | Schwere | Befund | Ergebnis |
|---|---|---|---|---|
| 2.01 | Hashes | wichtig | 8.1: Der Code-Anker zählt `CLAUDE.md` als Code; zieht jemand vor Etappe 2 einen Protokoll-Commit mit `CLAUDE.md` auf den Server, hält 8.1 grundlos an | umgesetzt: `':!CLAUDE.md'` in 8.1 und damit in 8.8 (`CLAUDE.md` liegt nicht im Image); 3.2 bleibt streng |
| 2.02 | Hashes | klein | Die Merge-Art war nicht vorgeschrieben; nach Squash oder Rebase fehlt `0e1d8de` auf `main`, 3.2 hielte grundlos an | umgesetzt mit 2.08 |
| 2.03 | Hashes | klein | Die erwartete Dateiliste des Doku-Commits nannte zwei statt fünf Dateien | umgesetzt mit 2.09 |
| 2.04 | Hashes | klein | 8.6 und Abschnitt 10 Punkt 4 führten die Korrektur der Anleitung S0 weiter als offen | umgesetzt mit 2.07 |
| 2.05 | Hashes | klein | Künftige Stände sollten nur `a43aa25` enthalten; ein Stand ohne `0e1d8de` nähme den Fix still zurück | umgesetzt mit 2.11 |
| 2.06 | Inhalt | wichtig | 5.4: Die Kachelprobe nannte keine Kachel. „Abgeschlossen“ zeigt ohne „Archiv anzeigen“ keine Zeile, „Frist!“ filtert auf `OVERDUE`, das es im Enum nicht gibt (Antwort 500, schon live) | umgesetzt: Kachel eines laufenden Status mit Zahl über 0; „Abgeschlossen“ und „Frist!“ ausdrücklich nicht. `OVERDUE` steht als bekannte Schwäche unter „Was NICHT dabei ist“ (eigene Aufgabe, nicht behoben) |
| 2.07 | Inhalt | wichtig | wie 2.04 | umgesetzt: 8.6 verweist nur noch auf 6.1, Abschnitt 10 Punkt 4 vermerkt die Korrektur als erledigt |
| 2.08 | Inhalt | wichtig | Der Plan hängt jetzt am Hash `0e1d8de`; die Bedingung „Merge-Commit“ stand nur beschreibend in 3.2 | umgesetzt: im Kopf und als Punkt 5 unter „Vor dem Termin zu entscheiden“: auf GitHub „Create a merge commit“, danach Prüfbefehl auf dem Entwicklerrechner; in 3.2 ein Satz zu Squash und Rebase |
| 2.09 | Inhalt | klein | wie 2.03 | umgesetzt: Kopf und 3.2 nennen alle fünf Dateien; Abschnitt 9 berücksichtigt die schon eingetragene Historienzeile |
| 2.10 | Inhalt | klein | Die Kacheln zählen nach dem Deploy im gewählten Filter statt über alle Vorgänge; der Plan sagte, für HR ändere sich nur der Menüpunkt | umgesetzt in Abschnitt 0 und der Tabelle. Den Text an HR in 5.5 hat die Überarbeitung nicht geändert, das entscheidet der Auftraggeber |
| 2.11 | Inhalt | klein | wie 2.05; `ux-umbau` enthält `b474d8a`, aber nicht `0e1d8de` | umgesetzt: Abschnitt 9 „Ausgangsstand“, 10.9 und Abschnitt 0 verlangen beide Anker; `main` erst nach dem Merge von PR #6 in `ux-umbau` |

---

## Nachtrag 18.10.2026 — Ausnahme in 3.2 und Gegenprüfung der Doku-Nachträge

**Entscheidung des Auftraggebers.** `CLAUDE.md` und `README.md` zählen in 3.2 als Doku, wie schon in
8.1 und 8.8: `git diff --quiet 0e1d8de HEAD -- . ':!docs' ':!CLAUDE.md' ':!README.md'`. Grund:
`.dockerignore` schließt `*.md` im Projektordner aus, beide kommen nie ins Image. Die Dateiliste in
Kopf und 3.2 ist durch eine Regel ersetzt (nur `docs/`, dazu höchstens `CLAUDE.md` und `README.md`).
Damit sind überholt: in 2.01 der Satz „3.2 bleibt streng“ und das Ergebnis von 2.09 („Kopf und 3.2
nennen alle fünf Dateien“).

**Gegenprüfung.** Zwei Prüfer lasen die Doku-Nachträge vom 18.10.2026 (Einstieg und Hausregeln in
`CLAUDE.md`, `README.md`, `lokale-umgebung.md`, Übergabe S0, dieser Plan). Für den Plan umgesetzt:

- Die dauerhafte Regel zu Deploy und Rückfall steht jetzt in `CLAUDE.md`, Abschnitt „Docker /
  Deployment“, „Feste Anker für Deploy und Rückfall“, und nicht nur im Einstieg, der sich mit jeder
  Übergabe ändert. Abschnitt 9 („Nach dem Update (Claude)“) und Abschnitt 10, Punkt 10 sagen das.
  1.08 („die Regel kommt schon mit Etappe 1 in CLAUDE.md“) ist damit früher erfüllt als geplant.
- Kopf: statt „Liste in 3.2“ jetzt „was als Doku zählt, regelt 3.2“; Abschnitt 9: in 8.6 der
  Übergabe nur noch den einen Satz zum Stand nachführen.
- Abschnitt 10, Punkt 12 erweitert (Passwort des Testzugangs aus der Workspace-Datei, ein älteres
  Seed-Standardpasswort, frühere Entwicklungswerte auf Servern und Testinstanzen); Punkt 13 neu
  (alte Testskripte im Projektordner und der Testschlüssel in `encryption.test.ts`, erst nach
  Etappe 1).

**Probe.** 3.1, 3.2 und der Code-Anker aus 8.1 und 8.8 liefen am 18.10.2026 in einem Wegwerf-Klon:
Arbeitsbaum als Commit auf `a4b1680`, Merge wie über GitHub (`--no-ff`) auf `main` = `a43aa25`,
Server-Klon auf `ea2d41d` mit einer Datei unter `backups/`. Alles wie erwartet: Fast-Forward ab
`ea2d41d`; in `log -12` `0e1d8de` in Zeile 5 und `a43aa25` in Zeile 6; beide Anker enthalten (voller
Hash von `a43aa25` stimmt); 20 Commits, 6 Merges, Liste von `0e1d8de` bis `5595cf7`; „Merge gleich
S0-Zweig“; „nach 0e1d8de nur Doku“; `--name-only` nur `CLAUDE.md`, `README.md` und Zeilen unter
`docs/`; genau die drei `numstat`-Zeilen; „package.json und package-lock unveraendert“; `git status`
nur `?? backups/…`; „Code-Stand 0e1d8de“. Gegenprobe: Nach einer Änderung an `src/middleware.ts`
fehlt die Zeile „nur Doku“.

---

## Verworfene Teilvorschläge

Alle aus Runde 1; Runde 2 hat nichts verworfen.

| Zu | Vorschlag | Grund |
|---|---|---|
| 1.21 | nach dem Abwählen von „als Probelauf“ „die Rückfrage bestätigen“ | widerlegt: Das Kästchen speichert ohne Rückfrage; der Plan nennt die Meldung, die stattdessen erscheint |
| 1.20 | nach einem gescheiterten Probestapel nachsehen, dass die Ausführung nach der Frist verschwindet | so nicht prüfbar: Die Importvorlage speichert manuelle Ausführungen nie. Ersatz: 8.7 prüft, dass keine erfolgreiche Ausführung gespeichert ist; die Frist regelt F11 |
| 1.13, 1.18 | auch die kombinierten Log-Filter in 4.3 und 8.2 auf `grep -i` | `-i` träfe dort auch Zeilen von Prisma („schema“) und bräche die Erwartung „genau diese Zeilen“; stattdessen `[Pp]ersonalstamm` |
| 1.07 | vor dem Neuanlegen zusätzlich die Vorschau aus 3.4 und `git status` | gleichwertig ersetzt: gleiches Image und Schema-Vergleich 0 im laufenden Container zeigen dasselbe; der Code-Anker deckt Änderungen am Code und an `docker-compose.yml` ab |
| 1.14 | Knoten „An Portal senden“ bis zum ersten Lauf deaktivieren | der Hauptvorschlag (Probe vor Credential und URL) ist umgesetzt und spart das Wiedereinschalten |
| 1.03, 1.12 | die Anleitung S0 in derselben Runde berichtigen | der Auftrag dieser Runde war auf den Plan beschränkt; nachgeholt im Doku-Commit von PR #6 (2.04) |

---

## Restrisiken

1. **Keine Generalprobe mit gebautem Image.** Startprotokoll, Schema-Vorschau und die Antwort des
   alten Images auf die neue Route sind aus Code und Schemas abgeleitet (Kopf des Plans, „Nicht
   gemessen“).
2. **Proben nur auf dem Entwicklerrechner.** Die Proben zum Schreibschutz (5.3 mit dem n8n-Schlüssel,
   8.6 per Browser-Konsole) liefen nie gegen den Server. Die Schreibweise `curl -H @-` ist nur mit dem
   `curl` des Entwicklerrechners gegen einen Testdienst geprüft; im lokal vorhandenen alten Image
   fehlte `curl`.
3. **Neustart-Schleife.** Woran man sie in 4.2 und 7.3 erkennt, ist aus Code und Docker-Verhalten
   abgeleitet. Offen ist vor allem, ob `docker compose logs -f` bei einem Neustart weiterläuft oder
   endet; der Plan nennt beides.
4. **Variablen von n8n für F11 Weg (b)** (`EXECUTIONS_DATA_PRUNE`, `EXECUTIONS_DATA_MAX_AGE`) stammen
   aus der n8n-Dokumentation und sind gegen die Version der Instanz nicht geprüft.
5. **Feste Stände zwischen den Etappen.** Kommt zwischen Etappe 1 und 2 ein weiterer Deploy, muss
   Claude Code-Anker und Image-ID in 8.1 nachführen, sonst hält 8.1 berechtigt, aber unnötig an.
6. **Prüfbefehl für tar (2.2)** entfernt Pfade nur bis zum letzten „: “ einer Zeile. Eine Fehlerzeile
   ohne „: “ ginge ungefiltert durch; bei BusyBox-tar nicht beobachtet.
7. **Schreibpause 8.4 bis 8.6.** Öffentliche Links (Fragebogen, Upload-Seite, Aufgabenseiten) lassen
   sich nicht anhalten. Ein Einspielen der Sicherung aus 8.4 verwürfe ihre Einträge aus dieser Zeit.
8. **Serverstand unbelegt.** Ob seit dem 14.10.2026 auf dem Server gezogen oder gebaut wurde, belegt
   das Repo nicht. Abschnitt 1 lief noch nie; am 18.10.2026 bestand kein Zugriff auf den Server.

---

## Offen

- **F11** (Aufbewahrung gescheiterter Ausführungen in n8n: nur dieser Ablauf „Do not save“ oder
  instanzweit, mit Frist) entscheiden Auftraggeber und DSB vor Etappe 2.
- **Lauf „Wartung“** am Tag des Deploys einschalten oder erst vor Etappe 2 (Abschnitt 0, Punkt 3).
- **Text an HR in 5.5:** ob er erwähnt, dass die Kacheln der Verbeamtung jetzt dem Filter folgen (2.10).
- **Kachel „Frist!“ der Verbeamtung** (`OVERDUE` gibt es im Enum nicht): eigene Aufgabe, schon live.
- **Abschnitt 1 nur lesend** gegen den Server, sobald Zugriff besteht; die Ausgaben an Claude.

---

Die Rohdaten der Runden (Befundlisten der Prüfer, Berichte der Überarbeitung) lagen nur in der
temporären Ablage der Sitzung vom 17./18.10.2026 außerhalb des Repositorys und sind nicht archiviert.
Maßgeblich sind dieses Protokoll und der Ablaufplan.
