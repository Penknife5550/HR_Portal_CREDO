# Ankündigung an das Personalbüro: neue Oberfläche, erster Schritt

**Entwurf zum Versenden am Tag des Deploys** · Stand 19.10.2026 (nach dem Merge von `main`:
„Personen“ im Kopf, Knopf „Text ansehen“, neutrale Wörter statt Paarformen) · gehört zu
[`projekt-ux-umbau.md`](projekt-ux-umbau.md), [`pilot-feinplan.md`](pilot-feinplan.md),
Abschnitt 8, und zum Ablaufplan
[`deploy-ux-umbau-2026-10.md`](../../historie/deploy-ux-umbau-2026-10.md), Schritt 5.5

Drei Dinge gehen zusammen hinaus: der neue Seitenkopf mit neuen Adressen (U0 + U1), die neue
Ansicht für Vertragsende als **Vorschau zum Ausprobieren** (Pilot) und der Text der E-Mail im
Versandprotokoll. Die Anrede ist „Sie“ — es ist eine E-Mail (Regel E6). Verschickt wird sie erst
nach der Probe im Browser (Ablaufplan 5.4).

---

## Textentwurf für die E-Mail

**Betreff:** HR-Portal: neuer Seitenkopf, neue Adressen — und eine neue Ansicht zum Ausprobieren

Guten Morgen,

heute Vormittag haben wir im HR-Portal die ersten Schritte des Oberflächen-Umbaus
eingespielt. Drei Dinge fallen Ihnen auf.

**1. Ein Seitenkopf für alle Seiten, neue Adressen**

Oben steht jetzt auf jeder Seite derselbe Kopf mit den Punkten *Vorgänge*, *Personen*, *BEM*,
*Vorlagen* und *Verwaltung* — je nachdem, was Ihre Rolle öffnen darf. Der Punkt, in dem Sie
gerade arbeiten, ist markiert; rechts stehen Ihr Name und Ihre Rolle.

Die Adressen heißen neu, zum Beispiel:

* Liste der Einstellungen: `…/vorgaenge/onboarding`
* ein Vertragsende-Vorgang: `…/vorgaenge/vertragsende/` und dahinter eine lange Kennung (nicht
  die Vorgangsnummer)

**Ihre Lesezeichen funktionieren weiter** — alte Adressen leiten automatisch auf die neuen um,
auch die Links in älteren E-Mails. Wenn Sie ein Lesezeichen neu setzen, nimmt es von selbst die
neue Adresse.

**2. Vertragsende: eine neue Ansicht zum Ausprobieren**

Wenn Sie einen Vertragsende-Vorgang öffnen, finden Sie oben die Zeile **„Neue Ansicht
ausprobieren“**. Ein Klick, und derselbe Vorgang erscheint in der neuen Form:

* eine **Prozessleiste** ersetzt die bisherige Schrittzeile: Sie zeigt zu jedem Schritt, was
  erledigt ist, was übersprungen wurde und was noch kommt,
* **„Jetzt dran“** sagt in einem Satz, wer gerade handeln muss und bis wann — und bietet genau den
  Knopf dafür an,
* alles Weitere steht gesammelt im Menü **„…“** oben rechts; die Reiter (Übersicht, Vertragsdaten,
  Dokumente, E-Mails) bleiben wie gewohnt.

**Zurück geht es jederzeit** über „Zur bisherigen Ansicht“ in derselben Zeile. Die Entscheidung
gilt nur für Sie und nur für diesen Browser; alle anderen sehen weiter die alte Ansicht, solange
sie nicht selbst umschalten. Die alte Ansicht bleibt vorläufig die Vorgabe und ist unverändert.

Was die neue Ansicht **noch nicht** kann: Die Karten im Reiter *Dokumente* sehen innen noch aus
wie bisher — sie werden in einem späteren Schritt umgebaut. Auch die Liste der Vorgänge bleibt
vorerst, wie sie ist; ihre Statustexte weichen deshalb an manchen Stellen von denen der neuen
Ansicht ab. Alles, was die alte Ansicht kann, kann auch die neue; es ist nichts weggefallen. Neu
ist im Menü „…“ der Punkt „Vorgang stornieren …“.

**3. Im Reiter „E-Mails“: nachlesen, was hinausgegangen ist**

Im Reiter *E-Mails* eines Vorgangs steht bei jeder E-Mail, die ab heute versendet wird, der
Knopf **„Text ansehen“** (Administration und HR-Leitung finden ihn auch im Versandprotokoll unter
*Einstellungen*). Damit sehen Sie den Text so, wie er hinausgegangen ist — hilfreich bei
Rückfragen wie „Was stand in der Erinnerung?“.

Aus Sicherheitsgründen sind **persönliche Zugangslinks in dieser Kopie nicht gespeichert**; an
ihrer Stelle steht ein Platzhalter. Der Text wird mit der Protokollzeile nach 90 Tagen gelöscht.
Mails, die vor heute versendet wurden, haben keinen Text. Der Datenschutzbeauftragte hat
zugestimmt.

**Rückmeldungen**

Für die neue Ansicht sammeln wir **zwei Wochen** Rückmeldungen, bis zum [Datum]. In der Vorschau
führt der Verweis **„Rückmeldung geben“** direkt zu einer E-Mail an
[personalbuchhaltung@fes-minden.de](mailto:personalbuchhaltung@fes-minden.de) (wer kein
Mailprogramm eingerichtet hat, schreibt einfach an diese Adresse). Uns interessiert vor allem:

* Finden Sie auf Anhieb, was als Nächstes zu tun ist?
* Fehlt etwas, das Sie in der alten Ansicht gewohnt sind?
* Stört etwas?

Danach entscheiden wir, ob die neue Ansicht zur Vorgabe wird und das Onboarding folgt.

Vielen Dank —

---

## Checkliste vor dem Versenden

- [ ] Das Ende der zwei Wochen („bis zum [Datum]“) einsetzen; der Text sagt „heute Vormittag“ — passt
      zum Zeitfenster des Ablaufplans (10 bis 12 Uhr), sonst anpassen
- [ ] Rollennamen prüfen: Wer im Personalbüro sieht *Vorlagen* bzw. *Verwaltung*?
      („Formulare“ sieht die Sachbearbeitung nicht — U1-F3; *Verwaltung* sehen nur
      Administration und HR-Leitung.)
- [ ] Zwei Bilder anhängen: den Kopf aus [`screenshots/u1-kopf-1440.png`](screenshots/u1-kopf-1440.png)
      (19.10.2026, mit „Personen“) und die neue Vertragsende-Ansicht mit Prozessleiste aus
      [`screenshots/pilot/`](screenshots/pilot/). Die Pilot-Bilder vom 15.10. zeigen den Kopf noch
      ohne „Personen“ — vor dem Anhängen auf die Prozessleiste zuschneiden.
- [ ] Erst nach der Probe im Browser verschicken (Ablaufplan 5.4): Verweis aus einer echten
      `contract-end-eskalation`-Mail öffnen (gibt es keine: alten Pfad von Hand eintippen); einen
      echten Vorgang in beiden Ansichten nebeneinander ansehen
- [ ] Die Löschung nach 90 Tagen trägt der Lauf „Wartung“ (Ablaufplan 6.2). Zeigte 1.8 ihn mit
      `aktiv` = `t` und `probelauf` = `f`: nichts zu tun. Sonst 6.2 am selben Tag gleich nach dem
      Versand ausführen (die Berichtsmail des Probelaufs kündigt der Bescheid an); nur wenn 6.2 nicht
      am Deploytag folgen kann, den Satz „Der Text wird mit der Protokollzeile nach 90 Tagen
      gelöscht.“ weglassen
