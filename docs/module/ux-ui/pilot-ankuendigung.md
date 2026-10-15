# Ankündigung an das Personalbüro: neue Oberfläche, erster Schritt

**Entwurf zum Versenden am Tag des Deploys** · Stand 15.10.2026 · gehört zu
[`projekt-ux-umbau.md`](projekt-ux-umbau.md) und [`pilot-feinplan.md`](pilot-feinplan.md),
Abschnitt 8

Drei Dinge gehen zusammen hinaus: der neue Seitenkopf mit neuen Adressen (U0 + U1), die neue
Ansicht für Vertragsende als **Vorschau zum Ausprobieren** (Pilot) und der Text der E-Mail im
Versandprotokoll. Die Anrede ist „Sie“ — es ist eine E-Mail (Regel E6).

---

## Textentwurf für die E-Mail

**Betreff:** HR-Portal: neuer Seitenkopf, neue Adressen — und eine neue Ansicht zum Ausprobieren

Guten Morgen,

heute Vormittag haben wir im HR-Portal die ersten Schritte des Oberflächen-Umbaus
eingespielt. Drei Dinge fallen Ihnen auf.

**1. Ein Seitenkopf für alle Seiten, neue Adressen**

Oben steht jetzt auf jeder Seite derselbe Kopf mit den Punkten *Vorgänge*, *BEM*, *Vorlagen*
und *Verwaltung* — je nachdem, was Ihre Rolle öffnen darf. Darunter zeigt jede Seite ihren
eigenen Titel und den Weg dorthin.

Die Adressen heißen neu, zum Beispiel:

* Liste der Einstellungen: `…/vorgaenge/onboarding`
* ein Vertragsende-Vorgang: `…/vorgaenge/vertragsende/<Nummer>`

**Ihre Lesezeichen funktionieren weiter** — alte Adressen leiten automatisch auf die neuen um.
Wenn Sie ein Lesezeichen neu setzen, nimmt es von selbst die neue Adresse.

**2. Vertragsende: eine neue Ansicht zum Ausprobieren**

Auf jeder Vertragsende-Seite finden Sie oben die Zeile **„Neue Ansicht ausprobieren“**. Ein
Klick, und derselbe Vorgang erscheint in der neuen Form:

* eine **Prozessleiste** zeigt, wo der Vorgang steht und welcher Schritt als Nächstes kommt,
* **„Jetzt dran“** sagt in einem Satz, wer gerade handeln muss — und bietet genau den Knopf
  dafür an,
* die Angaben stehen in **Reitern** (Übersicht, Vertragsdaten, Dokumente, E-Mails) statt
  untereinander auf einer langen Seite.

**Zurück geht es jederzeit** über „Zur bisherigen Ansicht“ in derselben Zeile. Die Entscheidung
gilt nur für Sie und nur für dieses Gerät; Ihre Kolleginnen und Kollegen sehen weiter die alte
Ansicht, solange sie nicht selbst umschalten. Die alte Ansicht bleibt vorläufig die Vorgabe und
ist unverändert.

Was die neue Ansicht **noch nicht** kann: Die Karten im Reiter *Dokumente* sehen innen noch aus
wie bisher — sie werden in einem späteren Schritt umgebaut. Alles, was die alte Ansicht kann,
kann auch die neue; es ist nichts weggefallen.

**3. Im Reiter „E-Mails“: nachlesen, was hinausgegangen ist**

Im Reiter *E-Mails* eines Vorgangs und im Versandprotokoll unter *Einstellungen* steht bei
jeder E-Mail jetzt **„E-Mail ansehen“**. Damit sehen Sie den Text so, wie die Empfängerin ihn
bekommen hat — hilfreich bei Rückfragen wie „Was stand in der Erinnerung?“.

Aus Sicherheitsgründen sind **persönliche Zugangslinks in dieser Kopie nicht gespeichert**; an
ihrer Stelle steht ein Platzhalter. Der Text wird wie die übrigen Protokollzeilen nach 90 Tagen
gelöscht. Mails, die vor heute versendet wurden, haben keinen Text. Der Datenschutzbeauftragte
hat zugestimmt.

**Rückmeldungen**

Für die neue Ansicht sammeln wir **zwei Wochen** Rückmeldungen. In der Vorschau führt der
Verweis **„Rückmeldung geben“** direkt zu einer E-Mail an
[personalbuchhaltung@fes-minden.de](mailto:personalbuchhaltung@fes-minden.de). Wir interessiert
vor allem:

* Finden Sie auf Anhieb, was als Nächstes zu tun ist?
* Fehlt etwas, das Sie in der alten Ansicht gewohnt sind?
* Stört etwas?

Danach entscheiden wir, ob die neue Ansicht zur Vorgabe wird und das Onboarding folgt.

Vielen Dank —

---

## Checkliste vor dem Versenden

- [ ] Datum und Uhrzeit des Deploys einsetzen
- [ ] Rollennamen prüfen: Wer im Personalbüro sieht *Vorlagen* bzw. *Verwaltung*?
      („Formulare“ sieht die Sachbearbeitung nicht — U1-F3.)
- [ ] Zwei Bilder anhängen: Kopf mit Navigation, neue Vertragsende-Ansicht mit Prozessleiste
      (vorhanden unter [`screenshots/`](screenshots/) bzw. [`screenshots/pilot/`](screenshots/pilot/))
- [ ] Nach dem Deploy selbst prüfen (Feinplan Abschnitt 8): Verweis aus einer echten
      `contract-end-eskalation`-Mail öffnen; einen echten Vorgang in beiden Ansichten
      nebeneinander ansehen
