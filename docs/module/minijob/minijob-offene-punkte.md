# Minijob-Checkliste — offene Punkte

> **Stand:** 2026-09-01 · Branch `feat/minijob-checkliste-2026`
> **Herkunft:** kritische Abschlussdurchsicht mit sechs unabhängigen
> Blickwinkeln, danach entdoppelt und geordnet.
> **Nicht enthalten:** die zwölf Fehler, die dabei gefunden und sofort behoben
> wurden — die stehen in
> [minijob-umsetzungsstand.md](minijob-umsetzungsstand.md), Abschnitt 5.

Dieses Dokument ist die Arbeitsliste nach der Fertigstellung. Es beschreibt,
**was fehlt**, nicht was kaputt ist: Das Modul ist funktionsfähig und geprüft.

Jeder Punkt nennt, worum es geht und warum es zählt. Die Fundstellen sind
Anhaltspunkte aus der Durchsicht, kein Auftrag — wer den Punkt angeht, prüft sie
zuerst selbst nach.

**32 Punkte**, davon 11 vor dem Rollout.

---

## Vor dem Rollout

Diese Punkte sollten geklärt sein, bevor der erste echte Minijobber den Fragebogen bekommt. Nicht alle brauchen Code — manche brauchen nur eine Entscheidung.

### Minderjährige: Zustimmung des gesetzlichen Vertreters fehlt vollständig

*Entscheidung nötig*

Checkliste und beide Antragsanlagen verlangen bei Minderjährigen zusätzlich die Unterschrift des gesetzlichen Vertreters. Im Portal steht dieser Satz nur als gedruckte Legende auf dem Antragsvordruck. Die elektronische Wahrheitsversicherung, die im Portal die Unterschrift ersetzt, kennt nur eine Bestätigung — die des Beschäftigten —, und das vorhandene Geburtsdatum wird beim Absenden nicht ausgewertet.

**Warum das zählt:** Für eine Schulträgergruppe ist der minderjährige Schüler im Minijob kein Randfall; 'Schüler' ist die erste Statusoption. Ein 16-Jähriger kann heute allein absenden und sogar eine Befreiung von der Rentenversicherungspflicht erklären. In der Akte liegt dann eine Erklärung, der genau die Zustimmung fehlt, die das Muster verlangt. Zu entscheiden: zweite Bestätigung des Vertreters über einen eigenen Link an dessen E-Mail — oder Minderjährige bewusst auf den unterschriebenen Ausdruck lenken.

<sub>src/lib/erklaerung-arbeitnehmer.ts:44-95; src/lib/rv-antrag-wortlaut.ts:52-54; src/app/api/fragebogen/[token]/route.ts (Absende-Pruefung ohne Altersauswertung)</sub>

### Ein Minijob-Vorgang kann abgesendet werden, ohne dass die Rentenversicherungs-Entscheidung getroffen wurde

*Fachliche Lücke*

Beim Absenden werden Erklärung, Pflichtdokumente und — nur bei Befreiung oder Aufhebung — die Versicherungsnummer geprüft, aber nie, ob überhaupt eine Entscheidung getroffen wurde. Erreichbar ist das über den Wiedereinstieg: Wer beim Umstellen auf die neue Vorlage schon auf der Zusammenfassung stand, springt dorthin zurück und bekommt den neuen Schritt 11 gar nicht mehr zu sehen.

**Warum das zählt:** Der Fragebogen kommt vollständig und rechtsverbindlich bestätigt zurück, ohne die Frage zu enthalten, die die Checkliste als zentral behandelt. HR sieht in der Karte 'noch nicht getroffen', kann den Wert nicht nachtragen und den Fragebogen nicht wieder öffnen — der Vorgang ist unrettbar unvollständig. Betroffen sind besonders die bereits laufenden Vorgänge.

<sub>src/app/api/fragebogen/[token]/route.ts:497-639; src/lib/fragebogen-steps.ts (resolveResumeStep); prisma/seed-check.js:388-418</sub>

### Eine falsche Rentenversicherungs-Entscheidung lässt sich nach dem Absenden nirgends korrigieren

*Fachliche Lücke*

Die Entscheidung wird ausschliesslich im Fragebogen geschrieben. Die HR-Maske für Stammdatenkorrekturen kennt das Feld nicht und verwirft es stillschweigend, die Rentenversicherungs-Karte zeigt es nur an, und der Zugangslink des Beschäftigten ist nach dem Absenden gesperrt. Ein 'Fragebogen zur Korrektur wieder öffnen' gibt es nicht.

**Warum das zählt:** Verklickt sich jemand bei der folgenreichsten Frage — etwa 'Befreiung' statt 'versichert bleiben' —, ist der Zustand endgültig. Der Antrag wird für die falsche Variante erzeugt, die Fristen rechnen für den falschen Weg, und der Beitragsabzug von 3,6 Prozent hängt an einem Wert, den niemand mehr ändern kann. Einziger Ausweg heute: neuer Vorgang oder Eingriff in die Datenbank.

<sub>src/app/api/onboarding/[id]/personal-data/route.ts:20-88; src/app/(portal)/dashboard/[id]/rv-fristen-card.tsx:206-212; src/app/(portal)/dashboard/[id]/detail-content.tsx:469-500</sub>

### Sackgasse im Fragebogen, wenn beim Mandanten die Betriebsnummer fehlt

*Fachliche Lücke*

Wählt jemand 'Befreiung beantragt', wird der unterschriebene Antrag zur Pflichtunterlage und das Absenden ist ohne ihn gesperrt. Den Antrag kann das Portal aber nur drucken, wenn beim Mandanten eine Betriebsnummer hinterlegt ist — sonst verschwindet der Download-Knopf und es steht nur da: 'Bitte wenden Sie sich an die Personalabteilung'. Weder beim Anlegen noch beim Einladen eines Minijob-Vorgangs wird geprüft, ob die Betriebsnummer vorhanden ist.

**Warum das zählt:** Der Beschäftigte steht am Ende der Strecke vor einer Pflicht, die er selbst nicht erfüllen kann: kein Blatt zum Ausdrucken, kein Absenden, kein Ausweg ausser einem Anruf. HR kann den Antrag auch nicht ersatzweise hochladen, und das Portal meldet den Fall von sich aus niemandem. Die Sperre greift erst, wenn der Beschäftigte schon alles ausgefüllt hat.

<sub>src/lib/minijob-antrag.ts:88-91; src/lib/required-documents.ts:89-91; src/app/fragebogen/[token]/steps/step11-rente.tsx:244-271; src/app/api/onboarding/route.ts:94-131</sub>

### HR kann kein Dokument zur Akte hochladen — der unterschriebene Antrag lässt sich nicht nachreichen

*Fachliche Lücke*

Hochladen kann ausschliesslich der Beschäftigte über seinen Zugangslink, und der ist nach dem Absenden gesperrt. Im Dokumente-Bereich des Vorgangs gibt es für HR nur eine Anzeige, kein Upload-Feld und keine Schnittstelle dahinter.

**Warum das zählt:** Der Regelfall des Papierwegs ist damit nicht abgebildet: Der unterschriebene Befreiungsantrag kommt per Post oder wird im Sekretariat abgegeben — der Scan kann nirgends abgelegt werden. Ebenso wenig lässt sich ein unleserlicher Upload ersetzen.

<sub>src/app/api/onboarding/[id]/documents/[docId]/route.ts:16 (nur GET); src/app/(portal)/dashboard/[id]/detail-content.tsx:1955-2028</sub>

### Art der Krankenversicherung (eigene Mitgliedschaft oder Familienversicherung) wird nicht gefragt

*Fachliche Lücke*

Abschnitt 3 der amtlichen Checkliste will zwei Angaben: ob eine gesetzliche Krankenversicherung besteht (mit Kasse) und ob es sich um eine eigene Mitgliedschaft oder eine Familienversicherung handelt. Das Portal erhebt nur den ersten Teil; die zweite Frage kommt im Fragebogen, in der Zusammenfassung, in der Akte und im PDF-Export nirgends vor.

**Warum das zählt:** Eine Pflichtangabe des amtlichen Musters fehlt vollständig. In einer Betriebsprüfung ist die Dokumentation an dieser Stelle unvollständig, und der Auftrag 'alles aus der Checkliste muss in den Prozess' ist für Abschnitt 3 nicht erfüllt.

<sub>src/lib/field-definitions.ts:86-92; src/app/fragebogen/[token]/steps/step4-social-security.tsx:160-220; prisma/schema.prisma (PersonalData, Sozialversicherung)</sub>

### Verlangte Nachweise (private KV, A1, Schul- oder Immatrikulationsbescheinigung) haben keine Kategorie und werden nie eingefordert

*Fachliche Lücke*

Der Fragebogen kündigt Nachweise ausdrücklich an ('Für diese Angabe brauchen wir später die Schul- bzw. Immatrikulationsbescheinigung', 'Bescheinigung A1'), bietet im Upload-Schritt aber keine passende Kategorie an und verlangt sie auch nicht. Von siebzehn Statusoptionen ist nur bei Schüler und Student ein Nachweis hinterlegt; der Nachweis der privaten Krankenversicherung wird trotz vorhandener Angabe 'privat versichert' nirgends angefordert.

**Warum das zählt:** Die Beschäftigten laden die Unterlagen unter 'Sonstiges' hoch oder gar nicht, und HR kann in der Akte nicht erkennen, ob etwas fehlt. Nach den Erläuterungen der Minijob-Zentrale gelten die Angaben ohne Belege nicht als Dokumentation im Sinne der Beitragsverfahrensverordnung — der Aufwand der Abschnitte 2 und 4 verliert in der Prüfung seinen Wert.

<sub>src/lib/required-documents.ts:78-94; src/lib/minijob-status.ts:70,80; prisma/schema.prisma:781-798 (enum DocumentType); src/app/fragebogen/[token]/steps/document-upload.tsx:40-52; src/app/fragebogen/[token]/steps/step6-employment.tsx:342-347,788-793</sub>

### Der Fragebogen lässt sich ohne Rentenversicherungsnummer und ohne die Ersatzangaben absenden

*Fachliche Lücke*

Die Checkliste sagt: Wenn keine Rentenversicherungsnummer angegeben werden kann, sind Geburtsname, Geburtsdatum, Geburtsort, Geschlecht und Staatsangehörigkeit Pflicht. Im Portal ist keine dieser Angaben verpflichtend, die Nummer selbst wird nur verlangt, wenn ein Befreiungs- oder Aufhebungsantrag gedruckt wird — und die Staatsangehörigkeit ist mit 'deutsch' vorbelegt.

**Warum das zählt:** Ein Fragebogen kommt vollständig aussehend zurück, obwohl die Daten für die Meldung zur Sozialversicherung fehlen. Auffallen wird es erst in der Lohnbuchhaltung. Die Vorbelegung 'deutsch' verschärft das, weil ein ungeprüftes Feld richtig aussieht.

<sub>src/lib/field-definitions.ts:88; src/lib/validations/personal-data.ts:279; src/app/fragebogen/[token]/steps/step1-personal.tsx:41; src/app/api/fragebogen/[token]/route.ts:621-634</sub>

### Die drei Tabellen aus Abschnitt 4 (weitere Beschäftigungen) sind für HR am Bildschirm unsichtbar

*Fachliche Lücke*

Die Detailseite eines Vorgangs zeigt nur das Ja/Nein ('weitere Beschäftigungen: ja'), aber keine einzige Zeile der erfassten Angaben — welche Beschäftigung seit wann, mit oder ohne Eigenanteil, wie viele Arbeitstage, Entgelt über der Grenze. Sichtbar werden diese Daten nur über den Gesamtakten-Export als PDF.

**Warum das zählt:** An genau diesen Angaben entscheidet sich die Zusammenrechnung mehrerer Beschäftigungen und die Berufsmäßigkeit. Wer die sozialversicherungsrechtliche Beurteilung vornimmt, hat die Grundlage dafür im Portal nicht vor sich.

<sub>src/app/api/onboarding/[id]/route.ts:44; src/app/(portal)/dashboard/[id]/detail-content.tsx:97-104,1497-1524</sub>

### Deploy-Befehl aus CLAUDE.md würde alle Vorlagen-Anpassungen von HR überschreiben

*Technische Schuld*

Der in CLAUDE.md unter den normalen Server-Befehlen aufgeführte Seed-Befehl (node prisma/seed.js) setzt die Fragebogen-Vorlagen bedingungslos auf den Auslieferungsstand zurück. Im laufenden Betrieb passiert das nicht von selbst, aber genau bei diesem Deploy liegt es nahe, den Befehl 'zur Sicherheit' auszuführen. Mandantendaten wie Betriebsnummer und Abrechnungstag sind nicht betroffen.

**Warum das zählt:** Jede Feldkonfiguration, die HR seit dem letzten Seed im Vorlagen-Editor gepflegt hat, wäre verloren — und fällt bei einem Deploy, bei dem sich die Vorlagen ohnehin sichtbar ändern, nicht sofort auf. Für diesen Deploy genügt es, den Befehl nicht auszuführen; dauerhaft sollte der Seed die Feldkonfiguration nur beim Neuanlegen setzen oder der Befehl in CLAUDE.md als 'nur für eine frische Datenbank' gekennzeichnet werden.

<sub>prisma/seed.ts:238-252; CLAUDE.md, Abschnitt 'Docker-Befehle auf dem Server'</sub>

### Wieder geöffnete Altvorgänge bekommen den neuen Fragebogen nicht

*Technische Schuld*

Beim Deploy werden die eingefrorenen Fragebogen-Konfigurationen laufender Vorgänge nachgezogen — allerdings nur für die Status 'Eingeladen' und 'In Bearbeitung'. Wird ein Vorgang, der zum Deploy-Zeitpunkt abgelaufen oder eingereicht war, später von Hand wieder geöffnet, läuft er mit dem alten Stand weiter.

**Warum das zählt:** Dieser Beschäftigte bekommt einen Fragebogen ohne den Schritt Rentenversicherung und mit der alten Steuerseite — ohne jeden Hinweis in der Oberfläche. Selten, aber schwer zu erkennen. Entweder den Statusfilter der Nachzieh-Migration weglassen oder die Konfiguration beim Zurücksetzen auf 'Eingeladen' neu setzen.

<sub>prisma/seed-check.js:315 und :410; src/app/api/onboarding/[id]/route.ts:145-170</sub>

---

## Bald

Nicht blockierend, aber sie werden im Alltag wehtun. Je länger sie liegen bleiben, desto mehr Vorgänge sind betroffen.

### Widersprüchliche RV-Entscheidungen derselben Person bei mehreren Mandanten fallen niemandem auf

*Fachliche Lücke*

Der Fragebogen sagt dem Beschäftigten zweimal zu, seine Entscheidung gelte für alle seine Minijobs gleichzeitig, und lässt ihn das bestätigen. Danach passiert damit nichts: Die Entscheidung hängt allein am einzelnen Vorgang, es wird nie geprüft, ob dieselbe Person bei einem anderen Mandanten anders entschieden hat.

**Warum das zählt:** Bei CREDO ist das kein theoretischer Fall — das Portal ist bei bis zu 16 Mandanten selbst der 'weitere Arbeitgeber'. Dieselbe Person kann bei Mandant A die Befreiung und bei Mandant B die Versicherungspflicht erklären; beide rechnen unterschiedlich ab. In der Betriebsprüfung fällt das an der Person auf, nachgefordert werden 3,6 Prozent Eigenanteil rückwirkend, möglicherweise bei mehreren Mandanten zugleich. HR sieht den Widerspruch heute nirgends.

<sub>src/lib/minijob-rentenversicherung.ts:108, :132, :210-214; prisma/schema.prisma:415</sub>

### Widerspruch zwischen den Angaben zu weiteren Minijobs und der getroffenen Entscheidung bleibt unbemerkt

*Fachliche Lücke*

In Schritt 6 gibt der Beschäftigte zu jedem weiteren Minijob an, ob dieser 'mit' oder 'ohne Eigenanteil zur Rentenversicherung' läuft — 'ohne' heisst: dort besteht bereits eine Befreiung. In Schritt 11 stehen anschliessend alle vier Wege unabhängig davon zur Wahl; die Angaben aus Schritt 6 werden nur angezeigt, nie ausgewertet.

**Warum das zählt:** Jemand kann angeben, sein anderer Minijob laufe befreit, und trotzdem 'Ich möchte versichert bleiben' wählen — rechtlich unmöglich. Oder er wählt 'Aufhebung einer früheren Befreiung', obwohl er alle anderen Minijobs als beitragspflichtig gemeldet hat; dann gibt es keine Befreiung, die aufzuheben wäre. Der Antrag entsteht trotzdem und wandert in die Entgeltunterlagen. Beide Angaben liegen im selben Fragebogen, die Prüfung wäre ohne Rückfrage möglich.

<sub>src/lib/validations/beschaeftigungs-angaben.ts:39-43; src/app/fragebogen/[token]/steps/step11-rente.tsx:62-65</sub>

### Merkblatt-Kenntnisnahme und Bindungswirkung werden nur im Browser abverlangt

*Fachliche Lücke*

Die Maske lässt 'Befreiung beantragt' erst durch, wenn der Beschäftigte bestätigt hat, das Merkblatt gelesen zu haben und die Bindung an alle seine Minijobs zu kennen. Der Server prüft das an keiner Stelle nach — er nimmt die Entscheidung auch ohne diese beiden Bestätigungen entgegen.

**Warum das zählt:** Das Datenmodell hält ausdrücklich fest, dass die Checkliste diese Voraussetzung verlangt. Wird sie umgangen, erzeugt das Portal trotzdem einen Antrag, in dessen Text steht 'Ich habe die Hinweise auf dem Merkblatt zur Kenntnis genommen' — ohne Nachweis. Dieselbe Regel liegt an zwei Stellen, und nur die schwächere ist verbindlich.

<sub>src/app/fragebogen/[token]/steps/step11-rente.tsx:82-92; src/app/api/fragebogen/[token]/route.ts:124-131 und :619-638</sub>

### Dass die Aufhebung nur einmal möglich ist, wird nirgends festgehalten und nicht geprüft

*Fachliche Lücke*

Der Wortlaut, den das Portal selbst druckt, sagt, dass die einmalige Aufhebung für die Dauer der Beschäftigungen bindend und nicht rücknehmbar ist. Im Datenmodell gibt es dazu nichts: kein Vermerk, ob für diese Person schon einmal eine Aufhebung erklärt wurde, und keine Angaben dazu, seit wann eine früher erklärte Befreiung besteht und bei welchem Arbeitgeber. Die Entscheidung hängt an einem einzelnen, jederzeit überschreibbaren Feld je Vorgang.

**Warum das zählt:** Wer sich bei einem Mandanten hat aufheben lassen und später bei einem anderen Mandanten der Gruppe einen zweiten Minijob beginnt, kann dort erneut 'Befreiung beantragt' wählen. Das Portal erzeugt den Antrag bereitwillig, obwohl er unwirksam ist — die Abrechnung beim zweiten Mandanten wird falsch, und der unwirksame Antrag liegt als Beleg in den Entgeltunterlagen. Ohne die beiden fehlenden Angaben kann HR eine Aufhebung ausserdem fachlich gar nicht prüfen.

<sub>src/lib/minijob-rentenversicherung.ts:126-139; src/app/fragebogen/[token]/steps/step11-rente.tsx:62-65; src/app/api/fragebogen/[token]/route.ts:346-348; prisma/schema.prisma:415</sub>

### Das erzeugte Antragsblatt wird nirgends abgelegt — beim Aufhebungsantrag entsteht gar kein Beleg

*Fachliche Lücke*

Beide Wege bauen das PDF bei jedem Abruf neu und geben es direkt aus; gespeichert wird nur ein Protokolleintrag 'Antrag erzeugt'. Beim Befreiungsantrag fängt der erzwungene Upload das noch auf, beim Aufhebungsantrag ist der Upload bewusst nicht verlangt — dort kommt kein Blatt in die Akte. Ein Modell für erzeugte Dokumente mit Pfad und Prüfsumme existiert bereits und wird von den Brief-Vorlagen genutzt.

**Warum das zählt:** Bei jedem Aufhebungsfall hängt der Beleg für die Entgeltunterlagen daran, dass jemand den Knopf drückt, ausdruckt und papiern ablegt. Wird es vergessen, ist nichts da und der Vorgang sieht trotzdem vollständig aus. Zudem ist ein späterer Abruf nicht dasselbe Blatt: Ändert sich Nachname, Betriebsnummer oder Mandantenname, entsteht ein anderes Dokument als das unterschriebene.

<sub>src/app/api/onboarding/[id]/rv-antrag/route.ts:106-148; src/app/api/fragebogen/[token]/rv-antrag/route.ts:92-145; src/lib/required-documents.ts:65-70; prisma/schema.prisma:1044-1071 (GeneratedDocument)</sub>

### Eingangs-, Wirkungs- und Meldedatum erscheinen weder auf dem Antragsblatt noch im Aktenexport

*Fachliche Lücke*

HR erfasst in der Rentenversicherungs-Karte, wann der Antrag eingegangen ist, ab wann er wirkt und wann gemeldet wurde. Diese Werte leben nur in der Datenbank und auf dem Bildschirm: Der von HR erzeugte Antragsvordruck lässt die beiden Kästchen leer (für den Ausdruck des Beschäftigten richtig, für die HR-Variante nicht), und der Export der Gesamtakte gibt im Abschnitt Rentenversicherung nur Entscheidung, Abgabezeitpunkt, Merkblatt und Bindungswirkung aus — die drei Daten kommen dort nicht vor.

**Warum das zählt:** Genau diese Angaben bestimmen die Beitragspflicht und gehören nach § 8 Abs. 2 Nr. 4a BVV in die Entgeltunterlagen. Ein Prüfer sieht die Entscheidung des Beschäftigten, aber nicht, ab wann die Befreiung wirkt und wann gemeldet wurde. HR muss die Werte handschriftlich auf dem Blatt nachtragen und parallel im Portal pflegen — zwei Quellen für denselben prüfungsrelevanten Wert. Mindestens der Akten-Export sollte sie mitdrucken.

<sub>src/lib/pdf-rv-antrag.ts:74-90, 339-362; src/app/api/onboarding/[id]/rv-antrag/route.ts:106-113; src/lib/pdf-export-onboarding.ts:458-472; src/app/api/onboarding/[id]/pdf-export/route.ts:176-181</sub>

### Nach einem Wechsel der Entscheidung bleiben Antrag und Zeitstempel der alten Wahl in der Akte

*Fachliche Lücke*

Geht jemand in Schritt 11 zurück und wechselt von der Befreiung auf einen anderen Weg, bleibt ein bereits hochgeladener unterschriebener Befreiungsantrag in der Akte liegen. Auch der Vermerk 'Merkblatt gelesen am ...' wird nicht zurückgenommen, obwohl das zugehörige Häkchen wieder auf 'nein' steht.

**Warum das zählt:** In der Akte liegt dann ein unterschriebener Befreiungsantrag bei einem Vorgang, dessen gespeicherte Entscheidung 'bleibt versicherungspflichtig' lautet. Wer die Akte später liest oder exportiert — auch ein Betriebsprüfer — kann nicht erkennen, welcher Stand gilt.

<sub>src/app/api/fragebogen/[token]/route.ts:349-351; src/lib/required-documents.ts:85-91</sub>

### Geschlecht wird nicht erhoben — die Anrede kennt nur 'Herr' und 'Frau'

*Fachliche Lücke*

Das amtliche Muster fragt in Abschnitt 1 nach dem Geschlecht (weiblich, männlich, divers). Das Portal kennt nur eine Anrede mit zwei Werten; 'divers' ist im Datenmodell kommentiert, aber nicht auswählbar.

**Warum das zählt:** Beschäftigte, die weder 'Herr' noch 'Frau' sind, können sich im Formular nicht korrekt abbilden, obwohl das Muster die Option vorsieht. Zugleich fehlt die Angabe, die bei fehlender Rentenversicherungsnummer für die Meldung zur Sozialversicherung gebraucht wird.

<sub>src/lib/validations/personal-data.ts:46,239; src/app/fragebogen/[token]/steps/step1-personal.tsx:63; prisma/schema.prisma (PersonalData.salutation)</sub>

### Arbeitgeber-Adresse lässt sich in zwei der drei Beschäftigungs-Tabellen nicht eintragen

*Fachliche Lücke*

Das amtliche Muster sieht in allen drei Tabellen eine Spalte für Arbeitgeber mit Adresse beziehungsweise Tätigkeitsort vor (freiwillige Angabe). Datenmodell, Prüfung und PDF-Ausgabe können dieses Feld, im Fragebogen wird es aber nur bei den weiteren aktuellen Beschäftigungen abgefragt — nicht bei Vorbeschäftigungen und nicht bei Auslandsbeschäftigungen.

**Warum das zählt:** Die Spalte bleibt in zwei von drei Tabellen dauerhaft leer, in Datenbank wie PDF. Bei der Auslandstabelle fällt das fachlich am stärksten ins Gewicht: Der Tätigkeitsort entscheidet mit darüber, welches Sozialversicherungsrecht gilt (VO (EG) 883/2004).

<sub>src/app/fragebogen/[token]/steps/step6-employment.tsx:670-684 und 764-778 (vorhanden in :475-488); src/app/fragebogen/[token]/steps/step10-summary.tsx:270-286</sub>

### Die Additionsfrage hängt an der Selbsteinstufung statt an den eingetragenen Beschäftigungen

*Fachliche Lücke*

Das Muster stellt die Frage nach der Summe der Verdienste nur, wenn keine Hauptbeschäftigung vorliegt. Das Portal prüft dafür ausschliesslich, was der Beschäftigte im Statusfeld angekreuzt hat — ob er in der Tabelle eine Zeile 'mehr als geringfügig entlohnt' eingetragen hat, bleibt unbeachtet.

**Warum das zählt:** Wer sich als Schüler oder Student einordnet und zugleich eine Hauptbeschäftigung einträgt, bekommt eine Frage gestellt, die das Muster in diesem Fall nicht vorsieht. Die Antwort landet in der Akte und kann die versicherungsrechtliche Beurteilung in die falsche Richtung lenken. Die Regel sollte zusätzlich an den Tabellenzeilen festgemacht und als benannte Funktion neben die übrige Fachlogik gelegt werden.

<sub>src/app/fragebogen/[token]/steps/step6-employment.tsx:206-207, :247-249, :532-556</sub>

### Ampel meldet grün 'Erledigt', auch wenn die Meldung zu spät erfolgte

*Bedienung*

Sobald ein Erledigungsdatum eingetragen ist, springt die Ampel der Meldefrist bedingungslos auf grün — auch wenn dieses Datum nach dem Fristende liegt. Direkt darunter erscheint bei derselben Datenlage der rote Kasten 'Die Meldefrist wurde überschritten'.

**Warum das zählt:** Zwei sich widersprechende Aussagen zur selben Sache auf einem Bildschirm. Wer nur auf die Ampel schaut, hält einen Fall für sauber erledigt, in dem sich das Wirkungsdatum um zwei Monate verschoben hat. Sinnvoll wäre ein eigener Zustand 'verspätet erledigt' in Warnfarbe.

<sub>src/lib/minijob-fristen.ts:634-640; Darstellung src/app/(portal)/dashboard/[id]/rv-fristen-card.tsx:65</sub>

### Es fehlt eine Übersicht, welche Vorgänge eine offene Rentenversicherungs-Frist haben

*Bedienung*

Die Fristendaten werden nur in der Karte eines einzelnen Vorgangs gelesen und geschrieben. Es gibt keine Liste, keinen Filter und keinen Bericht dazu. Auch die Aufgaben-Checkliste hilft nicht: Sie enthält zur Rentenversicherung nur den Punkt 'Befreiungsantrag geklärt', fällig sieben Tage vor Arbeitsbeginn — die eigentliche Meldefrist beginnt aber erst mit dem Eingang des Antrags, also meist danach. Das ist unabhängig von der bereits bekannten fehlenden automatischen Erinnerung; auch eine rein passive Übersicht gibt es nicht.

**Warum das zählt:** Um zu erfahren, wo eine Frist offen ist, muss HR jeden Minijob-Vorgang einzeln öffnen. Wird die Meldung an die Minijob-Zentrale versäumt, wirkt die Befreiung einen Monat später, und für diesen Monat ist der Eigenanteil nachzuzahlen. Ein Filter in der Vorgangsliste und zwei zusätzliche Punkte in der Minijob-Checkliste ('Antrag zu den Entgeltunterlagen genommen', 'Meldung abgesetzt') würden das ohne weitere Technik auffangen.

<sub>src/app/api/onboarding/[id]/rv-fristen/route.ts (einzige Lese- und Schreibstelle); prisma/seed.ts:342-349 (Minijob-Checkliste); src/app/api/reports/</sub>

### Beim Antrags-Download kann der Beschäftigte auf einer Fehlerseite mit rohem Technik-Text landen

*Bedienung*

Der Download-Knopf für den Befreiungsantrag ist ein einfacher Link. Klappt der Abruf nicht — etwa weil die Entscheidung nur im Browser steht und noch nicht gespeichert werden konnte —, verlässt der Browser das Formular und zeigt eine leere Seite mit einer technischen Meldung in geschweiften Klammern.

**Warum das zählt:** Der Beschäftigte sieht statt eines Hinweises im Formular eine kaputt wirkende Seite und findet ohne 'Zurück' nicht mehr in seinen Fragebogen. Genau diese Situation wollte der Code an dieser Stelle eigentlich verhindern.

<sub>src/app/fragebogen/[token]/fragebogen-form.tsx:128-140; src/app/fragebogen/[token]/steps/step11-rente.tsx:250-255</sub>

### Die RV-Karte verschwindet kommentarlos, wenn das Laden fehlschlägt

*Bedienung*

Kann die Karte ihre Daten nicht laden — Netzwerkfehler oder fehlende Berechtigung —, blendet sie sich ersatzlos aus, ohne eine Meldung anzuzeigen.

**Warum das zählt:** Der Nutzer sieht nicht, dass etwas fehlt, sondern nur eine Seite ohne Rentenversicherungs-Bereich. Fristen können dadurch unbemerkt übersehen werden, und Support-Anfragen sind schwer nachzuvollziehen. Ein kurzer Hinweis im Fehlerfall genügt.

<sub>src/app/(portal)/dashboard/[id]/rv-fristen-card.tsx:191-201, :236-237</sub>

### Die drei neuen RV-Routen umgehen die zentrale Zugriffsprüfung

*Technische Schuld*

Die neuen Endpunkte für Antrag und Fristen rufen die zentrale Prüfung 'Darf diese Person auf diesen Vorgang zugreifen?' nicht auf, sondern zählen die erlaubten Rollen jeweils selbst auf. Die Nachbarrouten im gleichen Pfad machen es anders.

**Warum das zählt:** Heute entsteht daraus kein Leck, weil die handgeschriebenen Listen deckungsgleich mit den ohnehin mandantenübergreifenden Rollen sind. Sobald jemand eine mandantengebundene Rolle ergänzt, lesen und schreiben diese Rollen sofort über alle Mandanten hinweg RV-Entscheidung, Fristen und den Antrag mit der Rentenversicherungsnummer — und kein Test fällt dabei um, weil es keinen einzigen Mandanten-Testfall gibt.

<sub>src/app/api/onboarding/[id]/rv-fristen/route.ts:34 und :170; src/app/api/onboarding/[id]/rv-antrag/route.ts:43</sub>

### Neue Fragebogen-Vorlagen erben den Minijob-Schritt 11 automatisch

*Technische Schuld*

Dass die Frage zur Rentenversicherung nur Minijobs betrifft, steht nicht an der Frage selbst, sondern nur als Ausnahme in den Startdaten. Der Standard ist 'Schritt ist an'. Ausserdem nimmt die Vorlagen-Schnittstelle jede Schrittkonfiguration ungeprüft entgegen, auch eine leere.

**Warum das zählt:** Heute stimmt das Ergebnis für alle fünf Vorlagen. Wer aber später eine Vorlage anlegt und die Ausnahme übersieht, stellt einer TV-L-Angestellten die Minijob-Frage nach der Befreiung von der Rentenversicherungspflicht — eine Frage, die auf sie nicht anwendbar ist. Die Absicherung liegt an der falschen Stelle.

<sub>src/lib/field-definitions.ts:199-206 und :232; prisma/seed.ts:174-203; src/app/api/vorlagen/[id]/route.ts:110</sub>

### Der Regressionstest 'Feld gesendet, aber nicht gespeichert' deckt Schritt 11 nicht ab

*Technische Schuld*

Es gibt einen Test, der für jeden Fragebogen-Schritt prüft, dass alle vom Formular gesendeten Felder auch tatsächlich gespeichert werden. Er deckt die Schritte 1 bis 9 ab — der zuletzt hinzugefügte Schritt 11 (Rentenversicherung) fehlt, weil er als einziger Schritt kein zentrales Prüfschema hat.

**Warum das zählt:** Genau die Fehlerart, gegen die dieser Test gebaut wurde (Eingaben gehen beim Speichern still verloren), ist im neuesten und fachlich heikelsten Schritt nicht abgesichert. Ein Prüfschema für Schritt 11 anlegen und in die Testtabelle aufnehmen.

<sub>src/__tests__/lib/fragebogen-felder.test.ts:48-60; src/lib/validations/personal-data.ts</sub>

---

## Später

Aufräumarbeiten ohne Termindruck.

### Der Dokumenttypen-Katalog wird an fünf Stellen unabhängig gepflegt

*Technische Schuld*

Die Liste der Dokumentarten steht neben der Datenbank-Definition in vier weiteren handgepflegten Listen (Beschriftungen, Auswahlliste, Upload-Zuordnung, Farbtabelle) plus zwei zusätzlichen im Upload-Bauteil. Kein Test hält sie gegeneinander.

**Warum das zählt:** Wer eine Dokumentart ergänzt und eine Liste vergisst, bekommt keinen Fehler, sondern eine still halb funktionierende Funktion: Der Typ lässt sich dann etwa nicht hochladen oder nicht als Pflichtdokument setzen. Ein Test gegen die Datenbank-Definition würde das absichern.

<sub>prisma/schema.prisma:781-794; src/lib/required-documents.ts:12-46; src/app/fragebogen/[token]/steps/document-upload.tsx:42-75; src/app/api/fragebogen/[token]/documents/route.ts:47-63; src/app/(portal)/dashboard/[id]/detail-content.tsx:1902-1918</sub>

### Tote Prüfschemata werden neben den aktiven weiter gepflegt

*Technische Schuld*

In der Validierungsdatei liegen zwei Generationen nebeneinander: die alten festen Schemata der Schritte 1 bis 10 und die neuen, von der Vorlagenkonfiguration abhängigen Fabriken. Nur letztere werden benutzt; das alte Schema für Schritt 6 wurde trotzdem auf den neuen Feldstand mitgezogen — ohne jede Wirkung.

**Warum das zählt:** Der Feldschnitt eines Schritts steht an zwei Stellen. Laufen sie auseinander, meldet der Compiler nichts. Die Doppelpflege hat bereits Arbeit gekostet, ohne etwas zu bewirken. Die Typen aus den Fabriken ableiten und die alten Schemata löschen.

<sub>src/lib/validations/personal-data.ts:45-235 (insbesondere 151-165)</sub>

### Die beiden Antrags-Routen sind fast identische Kopien, mit eigenen Rollenlisten

*Technische Schuld*

Die Route, über die der Beschäftigte den Befreiungsantrag herunterlädt, und die Route für HR unterscheiden sich nur in Anmeldung und Datenabfrage; der gesamte Rest — Antragsart, Vorprüfung, Entschlüsselung, PDF-Erzeugung, Protokolleintrag, Antwort-Header — steht zweimal Zeile für Zeile da. Die HR-Route baut ihre Berechtigungsliste zudem von Hand nach, statt die zentrale Gruppe zu verwenden.

**Warum das zählt:** Jede Änderung am Antragsblatt muss an zwei Stellen erfolgen, und die Kopien driften bereits auseinander: Die Fragebogen-Route fängt Fehler mit einer deutschen Meldung ab, die HR-Route liefert einen technischen Serverfehler. Auch die Frage 'wer darf RV-Daten sehen' wird mehrfach unabhängig beantwortet statt zentral.

<sub>src/app/api/fragebogen/[token]/rv-antrag/route.ts:60-145; src/app/api/onboarding/[id]/rv-antrag/route.ts:43 und 65-148</sub>

### Kleinere Aufräumpunkte im neuen Code

*Technische Schuld*

Die Tagesdifferenz-Berechnung der Fristen läuft in einer Schleife über alle Monate seit Jahr 0 (rund 48.600 Durchläufe je Aufruf, mehrfach je Bildschirmaufbau); ein direkter Tagesindex wäre derselbe zeitzonenfreie Ansatz ohne Schleife. In der Detailseite verdeckt eine lokale Variable eine gleichnamige importierte Funktion. Fünf Dateien liegen über 500 Zeilen, darunter der Beschäftigungs-Schritt mit 866 und die Detailseite mit 2.414 Zeilen.

**Warum das zählt:** Einzeln harmlos, zusammen erhöhen sie die Schwelle für die nächste Änderung und das Risiko, dabei etwas zu übersehen. Der Beschäftigungs-Schritt liesse sich entlang seiner drei Tabellen in Teilkomponenten schneiden.

<sub>src/lib/minijob-fristen.ts:601-615; src/app/(portal)/dashboard/[id]/detail-content.tsx:1982</sub>

---
