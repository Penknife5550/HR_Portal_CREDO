# Mitteilung an den Datenschutzbeauftragten: Text der versendeten E-Mail im Versandprotokoll

**Entwurf zur Abstimmung** · Stand 15.10.2026 · Verfasst für den Projektverantwortlichen des HR-Portals
Technischer Plan: [`mailtext-im-protokoll-plan.html`](mailtext-im-protokoll-plan.html) · Regeln im Code: `CLAUDE.md`, Abschnitt „Text der Mail im Protokoll“

Dieses Papier beschreibt Tatsachen und stellt Fragen. Rechtliche Wertungen (Rechtsgrundlage, Eintrag im Verzeichnis der Verarbeitungstätigkeiten, Information der Betroffenen) trifft der Datenschutzbeauftragte.

---

## 1. Was ändert sich

Das Versandprotokoll des HR-Portals hat bisher je Versand nur **Betreff, Adressen (An, CC, BCC), Status, Fehlermeldung und Zeitpunkt** gespeichert, nie den Text der E-Mail. Künftig speichert es zusätzlich den **Text der E-Mail so, wie er hinausging** — mit einer Ausnahme: persönliche Zugangslinks werden **vor dem Speichern ersetzt** und stehen in dieser Kopie nicht. (Die Tokens selbst liegen unverändert in den Vorgangszeilen — Fragebogen, Einstellungsmodalitäten, Abteilungslinks, Exit-Interview, Beurteilung — und sind HR im Vorgang sichtbar; nur die Links der Unterlagen-Nachforderung liegen als Hash. Die Kopie legt sie kein zweites Mal ab.)

**Zweck:** HR kann bei Nachfragen nachsehen, was eine Person tatsächlich bekommen hat („Was stand in der Erinnerung?“), ohne den Versand erneut auszulösen oder die Person zu bitten, die E-Mail weiterzuleiten.

Der Versand selbst ändert sich nicht; die E-Mail an die Person enthält weiter den echten Link.

## 2. Welche Daten

| Gespeichert | Beispiel |
|---|---|
| Text (HTML) der versendeten E-Mail | Anrede mit Vorname, Einrichtung, Fristen, Vorgangsnummer, Aufgabenlisten, Freitext aus dem jeweiligen Vorgang |
| Bei nicht zugestellten E-Mails: der Text, der hinausgehen sollte | wie oben |

| **Nicht** gespeichert | Grund |
|---|---|
| **Persönliche Zugangslinks** (Fragebogen, Upload von Unterlagen, Aufgabenlisten der Abteilungen, Exit-Interview, Vorgesetzten-Link u. a.) | Ein Link öffnet ohne Anmeldung Personalakte-Daten (z. B. IBAN, Steuer-ID im Fragebogen). Er wird am fertigen Text durch den Platzhalter „[Persönlicher Link – aus Sicherheitsgründen nicht gespeichert]“ ersetzt. Auf der Portal-Domain bleibt nur eine kleine Liste von Seiten hinter der Anmeldung; auf fremden Domains ersetzt ein Token-Muster in Pfad, Abfragewerten und Fragment. Zuletzt entfernt ein Netz jede UUID und lange Hex-Folge außerhalb dieser Seiten (Platzhalter „[Kennung entfernt]“). |
| **BEM-Mails** | versiegelte Akte; der Text wird nie gespeichert. Das gilt für jedes Ereignis der Gruppe BEM und für jeden Namen mit Präfix `bem-`. |
| Test-Versand aus den Einstellungen | Beispieldaten ohne Wert |
| Übersprungene Mails (Vorlage aus, kein Empfänger) | es wurde nichts erzeugt |
| Anhänge (Dateien) | wie bisher nur die Dateinamen im Feld „Detail“ |
| E-Mails vor Einführung der Funktion | nicht nachträglich herstellbar |

## 3. Betroffene Personen und Inhalte

Beschäftigte und neue Beschäftigte (Onboarding, Offboarding, Vertragsende, Verbeamtung, Elternzeit, Mutterschutz), Führungskräfte und die zuständigen Stellen (IT, Verwaltung, Facility …), Gutachtende in der Verbeamtung. Die Texte nennen je nach E-Mail Name, Einrichtung, Vorgangsnummer, Fristen und Aufgaben.

- **Mutterschutz** ist eingeschlossen (Entscheidung des Projektverantwortlichen vom 14.10.2026). Die fünf Vorlagen nennen nur Name und Vorgangsnummer, bei „angelegt“ zusätzlich Einrichtung und Adresse. Eine Angabe zur Schwangerschaft steht im Text nicht, wohl aber die Tatsache, dass ein Mutterschutz-Vorgang besteht — das steht schon heute im Betreff.
- **Freitexte von HR** stehen im Text, soweit sie in der Mail erscheinen: die persönliche Nachricht im Dokumentenpaket, der Text der individuellen E-Mail, Begründungen bei Zurückweisung von Unterlagen, Kommentare einer Abteilung in den HR-Mails. Diese Texte können beliebige Angaben enthalten.
- **Unterlagen nachfordern:** Sensible Unterlagen (Masernschutz, Schwerbehindertenausweis, Führungszeugnis, Aufenthaltstitel, Arbeitserlaubnis) nennt die E-Mail ohnehin nur als „eine vertrauliche Unterlage“; das bleibt im gespeicherten Text so.

## 4. Wer hat Zugriff

| Stelle | Wer | Reichweite |
|---|---|---|
| Reiter „E-Mails“ im Vorgang, Knopf „Text ansehen“ | Administrator, HR-Leitung, Sachbearbeiter | alle Vorgänge: diese drei Rollen sehen im Portal alle Einrichtungen (die Mandantenprüfung greift nur bei Einrichtungsleitungen und Vorgesetzten, die diese Route nicht erreichen); die Zeile muss zu genau diesem Vorgang gehören |
| Einstellungen → Versandprotokoll | Administrator, HR-Leitung | alle Einrichtungen |
| — | Einrichtungsleitungen, Vorgesetzte, lesende Rollen, API-Schlüssel (Reporting) | kein Zugriff |

Der Text steht in keiner Liste. Er wird erst auf Klick einzeln geladen. Die Listen melden nur, ob ein Text vorhanden ist.

## 5. Speicherdauer

**90 Tage**, wie die übrige Protokollzeile. Der Text hängt mit einem Fremdschlüssel an der Zeile und wird mit ihr gelöscht (Lauf „Wartung“ des Zeitplaners, zusätzlich höchstens einmal am Tag beim Öffnen des Versandprotokolls). Es gibt keine eigene Frist und keine Kopie an anderer Stelle.

## 6. Technische und organisatorische Maßnahmen

- Links werden am fertigen Text ersetzt, nicht nach Variablennamen, und **im Zweifel ersetzt** (nur eine kurze Liste erlaubter Seiten bleibt). Ist die Portal-Adresse in der Konfiguration unlesbar, bleiben nur diese Seiten. Ein automatischer Test erzeugt jede Standardvorlage mit einem echt aussehenden Link und prüft, dass nichts übrig bleibt. Zwei unabhängige Durchsichten mit gezielten Umgehungsversuchen führten am 15.10.2026 zu Verschärfungen (Entitäten, Backslashes, Abfragewerte, Kennungsnetz, Aufbau behaltener Portal-Adressen, lineare Zerlegung der Anzeige).
- Der Text liegt in einer **eigenen Tabelle**, damit er nicht versehentlich in Listenantworten gelangt.
- Anzeige im Portal in einem **abgeschotteten Rahmen** ohne Skripte, ohne klickbare Adressen und mit eigener Sicherheitsrichtlinie; das Dokument darin wird aus einer Positivliste erlaubter Elemente neu aufgebaut. Antworten sind nicht zwischenspeicherbar.
- Der Text geht **an keine Webhook-Adresse** und in keine Konsolenausgabe; Fehler werden nur mit Kennung protokolliert.
- Das **Öffnen eines Textes wird nicht im Prüfprotokoll vermerkt** (siehe Frage c).

## 7. Fragen an den Datenschutzbeauftragten

a) Ist die Speicherung des Mailtextes für 90 Tage durch die bestehende Protokollierung des E-Mail-Versands gedeckt, oder ist das Verzeichnis der Verarbeitungstätigkeiten zu ergänzen? Ist eine Information der Beschäftigten (Datenschutzhinweise) anzupassen?

b) Soll **Mutterschutz** (und gegebenenfalls Elternzeit) vom Speichern des Textes ausgenommen werden? Aktuell eingeschlossen. Eine Ausnahme ist eine Zeile Code.

c) Soll das **Öffnen** eines gespeicherten Textes im Prüfprotokoll vermerkt werden (wie beim Öffnen einer hochgeladenen Unterlage)? Aktuell nein, weil der Text nichts enthält, was HR im Vorgang nicht ohnehin sieht, und Links ersetzt sind.

d) Soll der Text der **individuellen E-Mail** und der persönlichen Nachricht im **Dokumentenpaket** ausgenommen werden? Für beide bestehen eigene Nachweise (individuelle E-Mail: Nachrichtentext 12 Monate, an den Vorgang gebunden). Aktuell stehen sie zusätzlich 90 Tage im allgemeinen Versandprotokoll, das Administrator und HR-Leitung für alle Einrichtungen sehen.

e) Sind **weitere E-Mail-Arten** auszunehmen, bei denen der Text über die Zusage „keine Personendaten im allgemeinen Protokoll“ hinausgeht?

## 8. Stand

Umgesetzt auf dem Zweig `ux-umbau` (Commits `466662b` Backend, `da1c62e` Routen und Oberfläche), **nicht deployt**; die Funktion geht gemeinsam mit dem Umbau der Oberfläche live. Bis dahin speichert das Portal keinen Mailtext. Nach dem Deploy haben nur neu versendete E-Mails einen Text.
