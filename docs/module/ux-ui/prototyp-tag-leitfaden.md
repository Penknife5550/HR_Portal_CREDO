# Prototyp-Tag (V0) – Leitfaden: neue Ansicht Vertragsende

Stand 08.10.2026 · für den Projektverantwortlichen und das Personalbüro · gehört zu
[projekt-ux-umbau.md](projekt-ux-umbau.md) (Abschnitt 0.4) und [pilot-feinplan.md](pilot-feinplan.md)
(Abschnitte 3.3 bis 3.8, 7, 8 und 11)

## 1. Worum es geht

Die Detailseite eines Vertragsende-Vorgangs hat eine neue Ansicht: oben der Name mit **einer**
Statuspille, darunter eine Leiste mit den fünf Schritten und dem Kasten „Jetzt dran“, der sagt,
wer gerade am Zug ist und was als Nächstes zu tun ist; Rückfragen erscheinen in eigenen Fenstern
statt als Browser-Meldung. Die Ansicht ist gebaut, aber nicht ausgeliefert; sie steht hinter
einem Schalter neben der bisherigen. Bevor das Personalbüro zwei Wochen damit arbeitet, prüfen
wir an einem Termin, ob die Seite ohne Erklärung verständlich ist und ob ihre Texte stimmen –
die meisten sind bisher nur angenommen. Dazu erledigt jemand aus dem Personalbüro typische
Aufgaben an erfundenen Testvorgängen, erst in der neuen, dann in der bisherigen Ansicht. Die
Klicks in der bisherigen Ansicht sind der Ausgangswert, an dem der Pilot später gemessen wird.
Danach klären wir offene Fragen; die Antworten fließen in Texte und Entscheidungen ein, bevor
die Seite abgenommen und ausgeliefert wird (Abschnitt 7).

| | |
|---|---|
| Dauer | ca. 90 Minuten |
| Teilnehmende | ein bis zwei Personen aus dem Personalbüro (am besten, wer Vertragsenden bearbeitet), der Projektverantwortliche |
| Klickt | eine Person aus dem Personalbüro; sie denkt laut („Ich suche jetzt …“) |
| Beobachtet und notiert | der Projektverantwortliche: liest die Aufgaben vor, stoppt die Zeit, zählt Klicks, stellt die Fragen. Eine zweite Person aus dem Personalbüro darf mitnotieren, hilft aber nicht. |
| Ort | am Rechner des Projektverantwortlichen – nur dort läuft die Testumgebung |

Drei Regeln für die Moderation:

- **Wir prüfen die Seite, nicht die Person.** Alles, was hakt, ist ein Befund der Seite.
- **Nicht erklären, nicht zeigen.** Auf Fragen mit einer Gegenfrage antworten („Was würden Sie
  erwarten?“). Erst nach etwa zwei Minuten Hängen helfen – und das notieren.
- **Nichts kann kaputtgehen.** Erfundene Vorgänge in einer lokalen Kopie, kein Mailserver: Es
  geht keine Mail hinaus. Darum scheitert jeder Versand (Anfrage, Erinnerung) mit einer
  Fehlermeldung – so gewollt; Aufgaben 4 und 5 prüfen genau diese Meldung (Abschnitt 4).

## 2. Vorbereitung

**Am Vortag**

- [ ] Rechner mit Docker Desktop; Bildschirm mindestens 1366 × 768 (am besten genau das – der
      übliche Schul-Laptop), Browserfenster maximiert, Zoom 100 %.
- [ ] Die Bilder aus Abschnitt 8 liegen vor – Ersatz, falls Docker am Termin nicht läuft.
- [ ] Ausdrucken: Beobachtungsbogen (Abschnitt 6), Fragen (Abschnitt 5), je Aufgabe eine
      Karte mit dem Satz „Aufgabe“ (Abschnitt 4) und ein Zettel mit der Adresse der
      Führungskraft: `fuehrungskraft.test@beispiel.invalid`.
- [ ] Schritte 1 bis 4 unten einmal zur Probe – geht etwas schief, bleibt Zeit.

**Eine Stunde vorher**

1. [ ] Docker Desktop öffnen → „Containers“ → Gruppe `hr-portal-lokal` starten (alle drei:
       `-app`, `-db`, `-gotenberg`). Nach einem Neustart des Rechners starten sie nicht von selbst.
2. [ ] Im Browser `http://localhost:3100` öffnen – die Anmeldeseite erscheint. Anmelden mit
       Konto und Passwort aus Ihrer Datei `anmeldung.txt`. Die Adresse geht nur an diesem Rechner.
3. [ ] Testvorgänge neu einspielen – Git Bash im Projektordner, die vier Zeilen nacheinander:

   ```bash
   export MSYS_NO_PATHCONV=1
   docker cp scripts/vertragsende-testdaten.js hr-portal-lokal-app:/app/vertragsende-testdaten.js
   docker exec -w /app -e TESTDATEN_HOST_ERLAUBT=db hr-portal-lokal-app node vertragsende-testdaten.js --mandant 712
   docker exec -u root hr-portal-lokal-app rm /app/vertragsende-testdaten.js
   ```

   Die Ausgabe nennt zehn Vorgänge `VE-2026-GSH-T01` bis `-T10` (Einrichtung GS Haddenhausen)
   mit Namen. Alle Fristen rechnen vom Tag des Einspielens – darum am Termintag, nicht am Vortag.
   Das Skript löscht nur seine eigenen T-Vorgänge und braucht wenige Sekunden.
4. [ ] Vorgänge → Vertragsende, im Suchfeld „Test“ eingeben, T01 öffnen. Oben steht eine
       schmale Zeile „Für diese Seite gibt es eine neue Ansicht.“ (fehlt sie, ist der Docker-Stand
       zu alt). Einmal **„Neue Ansicht ausprobieren“** klicken; die Zeile heißt dann „Neue Ansicht
       (Vorschau).“ Die Wahl merkt sich der Browser – also derselbe Browser, kein privates Fenster.
5. [ ] Zurück zur Liste; sie ist der Startpunkt jeder Aufgabe. „Rückmeldung geben“ in der
       Schalterzeile am Termin nicht klicken (öffnet das Mailprogramm).
6. [ ] Stoppuhr (Handy), Beobachtungsbogen, Stift.

**Während des Termins** läuft Schritt 3 noch einmal (zwischen den Durchgängen) und am Ende.
Danach sind die Vorgänge neu angelegt (mit neuen Adressen): Eine noch offene Vorgangsseite
findet ihren Vorgang nicht mehr – über die Liste neu öffnen.

## 3. Ablauf

| Zeit | Dauer | Was | Hinweis |
|---|---|---|---|
| 0:00 | 5 min | Begrüßung | Ziel (Abschnitt 1), „wir prüfen die Seite“, laut denken, nichts kann kaputtgehen |
| 0:05 | 10 min | Freies Umschauen in der **neuen** Ansicht, ohne Erklärung | Start: Liste → Herr Testberg (T02). „Schauen Sie sich um. Was sehen Sie, was würden Sie hier tun?“ Fenster dürfen geöffnet, aber nicht bestätigt werden („Abbrechen“). Ersten Eindruck wörtlich notieren. |
| 0:15 | 25 min | **Durchgang 1:** Aufgaben 1–7 in der neuen Ansicht | Zeit und Klicks je Aufgabe |
| 0:40 | 5 min | Pause; Testdaten neu einspielen (Abschnitt 2, Schritt 3); auf einer Vorgangsseite **„Zur bisherigen Ansicht“** | |
| 0:45 | 15 min | **Durchgang 2:** Aufgaben 1–7 kurz in der alten Ansicht | Ausgangswert für die Erfolgsmaße |
| 1:00 | 25 min | Fragen (Abschnitt 5) | vorher wieder „Neue Ansicht ausprobieren“; Bilder fürs Handy aus Abschnitt 8 |
| 1:25 | 5 min | Abschluss | „Was war am besten, was am schlimmsten?“ Wie es weitergeht (Abschnitt 7). Danach Testdaten neu einspielen. |

**Warum erst neu, dann alt:** Die alte Ansicht kennt das Personalbüro; ihre Werte sind
Routinewerte. Die neue soll unbefangen getroffen werden. Dass die Aufgaben im zweiten Durchgang
schon bekannt sind, macht die alte Ansicht eher etwas schneller – das ist in Kauf genommen und
beim Auswerten zu bedenken.

## 4. Aufgaben

Jede Aufgabe beginnt in der Liste der Vertragsenden. Aufgabe vorlesen (Karte hinlegen),
Stoppuhr starten, stoppen, wenn die Antwort gegeben ist bzw. die Meldung erscheint (unten rechts
oder im Fenster). Aufgaben 1–3 ändern nichts; 4–7 ändern Testdaten – deshalb wird zwischen den
Durchgängen und am Ende neu eingespielt. Die Spalte „Weg neu“ ist nur für die Moderation; die
Knopfnamen nie vorlesen.

**Anfrage und Erinnerung scheitern – gewollt:** In der Testumgebung ist bewusst kein
Mailserver eingerichtet (es geht nichts hinaus). Seit dem Stand vom 08.10. sagt das Portal das
ehrlich: Statt „gesendet“ meldet es „… konnte nicht versendet werden: SMTP ist nicht konfiguriert
…“. Im Betrieb geschieht genau das, wenn der Mailserver ausfällt. Aufgaben 4 und 5 prüfen
deshalb, ob die Meldung verstanden wird und ob klar ist, was als Nächstes zu tun ist. Vorher
nicht ankündigen. Kommt die Meldung, ein bis zwei Minuten beobachten („Was würden Sie jetzt
tun?“), die Antwort notieren, dann auflösen: „Hier gibt es absichtlich keinen Mailserver; im
Betrieb geht die Mail hinaus.“

### Aufgabe 1 – Wer ist dran? (liest nur)

| | |
|---|---|
| Ausgangslage | T02 Ben Testberg: Anfrage läuft, Link gültig, einmal erinnert. T03 Clara Testfeld: Anfrage ging hinaus, Link seit gestern abgelaufen, zweimal erinnert. |
| Aufgabe | „Öffnen Sie die Vorgänge von Herrn Testberg und Frau Testfeld. Bei wem liegt die Sache gerade, und was muss als Nächstes passieren?“ |
| Weg neu | T02: Pille „Wartet auf Führungskraft“, Kasten „Jetzt dran · Führungskraft“ mit „Wartet auf die Rückmeldung der Führungskraft“ (darunter Anfrage vom …, „1× erinnert“). T03: Pille „Link abgelaufen“, „Jetzt dran · HR“ mit „Link der Führungskraft ist abgelaufen – Anfrage neu senden“; der Schritt „Anfrage“ ist wieder aktiv, Notiz „Link abgelaufen“. |
| Beobachten | Liest sie die Pille, die Schritte oder den Kasten? Erkennt sie den Unterschied zwischen beiden ohne Hilfe? Was liest sie aus „Jetzt dran · HR“? |
| Alt | Beide sehen gleich aus: Status „Anfrage beim Vorgesetzten“, „… wartet auf Rückmeldung“. Dass der Link von Frau Testfeld abgelaufen ist, steht nirgends. Notieren, ob und woran sie es erkennt. |

### Aufgabe 2 – Was ist dringend? (liest nur)

| | |
|---|---|
| Ausgangslage | T04 David Testhaus: Führungskraft will übernehmen, Vertrag noch nicht zurück, Vertragsende in 20 Tagen (am Tag des Einspielens), nicht mit Vorstand abgestimmt, bisher 24 Monate sachgrundlos befristet und einmal verlängert. T10 Jonas Testbrink: nur angelegt, Vertragsende seit 3 Tagen überschritten, Datum kam geändert aus DokuBit. |
| Aufgabe | „Bei Herrn Testhaus und bei Herrn Testbrink: Gibt es etwas, das Sie sofort klären müssten? Was genau?“ |
| Weg neu | T04: Pille „Entfristungsrisiko · in 20 Tagen“; in „Jetzt dran“ die Frist mit „Kritisch“; drei Hinweise: „Entfristungsrisiko (§ 15 Abs. 5 TzBfG)“, „Nicht mit Vorstand oder Geschäftsführung abgestimmt“, „Hinweis zur Befristung (§ 14 TzBfG)“. T10: Pille „Anfrage offen“; in „Jetzt dran“ „Vertragsende … · seit 3 Tagen überschritten“ mit „Kritisch“; Hinweis „Vertragsende von DokuBit geändert (…)“. |
| Beobachten | Liest sie alle drei Hinweise? Scrollt sie – und merkt sie, dass bei 1366 × 768 die Reiter unter dem Bildrand liegen? Wirkt das dreifache Entfristungsrisiko hilfreich oder doppelt? Fällt bei T10 die Überschreitung auf, obwohl die Pille nur „Anfrage offen“ sagt? |
| Moderation | Der DokuBit-Text („… schon weit fortgeschritten …“) passt nicht zu T10 – diese Lage ist künstlich. Nicht über den Text sprechen, nur über die Überschreitung. |
| Alt | T04: Warnungen nur im Reiter „Übersicht“ (die Vorstand-Warnung zusätzlich im Reiter „Dokumente“). T10: keine Ampel, nichts Auffälliges – das überschrittene Vertragsende zeigt die alte Seite nicht. |

### Aufgabe 3 – Wo entsteht der Vertrag? (zeigen, nichts erzeugen)

| | |
|---|---|
| Ausgangslage | T04 David Testhaus wie in Aufgabe 2 |
| Aufgabe | „Für Herrn Testhaus muss der Verlängerungsvertrag geschrieben werden. Zeigen Sie, wo Sie ihn im Portal erstellen würden. Bitte nichts erzeugen.“ |
| Weg neu | Drei Wege: Knopf „Zu den Dokumenten“ in „Jetzt dran“, Klick auf den Schritt „Vertrag“ in der Leiste, oder Reiter „Dokumente“. Ziel ist die Karte „Dokumente erstellen“. In der Testumgebung sind keine Vertragsvorlagen hinterlegt; die Karte sagt das nur – fürs Finden reicht es. |
| Beobachten | Welchen Weg nimmt sie? Probiert sie den Schritt „Vertrag“ (man sieht ihm nicht an, dass er klickbar ist)? Muss sie dafür scrollen? |
| Alt | „Zu den Dokumenten →“ in der grünen Karte oder Reiter „Dokumente“ |

### Aufgabe 4 – Anfrage stellen (ändert Daten)

| | |
|---|---|
| Ausgangslage | T01 Anna Testmann: frisch angelegt, noch keine Anfrage, keine Adresse der Führungskraft |
| Aufgabe | „Bei Frau Testmann ist noch nichts passiert. Ihre Führungskraft soll entscheiden, ob es weitergeht. Die Adresse steht auf dem Zettel.“ |
| Weg neu | „Anfrage senden …“ → Fenster „Anfrage an die Führungskraft senden“, Feld „E-Mail der Führungskraft“ → „Anfrage senden“ → im Fenster die Meldung „Die Anfrage an die Führungskraft konnte nicht versendet werden: SMTP ist nicht konfiguriert … Die Anfrage gilt als nicht gesendet. Bitte senden Sie die Anfrage später erneut.“ (Stoppuhr stoppen). Das Fenster bleibt offen → „Abbrechen“. Dahinter steht wieder „Anfrage offen“ mit „Anfrage an die Führungskraft senden“; die Adresse ist gemerkt und beim nächsten Öffnen vorbelegt. |
| Beobachten | Klicks bis zur Meldung. Liest sie die Meldung ganz? Versteht sie, dass nichts hinausging und die Anfrage nicht als gesendet gilt? Was würde sie jetzt tun (später erneut senden, die IT fragen, die Führungskraft anrufen)? Was macht sie mit dem Teil „Bitte unter Einstellungen → SMTP … eintragen, ‚aktiv‘ setzen …“ – Hilfe oder nur Technik? Ein Tippfehler ohne „@“ ergibt „Das ist keine E-Mail-Adresse.“ – wird der Fehler verstanden? |
| Moderation | Die Meldung ist erwartet (siehe oben, „Anfrage und Erinnerung scheitern – gewollt“). Erst nach ihrer Antwort auflösen. |
| Wichtig | Nur die Adresse vom Zettel – nie eine echte, auch wenn nichts hinausgeht. |
| Alt | Feld in der Karte „Anfrage an die Führungskraft“ und „Anfrage an Vorgesetzten senden →“ (ohne Rückfrage) → dieselbe Meldung als rote Zeile oben über den Reitern; die Karte steht danach unverändert da. Wieder an T01 (nach dem Neueinspielen frisch). |

### Aufgabe 5 – Führungskräfte, die nicht antworten (ändert Daten)

| | |
|---|---|
| Ausgangslage | T02 Ben Testberg (Link gültig) und T03 Clara Testfeld (Link abgelaufen), wie in Aufgabe 1 |
| Aufgabe | „Die Führungskräfte von Herrn Testberg und von Frau Testfeld haben sich noch nicht gemeldet. Kümmern Sie sich darum.“ |
| Weg neu | T02: „Erinnerung senden“ – ohne Rückfrage → Fehlermeldung unten rechts „Die Erinnerung konnte nicht versendet werden: SMTP ist nicht konfiguriert … Sie wurde nicht gezählt – bitte später erneut versuchen.“ (bleibt stehen, bis sie geschlossen wird); weiter „1× erinnert“. T03: „Anfrage neu senden …“ → Rückfrage „Anfrage neu senden?“ (Adresse vorbelegt, Text sagt: der bisherige Link ist bereits abgelaufen, Erinnerungen beginnen von vorn, der Vermerk zur Abstimmung mit Vorstand oder Geschäftsführung wird zurückgesetzt) → „Anfrage neu senden“ → im Fenster „Die Anfrage an die Führungskraft konnte nicht versendet werden: … Der zuvor versendete Link gilt nicht mehr. …“; der Text oben heißt jetzt „der bisherige gilt bereits nicht mehr“. „Abbrechen“ → Pille „Anfrage nicht zugestellt“, „Jetzt dran · HR“ mit „Anfrage wurde nicht zugestellt – erneut senden“ und dem Knopf „Anfrage senden …“; im Reiter „Übersicht“ steht bei „Anfrage vom“ die Pille „Nicht zugestellt“. |
| Beobachten | Unterscheidet sie die beiden Fälle (erinnern / neu senden)? Liest sie den Text der Rückfrage, versteht sie ihn? Bemerkt sie die Fehlermeldung der Erinnerung unten rechts? Versteht sie bei T03 nach dem Abbrechen die neue Pille „Anfrage nicht zugestellt“ – und dass die Führungskraft jetzt gar keinen gültigen Link mehr hat? Vermisst sie bei der Erinnerung eine Rückfrage, oder ist „sofort“ richtig? Sucht sie im Menü „…“? |
| Moderation | Wie bei Aufgabe 4: Die Meldungen sind erwartet, erst nach ihrer Antwort auflösen. Danach Frage 21 (Abschnitt 5) stellen, solange die Meldung frisch ist. |
| Alt | T02: „Erinnerung senden“ → dieselbe Meldung als rote Zeile oben. T03: Wer „Erinnerung senden“ nimmt, bekommt den Fehler „Der Formular-Link ist abgelaufen. Bitte „Anfrage erneut senden“ nutzen …“; dann „Anfrage erneut senden“ – ohne Rückfrage → rote Zeile „… konnte nicht versendet werden …“; die Karte sagt danach „Bei der Führungskraft ist keine Anfrage angekommen – die E-Mail an … wurde nicht versendet (Grund im Reiter „E-Mails“). Bitte erneut senden.“ Den Umweg über den Fehler mitzählen. |

### Aufgabe 6 – Vertrag zurück, Vorgang beenden (ändert Daten)

| | |
|---|---|
| Ausgangslage | T04 David Testhaus wie in Aufgabe 2. Nach dem ersten Teil steht er so da wie T05 Emma Testkamp (Vertrag unterschrieben, Mitarbeitervertretung offen). |
| Aufgabe | „Der unterschriebene Vertrag von Herrn Testhaus ist heute zurückgekommen. Die Mitarbeitervertretung hat zugestimmt. Bringen Sie den Vorgang zu Ende.“ |
| Weg neu | „Unterschriebenen Vertrag erfassen …“ → „Unterschriebener Vertrag liegt vor?“ → „Vertrag erfassen“. Dann Reiter „Übersicht“ → Gruppe „Mitarbeitervertretung“ → „Stand setzen …“ → „Zugestimmt“ → „Stand speichern“. Dann „Abschließen …“ → „Vorgang abschließen?“ → „Abschließen“ → Pille „Abgeschlossen“. Die Reihenfolge ist frei: Ohne Stand nennt das Abschluss-Fenster „Der Stand der Mitarbeitervertretung ist noch offen.“, sperrt aber nicht. |
| Beobachten | Findet sie die Mitarbeitervertretung (unten im Reiter, evtl. unter dem Bildrand)? Schließt sie ab, ohne den Stand zu setzen? Was sagt sie dazu, dass „Nicht mit Vorstand oder Geschäftsführung abgestimmt … Vor der Vertragserstellung klären“ nach dem Erfassen weiter dasteht? |
| Alt | Wieder T04: „Unterschriebenen Vertrag erfassen“ (Browser-Rückfrage „Bestätigen: Der unterschriebene Verlängerungsvertrag liegt vor?“), Karte „Mitarbeitervertretung (MAV)“ unten in der Übersicht, Knopf „Zugestimmt“ (speichert sofort), „Vorgang abschließen“ (Browser-Rückfrage) |

### Aufgabe 7 – Führungskraft lehnt ab (ändert Daten)

| | |
|---|---|
| Ausgangslage | T06 Felix Testmeier: Führungskraft hat abgelehnt (mit Begründung), noch kein Offboarding. T07 Greta Testrath: Ablehnung, Offboarding `OFF-2026-GSH-T07` läuft schon. |
| Aufgabe | „a) Die Führungskraft von Herrn Testmeier will ihn nicht weiterbeschäftigen. Erledigen Sie, was jetzt zu tun ist. b) Bei Frau Testrath läuft das Offboarding schon. Wo stellen Sie das Zeugnis aus – und schließen Sie den Vertragsende-Vorgang ab.“ |
| Weg neu | a) „Offboarding anlegen …“ → „Offboarding anlegen?“ (nennt Namen und letzten Arbeitstag) → „Offboarding anlegen“ → „Offboarding … angelegt.“ b) „Zum Offboarding OFF-2026-GSH-T07“ in „Jetzt dran“ (oder Gruppe „Offboarding“ → „Offboarding öffnen“); Abschluss nur über das Menü „…“ → „Abschließen …“ → „Abschließen“. |
| Beobachten | Findet sie das Menü „…“? Erwartet sie den Abschluss im Offboarding? Die Offboarding-Seite selbst ist noch alt – nicht bewerten lassen. |
| Hinweis | Das in a) angelegte Offboarding bekommt eine fortlaufende Nummer (kein „T“) und bleibt beim Neueinspielen stehen – lokale Kopie, stört nicht. |
| Alt | a) „Offboarding anlegen →“ mit Browser-Rückfrage „Mitarbeiter NICHT übernehmen? …“. b) „Zum Offboarding OFF-2026-GSH-T07 (inkl. Zeugnis) →“. Abschließen gibt es in der alten Ansicht in dieser Lage nicht – nach einer Minute Suchen abbrechen, „nicht möglich“ notieren. |

## 5. Fragen an das Personalbüro

Vorher wieder „Neue Ansicht ausprobieren“. **Fragen 1 bis 9 sind Pflicht**, der Rest, wenn Zeit
bleibt. Zum Zeigen: die Texte je Testvorgang (aus `src/lib/prozess/vertragsende.ts`; „bisher“ =
Text der Liste und der alten Ansicht).

| Testvorgang | Pille neu | bisher | „Jetzt dran“ |
|---|---|---|---|
| T01 Anna Testmann | Anfrage offen | Angelegt | Anfrage an die Führungskraft senden |
| T02 Ben Testberg | Wartet auf Führungskraft | Anfrage beim Vorgesetzten | Wartet auf die Rückmeldung der Führungskraft |
| T03 Clara Testfeld | Link abgelaufen | Anfrage beim Vorgesetzten | Link der Führungskraft ist abgelaufen – Anfrage neu senden |
| T04 David Testhaus | Entfristungsrisiko · in 20 Tagen (ohne Risiko: Übernahme · Vertrag offen) | Rückmeldung: Übernahme | Verlängerungsvertrag erstellen und unterschrieben zurückholen · Danach: Vorgang abschließen |
| T05 Emma Testkamp | Vertrag unterschrieben | Vertrag unterschrieben | Vorgang abschließen · Mitarbeitervertretung: Stand noch offen |
| T06 Felix Testmeier | Abgelehnt · Offboarding offen | Rückmeldung: keine Übernahme | Ablehnung bestätigen und Offboarding anlegen |
| T07 Greta Testrath | Keine Übernahme | Keine Übernahme | Auslaufmitteilung erstellen, Zeugnis über das Offboarding |
| T08 Hannes Testwald | Abgeschlossen | Abgeschlossen | – (Leiste endet mit „Abgeschlossen“) |
| T09 Ida Teststein | Storniert | Storniert | – (Leiste endet mit „Abgebrochen“) |
| T10 Jonas Testbrink | Anfrage offen | Angelegt | Anfrage an die Führungskraft senden |
| T03 nach Aufgabe 5 (Anfrage ging nicht hinaus) | Anfrage nicht zugestellt | Anfrage beim Vorgesetzten | Anfrage wurde nicht zugestellt – erneut senden |

| # | Frage | Warum wir fragen | Antwort |
|---|---|---|---|
| 1 | Sagen die Pillen, was Sie wissen müssen? Welches Wort würden Sie nehmen? | P-F8: Die Pille sagt jetzt, wer dran ist, statt den Fachstatus zu wiederholen – bisher nur angenommen | |
| 2 | Sind die Sätze in „Jetzt dran“ verständlich? Stimmen Reihenfolge und Texte der Knöpfe? | Feinplan 3.3: Wortlaut nur angenommen | |
| 3 | Die Liste der Vertragsenden bleibt bis zu ihrem Umbau (U3) alt und zeigt die bisherigen Texte – dieselbe Sache heißt dort anders. Stört das für zwei Wochen? | P-F8; Ankündigungstext | |
| 4 | Bei T04 steht das Entfristungsrisiko dreimal (Pille, „Jetzt dran“, Hinweis). Richtig so, oder darf eines weg – welches? | beim Bau aufgefallen | |
| 5 | Bei T04 schieben drei Hinweise die Reiter unter den Bildrand (1366 × 768). Welche Hinweise lesen Sie wirklich? Kürzen, zusammenlegen, einklappen? | beim Bau aufgefallen; Feinplan 1 („Welche Hinweise oben stehen dürfen“) | |
| 6 | Nach „Vertrag erfassen“ steht „Nicht mit Vorstand oder Geschäftsführung abgestimmt … Vor der Vertragserstellung klären“ weiter da. Soll er dann verschwinden oder anders lauten? | beim Schreiben dieses Leitfadens aufgefallen | |
| 7 | „Vorgang stornieren …“ steht im Menü „…“. Gefunden? Richtig versteckt? (an T01 zeigen lassen, nicht bestätigen) | P-F2: neue Handlung, gab es bisher in der Oberfläche nicht | |
| 8 | Am Handy (Bild `pilot-t04-390.jpg`) zeigt die Leiste nur Punkte und „Schritt 4 von 5 · Vertrag“. Reicht das, oder soll mehr dastehen (z. B. wer zuständig ist)? | Feinplan 11, offen 1 | |
| 9 | Der Schritt „Vertrag“ führt per Klick zu den Dokumenten, zeigt das aber nur beim Überfahren mit der Maus. Braucht er ein sichtbares Zeichen? | Feinplan 11, offen 2 | |
| 10 | Nach dem Abschluss (T08) steht an „Rückmeldung“ weiter „sonst: Offboarding“. Weiter zeigen oder weglassen? | Feinplan 11, offen 3 | |
| 11 | Bei T09 sagt die Pille „Storniert“, die Leiste „Abgebrochen“. Ein Wort für beides – welches? | beim Schreiben aufgefallen; der Plan sieht „Stornieren (nicht Abbrechen)“ vor | |
| 12 | Vorgangsnummer: Brauchen Sie sie (am Telefon, beim Abgleich)? Reicht sie in der Unterzeile statt im Titel? In Listen als schmales Kürzel, die E-Mail-Adresse nur im Vorgang? | E9 (Dichte der Listen) | |
| 13 | Modulnamen: „Onboarding“/„Offboarding“ bleiben; Dialogtitel „Neues Onboarding“/„Neues Offboarding“ statt „Neuer Vorgang“/„Neuer Austritt“? „Vertragsende“ als Name passt? | E11 (Anzeigenamen der Module) | |
| 14 | Individuelle E-Mail: Für welche drei bis fünf Anlässe wünschen Sie Textbausteine (Beispiele: Vertrag zurück, Rückfrage zu Unterlagen, Terminbestätigung)? | E13 – die Anlässe soll der Prototyp-Tag benennen | |
| 15 | Ihre zehn häufigsten Aufgaben im Portal – über alle Module? | Plan, V0: Grundlage der Erfolgsmaße („Klicks je Top-Aufgabe“) | |
| 16 | Auf einem Bildschirm mit 1366 × 768 beginnen die Reiter erst nach 61 bis 84 % der Höhe (bei T04 sogar unterhalb des Fensters). Der Plan wollte höchstens ein Drittel. Stört das Rollen? Was darf kleiner werden: der Seitenkopf, die Prozessleiste, „Jetzt dran“, die Hinweise? | Messung vom 07.10.2026 (Bilder `pilot-tNN-1366.jpg`); P-F6: im Pilot nur messen | |
| 17 | Bei T10 ist das Vertragsende seit drei Tagen überschritten, die Pille sagt trotzdem nur „Anfrage offen“ (blau). Bei T04 sind noch 20 Tage Zeit, die Pille ist rot („Entfristungsrisiko“). Soll die Pille sagen, wer dran ist – oder das Dringendste? | beim Fotografieren aufgefallen | |
| 18 | Bei T04 und T06 bricht die Zeile unter „Rückmeldung“ in der Leiste um (Zuständigkeit, Ergebnis, Datum). Reicht dort weniger, z. B. ohne Datum (es steht in der Übersicht)? | beim Fotografieren aufgefallen | |
| 19 | Am Handy steht der Knopf „…“ allein in einer Zeile, und von „E-Mails“ ist in der Reiterleiste nur „E-M“ zu sehen. Fällt das auf, merkt man, dass die Leiste rollt? | beim Fotografieren aufgefallen (`pilot-t04-390.jpg`) | |
| 20 | Bei T09 (storniert) endet die Leiste ohne Datum und ohne Namen; die nicht erreichten Schritte sehen aus wie kommende. Braucht es „storniert am … von …“? | beim Fotografieren aufgefallen (`pilot-t09-1366.jpg`) | |
| 21 | Wenn eine Mail nicht hinausgeht (Aufgaben 4 und 5): Reicht die Meldung, um zu wissen, was zu tun ist? Was soll statt „SMTP ist nicht konfiguriert … ‚aktiv‘ setzen und ‚Verbindung testen‘“ dastehen? Wen würden Sie informieren? (direkt nach Aufgabe 5 stellen) | Versandergebnis seit 08.10. sichtbar; Plan U10: Gründe in Alltagssprache statt Text des Mailservers | |

**Für die Moderation:** Beim Vergleich alt/neu zählt die alte Ansicht bei T04 „in 19 Tagen“,
die neue „in 20 Tagen“. Die neue zählt Kalendertage in deutscher Zeit (richtig), die alte
rechnet mit Uhrzeiten ab Mitternacht UTC. Kein Fehler der neuen Ansicht – nicht verwirren
lassen. Ebenso: T10 ist ein Vorführfall (DokuBit-Änderung bei „Angelegt“ kommt im Betrieb so
nicht vor); der Hinweistext „vermutlich ist die Verlängerung bereits vollzogen“ passt deshalb
nicht zur Lage.

Zwei weitere Dinge vorher ansagen, damit sie nicht für Fehler der neuen Ansicht gehalten werden:

- **Rote Zeilen im Reiter „E-Mails“:** In der Testumgebung ist kein Mailserver eingetragen.
  Jede Mail (Anfrage, Erinnerung) erscheint dort deshalb als „FAILED“ mit dem Grund „SMTP ist
  nicht konfiguriert …“. Es geht nichts hinaus – das ist gewollt. Seit dem 08.10. sagt die Seite
  das auch selbst („… konnte nicht versendet werden“, Aufgaben 4 und 5).
- **Einrichtungsleitung und Führungskräfte** sehen die Seite heute gar nicht (auch nicht die
  alte), sondern nur „Keine Berechtigung“ – die Mandanten-Sperre lässt sie nicht an die Daten.
  Wenn am Termin jemand fragt, was eine Schulleitung sieht: Das ist eine eigene, offene
  Entscheidung, nicht Teil dieses Tests.

## 6. Beobachtungsbogen

**Zählregeln:** Ein *Klick* ist jeder Maus- oder Tastendruck, der etwas auslöst (auch Reiter,
Menü, „Abbrechen“, Bestätigen im Fenster; Scrollen zählt nicht). *Zeit* läuft vom Ende des
Vorlesens bis zur Antwort bzw. Erfolgsmeldung. *Zögern* = Pause über 5 Sekunden, Maus kreist,
oder Rückfrage „Wo finde ich …?“ – je ein Strich. Hilfe durch die Moderation mit „H“ vermerken.

| Aufgabe | alt: Klicks | alt: Zeit | alt: Zögern | neu: Klicks | neu: Zeit | neu: Zögern | Zitat / Notiz |
|---|---|---|---|---|---|---|---|
| 1 Wer ist dran? (T02, T03) | | | | | | | |
| 2 Was ist dringend? (T04, T10) | | | | | | | |
| 3 Wo entsteht der Vertrag? (T04) | | | | | | | |
| 4 Anfrage stellen (T01) | | | | | | | |
| 5 Nicht geantwortet (T02, T03) | | | | | | | |
| 6 Vertrag zurück, beenden (T04) | | | | | | | |
| 7 Ablehnung, Offboarding (T06, T07) | | | | | | | |

Erster Eindruck beim freien Umschauen (wörtlich):

&nbsp;

Rückfragen „Wo finde ich …?“ insgesamt (Strichliste, mit Stichwort):

&nbsp;

Am besten / am schlimmsten (Abschluss):

&nbsp;

## 7. Nach dem Termin

1. **Testdaten neu einspielen** (Abschnitt 2, Schritt 3). Docker darf weiterlaufen oder in
   Docker Desktop gestoppt werden.
2. **Bogen und Antworten** am selben Tag abtippen oder abfotografieren und der nächsten
   Claude-Sitzung zusammen mit diesem Leitfaden geben (es stehen nur Testpersonen darauf).
3. **Entscheidungen** ins Logbuch [projekt-ux-umbau.md](projekt-ux-umbau.md), Abschnitt 4
   (neue Tabelle „Am Prototyp-Tag“); E9, E11 und E13 wandern dort aus „Noch offen“. Im
   [Feinplan](pilot-feinplan.md), Abschnitt 11, die drei Punkte „Offen für den Prototyp-Tag“
   als entschieden markieren.
4. **Texte nachziehen:** Pillen und „Jetzt dran“ in `src/lib/prozess/vertragsende.ts`,
   Hinweise in `src/lib/prozess/vertragsende-hinweise.ts`, Rückfragen in
   `src/app/(portal)/vorgaenge/vertragsende/[id]/dialoge.tsx`, Knopftexte in `typen.ts`
   daneben (`AKTION_TEXT`). Das Wort „Abgebrochen“ am Ende der Leiste steht in
   `src/lib/prozess/prozess-stand.ts` und gilt später für alle Module.
5. **Messwerte** (Klicks und Zeit je Aufgabe, alt und neu) ins Protokoll des Logbuchs: Sie sind
   der Ausgangswert der Erfolgsmaße (Feinplan 8 – Klicks je Top-Aufgabe, Rückfragen „Wo finde
   ich …“).
6. **Danach Tag 6–7** (Feinplan 6 und 7): Abnahme mit Bildern je Lage in drei Breiten, Höhe von
   Kopf, Leiste und Reitern bei 1366 × 768, ein Vorgang ganz durch beide Stränge mit Vergleich
   des Protokolls, Rollen, Tastatur, alte Ansicht unverändert; dann `npm run build`.
7. **Deploy** zusammen mit U0 und U1, mit Ankündigung an das Personalbüro: was neu ist, wie man
   zurückschaltet („Zur bisherigen Ansicht“), Rückmeldungen über „Rückmeldung geben“ an
   personalbuchhaltung@fes-minden.de, die Karten im Reiter Dokumente sehen noch alt aus, die
   Liste zeigt bis U3 die bisherigen Texte. Danach zwei Wochen Pilot; erst dann folgt das nächste
   Modul (Onboarding).

## 8. Bilder (Ersatz, falls Docker nicht läuft)

Die Bilder zeigen die neue Ansicht je Testvorgang und entstehen mit
`node scripts/ux-abnahme.js vertragsende` (Dev-Server, Testdaten vom selben Tag) im Ordner
[screenshots/pilot/](screenshots/pilot/). Vor dem Termin prüfen, ob er gefüllt ist. Ohne Docker
die Aufgaben als „Wohin würden Sie klicken?“ am Bild stellen; Klicks und Zeiten sind dann nicht
messbar, nur der Weg. „1366“ ist der sichtbare Bereich eines Schul-Laptops, „1366 ganz“ die
ganze Seite, „390“ ein Handy.

| Testvorgang | Lage | 1440 | 1366 | 1366 ganz | 390 |
|---|---|---|---|---|---|
| T01 Anna Testmann | Angelegt, Anfrage offen | [Bild](screenshots/pilot/pilot-t01-1440.jpg) | [Bild](screenshots/pilot/pilot-t01-1366.jpg) | [Bild](screenshots/pilot/pilot-t01-1366-ganz.jpg) | [Bild](screenshots/pilot/pilot-t01-390.jpg) |
| T02 Ben Testberg | Anfrage läuft, Link gültig | [Bild](screenshots/pilot/pilot-t02-1440.jpg) | [Bild](screenshots/pilot/pilot-t02-1366.jpg) | [Bild](screenshots/pilot/pilot-t02-1366-ganz.jpg) | [Bild](screenshots/pilot/pilot-t02-390.jpg) |
| T03 Clara Testfeld | Anfrage, Link abgelaufen | [Bild](screenshots/pilot/pilot-t03-1440.jpg) | [Bild](screenshots/pilot/pilot-t03-1366.jpg) | [Bild](screenshots/pilot/pilot-t03-1366-ganz.jpg) | [Bild](screenshots/pilot/pilot-t03-390.jpg) |
| T04 David Testhaus | Übernahme, Vertrag offen, Entfristungsrisiko | [Bild](screenshots/pilot/pilot-t04-1440.jpg) | [Bild](screenshots/pilot/pilot-t04-1366.jpg) | [Bild](screenshots/pilot/pilot-t04-1366-ganz.jpg) | [Bild](screenshots/pilot/pilot-t04-390.jpg) |
| T04 – **alte** Ansicht | zum Vergleich | [Bild](screenshots/pilot/pilot-t04-alt-1440.jpg) | [Bild](screenshots/pilot/pilot-t04-alt-1366.jpg) | – | – |
| T05 Emma Testkamp | Vertrag unterschrieben | [Bild](screenshots/pilot/pilot-t05-1440.jpg) | [Bild](screenshots/pilot/pilot-t05-1366.jpg) | [Bild](screenshots/pilot/pilot-t05-1366-ganz.jpg) | [Bild](screenshots/pilot/pilot-t05-390.jpg) |
| T06 Felix Testmeier | Abgelehnt, Offboarding offen | [Bild](screenshots/pilot/pilot-t06-1440.jpg) | [Bild](screenshots/pilot/pilot-t06-1366.jpg) | [Bild](screenshots/pilot/pilot-t06-1366-ganz.jpg) | [Bild](screenshots/pilot/pilot-t06-390.jpg) |
| T07 Greta Testrath | Keine Übernahme, Offboarding angelegt | [Bild](screenshots/pilot/pilot-t07-1440.jpg) | [Bild](screenshots/pilot/pilot-t07-1366.jpg) | [Bild](screenshots/pilot/pilot-t07-1366-ganz.jpg) | [Bild](screenshots/pilot/pilot-t07-390.jpg) |
| T08 Hannes Testwald | Abgeschlossen (Übernahme) | [Bild](screenshots/pilot/pilot-t08-1440.jpg) | [Bild](screenshots/pilot/pilot-t08-1366.jpg) | [Bild](screenshots/pilot/pilot-t08-1366-ganz.jpg) | [Bild](screenshots/pilot/pilot-t08-390.jpg) |
| T09 Ida Teststein | Storniert (aus der Anfrage) | [Bild](screenshots/pilot/pilot-t09-1440.jpg) | [Bild](screenshots/pilot/pilot-t09-1366.jpg) | [Bild](screenshots/pilot/pilot-t09-1366-ganz.jpg) | [Bild](screenshots/pilot/pilot-t09-390.jpg) |
| T10 Jonas Testbrink | Angelegt, Vertragsende überschritten, von DokuBit geändert | [Bild](screenshots/pilot/pilot-t10-1440.jpg) | [Bild](screenshots/pilot/pilot-t10-1366.jpg) | [Bild](screenshots/pilot/pilot-t10-1366-ganz.jpg) | [Bild](screenshots/pilot/pilot-t10-390.jpg) |
