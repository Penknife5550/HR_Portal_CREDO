# Mitteilung an das HR-Team — Portal-Update Brief-Vorlagen & Dokumente

**Hinweis für den Versand:** Bitte erst **nach** dem Deploy verschicken, damit die
beschriebenen Änderungen im Portal auch tatsächlich sichtbar sind.
Der Abschnitt „Was ihr bitte einmalig erledigt" ist der wichtigste; alles
Weitere ist zur Kenntnis.

Zwei Stellen im Text sind bewusst gesiezt und sollten so bleiben:
das Briefbeispiel (das richtet sich an die Mitarbeitenden, nicht ans Team)
und das Zitat des Etiketts „Für Ihre Einrichtung" (so steht es im Portal).

---

**Betreff:** HR-Portal: Vorlagen und Dokumente sind übersichtlicher — eine kleine Bitte an euch

---

Liebe Kolleginnen und Kollegen,

wir haben im HR-Portal einige Verbesserungen an den Brief-Vorlagen und am
Dokumente-Bereich der Vorgänge eingespielt. Das meiste werdet ihr sofort sehen —
und an einer Stelle brauche ich kurz eure Mithilfe.

## Was ihr bitte einmalig erledigt

**Tragt eure dienstliche Telefonnummer im Portal ein.**

Ihr findet das neue Feld unter *Verwaltung → Benutzer → euer Name → Bearbeiten*.
Falls ihr dort keinen Zugriff habt, gebt mir kurz Bescheid — dann trage ich sie
ein.

Der Hintergrund: In Anschreiben lassen sich ab sofort eure Kontaktdaten
automatisch einsetzen. Ohne hinterlegte Nummer erscheint im fertigen Dokument an
dieser Stelle nur `___`.

## Neu in den Word-Vorlagen: eure Kontaktdaten als Platzhalter

Ihr könnt in jeder Brief-Vorlage künftig diese Felder verwenden. Eingesetzt wird
immer, wer das Dokument erzeugt:

| Platzhalter | Ergebnis im Dokument |
|---|---|
| `{sachbearbeiter_name}` | Erika Musterfrau |
| `{sachbearbeiter_vorname}` | Erika |
| `{sachbearbeiter_nachname}` | Musterfrau |
| `{sachbearbeiter_email}` | erika.musterfrau@credo-gruppe.de |
| `{sachbearbeiter_telefon}` | 0571 / 88 79 - 120 |

Typischer Einsatz am Briefende — die Anrede darin richtet sich ja an die
Mitarbeitenden und bleibt deshalb förmlich:

> Bei Rückfragen wenden Sie sich gern an:
> `{sachbearbeiter_name}`
> Telefon `{sachbearbeiter_telefon}`
> `{sachbearbeiter_email}`

**Wichtig:** `{name}`, `{email}` und `{telefon}` bleiben unverändert die Daten
**der Mitarbeiterin oder des Mitarbeiters**. Nur die Felder mit dem Vorsatz
`sachbearbeiter_` beziehen sich auf euch. Beim Bearbeiten einer Vorlage seht ihr
alle verfügbaren Platzhalter im Kasten „Verfügbare Variablen" — dort gibt es jetzt
eine eigene Gruppe „Sachbearbeiter", und ihr könnt jeden Eintrag anklicken, um ihn
zu kopieren.

## Im Vorgang: der Bereich „Dokumente"

**Ihr seht nur noch die Vorlagen, die zu eurer Einrichtung gehören.** Bisher
standen dort die Vorlagen aller Träger untereinander — auch solche, die für den
jeweiligen Vorgang gar nicht in Frage kamen. Jetzt erscheinen nur noch die
gruppenweit gültigen Vorlagen und die des Trägers, zu dem der Vorgang gehört.

Ein kleines Etikett an jeder Zeile zeigt die Herkunft: **„Für Ihre Einrichtung"**
oder **„Gruppenweit"**. Das hilft besonders dort, wo es eine allgemeine und eine
angepasste Fassung desselben Schreibens gibt.

**Neu: Ihr werdet gewarnt, wenn im Dokument etwas fehlt.** Konnte das Portal beim
Erzeugen einen Platzhalter nicht befüllen, steht direkt unter der Zeile ein
Hinweis:

> *2 Felder blieben leer — bitte im Dokument prüfen.*

Bisher gingen solche Schreiben unbemerkt mit `___` hinaus. Schaut bei diesem
Hinweis bitte kurz ins erzeugte Dokument, bevor ihr es versendet.

**Weitere Anpassungen im selben Bereich:**

- Geht beim Erzeugen etwas schief, steht die Meldung jetzt direkt an der
  betroffenen Zeile — nicht mehr ganz oben, wo man sie leicht übersieht.
- Die **hochgeladenen Nachweise** stehen weiter oben, weil sie am häufigsten
  gebraucht werden. Der **PDF-Export fürs DMS** ist ans Ende gerückt und deutlich
  kompakter: statt fünf großer Kacheln nur noch eine Zeile mit Schaltflächen. Die
  Funktion ist unverändert.
- Die Dokumentarten stehen in Klartext statt in Großbuchstaben — also
  „Mitgliedsbescheinigung Krankenkasse" statt „KK BESCHEINIGUNG".

## In der Vorlagen-Übersicht

Unter *Vorlagen → Brief-Vorlagen* gibt es jetzt zwei Filter über der Tabelle:

- **Modul** — Onboarding, Vertragsverlängerung, BEM und so weiter
- **Geltung** — alle, nur gruppenweite, nur einrichtungsspezifische oder ein
  einzelner Mandant

Daneben seht ihr, wie viele Vorlagen gerade angezeigt werden, und könnt die
Filter mit einem Klick zurücksetzen.

## Kleinere Änderungen

- In der **Benutzerverwaltung** stehen bei „Rolle" nur noch die Rollen zur
  Auswahl, die tatsächlich vergeben werden können. „Einrichtungsleitung" und
  „Vorgesetzter" sind entfallen — diese Konten benötigen eine Zuordnung zu
  Mandanten, für die es im Portal noch keine Oberfläche gibt. Bestehende Konten
  bleiben unverändert nutzbar.
- Die Vergabe der Rolle „Super Admin" ist Super-Admins vorbehalten, und die
  eigene Rolle lässt sich nicht mehr selbst ändern.
- Beim Anlegen von **BEM-Vorlagen** werden jetzt auch die BEM-eigenen Platzhalter
  angezeigt (Fall-Nummer, Fristen und so weiter).

## Was sich nicht ändert

Eure bestehenden Word-Vorlagen funktionieren unverändert weiter — die neuen
Platzhalter wirken nur dort, wo ihr sie selbst einbaut. Auch an den Abläufen, den
Berechtigungen für eure tägliche Arbeit und am Versand ändert sich nichts.

## Rückfragen

Wenn etwas nicht so aussieht wie beschrieben oder euch im Alltag etwas fehlt,
meldet euch gern direkt bei mir.

Herzliche Grüße
Dimitri
