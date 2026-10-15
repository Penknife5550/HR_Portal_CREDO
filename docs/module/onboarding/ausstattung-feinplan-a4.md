# Feinplan „Ausstattung & Zugänge“ – Paket A4 (Stufe 2)

Stand: 13.10.2026, zweite Fassung (Mängelliste der Durchsicht eingearbeitet; was nicht übernommen wurde, steht in Abschnitt 7), mit Nachtrag nach der Durchsicht von A4a: G17 (ein erneutes „fehlt“ öffnet die erledigte Folgeaufgabe wieder, `folgeAufgabeSchritt`), G27 (Grund des Überspringens, „keine Angabe“ im WHERE), 1.3 (`ausgabenZeile` im eigenen Austritt), 1.4 (`bestaetigt` allein ist keine Änderung); Nachtrag nach der Durchsicht von A4c: G15 (Wiederöffnen nach „verbleibt“), G18 (offen übernommenes VERBLEIBT beim Abschluss), G28 (Bindung am Stand beim Austritt, der jüngste Bezug gilt), 1.2, 1.3 (`bezugBindet`, `abgeloesteAustritte`, `rueckgabenFortschritt`), 1.5, 1.6 (`fortschritt`, `merkerWechsel`), 1.8 (Merker mit Rückfrage, Wahl im Zuordnen-Dialog, Fokus des Abschluss-Dialogs, Stand ohne Knöpfe) · Branch `feature/ausstattung-zugaenge` (HEAD 345c631: A1 bis A3 auf `main` 8c1ef05, dazu gemergt `fix/offboarding-rueckgaben` e5eaac4 und `fix/offboarding-routen-rolle-mandant` 1b4a9b1)
**In Betrieb seit dem 14.10.2026:** Stufe 2 über „Rückgabe-Vorgaben übernehmen …“ eingeschaltet (17 Positionen mit „Beim Austritt“), Übergabeprotokoll reaktiviert — Protokoll in [`docs/historie/deploy-main-2026-10.md`](../../historie/deploy-main-2026-10.md).
Grundlage: [`ausstattung-zugaenge-plan.html`](ausstattung-zugaenge-plan.html) (Mockup 6.8, Abschnitt 8 „Stufe 2“, Abschnitte 9 bis 11, Entscheidungen E-A30 bis E-A37), der Feinplan A1–A3 [`ausstattung-feinplan.md`](ausstattung-feinplan.md) (Festlegungen F1–F23, Schritte S0–S20, Grundregeln) und `CLAUDE.md` im Arbeitsverzeichnis (Abschnitte „Abteilungsaufgaben“ und „Ausstattung & Zugänge“).

---

## 0. Zweck und Geltungsbereich

Dieser Feinplan macht Paket A4 baubar. Er legt fest, was Plan und Entscheidungen technisch offenlassen (Abschnitt 1), beschreibt das Datenmodell (Abschnitt 2), schneidet die Arbeit in Schritte, die je ein Agent in einer Sitzung schafft und nach denen das Repo grün ist (Abschnitt 3), und listet Vorlagen, Risiken und echte technische Restfragen (Abschnitte 4 bis 6). Die Festlegungen heißen **G1 bis G28** (A1–A3: F1–F23), die Schritte **S21 bis S37** (A1–A3: S0–S20). Regelnummern R1–R20 beziehen sich auf Abschnitt 7 des Plans, E-A… auf die Abschnitte 12 und 13.

**Basis.** A1 bis A3 sind gebaut und im Browser geprüft (Feinplan A1–A3, Abschnitt 7). Die Voraussetzung aus Mockup 6.8 ist erfüllt: Der Reiter „Rückgaben“ ruft die vorhandene Route `/return-items`, und die Route prüft Rolle und Mandant (e5eaac4). Die Offboarding-Unterrouten Notizen, Dokumente, Exit-Interview und Zeugnis prüfen Rolle und Mandant über `src/lib/offboarding-zugriff.ts` (1b4a9b1). Werkzeuge und Datenbank des Worktrees aus S0 (eigener Prisma-Client, Datenbank `hr_portal_ausstattung` auf Port 5433) gelten weiter.

**Gebaut wird:**

- die Tabelle `Ausgabe` mit einer Zeile je Stück (E-A30);
- „Übergabe vermerken“ an einer Ausstattungsaufgabe, getrennt vom Abhaken, über die Link-Seite der Stelle und über die HR-Karte, mit Nachtragen, Korrigieren und Tauschen auch nach Abschluss des Onboardings;
- die Katalogfelder `ausgabeKennung`, `rueckgabeKategorie` und `beiAustritt`, die ab jetzt pflegbar sind;
- im Offboarding:
  - „Einstellung zuordnen …“ mit Vorschlägen und Bestätigung (E-A31);
  - der Rückgabe-Vorschlag mit den Regeln für mehrere Beschäftigungen (E-A35) und drei unterscheidbaren Leeranzeigen (E-A36);
  - Rücknahme- und Sperraufgaben der ausgebenden Stelle über ihren Offboarding-Link (E-A32);
  - Rückgabezustände, Abschluss mit Warnung und bei einem fehlenden Schlüssel eine Folgeaufgabe für die Gebäudewirtschaft (E-A33);
- Übergabe- und Rückgabeprotokoll als System-Word-Vorlage, dazu das Hochladen des unterschriebenen Exemplars (E-A34);
- Löschfristen als Block im Lauf „Aufbewahrung erzeugter Dokumente“ (E-A37);
- Rückbau nach einer Absage (Plan, Regel 13: „Rückbau-Aufgaben kommen mit A4“), Auslegung in G10;
- die Umformulierung der pauschalen Sperrpunkte der Offboarding-Vorlagen (E-A32), Auslegung in G25.

**Bewusst nicht gebaut:**

- **Bestand der Person als eigene Seite** und Ausgaben ohne Aufgabe („neuer Schlüssel für eine neue Funktion“). Laut E-A36 werden das eine eigene Aktion am Bestand der Person; sie kommt mit der Personenseite (UX-Plan) bzw. der LOGA-Anbindung.
- **Bindung an die Personalakte** (`Ausgabe.employeeId`). Die Spalte wird angelegt, aber bis zur LOGA-Anbindung schreibt sie niemand (E-A31).
- **Rückgabeliste per Mail an die Person** (E-A34: „später“).
- **Zustand der Rückgabe in Offboarding-Mails.** Die Offboarding-Payloads bleiben Byte für Byte gleich (Wächter `offboarding-mails.test.ts`), siehe G21.
- **Der optionale Satz „Laut Portal ausgegeben: …“** in `offboarding-department-assigned` (Plan, Abschnitt 9). Die Rücknahme- und Sperraufgaben stehen ohnehin in der Aufgabenliste der Mail.
- **Ein Nachtrag im Offboarding.** Das Offboarding-Aktionsschema bleibt eingefroren, siehe G14.
- **Ein Arbeitsort-Feld am Offboarding in der Oberfläche.** Der Arbeitsort wird nur bei der Zuordnung übernommen (G12).
- **Kennzahlen im Portal** (Plan, Abschnitt 4: für den Pilot reicht eine Abfrage).
- **A0-Themen ohne Code:**
  - förmliche Beteiligung der MAV vor A4 (E-A15);
  - Bestätigung der Löschfristen durch den DSB (E-A37);
  - Rechtsgrundlage für Stellen in eigenen Gesellschaften (HELEX.IT, Objekt Service; Plan, Abschnitt 10).

  Bauen und deployen darf man vorher. **Eingeschaltet** wird A4, indem Katalogpositionen ein `beiAustritt` bekommen: über die eigene Aktion „Rückgabe-Vorgaben übernehmen …“ oder von Hand im Positionsdialog, **nie** über „Vorschläge übernehmen“. Ohne diesen Wert bietet niemand eine Übergabe an (G27).
- **Handbuchseiten** gehören zur Einführung, nicht zu den Bauschritten. Der Abschnitt in `CLAUDE.md` ist Teil von S37.

---

## 1. Technische Festlegungen

### 1.1 Leitentscheidungen und Abweichungen vom Plan

| Nr. | Festlegung | Begründung | Abweichung vom Plan? |
|---|---|---|---|
| G1 | **Eigene reine Datei `src/lib/ausgaben.ts`** (client-sicher, ohne Uhr, ohne Prisma-Import) für alle Regeln von A4. Sie darf Werte aus `ausstattung.ts`, `abteilungsaufgaben.ts`, `constants.ts`, `format.ts`, `kalendertag.ts`, `vorgangsjahr.ts` und `minijob-fristen.ts` importieren. `ausstattung.ts` importiert aus `ausgaben.ts` nur `import type`. Zod liegt in `src/lib/validations/ausgaben.ts`. | `ausstattung.ts` hat 4469 Zeilen. Getrennt bleiben die A4-Regeln lesbar und einzeln testbar. Kreisfrei, weil die Richtung fest ist (Test wie für `abteilungsaufgaben.ts` ↔ `ausstattung.ts`). | Präzisierung (Plan: „Regeln in `ausstattung.ts`“) |
| G2 | **Modell `Ausgabe`, eine Zeile je Stück** (Abschnitt 2):<br>• Herkunft `onboardingId` mit `onDelete: SetNull`, ohne Cascade.<br>• `employeeId` (bleibt leer).<br>• `organizationId` = Einrichtung, der das Stück gehört: die Empfänger-Einrichtung der Einstellung, also `onboardingEmpfaengerEinrichtung` (Arbeitsort, sonst Einrichtung).<br>• `zentral` = die Position galt beim Vermerk zentral.<br>• `departmentKey` = ausgebende Stelle.<br>• Zustände als Zeichenketten.<br>Statt `uebergebenDurch` gibt es `quelle` (`"LINK"` \| `"HR"`) und `erfasstVonId` (HR-Konto, kein FK). Neu sind `zustandAm`, `kennungLabel` und `zentral`. `rueckgabeKategorie` ist nullbar (nur bei RUECKGABE). `uebergebenAm` ist Pflicht und ein Kalendertag (`@db.Date`). | „Durch wen“ gibt es auf dem Link-Weg nicht: Ein getippter Name wäre Freitext, und `completedById` bleibt per Link absichtlich `null`.<br>Ohne `zustandAm` lassen sich die sechs Monate nach bestätigter Rückgabe weder rechnen noch prüfen.<br>Ohne `zentral` kann E-A35 zentrale Ausgaben nicht von denen der Einrichtung trennen.<br>Ein Kalendertag vermeidet den Zeitzonenfehler des Containers (UTC). | Ja (Feldnamen, Ergänzungen) |
| G3 | **Ein Schreiber für die Tabelle `ausgaben`:** `src/lib/ausgaben-schreiben.ts`. Er arbeitet in einer fremden Transaktion. Jeder Zustandswechsel geht über die reine Funktion `ausgabeZustandDaten(zustand, jetzt, opts)`, die `zustand`, `zustandAm` und `loeschenAb` gemeinsam liefert. Ein Wächter-Test sucht in `src/` jedes `.ausgabe.(create\|createMany\|update\|updateMany\|upsert\|delete\|deleteMany)` außerhalb dieser Datei. | So kann kein Schreibweg die Löschfrist vergessen (E-A37) und keiner einen Zustand ohne Zeitstempel setzen. Das ist dasselbe Muster wie `zuweisungSenden` als einziger Schreiber der Link-Zeile. | Ergänzung |
| G4 | **Eine Ausgabe entsteht nur durch „Übergabe vermerken“** an einer Ausstattungsaufgabe (`herkunft = "AUSSTATTUNG"`), getrennt vom Abhaken (E-A30). Voraussetzungen:<br>• Die Zeile hat `beiAustritt` RUECKGABE oder SPERREN. `NICHTS` oder `null` bieten nie eine Übergabe an.<br>• Die Aufgabe ist nicht entfallen. Sie darf aber noch offen sein.<br>Grenzen:<br>• 1 bis 10 Stück je Vermerk, höchstens 20 aktive Ausgaben je Aufgabe.<br>• Kennung optional, beschriftet mit `kennungLabel` (Momentaufnahme `ausgabeKennung`, sonst „Kennung“).<br>• Datum optional, Vorgabe heute (Berliner Tag), nie in der Zukunft, höchstens 365 Tage vor dem Anlegen des Vorgangs.<br>**Nie automatisch beim Abhaken.** Das Netz dafür ist „ohne Übergabevermerk“ im Offboarding (G13).<br>**Wörter bei einem Zugang** (Review A4b): Hinweis der Karte („Einrichtung nicht vermerkt“), Link-Seite („Einrichtung noch nicht vermerkt“), Erfolgsmeldungen („Einrichtung vermerkt.“, „Einrichtungsvermerk korrigiert.“, „Einrichtungsvermerk entfernt.“, „Sperrung vermerkt.“) und Dialoge sagen nie „Übergabe“; Datumsmeldungen sagen nur „Datum“. Die Mail an HR (`onboarding-task-completed`) beschriftet die Zeile artneutral mit „Vermerkt“ – der Wert sagt selbst „übergeben …“ bzw. „eingerichtet …“. | Ersatzgeräte, mehrere Schlüssel und spätere Übergaben (E-A30) gehen nur ohne Kopplung an den Haken. Ein Zugang (SPERREN) wird genauso vermerkt („eingerichtet am“). | Präzisierung |
| G5 | **Ein Vermerk sperrt Regel 9 der Karte.** Eine Option bzw. Position mit aktiver Ausgabe (AUSGEGEBEN, VERBLEIBT) lässt sich weder abwählen noch streichen, und ihre Stelle lässt sich nicht wechseln: 409 `AUSGABE_VORHANDEN` („Für diese Position ist eine Ausgabe vermerkt – erst die Ausgabe entfernen oder zurücknehmen.“). Die Karte sperrt dasselbe vorab, auch an einer noch **offenen** Aufgabe (Review A4b): `pruefbareAufgaben` (ausstattung.ts) bildet `mitAusgabe` aus den aktiven Stücken; dieselbe Abbildung nutzen die Aktionen der Zeile („Streichen…“) und der Dialog „Bearbeiten…“ (Kästchen der Option fest mit Grund, `festeOptionen`; Stellenwechsel sperrt „Speichern“ mit dem Grund, `bearbeitenGrund`). | Vor der Information der Stelle löscht „Streichen“ die Aufgabe (`checklistItem.deleteMany`). Die Ausgabe verlöre dann ihren Bezug, und die Karte zeigte sie nirgends mehr. | Ergänzung zu R9 |
| G6 | **Vermerk durch die Stelle über eigene öffentliche Endpunkte:**<br>• `POST /api/onboarding-tasks/[token]/[itemId]/ausgaben` (vermerken)<br>• `DELETE …/ausgaben/[ausgabeId]` (eigenen Vermerk entfernen)<br>Nicht über den Link-PATCH: Dessen `refine` („Status oder Kommentar“) weist einen reinen Vermerk ab, und das Schema gilt auch fürs Offboarding.<br>Erlaubt nur, solange der Vorgang läuft. COMPLETED ergibt 409, EXPIRED und ein abgelaufener Link 410; danach trägt HR nach.<br>Entfernen geht nur für Vermerke mit `quelle = "LINK"`, Zustand AUSGEGEBEN und ohne Austrittsbezug (G28). | E-A30 „getrennt vom Abhaken“. Auf dem Link-Weg gibt es keine Person; „vermerkt von <Stelle>“ ergibt sich aus `departmentKey` und `quelle`. | Präzisierung (Karte 10.2) |
| G7 | **HR trägt nach und tauscht, auch nach Abschluss:** Route `POST /api/onboarding/[id]/ausgaben` mit den Aktionen `vermerken`, `korrigieren` (Kennung, Datum), `tauschen`, `zurueckgenommen` (ZURUECK, BESCHAEDIGT, FEHLT ohne Austritt, etwa nach Absage oder Defekt ohne Ersatz) und `entfernen` (irrtümlich vermerkt).<br>• Gilt bei jedem Status, auch COMPLETED und EXPIRED (`vorgangSperrenIn(…, { auch: ["COMPLETED", "EXPIRED"] })`).<br>• Ohne Versandsperre, ohne Änderungsliste (R10: der Ausgabevermerk ist kein Inhaltsfeld), ohne Mail.<br>• Die Antwort ist die Übersicht der Karte. Die Karte zeigt die Ausgaben-Aktionen auch im Zustand NUR_LESEN, solange die Rolle in `HR_EDIT_ROLES` ist.<br>• **Tausch mit Grund** (`grund: "DEFEKT" \| "VERLOREN"`, Pflicht), von AUSGEGEBEN oder VERBLEIBT aus; die neue Ausgabe ist AUSGEGEBEN an derselben Aufgabe, `ersetztDurchId` zeigt immer auf sie. DEFEKT: Die alte wird ERSETZT (Frist 6 Monate). VERLOREN: Die alte wird FEHLT (Frist 3 Jahre ab Jahresende, E-A37 „fehlende Rückgabe“).<br>• **Getauscht werden nur Gegenstände (RUECKGABE)** (Review A4b): Ein Zugang (SPERREN) wird als „gesperrt“ zurückgenommen und neu eingerichtet (`vermerken`). `tauschen` an einem Zugang ergibt 400 `ZUGANG_KEIN_TAUSCH`, und `ausgabenZeile` bietet den Tausch dort nicht an – sonst setzte „verloren“ einen Zugang auf FEHLT, den Zustand, den `zurueckgenommen` für Zugänge ausschließt (400 `ZUGANG_NUR_GESPERRT`, 1.2).<br>• **Nach der Absage** (EXPIRED) tragen neu vermerkte und eingetauschte Stücke die Frist der Absage (G10).<br>• **Verlorener Schlüssel ohne Austritt** (Tausch VERLOREN oder `zurueckgenommen` FEHLT bei `rueckgabeKategorie` SCHLUESSEL): keine Aufgabe an FACILITY, sondern im Dialog und in `meldung` der feste Hinweis „Bitte die Gebäudewirtschaft wegen der Schließung informieren.“ (`MELDUNGEN_AUSGABEN.GEBAEUDEWIRTSCHAFT_INFORMIEREN`).<br>• Ausgaben mit Austrittsbezug (G28) ändert nur der Austritt: 409 `AUSGABE_IM_AUSTRITT`. Die Meldung nennt die Vorgangsnummer nur, wenn HR den Austritt öffnen darf (`canAccessProcess`), sonst „in einem anderen Austritt“. | Plan Z.547: „Übergabe erst nach Abschluss → HR trägt nach“, E-A30 „ergänzen und tauschen“, ausdrücklich auch „verlorene Schlüssel“.<br>Eine eigene Route statt der Kartenaktion, weil deren Prüfkette (409 `VORGANG_ABGESCHLOSSEN`, `MODALITAETEN_FEHLEN`, Versandsperre) hier nicht passt.<br>Ohne Grund würde ein verlorener Schlüssel nach 6 Monaten gelöscht statt nach 3 Jahren; der Umweg „zurückgenommen FEHLT + neu vermerken“ verlöre `ersetztDurchId`.<br>Eine Onboarding-Aufgabe „Schließung prüfen“ ginge bei COMPLETED und EXPIRED an keine Stelle hinaus (kein Versand, Link nur lesbar bzw. 410), deshalb der Hinweis.<br>Der 409 im Austritt verhindert, dass Onboarding und Offboarding gleichzeitig an einem Stück schreiben (G24). | Präzisierung |
| G8 | **Katalogfelder A4 werden pflegbar:** Zod, Positivliste `KATALOG_FELDER`, `PositionEntwurf`, Dialog und Protokoll. Regeln in `positionPruefen`:<br>• ANGABE: alle drei leer.<br>• `beiAustritt` aus `BEI_AUSTRITT` oder leer.<br>• RUECKGABE verlangt `rueckgabeKategorie` aus `RETURN_CATEGORY_LABELS`; sonst ist sie leer.<br>• `ausgabeKennung` (höchstens 40 Zeichen) nur bei RUECKGABE oder SPERREN.<br>`formularGruppen` streicht die Felder weiter, die Führungskraft sieht sie nie. `VORSCHLAEGE` bleibt **ohne** A4-Werte; die Vorgaben stehen getrennt in `RUECKGABE_VORGABEN` und kommen nur über die eigene Aktion in den Katalog (G27, 1.3). Freie HR-Positionen (`hinzufuegen.frei`) bekommen optional `beiAustritt` und `rueckgabeKategorie`, ohne Kennungsbeschriftung. Die Momentaufnahme kopiert die Felder schon seit A2. | Ohne Pflege der Felder gibt es keine Ausgabe. Bestandszeilen ohne Werte gelten als „vor Einführung“ (G13). | nein |
| G9 | **Mail `onboarding-task-completed` mit `ausgabe_vermerk`:**<br>• Rohtext, Zeilen „FES-IPAD-0412 · übergeben 28.01.2027“, und `ausgabe_vermerk_html`, maskiert, mit `<br>`.<br>• Nach dem Commit frisch gelesen, nur aktive Ausgaben dieser Aufgabe; ohne Ausgabe `""`.<br>• Ein Vermerk allein schickt **keine** Mail, es gibt keinen dritten Anlass neben ERLEDIGT und KOMMENTAR.<br>• `betreffOhne` bekommt beide Felder, `FREITEXT_VARIABLEN` den Rohtext. | Plan, Abschnitt 9, und Feinplan A1–A3, Zeile 17. Die Kennung ist Freitext der Stelle, das Ereignis ist seit F1 webhookfrei. | nein |
| G10 | **Rückbau nach Absage** (Anschluss an E-A20):<br>• Die Absage-Mail `onboarding-department-abgesagt` nennt je Stelle zusätzlich die aktiven Ausgaben samt Kennung: `ausgaben_liste`, `ausgaben_liste_html`, Merker `hat_ausgaben`. Das Ereignis ist webhookfrei; `betreffOhne` bekommt die Listen.<br>• Neue Aufgaben gibt es dafür **nicht**, weil die Links eines EXPIRED-Vorgangs mit 410 antworten.<br>• Die Rücknahme vermerkt HR in der Karte (G7 `zurueckgenommen`).<br>• **Frist bei Absage:** Der EXPIRED-Zweig des Onboarding-Status-PATCH setzt in seiner Transaktion (nach dem bedingten Statuswechsel, der den Vorgang sperrt) für jede aktive Ausgabe ohne Austrittsbezug `loeschenAb` = drei Jahre ab Jahresende von `expiredAt` (`ausgabenFristBeiAbsageIn`, über `ausgabeLoeschenAb` mit `vorgangEingestelltAm`, G20). Vermerkt HR danach die Rücknahme, gilt die kürzere Frist des neuen Zustands.<br>• **Auch nach der Absage** (Review A4b): Vermerkt oder tauscht HR an einem schon abgesagten Vorgang (G7 erlaubt beides bei EXPIRED), bekommt das neue AUSGEGEBEN-Stück dieselbe Frist – `ausgabenAnlegenIn` bzw. `ausgabeTauschenIn` mit `vorgangEingestelltAm` = `expiredAt`. Status und `expiredAt` liest der Dienst **nach** der Sperre des Vorgangs (eine gleichzeitige Absage kommt so an); ein Altfall ohne `expiredAt` (vor F12) nimmt den Zeitpunkt des Vermerks – später, nie früher gelöscht. Der EXPIRED-Zweig läuft nur einmal; ohne das bliebe ein nachgetragenes oder eingetauschtes Stück unbegrenzt mit Kennung gespeichert, denn kein Austritt kann eine abgesagte Einstellung binden (`EINSTELLUNG_ABGESAGT`), und G18 griffe nie. | Plan, Regel 13, sagt „Rückbau-Aufgaben kommen mit A4“. Eine Aufgabe, die die Stelle nicht öffnen kann, hilft nicht; die Stelle braucht die Information, HR das Ergebnis.<br>Ohne die Frist blieben Stücke einer Absage, deren Rücknahme HR nicht vermerkt, unbegrenzt mit Kennung gespeichert (E-A37: „bei fehlender Rückgabe 3 Jahre ab Jahresende“). | Ja (Auslegung) |
| G11 | **Zuordnung Austritt ↔ Einstellung (E-A31):**<br>• `OffboardingProcess.onboardingId` bekommt Relation (`SetNull`) und Index.<br>• Knopf „Einstellung zuordnen …“ im Reiter Rückgaben.<br>• Vorschläge mit Begründung in drei Stufen (1.3 `zuordnungsVorschlaege`), dazu eine Suche über Vorgangsnummer oder Nachname.<br>• **Nur HR bestätigt.** Geschrieben wird per bedingtem `updateMany({ id, onboardingId: null, status notIn [COMPLETED, CANCELLED] })`, sonst 409.<br>• „Lösen“ geht nur, solange keine Ausgabe-Aufgabe erledigt ist und keine vorgeschlagene Rückgabe einen Zustand hat; Ablauf in 1.7.<br>• `canAccessProcess` gilt für **beide** Vorgänge.<br>• Kandidaten: nur `processType` EINSTELLUNG, nicht EXPIRED, nur aus erlaubten Mandanten. Eine Einstellung, die schon an einem anderen **laufenden** Austritt (nicht COMPLETED, nicht CANCELLED) hängt, ist nicht wählbar; ein abgeschlossener Austritt (etwa eine Versetzung) sperrt sie nicht.<br>• Dieselben Regeln prüft der POST **nach** der Sperre der Einstellung erneut, nicht nur die Kandidatenliste (1.7): 409 `EINSTELLUNG_VERGEBEN` bzw. `EINSTELLUNG_ABGESAGT`. | Nie über einen stillen Namensabgleich (E-A31). Mehrere Austritte je Einstellung bleiben möglich (abgebrochener plus neuer, Versetzung plus späterer Austritt), deshalb kein `@unique`.<br>Ohne Sperre der Einstellung könnten zwei Austritte dieselbe Einstellung gleichzeitig binden. | nein |
| G12 | **Arbeitsort am Austritt:** `OffboardingProcess.arbeitsortId` (Relation `"OffboardingArbeitsort"`, `SetNull`) wird bei der Zuordnung aus `onboarding.arbeitsortId` übernommen, **nur wenn** beide Bedingungen gelten:<br>• Die Einrichtung der Einstellung ist die Einrichtung des Austritts (`onboarding.organizationId = offboarding.organizationId`). Ein Austritt an Einrichtung Y bekommt nie den Arbeitsort einer Einstellung an Einrichtung X.<br>• Noch keine Stelle des Austritts ist informiert (kein Link mit `sentAt ?? lastSentAt`), geprüft unter der Versandsperre (1.7). Sonst bleibt er leer, und der Dialog sagt das.<br>Empfänger **aller** Offboarding-Abteilungsaufgaben: `arbeitsortId ?? organizationId`. Dafür wird `onboardingEmpfaengerEinrichtung` zu `empfaengerEinrichtung` verallgemeinert, mit Alias für den alten Namen. Das gilt für Versand, Erinnerung, Übersicht und Karte.<br>Unverändert bleiben der Mandant `organizationId` und das Mailfeld `einrichtung`. Lösen setzt ihn zurück, solange keine Stelle informiert ist.<br>**Hinweis vor dem Informieren:** Solange keine Einstellung zugeordnet ist, der Austritt läuft und `zuordnungsVorschlaege` mindestens einen STARK- oder MITTEL-Vorschlag liefert (`rueckgaben.zuordnungEmpfohlen`), zeigen die Abteilungskarte und der Stepper-Schritt „Rückgaben einsammeln“ den Hinweis „Einstellung zuordnen, bevor Sie die Abteilungen informieren“ mit Knopf „Einstellung zuordnen …“. Nur für `HR_EDIT_ROLES` (das Feld `rueckgaben` bekommt sonst niemand). | Sonst gingen die Rücknahmen der OGS-Kraft eines Fördervereins an den Hausmeister des Fördervereins statt an den der Grundschule (Karte offboarding, Stolperstelle 1). Das ist dieselbe Logik wie E-A10: zwei FACILITY-Stellen, aber nur ein Link je Schlüssel.<br>Die Einrichtungsbedingung trennt die OGS-Kraft (Förderverein, Arbeitsort Grundschule) von der Zweitbeschäftigung an einer anderen Einrichtung.<br>Im Normalablauf (anlegen, sofort informieren) käme die Zuordnung sonst zu spät für den Arbeitsort (Frage 4), und Ausgaben blieben unbemerkt. | Ergänzung (Plan offen) |
| G13 | **Rückgabe-Vorschlag (E-A35, E-A36):**<br>Kandidaten: Ausgaben der zugeordneten Einstellung mit Zustand AUSGEGEBEN oder VERBLEIBT, `beiAustritt` RUECKGABE oder SPERREN, ohne Austrittsbezug zu einem **anderen** Austritt (G28; CANCELLED und ein abgeschlossener Austritt mit VERBLEIBT geben frei).<br>Davon werden **vorgeschlagen**:<br>• nicht zentrale mit `organizationId` ∈ {Einrichtung des Austritts, Arbeitsort des Austritts} ∪ {Arbeitsort der Einstellung, **nur wenn** die Einrichtung der Einstellung die Einrichtung des Austritts ist}. Weil `Ausgabe.organizationId` der Arbeitsort der Einstellung ist (G2), schlüge die Menge ohne diese Bedingung jede Ausgabe vor, sobald die Einstellung einen Arbeitsort hat;<br>• zentrale (`zentral = true`) **ohne** Einrichtungsfilter, nur über den Merker: ohne „Person bleibt in einer anderen Beschäftigung“ vorgeschlagen, mit Merker als Hinweis.<br>Der Merker steht in `OffboardingProcess.weitereBeschaeftigung` (S21): gesetzt bei `zuordnen` (im Dialog vorbelegt bei `exitType = VERSETZUNG`), änderbar über `aktualisieren`, im Audit nur als Boolean. `aktualisieren` und `rueckgabenUebersichtLaden` lesen ihn; ohne gespeicherten Merker übernähme „Rückgaben aktualisieren“ zentrale Ausgaben, die HR bewusst als Hinweis gelassen hat.<br>Der Rest steht **als Hinweis** da: zentrale bei weiterer Beschäftigung, Ausgaben anderer Einrichtungen. HR kann sie einzeln trotzdem übernehmen.<br>Die Übernahme läuft in der Transaktion der Zuordnung. Später fügt „Rückgaben aktualisieren“ Fehlendes hinzu (`createMany … skipDuplicates`). Die Übernahme ändert den Zustand der Ausgabe nicht: AUSGEGEBEN und VERBLEIBT heißen beide „noch bei der Person“ (`AUSGABE_AKTIV`) und passen zu einer offenen Rückgabe.<br>Erledigte Ausstattungsaufgaben mit `beiAustritt` und ohne Ausgabe stehen als „ohne Übergabevermerk“ mit „Als ausgegeben übernehmen“ da: HR legt eine Ausgabe mit `quelle "HR"` an, Datum = Berliner Tag von `completedAt`, ohne Kennung. Aufgaben, deren Ausgaben nach Ablauf der Frist gelöscht wurden (`ChecklistItem.ausgabenGeloeschtAm`), stehen dort nie.<br>Die Lage (6 Werte, 1.3 `rueckgabeLage`) entscheidet die Kopfzeile. | E-A35: „Nur Ausgaben der Einrichtung des Austritts; zentrale nur als Hinweis, solange eine andere Beschäftigung läuft.“ Ob eine läuft, weiß das Portal nicht (`Employment` füllt niemand), also entscheidet HR mit einem Merker. VERBLEIBT bleibt Bestand und kommt beim nächsten Austritt wieder (G28 gibt es mit dem Abschluss frei). | Präzisierung |
| G14 | **Rücknahme- und Sperraufgaben (E-A32):**<br>Je Ausgabe genau eine `OffboardingChecklistItem` mit `herkunft "AUSGABE"` und `ausgabeId` (`@@unique([offboardingId, ausgabeId, herkunft])`).<br>• Titel **ohne Kennung**: „<Bezeichnung> zurücknehmen“ bzw. „<Bezeichnung> sperren“.<br>• Feste Beschreibung (1.3).<br>• Kategorie `AUSSTATTUNG_KATEGORIE`, `orderIndex` unter `ORDER_BASIS`, also oben.<br>• `dueDate` = max(letzter Arbeitstag, heute).<br>• Stelle = `Ausgabe.departmentKey`; HR heißt Portal-Aufgabe ohne Link.<br>RUECKGABE bekommt zusätzlich eine `ReturnItem`:<br>• `category` aus `rueckgabeKategorie`, sonst SONSTIGES;<br>• `itemName` = Bezeichnung;<br>• `serialNumber` = Kennung.<br>SPERREN bekommt nur die Aufgabe.<br>In derselben Transaktion:<br>• Links betroffener Stellen verlängern (`gueltigBis`/`verlaengerungNoetig`);<br>• `linkStatusNeuBerechnenIn`, mit Audit `DEPARTMENT_TASKS_REOPENED` bei WIEDER_OFFEN.<br>**Kein Nachtrag im Offboarding:** Das Aktionsschema bleibt unverändert. Die Abteilungskarte zeigt „n Aufgaben nach der Information hinzugekommen – „Erneut senden““ (gleicher Token, außer bei neuer Adresse). Die Link-Seite zeigt sie sofort, die nächste Erinnerung nimmt sie mit.<br>Portal-PATCH für `herkunft != null`:<br>• nur `HR_EDIT_ROLES`, sonst 403;<br>• `assigneeDepartment` im Body ergibt 409.<br>**Transponder und Chips** sind Rückgabe-Stücke (Kategorie SCHLUESSEL) mit einer Rücknahmeaufgabe, keine Sperraufgaben wie in Mockup 6.8. Einen nicht zurückgegebenen Chip deckt die Folgeaufgabe „Schließung prüfen“ ab (G17; ihre Beschreibung nennt das Sperren im Schließsystem). | E-A32. Kennungen in Titel oder Beschreibung gingen in den Betreff von `offboarding-task-completed`, an n8n (die Offboarding-Ereignisse sind nicht webhookfrei) und blieben über jede Löschfrist hinaus stehen (Weg B der Karte laeufe-loeschen).<br>Ein Nachtrag hätte das eingefrorene Offboarding-Schema, seine Tests und die Byte-Gleichheit geändert.<br>Transponder: ein Stück, eine Aufgabe. Eine zweite Sperraufgabe zum selben Chip liefe neben der Rücknahme her und müsste mit ihr gleichlaufen. | Präzisierung; **Ja** bei Transpondern (Plan: Sperraufgabe) |
| G15 | **Ein Stück, drei Zeilen, ein Stand:** `Ausgabe.zustand` ist führend. Aufgabe (`isCompleted`) und `ReturnItem` (`zustand`, `isReturned`) folgen **in derselben Transaktion**, gleich über welchen Weg:<br>• Link-PATCH der Stelle;<br>• Portal-PATCH;<br>• Reiter Rückgaben.<br>Den Gleichlauf übernimmt `ausgabeGleichlaufIn` (in `ausgaben-schreiben.ts`).<br>• Offen heißt auf allen drei Zeilen dasselbe: Rückgabe ohne Zustand, Aufgabe offen, Ausgabe aktiv (AUSGEGEBEN oder VERBLEIBT).<br>• Wiederöffnen setzt AUSGEGEBEN, `ReturnItem.zustand null` und löscht eine offene Folgeaufgabe. **Auch nach „verbleibt“** (Review A4c): Hat DIESER Austritt den Zustand gesetzt (Rückgabe-Zeile mit Zustand bzw. Aufgabe erledigt), heißt „offen“ immer AUSGEGEBEN (`ausgabeNachZiel` mit `warErledigt`; der Link-Weg, der die Aufgabe schon geschaltet hat, gibt den Stand vorher mit, `aufgabeWarErledigt`). VERBLEIBT bleibt nur, solange das Stück unverändert aus einem früheren Austritt übernommen ist (Zeile offen). Sonst stünde nach „verbleibt“ → „offen“ eine offene Zeile neben VERBLEIBT, und der Abschluss gäbe das Stück ohne Frist frei.<br>• **Abhaken ohne Zustand:** Eine RUECKGABE-Aufgabe mit `isCompleted: true` und ohne `zustand` gilt auf beiden Wegen (Link und Portal) als ZURUECK, wie `isReturned: true` im Reiter (G16). So bleibt der bestehende Haken im Reiter Checkliste (`toggleChecklistItem` schickt nur `{ isCompleted }`) gültig.<br>• Ein Austritt ändert eine Ausgabe nur, solange sie an **keinen anderen** Austritt gebunden ist (G28, nach der Sperre der Ausgabe gelesen, sonst 409 `AUSGABE_IM_AUSTRITT`). Der Reiter eines abgeschlossenen Austritts zeigt den Stand beim Austritt (`ReturnItem.zustand`); eine danach freigegebene VERBLEIBT-Ausgabe lebt in der Karte bzw. im nächsten Austritt weiter.<br>• Eine vorgeschlagene Rückgabe lässt sich nicht löschen (409, stattdessen „entfällt“).<br>• Kennung korrigieren im Reiter Rückgaben ändert `ReturnItem.serialNumber` **und** `Ausgabe.kennung`. Für Zeilen mit `ausgabeId` gilt dafür das Kennungsschema aus `validations/ausgaben.ts` (≤ 60 Zeichen, einzeilig, ohne spitze Klammern und Steuerzeichen, sonst 400), nicht die 100 Zeichen von `rueckgabeAendernSchema`. | Sonst zeigten Link-Seite, Reiter und Karte für dasselbe Stück drei verschiedene Stände (Karte offboarding, Stolperstelle 4).<br>Über den Reiter käme sonst eine ungeprüfte Kennung in `Ausgabe.kennung`, in webhookfreie Onboarding-Mails und in Word-Protokolle. | Ergänzung |
| G16 | **`ReturnItem.zustand` neben `isReturned`.** `isReturned` wird abgeleitet: wahr bei ZURUECK oder BESCHAEDIGT. Alle Leser von „offen“ nehmen die reine Funktion `rueckgabeOffen` (Zustand leer und `isReturned` falsch).<br>• Altbestand mit `isReturned = true` ohne Zustand gilt als ZURUECK, ohne Datenmigration.<br>• Der PATCH-Body bleibt verträglich: `isReturned: true` heißt ZURUECK, `false` heißt offen.<br>• Fortschrittszahlen zählen „erledigt“ (Zustand gesetzt), nicht „zurückgegeben“. Der Feldname `returnProgress.returned` bleibt aus Verträglichkeit. | `isReturned` hat sechs Leser (Karte offboarding, Abschnitt 5). Mit „fehlt“ und „verbleibt“ bliebe der Fortschritt sonst für immer unter 100 %. | nein |
| G17 | **„fehlt“ bei einem Schlüssel ergibt eine Folgeaufgabe** für FACILITY:<br>• `herkunft "AUSGABE_FEHLT"`, gleiche `ausgabeId`;<br>• Titel „Schließung prüfen: <Bezeichnung>“, `dueDate` heute;<br>• entsteht in der Transaktion, die FEHLT setzt, egal auf welchem Weg.<br>Weil Links vor Aufgaben gesperrt werden (G24), sperrt dieser Weg den FACILITY-Link vorab mit, sobald `zustand` FEHLT gesetzt oder verlassen wird und die Kategorie SCHLUESSEL ist.<br>Verlässt das Stück den Zustand FEHLT, wird eine **offene** Folgeaufgabe gelöscht; eine erledigte bleibt.<br>**Erneut FEHLT im selben Austritt** (FEHLT → „Schließung prüfen“ erledigt → ZURUECK bzw. Wiederöffnen → wieder FEHLT): Die stehen gebliebene erledigte Folgeaufgabe wird **wieder geöffnet** – `isCompleted` falsch, `completedAt`/`completedById` leer, fällig heute, `abteilungKommentar`/`abteilungKommentarAm` geleert (der Kommentar gehört zur früheren Prüfung) –, eine zweite wird nicht angelegt. Der Index `@@unique([offboardingId, ausgabeId, herkunft])` lässt je Austritt und Ausgabe nur eine Folgeaufgabe zu: Ein `create` endete in P2002 (die Stelle könnte „Fehlt“ nicht mehr setzen), ein `skipDuplicates` verschluckte den erneuten Verlust still. Anlegen, Wiederöffnen, Löschen oder nichts entscheidet die reine Funktion `folgeAufgabeSchritt` (1.3) für alle drei Wege.<br>Auf der Link-Seite von FACILITY trägt die Folgeaufgabe das Feld `ausgabe` **nur lesend** (`{ art, kennungLabel, kennung, zustandLabel: "fehlt" }`, ohne `auswahl`) und hat den normalen Haken (1.6). | E-A33. Die Gebäudewirtschaft entscheidet über den Zylindertausch, auch wenn eine andere Stelle den Schlüssel ausgab; dafür braucht sie die Schlüssel- bzw. Chipnummer, die nach G14 nicht im Titel stehen darf. | nein |
| G18 | **Abschluss mit Warnung (E-A33):**<br>• Der COMPLETED-Zweig des Offboarding-PATCH läuft in einer Transaktion: erst bedingtes `updateMany` auf den gelesenen Status (Sperre), dann Zählung der offenen Rückgaben (`offeneRueckgaben`, Stück für Stück), dann das Update.<br>• Ohne `bestaetigt` folgt 409 `{ error, grund: "RUECKGABEN_OFFEN", offen: [{ titel, stelle }] }` und Rollback.<br>• **Nichts vor der Prüfung schreiben:** Kommt `exitData` im selben Body wie `status: COMPLETED`, läuft der `exitData`-Upsert (heute vor jeder Transaktion, `route.ts:264–331`) in dieser Transaktion **nach** Sperre und Zählung. Bei anderen PATCHes bleibt er, wo er ist.<br>• Mit Bestätigung: Audit `offeneRueckgaben: n`. Jede offene Ausgabe des Austritts bekommt `loeschenAb` = 3 Jahre ab Jahresende des Abschlusses.<br>• **Offen ist auch ein übernommenes VERBLEIBT** (Review A4c): Ein Stück, das ein früherer Austritt mit „verbleibt“ freigab und das dieser unverändert übernommen hat, ist offen, solange seine Rückgabe-Zeile bzw. (Zugang) seine Sperraufgabe IN DIESEM Austritt offen ist. Der Abschluss setzt es mit derselben Frist auf AUSGEGEBEN (`offeneAusgabenAbschliessenIn` → `ausgabeZustandIn`, bedingt auf VERBLEIBT; Audit `AUSGABE_ZUSTAND_GEAENDERT` mit `ueber: "ABSCHLUSS"`, ohne Kennung); damit bleibt es an diesen Austritt gebunden, dessen Reiter die späte Rückgabe aufnimmt. Ein hier gesetztes VERBLEIBT (Zeile erledigt) bleibt ohne Frist und wird frei (G20, G28). Sonst gäbe der Abschluss das Stück frei, obwohl die Rückfrage es als offen nannte: Die Zeile stünde für immer auf „offen“, kein Austritt nähme die späte Rückgabe auf, und die Kennung bliebe unbegrenzt gespeichert.<br>• Der Link-PATCH einer Ausgabe-Aufgabe sperrt zuerst den Austritt, bedingt auf „nicht COMPLETED und nicht CANCELLED“ (Muster A3, E-A19). | Abschluss mit Warnung, nicht gesperrt. Ohne Sperre rutschte ein „wieder öffnen“ zwischen Zählen und Commit durch. | nein |
| G19 | **Protokolle (E-A34):**<br>• Zwei System-Vorlagen: „Übergabeprotokoll Ausstattung“ (ONBOARDING) und „Rückgabeprotokoll Ausstattung“ (OFFBOARDING). Die `.docx` erzeugt ein Skript im Repo, getestet wird ihr Inhalt.<br>• Listen-Platzhalter je Stelle mit Seitenumbruch und Unterschriftszeilen, dazu ein Leerblock `{^…}`. Die inneren Namen sind eindeutig und nicht sensibel (1.3).<br>• Der Platzhalter-Katalog kennt Listen. Der Editor zeigt die inneren Namen nicht als Eingabefelder, und „Erzeugen“ überschreibt eine Liste nie mit einem Handwert.<br>• `ensureSystemDocumentTemplates` arbeitet eine exportierte Liste `SYSTEM_VORLAGEN` ab. Suchschlüssel ist `{ isSystem, modul, originalName }`, gelesen mit `findMany` und `orderBy: { createdAt: "asc" }`: Aktualisiert wird die **älteste eingeschaltete** Zeile, ohne eingeschaltete die älteste (Review A4d; vorher die älteste). Bei mehr als einer **eingeschalteten** Zeile schreibt der Seed-Check die Warnung „Duplikat der System-Vorlage … – bitte in Brief-Vorlagen bereinigen (alle bis auf eine deaktivieren)“ ins Protokoll und löscht nichts. Bereinigen heißt Deaktivieren: Brief-Vorlagen kennt kein Löschen, ein deaktiviertes Duplikat löst keine Warnung mehr aus. Beim Aktualisieren wechseln nur Datei, Hash, Größe und Platzhalter; Name, Beschreibung, `isActive` und `organizationId` pflegt HR. **Das Modul ist fest** (Review A4d): `PATCH /api/brief-vorlagen/[id]` weist an einer System-Vorlage ein anderes Modul mit 409 ab, der Bearbeiten-Dialog sperrt das Feld (`systemVorlageModulGesperrt`, `src/lib/brief-vorlagen-filter.ts`). Die Beschreibung schreibt der Seed nur beim Anlegen; sie nennt deshalb keinen internen Paketnamen („System-Vorlage (Ausstattung & Zugänge)“). Das Übergabeprotokoll wird **ausgeschaltet** angelegt, das Rückgabeprotokoll eingeschaltet.<br>• **Weg zur Stelle:** HR erzeugt das Protokoll (eine Seite je Stelle) und gibt der ausgebenden Stelle ihre Seite zur Unterschrift weiter; die unterschriebenen Seiten lädt HR hoch. Die Link-Seite bietet das Protokoll **nicht** an. Der Weg steht im Handbuch und in der Übergabe.<br>• **Stand sichtbar (Pflicht nach E-A34):** Sobald ein Vorgang aktive Ausgaben mit RUECKGABE hat, zeigt die Karte „Ausstattung & Zugänge“ die Zeile „Unterschriebenes Übergabeprotokoll: fehlt“ bzw. „… hochgeladen am TT.MM.JJJJ“. Der Reiter Rückgaben zeigt dasselbe für `RUECKGABEPROTOKOLL`, sobald der Austritt Rückgaben mit `ausgabeId` hat, und der Abschluss-Dialog nennt ein fehlendes Rückgabeprotokoll als Hinweiszeile (ohne Sperre). Berechnet rein aus dem Dokumenttyp (`protokollStand`, 1.3).<br>• Hochladen: Im Offboarding gibt es den Weg schon (`RUECKGABEPROTOKOLL`). Im Onboarding kommt `POST /api/onboarding/[id]/documents` hinzu, in A4 nur für den neuen Typ `UEBERGABEPROTOKOLL`, höchstens **9 MB** Rohbytes mit `contentLengthZuGross` vor dem Lesen (413). Die Middleware schneidet Portal-Bodys bei 10 MiB still ab; eine Datei von 10 MB käme samt Multipart-Rahmen abgeschnitten an.<br>• **Entfernen (Review A4d):** `DELETE /api/onboarding/[id]/documents/[docId]` nur für `UEBERGABEPROTOKOLL` (Bedingung in der Abfrage), `HR_EDIT_ROLES`, unabhängig vom Status; Datei vor Zeile über `dateiLoeschen` unter `uploads/<onboardingId>`, Zeile und Audit `DOCUMENT_DELETED` in einer Transaktion. Die Upload-Karte listet die hochgeladenen Protokolle mit „Entfernen …“ und Rückfrage.<br>• **Die Person sieht das Protokoll nicht:** Die öffentliche Fragebogen-Route `…/fragebogen/[token]/documents` liefert bei GET, PATCH und DELETE nur noch Dokumente mit Typ aus `SELECTABLE_DOCUMENT_TYPES`; jedes andere Dokument ist dort unbekannt (DELETE und PATCH: dieselbe 404). | E-A34: Die ausgebende Stelle holt die Unterschrift ein, deshalb eine Seite je Stelle.<br>Heute kennt kein Teil eine Liste: Die inneren Namen landeten als Eingabefelder im Editor, ein Handwert für `ausgaben` überschriebe die Liste (Karte dokumente-person, 4a).<br>Der alte Seed reaktivierte eine von HR abgeschaltete Vorlage und legte nach einer Umbenennung ein Duplikat an (Karte, Abschnitt 2). Solche Duplikate können schon in der Datenbank liegen; `findFirst` ohne Sortierung träfe dann zufällig eine.<br>Ein Download auf der Link-Seite bräuchte eine neue öffentliche Route, die ein Word mit Name und Kennungen ausliefert.<br>Review A4d: Ein umgestelltes Modul ließe den Seed eine zweite, eingeschaltete Zeile anlegen und den Löschlauf die erzeugten Protokolle (`GeneratedDocument.modul`) nicht mehr finden. Ein HR-Upload ohne Löschweg ließe eine Fehlablage (das Protokoll einer anderen Person) bis zur letzten Ausgabe des Vorgangs in der Akte – bei VERBLEIBT nie (Art. 5 Abs. 1 lit. d, Art. 17 DSGVO).<br>Die Fragebogen-Route listet heute **alle** `Document` des Vorgangs (`route.ts:266`) und löscht jedes davon samt Datei (`:489–509`), solange der Fragebogen offen ist; der Dienstbeginn liegt oft davor. Die Positivliste umfasst heute alle übrigen Werte des Enums, für den Bestand ändert sich also nichts. | Präzisierung |
| G20 | **Löschfristen (E-A37)** in `loeschenAb`, gesetzt mit jedem Zustandswechsel (G3):<br>• ZURUECK, BESCHAEDIGT, ENTFAELLT und ERSETZT: Beginn des Berliner Tages sechs Monate nach `zustandAm`, Monatsende gekappt.<br>• FEHLT: 1.1. des vierten Folgejahres nach dem Berliner Jahr von `zustandAm`, also drei Jahre ab Jahresende (FEHLT im Jahr 2027 → 1.1.2031).<br>• AUSGEGEBEN: `null`. Ausnahmen mit derselben Rechnung wie FEHLT: offen beim Abschluss des Austritts (G18, Jahr des Abschlusses) und aktiv bei der Absage der Einstellung (G10, Jahr von `expiredAt`) – auch ein Stück, das HR erst nach der Absage vermerkt oder eintauscht. Der Anker zählt unabhängig vom Realm des `Date` (kein `instanceof`): Ein still verlorener Anker hieße „unbegrenzt gespeichert“.<br>• VERBLEIBT: `null`.<br>Gelöscht wird in einem eigenen Block im Lauf „Aufbewahrung erzeugter Dokumente“, eine Transaktion je Herkunfts-Vorgang, **in der Sperrreihenfolge G24** (1.11): erst die betroffenen Austritte und die Einstellung sperren, dann die Löschmenge neu lesen und festlegen, erst danach für genau diese Ausgaben Kommentare leeren, Ausgaben bedingt löschen, die Kopie in `ReturnItem` leeren und die Merker setzen. Geleert werden:<br>• `ReturnItem.serialNumber`, `condition`, `notes`;<br>• `abteilungKommentar` der Rücknahme- und Folgeaufgaben des Offboardings **und** der Onboarding-Ausstattungsaufgabe, an der vermerkt wurde („iPad 0412 übergeben“), sobald diese Aufgabe keine Ausgabe mehr hat.<br>Merker: `ChecklistItem.ausgabenGeloeschtAm` je Ausstattungsaufgabe (Anzeige „Ausgaben nach Ablauf der Aufbewahrungsfrist gelöscht“, nie wieder „ohne Übergabevermerk“) und `ausgabenGeloeschtAm` an On- und Offboarding (Protokolle). Ein neuer Vermerk setzt beide Merker zurück.<br>Die Protokolle fallen mit der letzten Ausgabe ihres Vorgangs: hochgeladene (`UEBERGABEPROTOKOLL`, `RUECKGABEPROTOKOLL`) **und** die vom Portal erzeugten (`GeneratedDocument` der beiden System-Vorlagen mit `refId` = Vorgang), jeweils Datei vor Zeile (1.11).<br>Der Bericht zählt zusätzlich aktive Ausgaben ohne Frist mit `uebergebenAm` älter als drei Jahre (`ohneFristAelterDreiJahre`, nur Zahl), damit nie zugeordnete Bestände sichtbar werden (Abschnitt 6, Frage 7). Mit Probelauf. | E-A37. Die Kennung steht auch in `ReturnItem.serialNumber`, in Kommentaren, im unterschriebenen und im erzeugten Protokoll, und Vorgänge werden nie gelöscht. Ein Löschen nur der Zeile `ausgaben` ließe also alles Wesentliche stehen.<br>Erzeugte Dokumente fielen sonst erst zwölf Monate nach der Erzeugung (`dokumente-aufbewahrung.ts`), ein beim Austritt erzeugtes Rückgabeprotokoll überlebte die Ausgabe um bis zu ein halbes Jahr.<br>Ohne Merker je Aufgabe forderte die Karte nach der Löschung dauerhaft „Übergabe vermerken“ und der Reiter „Als ausgegeben übernehmen“ – also neue Zeilen für längst zurückgegebene Stücke.<br>Sperrt der Lauf in umgekehrter Reihenfolge, kann er sich mit Wiederöffnen oder einem HR-Weg der Karte verklemmen; leert er vor dem bedingten Löschen, verliert eine weiterlebende Ausgabe ihre Kopien. | Ergänzung (Plan nennt nur `loeschenAb`) |
| G21 | **Webhook- und Betreffschutz der Kennung (Weg B):** Die Kennung steht nie in einem Aufgabentitel, einer Beschreibung, einer Offboarding-Payload, einem Betreff oder einem AuditLog.<br>• Zu sehen ist sie nur auf der Link-Seite der ausgebenden Stelle (Token) und an der Folgeaufgabe der Gebäudewirtschaft (G17), in der HR-Karte, im Reiter Rückgaben, in den Protokollen und in Mails webhookfreier Onboarding-Ereignisse (G9, G10).<br>• Die Offboarding-Abteilungsereignisse bleiben webhookfähig, und die WEBHOOK-Regel bleibt.<br>• Ein Wächter-Test schickt eine Kennung durch Zuweisung, Erinnerung und Erledigt-Meldung des Offboardings und verlangt, dass sie in keiner Payload steht.<br>• **Bewusst offene Flanke:** `offboarding-department-assigned` und `offboarding-reminder` tragen `token`, `link` und `magicLink` der Stelle (`events.ts`). Wer einen Webhook darauf empfängt, öffnet die Link-Seite, sieht dort ab A4 die Kennung der Stücke dieser Stelle und kann Rückgabezustände setzen (Aufgaben abhaken kann er schon heute). **Entscheidung:** Die Kennung bleibt auf der Link-Seite; dafür gibt es vor dem Einschalten (G27) den Handgriff „aktive Webhooks auf `offboarding-department-*`, `offboarding-reminder` und `offboarding-task-completed` prüfen und löschen“ (Abschnitt 4). `rueckgabeVorgabenUebernehmen` meldet in seiner Antwort als `hinweis`, wenn solche Webhooks aktiv sind (`webhookConfig.count`), ohne zu sperren. | Weg A (Offboarding-Ereignisse in `EVENTS_OHNE_WEBHOOK`) hätte die WEBHOOK-Regel und das Zustellverhalten der Offboarding-Links geändert (Karte laeufe-loeschen, Abschnitt 4).<br>Ohne Kennung auf der Link-Seite („siehe Übergabeprotokoll“) fände die Stelle das Stück nicht (etwa ein iPad unter vielen), und das Protokoll hat sie nicht zwingend zur Hand. Seit dem Zeitplaner (30.09.2026) braucht das Portal n8n für keinen Lauf mehr. | Präzisierung |
| G22 | **Protokoll ohne Inhalte:** `AUSGABEN_AUDIT` (1.10). `details` nur IDs, Zustände, Stellen-Schlüssel, Katalog- bzw. Aufgabentitel und Anzahlen. Die Kennung erscheint nur als `mitKennung: true` bzw. als Anzahl. Bei der Zuordnung stehen Begründungsschlüssel im Protokoll, keine Namen und keine Adressen. Der Eintrag trägt `offboardingId` **und** `onboardingId`. | CLAUDE.md, Regel 18 von „Ausstattung & Zugänge“. | nein |
| G23 | **Rollen und Mandant:**<br>• Alle schreibenden Wege in Portal-Routen nur `HR_EDIT_ROLES`.<br>• Das neue Feld `rueckgaben` im Detail-GET des Offboardings bekommt nur `HR_EDIT_ROLES`, sonst `null` (ohne Abfrage; Test in S28 nach dem A3-Muster, direkter Aufruf des Handlers ohne Middleware).<br>• Unbekannt und fremder Mandant ergeben dieselbe 404.<br>• Zuordnung: Mandant beider Vorgänge.<br>• Öffentliche Wege: nur über den Token, mit beiden Bremsen.<br>Matrix in 1.6. | R16 und E-A23 sinngemäß. Mandantenrollen erreichen diese APIs ohnehin nicht (`mandanten-gate.ts`: Allowlist nur `/api/auth`); die Routen prüfen trotzdem selbst. | nein |
| G24 | **Sperrreihenfolge über beide Module:** Offboarding → Onboarding → Links (nach Schlüssel sortiert, je Transaktion nur die eines Moduls) → Aufgaben → Ausgaben (nach `id` sortiert, `updateMany … updatedAt`) → Rückgaben (`ReturnItem`).<br>• Neue Zeilen (Ausgaben, Aufgaben, Rückgaben) entstehen erst nach den Sperren, auf die sie sich beziehen.<br>• Onboarding-Wege sperren nie eine Offboarding-Zeile.<br>• Der Bezug „gehört zu einem Austritt“ (G28) wird **nach** der Sperre der Ausgabe gelesen.<br>• Dieselbe Reihenfolge gilt für den Löschlauf (1.11) und für „Lösen“ (1.7). | Erweiterung von „Vorgang → Links → Aufgaben → Ausstattung“. Weil kein Onboarding-Weg den Austritt sperrt und jeder Offboarding-Weg den Austritt zuerst, entsteht kein Kreis. Die Ausgabe ist der einzige gemeinsame Punkt. | Erweiterung |
| G25 | **Pauschale Sperrpunkte (E-A32 „umformulieren“):** Die Titel bleiben. Die Punkte bekommen einen Hinweis für die Stelle (`description`): „Gemeint ist alles, was nicht als eigene Aufgabe unter „Ausstattung & Zugänge“ steht – was das Portal als ausgegeben kennt, bekommt eine eigene Rücknahme- bzw. Sperraufgabe.“<br>• Bestand: Migration `OFFBOARDING_SPERRPUNKTE_V1` in `prisma/seed-check.js`, nur für Punkte mit unverändertem Titel **und** leerer Beschreibung in Vorlagen, deren Name mit „Offboarding:“ beginnt.<br>• Neue Datenbanken: `prisma/seed.ts`.<br>• Laufende Vorgänge behalten ihre Kopie. | Titel stehen in Betreffzeilen, Statistiken und der Warnung „ähnlicher Vorlagenpunkt“. Ein „Weitere …“ läse sich falsch, solange der Katalog nichts abfragt. Der Hinweis stimmt in beiden Fällen. „IT-Abteilung über Austritt informieren“ (HR) bleibt unberührt. | Ja (Auslegung) |
| G26 | **Keine neuen Ereignisse, keine neue prozesslokale Sperre, kein neuer Lauf.** Die schreibenden Aktionen am Austritt (zuordnen, lösen, aktualisieren, ohne Vermerk) nehmen die **vorhandene** Versandsperre des Austritts (`versandSperreNehmen(offboardingVersandModul(vorgang))`, belegt → 409 `VERSAND_LAEUFT`, Freigabe im `finally`), wie die Onboarding-Karte (F6). Sonst prüfte die Zuordnung „keine Stelle informiert“ (G12), während „Abteilungen informieren“ gerade an die Stelle der alten Einrichtung schreibt, und neue Rücknahmeaufgaben fehlten in der Mail, ohne dass `nachInfoNeu` (`createdAt > sentAt`) sie meldet. Die Löschfrist ist ein Block im bestehenden Lauf. Sie hat damit schon einen Probelauf (`scharfGesperrt` prüft je Schlüssel); weil die Tabelle leer startet, ist das harmlos. Doppelte verhindern Unique-Indizes und bedingte Updates. | Hält den Ereigniskatalog, die Liste `EVENTS_OHNE_WEBHOOK` und den Zeitplaner unverändert. | nein |
| G27 | **A4 schaltet der Katalog ein, und nur eine bewusste Handlung schaltet ihn.** Ohne `beiAustritt` an einer Position bietet weder die Link-Seite noch die Karte eine Übergabe an. Der Reiter Rückgaben zeigt dann „vor Einführung“ bzw. „keine Einstellung zugeordnet“.<br>• „Vorschläge übernehmen“ (`ausstattung-katalog.ts:505`) legt Positionen weiterhin **ohne** A4-Werte an; `VORSCHLAEGE` bekommt keine.<br>• Die A4-Vorgaben stehen als `RUECKGABE_VORGABEN` (je `vorschlagSchluessel`, 1.3) in `ausgaben.ts`. Die eigene Aktion „Rückgabe-Vorgaben übernehmen …“ (Einstellungen → Ausstattung, `POST /api/settings/ausstattung/rueckgabe-vorgaben`, `adminHandler` = `ADMIN_ROLES`) setzt `beiAustritt`, `rueckgabeKategorie` und `ausgabeKennung` **nur** an vorhandenen Positionen mit `vorschlagSchluessel`, leerem `beiAustritt` und einer anderen Art als ANGABE, in einer Transaktion per bedingtem `updateMany` je Position (`beiAustritt: null` **und** `art: { not: "ANGABE" }` im WHERE: Macht ein gleichzeitiger PATCH die Position zur Angabe, schreibt das UPDATE nichts, G8), mit Audit `AUSSTATTUNG_RUECKGABE_VORGABEN_UEBERNOMMEN` (IDs, Schlüssel, Anzahl). Wiederholbar; von HR gesetzte Werte bleiben.<br>• **Übersprungen mit Grund** (`rueckgabeVorgabenPlan`): `WERT` (schon ein Wert für „Beim Austritt“) bzw. `ANGABE` (inzwischen eine Angabe, bekommt keine Vorgabe). Rückfrage, Sperrgrund `RUECKGABE_VORGABEN_NICHTS_ZU_TUN` und `meldung` sagen einer Angabe nie nach, sie habe schon einen Wert. Positionen, deren bedingtes Update nichts traf, liest die Aktion in derselben Transaktion neu und ordnet sie mit derselben Regel ein; eine inzwischen gelöschte zählt nicht.<br>• Die Rückfrage des Knopfs sagt: „Danach bieten Link-Seite und Karte Übergaben an. Erst nach der Beteiligung der MAV und der Bestätigung der Löschfristen durch den DSB.“ Die Antwort trägt den Webhook-Hinweis aus G21.<br>• Von Hand im Positionsdialog gesetzte Werte schalten ebenso ein; der Dialog nennt denselben Satz bei der Feldgruppe „Beim Austritt“.<br>Eingeschaltet wird nach der förmlichen MAV-Beteiligung und der Bestätigung der Fristen durch den DSB (E-A15, E-A37). | Wie „leerer Katalog = keine Änderung“ in A1.<br>Trügen die Vorschläge die Werte, schaltete die Verwaltung A4 schon mit dem A1–A3-Pilot ein (gemeinsamer Deploy, Vorschläge einschalten): Übergaben, Kennungen und Rücknahmen vor MAV und DSB. Eine eigene Aktion statt eines globalen Schalters, weil `beiAustritt` je Position ohnehin der Schalter ist und kein zweiter Ort entstehen soll, den jeder Leser prüfen muss. | Ja (Plan: Vorgaben in `VORSCHLAEGE`) |
| G28 | **Austrittsbezug einer Ausgabe** (eine Definition für `austrittsBezuegeLaden`, G6, G7, G11, G13, G15, 1.2). „Austrittsbezug“ heißt im ganzen Plan: Die Ausgabe ist an einen Austritt **gebunden**. Ein Austritt **bezieht** eine Ausgabe, wenn er eine Aufgabe (`herkunft` AUSGABE oder AUSGABE_FEHLT) oder eine `ReturnItem` mit ihrer `ausgabeId` hat. Er **bindet** sie:<br>• immer, solange er läuft (Status nicht COMPLETED, nicht CANCELLED);<br>• nach COMPLETED, solange die Ausgabe **nicht** VERBLEIBT ist (ZURUECK, BESCHAEDIGT, FEHLT, ENTFAELLT und ein beim Abschluss offen gebliebenes AUSGEGEBEN gehören weiter diesem Austritt: Eine späte Rückgabe vermerkt HR in dessen Reiter Rückgaben);<br>• nie nach CANCELLED.<br>Reine Regel `bindetAusgabe(austrittStatus, ausgabeZustand)` (1.3).<br>**Gemessen am Stand beim Austritt** (Review A4c, `bezugBindet`): Ein abgeschlossener Austritt bindet nach dem Zustand seiner **eigenen** Rückgabe-Zeile (`AustrittsBezug.eigenerStand`; offen bzw. Zugang ohne Zeile: Zustand der Ausgabe), nicht nach dem Zustand, den die Ausgabe heute hat. Und **der jüngste Bezug gilt**: Bezieht ein späterer Austritt die Ausgabe ebenfalls (seine erste Zeile zu ihr ist jünger, `abgeloest`, `abgeloesteAustritte`), bindet der frühere nie mehr – übernehmen konnte der spätere sie nur nach der Freigabe. Beides liefert `austrittsBezuegeLaden` (Zustand und `createdAt` der Zeilen); ohne bekannten Zeitpunkt gilt „nicht abgelöst“. Ohne diese Regel bände A (VERBLEIBT, abgeschlossen) das Stück wieder, sobald B es zum ersten Mal umschaltet (ZURUECK, FEHLT …): Jede weitere Änderung in B (Wiederöffnen, Korrektur eines Fehlklicks, „Schließung prüfen“) endete in 409 `AUSGABE_IM_AUSTRITT` mit der Nummer von A. Bekannte Grenze: Schaltet B einen Zugang (ohne Zeile) um, öffnet ihn wieder und löst danach die Zuordnung, ist A wieder der jüngste Bezug und bindet das nun AUSGEGEBENE Stück; dessen Sperraufgabe nimmt die Änderung auf (kein Einfrieren).<br>Gebunden heißt: Karte (G7) und jeder andere Austritt antworten 409 `AUSGABE_IM_AUSTRITT`, die Ausgabe ist kein Kandidat eines anderen Austritts (G13). Eine Einstellung ist nur gesperrt, solange sie an einem **laufenden** Austritt hängt (G11).<br>Eine mit VERBLEIBT freigegebene Ausgabe übernimmt der nächste Austritt mit ihrem Zustand; dort gelten die Übergänge aus 1.2 wie für AUSGEGEBEN. Ihr `loeschenAb` ist ohnehin `null` (G20). | Sonst fröre ein VERBLEIBT-Stück für immer ein: kein Vorschlag im nächsten Austritt, keine Zuordnung derselben Einstellung, 409 in der Karte und mit `loeschenAb null` nie gelöscht – entgegen G13 und E-A35.<br>Ein offen gebliebenes AUSGEGEBEN bleibt gebunden, damit Ausgabe, Aufgabe und `ReturnItem` des Austritts gleich bleiben (G15): Die Karte dürfte sonst ein Stück auf ZURUECK setzen, dessen Rückgabe im Austritt offen steht, und ein Onboarding-Weg darf keine Offboarding-Zeile schreiben (G24). | Ergänzung |

### 1.2 Zustände und Übergänge

**Ausgabe (`Ausgabe.zustand`)**

| Von → nach | Wer | Wo | Folge |
|---|---|---|---|
| (neu) → AUSGEGEBEN | Stelle, HR | Link-Seite Onboarding, Karte (`vermerken`), Offboarding („Als ausgegeben übernehmen“) | `loeschenAb null`; an einem abgesagten Vorgang (EXPIRED, nur HR) die Frist der Absage (G10) |
| AUSGEGEBEN/VERBLEIBT → ZURUECK, BESCHAEDIGT, FEHLT | Stelle (nur RUECKGABE), HR | Offboarding-Link, Portal-PATCH, Reiter Rückgaben – auch im **nächsten** Austritt, nachdem ein abgeschlossener die Ausgabe mit VERBLEIBT freigegeben hat (G28); ohne Austrittsbezug Karte (`zurueckgenommen`) | Aufgabe erledigt, `ReturnItem.zustand`; FEHLT + SCHLUESSEL → Folgeaufgabe (nur Offboarding; eine erledigte aus einem früheren FEHLT desselben Austritts wird wieder geöffnet, G17), in der Karte der Hinweis „Gebäudewirtschaft informieren“ (G7). RUECKGABE abgehakt ohne `zustand` = ZURUECK (G15) |
| AUSGEGEBEN/VERBLEIBT → ZURUECK („gesperrt“) | Stelle, HR | SPERREN-Aufgabe abhaken | Aufgabe erledigt |
| AUSGEGEBEN/VERBLEIBT → VERBLEIBT, ENTFAELLT | HR | Portal-PATCH, Reiter Rückgaben | Aufgabe erledigt (`completedById` HR); VERBLEIBT gibt die Ausgabe mit dem Abschluss des Austritts frei (G28) |
| AUSGEGEBEN/VERBLEIBT → ERSETZT | HR | Karte (`tauschen`, Grund DEFEKT), nur ohne Austrittsbezug, nur Gegenstände (RUECKGABE; ein Zugang → 400 `ZUGANG_KEIN_TAUSCH`) | neue Ausgabe AUSGEGEBEN, `ersetztDurchId`; Frist 6 Monate |
| AUSGEGEBEN/VERBLEIBT → FEHLT | HR | Karte (`tauschen`, Grund VERLOREN), nur ohne Austrittsbezug, nur Gegenstände (RUECKGABE) – ein Zugang „fehlt“ nie | neue Ausgabe AUSGEGEBEN, `ersetztDurchId` bleibt gesetzt; Frist 3 Jahre ab Jahresende; bei SCHLUESSEL Hinweis „Gebäudewirtschaft informieren“ |
| AUSGEGEBEN → AUSGEGEBEN mit Frist | System | Abschluss des Austritts mit offenen Rückgaben (G18) bzw. Absage der Einstellung (G10, nur ohne Austrittsbezug) | `loeschenAb` = drei Jahre ab Jahresende des Abschlusses bzw. von `expiredAt`; Zustand unverändert |
| VERBLEIBT → AUSGEGEBEN mit Frist | System | Abschluss des Austritts, wenn das Stück unverändert aus einem früheren Austritt übernommen ist und seine Zeile bzw. Sperraufgabe hier offen blieb (G18, Review A4c) | dieselbe Frist wie oben; bleibt an diesen Austritt gebunden; Audit `AUSGABE_ZUSTAND_GEAENDERT` (`ueber` ABSCHLUSS) |
| ZURUECK/BESCHAEDIGT/FEHLT/VERBLEIBT/ENTFAELLT → AUSGEGEBEN | Stelle, HR | Wiederöffnen der Aufgabe bzw. Zustand „offen“ im Reiter (nur in dem Austritt, der die Ausgabe bindet, G28) – VERBLEIBT nur, wenn dieser Austritt es gesetzt hat; ein unverändert übernommenes VERBLEIBT mit offener Zeile bleibt (G15) | Folgeaufgabe offen → gelöscht |
| AUSGEGEBEN → (gelöscht) | HR, Stelle (eigener Link-Vermerk) | Karte bzw. Link (`entfernen`) | nur ohne Austrittsbezug (G28) |
| ERSETZT | — | — | endgültig |

Anzeige (`AUSGABE_ZUSTAND_LABELS`): AUSGEGEBEN „ausgegeben“, ZURUECK „zurück“ (bei SPERREN „gesperrt“), BESCHAEDIGT „beschädigt zurück“, FEHLT „fehlt“, VERBLEIBT „verbleibt“, ENTFAELLT „entfällt“, ERSETZT „ersetzt“.

**Rückgabe (`ReturnItem.zustand`):** `null` heißt offen; dazu ZURUECK, BESCHAEDIGT, FEHLT, VERBLEIBT, ENTFAELLT. Über den Link wählt die Stelle nur ZURUECK, BESCHAEDIGT oder FEHLT; HR alle fünf.

### 1.3 Reine Regeln: `src/lib/ausgaben.ts`

**Konstanten**

- `AUSGABE_ZUSTAENDE`, `AUSGABE_AKTIV = ["AUSGEGEBEN", "VERBLEIBT"]`, `AUSGABE_BEI_AUSTRITT = ["RUECKGABE", "SPERREN"]` (Teilmenge von `BEI_AUSTRITT` ohne NICHTS, Test), `AUSGABE_QUELLEN = ["LINK", "HR"]`, `RUECKGABE_ZUSTAENDE`, `RUECKGABE_ZUSTAENDE_STELLE = ["ZURUECK", "BESCHAEDIGT", "FEHLT"]`, `OFFBOARDING_AUFGABEN_HERKUNFT = ["AUSGABE", "AUSGABE_FEHLT"]`, `TAUSCH_GRUENDE = ["DEFEKT", "VERLOREN"]`.
- `RUECKGABE_KATEGORIEN` wird **nicht neu gebaut**: Die vorhandene Konstante (`validations/offboarding.ts:104`, `as const satisfies readonly ReturnCategory[]`) zieht nach `src/lib/constants.ts` neben `RETURN_CATEGORY_LABELS` (mit `import type { ReturnCategory }`), `validations/offboarding.ts` exportiert sie unverändert weiter, `ausgaben.ts` importiert sie. Eine zweite Konstante aus `Object.keys(RETURN_CATEGORY_LABELS)` verlöre die Literaltypen. Test: Werte = `$Enums.ReturnCategory`.
- `RUECKGABE_VORGABEN` (G27): je `vorschlagSchluessel` `{ beiAustritt, rueckgabeKategorie, ausgabeKennung }` nach der Tabelle unten. Test: Jeder Schlüssel kommt in `VORSCHLAEGE` vor, jede Zeile besteht `positionPruefen`.
- `AUSGABE_GRENZEN`: `kennung` 60, `kennungLabel` 40, `stueckJeVermerk` 10, `aktiveJeAufgabe` 20, `rueckwirkendTage` 365, `kandidaten` 10, `suche` 20, `sucheMinZeichen` 3.
- `AUSGABE_AUFBEWAHRUNG_MONATE = 6`, `AUSGABE_VERJAEHRUNG_JAHRE = 3`.
- `RUECKNAHME_TEXTE`:
  - Titel: „{Bezeichnung} zurücknehmen“ bzw. „{Bezeichnung} sperren“, Folgeaufgabe „Schließung prüfen: {Bezeichnung}“.
  - Beschreibung bei RUECKGABE: „Bitte nehmen Sie den Gegenstand zurück und bestätigen Sie den Zustand auf Ihrer Aufgabenseite. Dort steht auch die Kennung.“
  - Beschreibung bei SPERREN: „Bitte sperren Sie den Zugang zum letzten Arbeitstag.“
  - Beschreibung der Folgeaufgabe: „Ein Schlüssel bzw. Transponder wurde als fehlend gemeldet. Bitte prüfen, ob die Schließung geändert werden muss, bzw. den Transponder im Schließsystem sperren.“
  - Keine Kennung, keine Namen.
- `FOLGE_STELLE = "FACILITY"`.
- `LAGE_TEXTE` (E-A36):

  | Lage | Text |
  |---|---|
  | `KEINE_EINSTELLUNG` | „Keine Einstellung zugeordnet. Was ausgegeben wurde, kennt das Portal erst nach „Einstellung zuordnen …“.“ |
  | `VOR_EINFUEHRUNG` | „Für die Einstellung {nr} hat das Portal keine Ausgaben erfasst: Sie stammt aus der Zeit vor der Erfassung oder hatte keinen Ausstattungsschritt mit Gegenständen, die zurückkommen. Bitte mit Geräteverwaltung und Schließplan abgleichen.“ |
  | `NICHTS_AUSGEGEBEN` | „Laut Portal wurde bei der Einstellung {nr} nichts ausgegeben, das zurückkommt oder gesperrt wird.“ |
  | `NICHTS_ERFASST` | „Laut Portal bereitgestellt, aber keine Übergabe vermerkt: {n} Aufgaben.“ |
  | `GELOESCHT` | „Die Ausgaben der Einstellung {nr} wurden nach Ablauf der Aufbewahrungsfrist gelöscht.“ |
  | `AUSGABEN` | „Laut Portal ausgegeben (Einstellung {nr}, von HR zugeordnet): {n} Gegenstände, {m} Zugänge.“ Hat die Einstellung daneben gelöschte Ausgaben, folgt die Zeile „Weitere Ausgaben wurden nach Ablauf der Aufbewahrungsfrist gelöscht.“ |

  Darunter immer der Satz: „Das Portal ist eine Gedächtnisstütze; maßgeblich bleiben Geräteverwaltung und Schließplan.“
- `MELDUNGEN_AUSGABEN` (alle Texte der Routen, Karten und Dialoge), unter anderem:
  - Fehler: `AUSGABE_VORHANDEN`, `AUSGABE_IM_AUSTRITT` (mit und ohne Vorgangsnummer), `KEINE_AUSGABE`, `ZU_VIELE_STUECKE`, `DATUM_IN_ZUKUNFT` („Das Datum liegt in der Zukunft.“ – artneutral, gilt auch für das Einrichtungsdatum), `ZUGANG_NUR_GESPERRT`, `ZUGANG_KEIN_TAUSCH` (G7, Review A4b), `BEREITS_ZUGEORDNET`, `EINSTELLUNG_VERGEBEN` („Diese Einstellung ist schon einem laufenden Austritt zugeordnet.“), `EINSTELLUNG_ABGESAGT` („Diese Einstellung wurde abgesagt und lässt sich nicht zuordnen.“), `LOESEN_GESPERRT`, `RUECKGABEN_OFFEN`, `VORGESCHLAGEN_NICHT_LOESCHEN`; `VERSAND_LAEUFT` kommt aus `MELDUNGEN` von `abteilungsaufgaben.ts`.
  - Erfolg (Review A4b nach Art des Stücks, `beiAustritt`): `VERMERKT(n, art)` („Übergabe vermerkt.“ bzw. „Einrichtung vermerkt.“), `KORRIGIERT(art)`, `ENTFERNT(art)` („Übergabevermerk …“ bzw. „Einrichtungsvermerk …“), `ZURUECKGENOMMEN(zustand, art)` („Rücknahme vermerkt: …“ bzw. bei einem Zugang „Sperrung vermerkt.“), `GETAUSCHT(grund)`.
  - Hinweise: `GEBAEUDEWIRTSCHAFT_INFORMIEREN` (G7), `UEBERGABE_NICHT_VERMERKT` / `EINRICHTUNG_NICHT_VERMERKT` (Karte, nach Art), `UEBERGABE_NOCH_NICHT_VERMERKT` / `EINRICHTUNG_NOCH_NICHT_VERMERKT` (Link-Seite), `AUSGABEN_GELOESCHT` („Ausgaben nach Ablauf der Aufbewahrungsfrist gelöscht“), `ZUORDNUNG_EMPFOHLEN` („Einstellung zuordnen, bevor Sie die Abteilungen informieren“), `SCHON_IM_AUSTRITT` („{n} Stück(e) laufen im Austritt {nr}“ bzw. „… in einem anderen Austritt“, ohne Kennung), `LOESEN_RUECKFRAGE` („{n} Rücknahme- und Sperraufgaben werden gelöscht. {m} Stellen wurden schon informiert und sehen sie danach nicht mehr – bitte ggf. Bescheid geben.“).
  - Leerzustände des Zuordnen-Dialogs: `KEIN_VORSCHLAG` („Kein Vorschlag – über Vorgangsnummer oder Nachname suchen“), `SUCHE_ZU_KURZ` („Mindestens 3 Zeichen“), `KEIN_TREFFER` („Kein Treffer“); eine Vorschau ohne vorschlagbare Stücke zeigt den Text der Lage aus `LAGE_TEXTE`.
  - Protokoll: `PROTOKOLL_FEHLT` („Unterschriebenes Übergabeprotokoll: fehlt“ bzw. „Rückgabeprotokoll“), `PROTOKOLL_HOCHGELADEN` („… hochgeladen am {datum}“).
- `AUSGABEN_AUDIT` / `AUSGABEN_AUDIT_LABELS` (1.10).

**Funktionen** (Signaturen verbindlich)

| Funktion | Zweck | Regel |
|---|---|---|
| `ausgabeMoeglich(zeile: { art; beiAustritt; gestrichenAm }): boolean` | RUECKGABE oder SPERREN, nicht ANGABE, nicht gestrichen | G4 |
| `ausgabenAngeboten(ausschnitt: { art; beiAustritt }[]): boolean` | Merker `SupervisorData.ausgabenAngeboten`: Der Katalogausschnitt des Vorgangs enthielt mindestens eine Position mit RUECKGABE oder SPERREN (nicht ANGABE) | E-A36 |
| `ausgabeBezeichnung(zeile: { bezeichnung }, option: string): string` | „Dienst-iPad (Lernmittel)“ bzw. „Schlüssel: Haupteingang“, nie Freitext | G2 |
| `vermerkPruefen(eingabe, ctx: { heute; vorgangAngelegt; aktiv }): Grund \| null` | Anzahl, Datum (nicht nach heute, nicht vor `vorgangAngelegt − 365`), Grenze aktiver Stücke | G4 |
| `ausgabeZustandDaten(zustand, jetzt, opts?: { austrittAbgeschlossenAm?; vorgangEingestelltAm? }): { zustand; zustandAm; loeschenAb }` | **einziger** Bauplan eines Zustandswechsels | G3, G20 |
| `ausgabeLoeschenAb({ zustand, zustandAm, austrittAbgeschlossenAm?, vorgangEingestelltAm? }): Date \| null` | Fristen aus G20 in Berliner Kalendertagen (`monateSpaeter`, `beginnDesBerlinerTages`, `vorgangsjahrInBerlin`); `vorgangEingestelltAm` für AUSGEGEBEN bei Absage (G10) – auch beim Anlegen nach der Absage. Anker realm-unabhängig geprüft (kein `instanceof Date`) | E-A37 |
| `bindetAusgabe(austrittStatus, ausgabeZustand): boolean` | laufend → ja; COMPLETED → ja außer VERBLEIBT; CANCELLED → nein | G28 |
| `bezugBindet(bezug: AustrittsBezug, ausgabeZustand): boolean` | wie `bindetAusgabe`, aber COMPLETED am eigenen Stand (`eigenerStand ?? ausgabeZustand`) und nie mit `abgeloest`; Grundlage von `bindenderAustritt` und `gleichlaufGesperrt` (Review A4c) | G28 |
| `abgeloesteAustritte(seit: Map<offboardingId, ms \| null>): Set` | jeder Austritt, nach dem ein anderer die Ausgabe bezogen hat; unbekannte Zeitpunkte zählen nicht | G28 |
| `protokollStand({ ausgabenMitRueckgabe: number, dokumente: { uploadedAt }[] }): { noetig; hochgeladenAm: Date \| null }` | „fehlt“ bzw. „hochgeladen am …“ (jüngstes Dokument des Typs) | G19 |
| `rueckgabeZeileText(item: { itemName; serialNumber; zustand; isReturned; returnedAt }): string` | Zeile für `rueckgaben_liste`: „Laptop (FES-0412) — zurueck am TT.MM.JJJJ“, „— beschädigt zurück am …“, „— fehlt“, „— verbleibt“, „— entfällt“; Wörter aus `AUSGABE_ZUSTAND_LABELS` | 1.9 |
| `rueckgabeZustand(item: { zustand; isReturned }): RueckgabeZustand \| null` | Altbestand: `isReturned` ohne Zustand gilt als ZURUECK | G16 |
| `rueckgabeOffen(item): boolean` | `rueckgabeZustand(item) === null` | G16 |
| `rueckgabeDaten(zustand \| null, jetzt, userId \| null): { zustand; isReturned; returnedAt; returnedToId }` | `isReturned` nur bei ZURUECK/BESCHAEDIGT | G16 |
| `ruecknahmeAufgabe(ausgabe, ctx: { letzterArbeitstag; heute; index }): AufgabenEntwurf` | Titel, Beschreibung, Kategorie, `orderIndex`, `dueDate`, `assigneeDepartment`, `herkunft`, `ausgabeId` | G14 |
| `folgeAufgabe(ausgabe, heute): AufgabenEntwurf` | FEHLT bei SCHLUESSEL | G17 |
| `brauchtFolgeStelle(ausgabe, alt, neu): boolean` | FACILITY-Link vorab mitsperren | G17, G24 |
| `folgeAufgabeSchritt({ ausgabe, alt, neu, vorhanden: { id; isCompleted } \| null, heute }): FolgeSchritt \| null` | Was der Gleichlauf mit der Folgeaufgabe tut: `ANLEGEN` (FEHLT, keine vorhanden; Entwurf aus `folgeAufgabe`), `WIEDEROEFFNEN` (FEHLT, eine **erledigte** vorhanden; Daten: offen, Erledigung leer, fällig heute, Kommentar der Stelle leer), `LOESCHEN` (FEHLT verlassen, eine **offene** vorhanden), sonst `null` (kein Schlüssel, kein Wechsel, schon offen, erledigte beim Verlassen). Nie etwas, ohne dass `brauchtFolgeStelle` gilt | G17 |
| `zuordnungsVorschlaege(austritt, kandidaten): Vorschlag[]` | Stufen: **STARK** = gleiche E-Mail (normalisiert: klein, getrimmt; Austritt `employeeEmail`/`employeePrivateEmail` gegen Einstellung `email`/`personalData.emailPrivate`); **MITTEL** = Vor- und Nachname gleich (auch Geburtsname) **und** Einrichtung oder Arbeitsort gleich; **SCHWACH** = nur Nachname und Einrichtung. Je Vorschlag die Begründungen als Schlüssel und Text, ohne Adresse. Sortiert nach Stufe, dann Vertragsbeginn absteigend, höchstens 10. Ohne Begründung kein Vorschlag. | E-A31 |
| `namensSchluessel(s): string` | `normalize("NFC")`, klein (`de`), getrimmt, Leerräume zusammengefasst; keine Unschärfe | E-A31 |
| `rueckgabeVorschlag({ austritt: { id, organizationId, arbeitsortId }, einstellung: { organizationId, arbeitsortId }, ausgaben, weitereBeschaeftigung, bezuege }): { vorschlag; hinweisZentral; hinweisAndereEinrichtung; schonImAustritt: { offboardingId; anzahl }[] }` | Filter aus G13 (Einrichtungsmenge mit Bedingung, zentrale ohne Einrichtungsfilter), Bezüge nach G28 | E-A35 |
| `ohneVermerk(aufgaben, zeilen, ausgaben): { checklistItemId; titel; erledigtAm }[]` | erledigt, nicht entfallen, `beiAustritt` RUECKGABE/SPERREN, keine Ausgabe, **kein** `ausgabenGeloeschtAm` | G13, G20 |
| `rueckgabeLage({ einstellung, zeilen, ausgaben, ohneVermerk, ausgabenAngeboten, geloeschteAufgaben }): RueckgabeLage` | `KEINE_EINSTELLUNG` → `AUSGABEN` (mindestens eine Ausgabe der Einstellung) → `GELOESCHT` (keine Ausgabe, aber eine Ausstattungsaufgabe mit `ausgabenGeloeschtAm`) → `NICHTS_ERFASST` (`ohneVermerk` nicht leer) → `NICHTS_AUSGEGEBEN` (eine Zeile mit RUECKGABE/SPERREN **oder** `SupervisorData.ausgabenAngeboten = true`) → `VOR_EINFUEHRUNG` (sonst, auch Merker `false`/`null`: Altfall, kein Ausstattungsschritt, Katalog ohne Rückgabe-Positionen) | E-A36 |
| `offeneRueckgaben({ rueckgaben, aufgaben, stellenNamen }): { titel; stelle }[]` | Stück für Stück: offene `ReturnItem`, offene SPERREN- und Folgeaufgaben, je Ausgabe nur einmal | E-A33 |
| `rueckgabenSchritt(lage, offen): { erledigt: boolean; text: string }` | Stepper „Rückgaben einsammeln“: erledigt, wenn nichts offen ist; der Text kommt aus `LAGE_TEXTE` | E-A36 |
| `rueckgabenFortschritt({ rueckgaben, aufgaben }): { erledigt; gesamt }` | Fortschritt desselben Schritts in denselben Stücken wie `offeneRueckgaben` (Rückgabe-Zeilen, Sperr- und Folgeaufgaben, je Ausgabe einmal): `gesamt − erledigt` = Zahl der offenen; nie „4/4“ neben einer offenen Sperraufgabe (Review A4c) | E-A33 |
| `ausgabeVermerkMailFelder(stuecke): { ausgabe_vermerk; ausgabe_vermerk_html }` | Zeilen „Kennung · übergeben TT.MM.JJJJ“ bzw. ohne Kennung „übergeben TT.MM.JJJJ“; HTML mit `escapeHtml`, `<br>` | G9 |
| `ausgabenListeMailFelder(stuecke): { ausgaben_liste; ausgaben_liste_html; hat_ausgaben }` | Absage-Mail (G10); Merker `"ja"`/`""` | G10 |
| `ausgabenZeile(stand, ctx): AusgabeStand` | Anzeige je Stück in Karte und Reiter mit `aktionen` und `sperrGrund`; `tauschen` nur an einem Gegenstand (RUECKGABE, G7). Im Reiter (`ctx.austrittId`) an einem Stück, das **dieser** Austritt bezieht: höchstens `korrigieren` (Kennung über die Rückgabe-Zeile, also nur bei RUECKGABE, G15); `tauschen`, `zurueckgenommen` und `entfernen` gibt es nur ohne Austrittsbezug (1.2, G7) – die Onboarding-Route antwortete 409 `AUSGABE_IM_AUSTRITT`. Je Aufgabe ohne aktive Ausgabe (`ausgabenJeAufgabe` mit `art`): „Übergabe nicht vermerkt“ bzw. bei einem Zugang „Einrichtung nicht vermerkt“ (gelb, nur erledigt, ohne Merker) bzw. „Ausgaben nach Ablauf der Aufbewahrungsfrist gelöscht“ (mit `ausgabenGeloeschtAm`, grau, keine Aufforderung; „Vermerken“ bleibt als gewöhnliche Aktion) | G7, G20 |
| `protokollStellen(stuecke, stellenNamen, art: "UEBERGABE" \| "RUECKGABE")` | Gruppen je Stelle für die Word-Listen (1.9) | G19 |

**Änderungen in `src/lib/ausstattung.ts`:**

- `positionPruefen`, `KATALOG_FELDER` und `PositionEntwurf` bekommen die A4-Felder (G8).
- `VORSCHLAEGE` bleibt **unverändert ohne** A4-Werte (G27). Die Vorgaben stehen als `RUECKGABE_VORGABEN` in `ausgaben.ts` und kommen nur über „Rückgabe-Vorgaben übernehmen …“ an die Positionen:

  | Vorschlag | `beiAustritt` | `rueckgabeKategorie` | Kennung |
  |---|---|---|---|
  | Dienst-Laptop/PC | RUECKGABE | IT_HARDWARE | „Inventarnummer“ |
  | Dienst-iPad | RUECKGABE | IT_HARDWARE | „Inventarnummer“ |
  | Telefon mit Durchwahl | RUECKGABE | IT_HARDWARE | „Inventarnummer“ |
  | BYOD | SPERREN | – | – |
  | Zugänge | SPERREN | – | – |
  | Transponder/Chip | RUECKGABE | SCHLUESSEL | „Chipnummer“ |
  | Schlüssel | RUECKGABE | SCHLUESSEL | „Schlüsselnummer“ |
  | Spind | RUECKGABE | SCHLUESSEL | „Schlüsselnummer“ |
  | Kopierkarte | RUECKGABE | SONSTIGES | „Kartennummer“ |
  | Dienstausweis | RUECKGABE | DOKUMENTE | „Ausweisnummer“ |
  | Parkplatz, Fach, Türschild | NICHTS | – | – |

  Transponder/Chip als RUECKGABE statt Sperraufgabe: Abweichung vom Mockup 6.8, begründet in G14.

- `AusstattungsAufgabeStand` bekommt `ausgabeMoeglich: boolean` und `ausgaben: AusgabeStand[]`, nur als `import type`.
- `aenderungPruefen` bekommt je Aufgabe `mitAusgabe` (G5). `pruefbareAufgaben(aufgaben)` bildet es aus `ausgaben[].aktiv` – EINE Abbildung für `zeilenAktionen` und den Dialog „Bearbeiten…“ (`bearbeitenGrund`, `festeOptionen` in `ausstattung-dialoge.tsx`), damit die Karte dieselbe Prüfung rechnet wie der Server (Review A4b).
- `ausstattungsUebersichtBauen` gibt `ausgabenBearbeitbar` aus (`HR_EDIT_ROLES`, unabhängig vom Endstatus, G7) und `protokoll` aus `protokollStand` (G19).
- Wer die Momentaufnahme schreibt (Speichern des Schritts und Abgabe der Modalitäten, nur bei `mitAusstattung`), setzt in derselben Transaktion `SupervisorData.ausgabenAngeboten = ausgabenAngeboten(ausschnitt)` aus dem Katalogausschnitt, den die Transaktion ohnehin liest (Regel 3 der Ausstattung). Ohne Ausstattungsschritt bleibt der Merker `null`.

**Änderungen in `src/lib/abteilungsaufgaben.ts`:**

- `onboardingEmpfaengerEinrichtung` wird zu `empfaengerEinrichtung(v: { arbeitsortId?; organizationId })`; der alte Name bleibt als Alias (G12).
- `abteilungsZeilenBauen` bekommt optional `nachInfoNeu?: Record<string, number>`. Gilt nur im Offboarding und ergibt den gelben Hinweis „{n} Aufgaben nach der Information hinzugekommen – bitte „Erneut senden““.
- `AufgabeFuerZeile` bekommt optional `herkunft` (Anzeige „Ausgabe“). Ohne die neuen Felder bleibt die Ausgabe gleich.

### 1.4 Zod

**Neu `src/lib/validations/ausgaben.ts`:**

- Freitext Kennung: auf `\n` normalisiert, einzeilig, getrimmt, höchstens 60 Zeichen, ohne Steuerzeichen und spitze Klammern (Muster `OHNE_KLAMMERN_STEUERZEICHEN`; heute ein nicht exportiertes `const` in `validations/abteilungsaufgaben.ts:37`, S22 exportiert es ohne Verhaltensänderung). Leer heißt `null`.
- Datum: `YYYY-MM-DD` mit Rückprobe (`istKalendertag`).

| Schema | Inhalt |
|---|---|
| `vermerkSchema` | `{ stuecke: { kennung?; uebergebenAm? }[] (1..10) }` (Link und HR) |
| `ausgabenAktionSchema` | `discriminatedUnion("aktion")` über:<br>• `vermerken { checklistItemId, stuecke }`<br>• `korrigieren { ausgabeId, kennung?, uebergebenAm? }` (mindestens eins)<br>• `tauschen { ausgabeId, grund: enum(TAUSCH_GRUENDE), neu: { kennung?, uebergebenAm? } }` (`grund` Pflicht)<br>• `zurueckgenommen { ausgabeId, zustand: ZURUECK\|BESCHAEDIGT\|FEHLT }`<br>• `entfernen { ausgabeId }` |
| `einstellungAktionSchema` | • `zuordnen { onboardingId, weitereBeschaeftigung?: boolean, uebernehmen?: string[] }` (ohne `uebernehmen` = Vorschlag; ohne `weitereBeschaeftigung` = Vorbelegung nach `exitType`)<br>• `loesen {}`<br>• `aktualisieren { ausgabeIds?: string[], weitereBeschaeftigung?: boolean }` (ohne Feld = gespeicherter Merker)<br>• `ohne-vermerk { checklistItemIds: string[] (1..50) }` |
| `kennungSchema` (exportiert) | das Kennungsschema oben; auch für `serialNumber` von Rückgaben mit `ausgabeId` (G15) |
| `einstellungSucheSchema` (Query) | `q` 3..60 Zeichen, optional |

**Änderungen an bestehenden Schemas:**

- `validations/ausstattung.ts`:
  - `katalogPositionFelder` + `ausgabeKennung` (≤40), `rueckgabeKategorie` (enum `RUECKGABE_KATEGORIEN`), `beiAustritt` (enum `BEI_AUSTRITT`), alle `.nullable().optional()`;
  - `hinzufuegen.frei` + `beiAustritt?` (nur RUECKGABE/SPERREN/NICHTS), `rueckgabeKategorie?`.
  - Die Prüfung gegeneinander macht `positionPruefen`.
- `validations/abteilungsaufgaben.ts`:
  - Neues `offboardingAufgabeLinkPatchSchema` = dieselben Felder plus `zustand?: enum(RUECKGABE_ZUSTAENDE_STELLE)`; refine „`zustand` nur mit `isCompleted: true`“. `isCompleted: true` **ohne** `zustand` an einer RUECKGABE-Aufgabe ist gültig und heißt ZURUECK (Dienst, G15); Zod bleibt dafür neutral.
  - `aufgabeLinkPatchSchema` (Onboarding) bleibt **unverändert**; `oeffentlichAendern` wählt das Schema nach Modul.
  - `portalAufgabePatchSchema` (Offboarding-Portal) + `zustand?: enum(RUECKGABE_ZUSTAENDE)`.
- `validations/offboarding.ts`:
  - `rueckgabeAendernSchema` + `zustand?: enum(RUECKGABE_ZUSTAENDE) | null`, dazu refine: `isReturned` und `zustand` nicht zugleich. Die 100 Zeichen für `serialNumber` bleiben für manuelle Zeilen; an Zeilen mit `ausgabeId` prüft der Dienst zusätzlich `kennungSchema` (400).
  - `updateOffboardingSchema` + `bestaetigt?: boolean`. **`bestaetigt` allein ist keine Änderung:** Der `refine` „Mindestens ein Feld erforderlich“ zählt ihn nicht mit (wie `stand` im Katalog-PATCH). Sonst liefe `{ bestaetigt: true }` mit leerem Update durch (200 statt bisher 400) und hinterließe ein inhaltsleeres `OFFBOARDING_UPDATED`.
  - `RUECKGABE_KATEGORIEN` wird aus `constants.ts` re-exportiert (1.3); Name und Typ bleiben.

### 1.5 Server-Module (ohne Zyklen)

| Datei | Inhalt | Importiert (neu) |
|---|---|---|
| `src/lib/ausgaben-schreiben.ts` | **einziger Schreiber** von `ausgaben` (G3), immer in einer fremden Transaktion:<br>• `ausgabenSperrenIn(tx, ids)`<br>• `ausgabenAnlegenIn`, `ausgabeKorrigierenIn`, `ausgabeTauschenIn`, `ausgabeZustandIn`, `ausgabeEntfernenIn`<br>• `ausgabeGleichlaufIn(tx, { offboardingId, ausgabeId, zustand \| null, jetzt, userId \| null, aufgabeSchonGeschaltet })`: Ausgabe bedingt, `ReturnItem`, Aufgabe (falls nicht der Aufrufer sie schaltet), Folgeaufgabe nach `folgeAufgabeSchritt` anlegen, wieder öffnen bzw. löschen (G17; die vorhandene Folgeaufgabe wird nach der Sperre des FACILITY-Links gelesen); Rückgabe: betroffene Stellen<br>• `offeneAusgabenAbschliessenIn` (G18), `ausgabenFristBeiAbsageIn` (G10)<br>• `ausgabenLoeschenIn` (Lauf; leert Kommentare, löscht, leert die `ReturnItem`-Kopien und setzt die Merker für eine **übergebene** Menge von IDs, sperrt selbst nichts) | db-Typen, `ausgaben.ts` |
| `src/lib/ausgaben-daten.ts` | **nur lesend:**<br>• `ausgabenZuAufgabenLaden(db, checklistItemIds)`<br>• `austrittsBezuegeLaden(db, ausgabeIds)`: je Ausgabe die Austritte, die sie beziehen (über `ReturnItem` bzw. Aufgabe), mit Status und `displayId`, dazu `eigenerStand` (Zustand der eigenen Rückgabe-Zeile, nur wenn gesetzt) und `abgeloest` (ein späterer Austritt bezieht sie, aus `createdAt`); **gebunden** nach `bezugBindet` (G28)<br>• `bestandDerEinstellungLaden(db, onboardingId)` (Zeilen, Aufgaben samt `ausgabenGeloeschtAm`, Ausgaben, `ausgabenAngeboten`)<br>• `stellenNamenLaden(db, keys, organizationId)` | db, `ausgaben.ts`, `abteilungsaufgaben.ts` |
| `src/lib/ausgaben-dienst.ts` | Onboarding, HR: `ausgabenAktionAusfuehren({ onboardingId, rohBody, session, jetzt })` | `ausgaben-schreiben`, `-daten`, Adapter (`vorgangSperrenIn`), `ausstattung-dienst` (Übersicht) |
| `src/lib/abteilungsaufgaben-uebergaenge.ts` (Kern) | **neu:** `oeffentlicheAusgabeVermerken(token, itemId, rohBody, jetzt)`, `oeffentlicheAusgabeEntfernen(token, itemId, ausgabeId, jetzt)`.<br>**erweitert:**<br>• `oeffentlichAendern` (Offboarding: `zustand`, Austrittssperre, Gleichlauf, FACILITY-Link)<br>• `aufgabeImPortalAendern` (Rolle, 409, `zustand`, Gleichlauf)<br>• `aufgabenDerAbteilung` (Feld `ausgabe` in beiden Modulen)<br>• `aufgabeErledigtMelden` (`ausgabe_vermerk`, nur Onboarding) | `ausgaben-schreiben`, `ausgaben-daten` (keinen Dienst, Regel des Kerns) |
| `src/lib/offboarding-ausgaben.ts` | Offboarding:<br>• `einstellungVorschlaegeLaden`<br>• `einstellungAktionAusfuehren` (zuordnen, lösen, aktualisieren, ohne Vermerk; nimmt die Versandsperre des Austritts, G26)<br>• `rueckgabenUebernehmenIn`<br>• `rueckgabeAendern` (Reiter Rückgaben, G15)<br>• `rueckgabenUebersichtLaden` (Feld `rueckgaben`, mit `zuordnungEmpfohlen` und `protokoll`)<br>• `offeneRueckgabenZaehlenIn` (Abschluss) | Kern (`linksSperrenIn`, `linkStatusNeuBerechnenIn`), `abteilungsaufgaben.ts` (`gueltigBis`, `verlaengerungNoetig`, `empfaengerEinrichtung`), `-dienst` (`versandSperreNehmen`/`-Freigeben`, `offboardingVersandModul`), `ausgaben-schreiben`, `-daten`, Adapter (`vorgangSperrenIn`) |
| `src/lib/ausgaben-lauf.ts` | `ausgabenLoeschen({ jetzt, dryRun })`, `leeresAusgabenErgebnis()`; sperrt je Gruppe in der Reihenfolge G24 und ruft dann `ausgabenLoeschenIn` | `ausgaben-schreiben`, `abteilungsaufgaben-onboarding` (`vorgangSperrenIn`), `file-upload` (`dateiLoeschen`), `fehler-kennung` |
| `src/lib/ausstattung-katalog.ts` | **neu:** `rueckgabeVorgabenUebernehmen(opts)` (G27) | `ausgaben.ts` (`RUECKGABE_VORGABEN`) |
| `src/lib/abteilungsaufgaben-dienst.ts` | `VORGANG_AUSWAHL`, `offboardingVersandModul`, `abteilungsUebersichtLaden` mit `arbeitsortId` (G12); `nachInfoNeu` für die Karte | `abteilungsaufgaben.ts` |

### 1.6 Routen

Alle Routen sind dünn: Sitzung, Body, **eine** Dienstfunktion, Antwort 1:1. Kaputtes JSON ergibt 400. Unbekannt und fremder Mandant ergeben dieselbe 404 mit demselben Text.

| Route | Rolle | Antworten |
|---|---|---|
| `POST /api/onboarding/[id]/ausgaben` (neu) | `HR_EDIT_ROLES` | Erfolg: 200 `{ data: AusstattungsUebersicht, meldung }`.<br>Fehler in dieser Reihenfolge:<br>• 403<br>• 400 (Zod, `vermerkPruefen`)<br>• 404 (Vorgang, Aufgabe oder Ausgabe unbekannt bzw. fremd)<br>• 409 `KEINE_AUSGABE` (Zeile ohne `beiAustritt`), `AUFGABE_ENTFAELLT`, `AUSGABE_IM_AUSTRITT`, `NICHT_AUSGEGEBEN` |
| `POST /api/onboarding-tasks/[token]/[itemId]/ausgaben` (neu, öffentlich) | Token | Prüfungen in dieser Reihenfolge:<br>• 429 (IP, vor dem Token)<br>• 404 Token<br>• 410 (EXPIRED, Link abgelaufen)<br>• 409 nur lesen (COMPLETED)<br>• 429 (Link)<br>• 400<br>• 404 (fremde Aufgabe, Stelle passt nicht)<br>• 409 `KEINE_AUSGABE`/`AUFGABE_ENTFAELLT`<br>Erfolg: 201 `{ data: { ausgabe } }` (frischer Stand der Aufgabe) |
| `DELETE /api/onboarding-tasks/[token]/[itemId]/ausgaben/[ausgabeId]` (neu, öffentlich) | Token | wie oben; zusätzlich 409, wenn `quelle ≠ LINK`, der Zustand nicht AUSGEGEBEN ist oder ein Austrittsbezug besteht; Erfolg: 200 |
| `GET /api/offboarding/[id]/einstellung?q=` (neu) | `HR_EDIT_ROLES` | 200 `{ data: { zugeordnet, vorschlaege, treffer, vorschau? } }`; `?vorschau=<onboardingId>` liefert den Rückgabe-Vorschlag vor der Bestätigung |
| `POST /api/offboarding/[id]/einstellung` (neu) | `HR_EDIT_ROLES` | 200 `{ data: RueckgabenUebersicht, meldung }`; 400; 403; 404 (auch für die Einstellung: unbekannt, fremd, nicht EINSTELLUNG); 409 `VERSAND_LAEUFT`, `BEREITS_ZUGEORDNET`, `VORGANG_ABGESCHLOSSEN`, `EINSTELLUNG_VERGEBEN` (hängt an einem anderen laufenden Austritt), `EINSTELLUNG_ABGESAGT` (EXPIRED), `LOESEN_GESPERRT`, `INZWISCHEN_GEAENDERT` |
| `POST /api/settings/ausstattung/rueckgabe-vorgaben` (neu) | `adminHandler` | 200 `{ gesetzt, uebersprungen, meldung, hinweis? }` (G27; `uebersprungen` ist die Anzahl, `meldung` nennt die Gründe getrennt: schon ein Wert bzw. eine Angabe; `hinweis` bei aktiven Offboarding-Webhooks, G21) |
| `PATCH /api/offboarding/[id]/return-items` (vorhanden) | `HR_EDIT_ROLES` | wie bisher. Neu:<br>• `zustand`; Zeilen mit `ausgabeId` laufen durch `rueckgabeAendern` (G15), gebunden an einen anderen Austritt → 409 `AUSGABE_IM_AUSTRITT`.<br>• 409 bei CANCELLED.<br>• `serialNumber` einer Ausgabe-Zeile ändert auch die Ausgabe und muss `kennungSchema` bestehen (400).<br>• Das bedingte `updateMany` hält zusätzlich `zustand: vorhanden.zustand` fest (heute nur `isReturned`), auch für manuelle Zeilen: Zwei gleichzeitige Zustandswechsel überschrieben sich sonst still → 409 „inzwischen geändert“. |
| `DELETE /api/offboarding/[id]/return-items` (vorhanden) | `HR_EDIT_ROLES` | neu: 409 `VORGESCHLAGEN_NICHT_LOESCHEN` für Zeilen mit `ausgabeId` |
| `PATCH /api/offboarding/[id]` (vorhanden) | wie bisher | neu: 409 `RUECKGABEN_OFFEN` mit `offen` bei COMPLETED ohne `bestaetigt` (G18), ohne vorher `exitData` zu schreiben |
| `GET /api/offboarding/[id]` (vorhanden) | `PORTAL_ROLES` | neu:<br>• Feld `rueckgaben: RueckgabenUebersicht \| null`, nur für `HR_EDIT_ROLES`, ohne Abfrage für andere; darin seit Review A4c `fortschritt` (`rueckgabenFortschritt`, Stepper) und `merkerWechsel: { nach, uebernimmt } \| null` (was eine Änderung des Merkers „weitere Beschäftigung“ übernähme – derselbe Vorschlag mit dem neuen Wert, nur solange `aktionen.aktualisieren` gilt);<br>• `abteilungen.zeilen[].hinweis` bei `nachInfoNeu` |
| `PATCH /api/offboarding/[id]/checklist/[itemId]` (vorhanden) | `CHECKLIST_ROLES` | neu für `herkunft ≠ null`:<br>• 403 ohne `HR_EDIT_ROLES`;<br>• 409 bei `assigneeDepartment`;<br>• `zustand`; RUECKGABE mit `isCompleted: true` ohne `zustand` = ZURUECK;<br>• Gleichlauf.<br>Für alle Aufgaben: Die CANCELLED-Prüfung (`uebergaenge.ts:1166`, heute nur `statusWechsel \|\| zustaendigWechsel`) zählt auch `zustandWechsel` – sonst ginge ein reiner Zustandswechsel an einer erledigten Ausgabe-Aufgabe bei einem abgebrochenen Austritt durch. |
| `GET`/`PATCH /api/offboarding-tasks/[token]…` (vorhanden) | Token | neu: Feld `ausgabe` an Ausgabe- und Folgeaufgaben; `zustand` im PATCH (G15) |
| `GET /api/onboarding-tasks/[token]` (vorhanden) | Token | neu: Feld `ausgabe` an Aufgaben mit `ausgabeMoeglich` |
| `PATCH /api/onboarding/[id]` (vorhanden, EXPIRED-Zweig) | wie bisher | neu: `ausgabenFristBeiAbsageIn` in der Transaktion (G10); Audit `STATUS_CHANGED` + `ausgabenMitFrist: n` |
| `POST /api/onboarding/[id]/documents` (neu) | `HR_EDIT_ROLES` | multipart `datei` + `type` (nur `UEBERGABEPROTOKOLL`), höchstens 9 MB Rohbytes.<br>Fehler in dieser Reihenfolge: 403; 413 (`contentLengthZuGross` **vor** dem Lesen des Bodys, danach die gezählte Größe); 400; 404; 415 (Typ aus den Bytes, `erkenneDateityp`).<br>Erfolg: 201. Die Offboarding-Route (`MAX_FILE_SIZE` 10 MB, ohne Vorabprüfung) hat dieselbe Lücke; sie bleibt in A4 unverändert und steht als eigener kleiner Fix in der Übergabe. |
| `DELETE /api/onboarding/[id]/documents/[docId]` (neu, Review A4d) | `HR_EDIT_ROLES` | nur `UEBERGABEPROTOKOLL` (Bedingung in der Abfrage), unabhängig vom Status des Vorgangs.<br>Fehler: 401; 403; 404 (Vorgang unbekannt oder fremd, Dokument unbekannt, eines anderen Vorgangs oder anderen Typs – derselbe Text je Ebene); 500 `ENTFERNEN_DATEI_FEHLER`, wenn `dateiLoeschen` „fehler“ meldet (Zeile bleibt).<br>Erfolg: 200 `{ id, meldung }`. Datei vor Zeile; Zeile (`deleteMany` mit Vorgang und Typ) und Audit `DOCUMENT_DELETED` (`documentId`, `dokumentTyp`, `datei`: „geloescht“/„fehlte“) in einer Transaktion; findet sie die Zeile nicht mehr (gleichzeitiger zweiter Aufruf): 404 ohne Audit. Im Offboarding gibt es für hochgeladene Dokumente weiterhin keinen Löschweg (Bestand, Übergabe). |
| `PATCH /api/brief-vorlagen/[id]` (vorhanden, Review A4d) | `ADMIN_ROLES` | neu: 409 `SYSTEM_VORLAGE_MODUL_FEST`, wenn eine System-Vorlage ein anderes Modul bekommen soll – vor jedem Schreiben; dasselbe Modul ist keine Änderung (weder im Update noch im Audit). |
| `GET`/`PATCH`/`DELETE /api/fragebogen/[token]/documents` (vorhanden, öffentlich) | Token | neu: nur Dokumente mit Typ aus `SELECTABLE_DOCUMENT_TYPES` (GET: `where.type in …`; PATCH, DELETE: dieselbe 404 „Dokument nicht gefunden.“ für jeden anderen Typ, G19) |

**Datenzuschnitt `ausgabe` auf der Link-Seite:**

- **Onboarding:** `{ moeglich, kennungLabel, art, stuecke: [{ id, kennung, uebergebenAm, entfernbar }] }`. Nur an Aufgaben der eigenen Stelle (`bemerkungFuerStelle`-Muster: Die Zeile gehört dieser Stelle).
- **Offboarding:** `{ art, kennungLabel, kennung, uebergebenAm, zustand, zustandLabel, auswahl }` an den Rücknahme- und Sperraufgaben der ausgebenden Stelle. An der Folgeaufgabe „Schließung prüfen“ (nur FACILITY) **nur lesend** `{ art, kennungLabel, kennung, zustandLabel: "fehlt" }` ohne `auswahl`; sie hat den normalen Haken (G17). Die ausgebende Stelle sieht die Kennung nur an ihrer eigenen Aufgabe, FACILITY nur an der Folgeaufgabe.
- In beiden Modulen fehlt der Schlüssel an allen übrigen Aufgaben **ganz**. So bleibt die gepinnte Schlüsselliste des Offboardings (`abteilungsaufgaben-routen.test.ts`, „nur die eigenen Aufgaben … ohne interne Notiz“) gültig. Gleiches gilt für die Onboarding-Pins in `onboarding-tasks.test.ts`.

### 1.7 Abläufe

**Vermerk über den Link (Onboarding, G6):**

1. IP-Bremse, Token, Status, Ablauf, Link-Bremse, Zod (Reihenfolge wie `oeffentlichAendern`).
2. Aufgabe lesen. Sie muss zur Stelle gehören und `herkunft "AUSSTATTUNG"` tragen. Über die Verknüpfung die Zeile lesen; `ausgabeMoeglich` gilt, sonst 409 `KEINE_AUSGABE`.
3. Transaktion:
   - Onboarding bedingt auf „laufend“ sperren (0 Treffer → 409/410).
   - Aufgabe erneut lesen (Stelle, `entfaelltAm`).
   - Aktive Stücke zählen und `vermerkPruefen` anwenden.
   - `ausgabenAnlegenIn` mit `organizationId` = `empfaengerEinrichtung(vorgang)`, `zentral` = Position ohne Einrichtung, `quelle "LINK"`.
   - `ausgabenGeloeschtAm` der Einstellung und der Aufgabe zurück auf `null` (1.11).
   - Audit `AUSGABE_VERMERKT`.
4. Keine Mail.

**HR in der Karte (G7):**

1. 403 → 400 → 404.
2. Transaktion:
   - `vorgangSperrenIn(tx, id, { auch: ["COMPLETED", "EXPIRED"] })`.
   - Bei `korrigieren`, `tauschen`, `zurueckgenommen` und `entfernen`: `ausgabenSperrenIn` und danach `austrittsBezuegeLaden`; eine **Bindung** nach G28 ergibt 409 `AUSGABE_IM_AUSTRITT` (Vorgangsnummer nur bei `canAccessProcess` auf den Austritt).
   - `tauschen`: alte Ausgabe über `ausgabeZustandDaten(grund === "VERLOREN" ? "FEHLT" : "ERSETZT", jetzt)`, neue Ausgabe anlegen, `ersetztDurchId` setzen.
   - Schreiben, dann Audit.
3. Antwort: neue Übersicht; bei FEHLT eines Schlüssels mit `meldung` = `GEBAEUDEWIRTSCHAFT_INFORMIEREN`.

**Zuordnen (G11 bis G14):**

1. Prüfen: 403 → 400 → 404 (Austritt) → 404 (Einstellung unbekannt, fremd oder nicht EINSTELLUNG).
2. **Versandsperre** des Austritts nehmen (`versandSperreNehmen(offboardingVersandModul(vorgang))`), belegt → 409 `VERSAND_LAEUFT`; Freigabe im `finally` (G26).
3. Transaktion:
   1. **Austritt sperren:** `updateMany({ id, onboardingId: null, status notIn [COMPLETED, CANCELLED] }, { onboardingId, weitereBeschaeftigung })`; 0 Treffer → 409 (`BEREITS_ZUGEORDNET` bzw. `VORGANG_ABGESCHLOSSEN` nach erneutem Lesen).
   2. **Einstellung sperren:** `vorgangSperrenIn(tx, onboardingId, { auch: ["COMPLETED"] })`; `false` → 409 `EINSTELLUNG_ABGESAGT` (EXPIRED). Danach `offboardingProcess.count({ onboardingId, id: { not }, status: { notIn: [COMPLETED, CANCELLED] } })` > 0 → 409 `EINSTELLUNG_VERGEBEN`. Weil jede Zuordnung die Einstellung sperrt, sieht die zweite von zwei gleichzeitigen die erste.
   3. **Arbeitsort** nach G12: nur bei gleicher Einrichtung; die Links des Austritts lesen, ist keiner versendet, `arbeitsortId` setzen.
   4. **Vorschlag** berechnen (`bestandDerEinstellungLaden`, `austrittsBezuegeLaden`, `rueckgabeVorschlag`); bei `uebernehmen` stattdessen genau diese IDs, jede geprüft.
   5. **Links** der betroffenen Stellen sperren.
   6. **Ausgaben** sperren (`ausgabenSperrenIn`, nach `id`) und erneut prüfen: Zustand aktiv, keine Bindung an einen anderen Austritt (G28). Was sich geändert hat, fällt still heraus und wird in `meldung` gezählt.
   7. **Anlegen:** `offboardingChecklistItem.createMany` (`ruecknahmeAufgabe`) und `returnItem.createMany`, beide mit `skipDuplicates`.
   8. **Links nachziehen:** verlängern und `linkStatusNeuBerechnenIn`.
   9. **Audit** `EINSTELLUNG_ZUGEORDNET` (Begründungsschlüssel, beide IDs, `weitereBeschaeftigung` als Boolean) und `RUECKGABEN_VORGESCHLAGEN` (Anzahlen).
4. „Rückgaben aktualisieren“: Versandsperre (Schritt 2), dann Austrittssperre (`updateMany … updatedAt`, bedingt auf `onboardingId` = gelesene Einstellung und nicht abgeschlossen; ein mitgeschicktes `weitereBeschaeftigung` wird dabei gespeichert), dann ab Schritt 3.4 mit dem **gespeicherten** Merker.
5. „Ohne Vermerk übernehmen“: Versandsperre → Austritt sperren → Einstellung sperren (`vorgangSperrenIn`, `auch` beide Endstatus) → `ohneVermerk` erneut rechnen → `ausgabenAnlegenIn` (`quelle "HR"`) → dann Schritt 3.4 bis 3.9.

**Lösen (G11):**

1. Prüfen: 403 → 404; Versandsperre des Austritts (409 `VERSAND_LAEUFT`).
2. Transaktion:
   1. **Austritt sperren:** `updateMany({ id, onboardingId: gelesen, status notIn [COMPLETED, CANCELLED] }, { updatedAt })`; 0 Treffer → 409 `INZWISCHEN_GEAENDERT` bzw. `VORGANG_ABGESCHLOSSEN`.
   2. **Bedingungen erneut prüfen:** keine Aufgabe mit `herkunft` ≠ null erledigt, keine `ReturnItem` mit `ausgabeId` und Zustand → sonst 409 `LOESEN_GESPERRT`.
   3. **Links** der Stellen dieser Aufgaben sperren (nach Schlüssel).
   4. **Aufgaben** mit `herkunft` AUSGABE bzw. AUSGABE_FEHLT löschen, danach die `ReturnItem` mit `ausgabeId` (G24: Aufgaben vor Rückgaben). Die Ausgaben selbst bleiben unverändert.
   5. `linkStatusNeuBerechnenIn` für diese Stellen, **ohne Mail** (eine Stelle, deren übrige Aufgaben erledigt sind, steht danach auf „fertig“ statt auf offen mit 0 offenen Aufgaben).
   6. **Arbeitsort** zurück auf `null`, nur solange keine Stelle informiert ist; `onboardingId` und `weitereBeschaeftigung` zurück auf `null`.
   7. **Audit** `EINSTELLUNG_GELOEST` (Anzahlen, `arbeitsortZurueckgesetzt`, `informierteStellen`).
3. Der Dialog nennt vorher Zahl der gelöschten Aufgaben und der schon informierten Stellen (`LOESEN_RUECKFRAGE`): Deren Aufgaben verschwinden von der Link-Seite, eine Mail dazu gibt es nicht (G26).

**Zustand setzen, drei Wege (G15):**

| Weg | Sperren | Danach |
|---|---|---|
| **Link (Offboarding, Ausgabe-Aufgabe)** | Austritt bedingt (nicht COMPLETED, nicht CANCELLED) → Links `[eigene Stelle, FACILITY falls brauchtFolgeStelle]` → Aufgabe erneut lesen → Ausgabe sperren, Bindung prüfen (G28) | `aufgabeUmschaltenPerLink` → `ausgabeGleichlaufIn(…, aufgabeSchonGeschaltet: true)` → `linkStatusNeuBerechnenIn` für die betroffenen Stellen → Audit. Mails wie bisher (Payload unverändert). RUECKGABE ohne `zustand` = ZURUECK. |
| **Portal-PATCH** | wie bisher, dazu Austritt sperren und FACILITY mitsperren; CANCELLED → 409 auch bei reinem Zustandswechsel | Ein reiner Zustandswechsel an einer schon erledigten Aufgabe (etwa ZURUECK → FEHLT) ist erlaubt. RUECKGABE ohne `zustand` = ZURUECK. |
| **Reiter Rückgaben** (`rueckgabeAendern`) | Austritt (bedingt nicht CANCELLED) → Links der Aufgabenstelle (+ FACILITY) → Aufgabe → Ausgabe sperren, Bindung an einen anderen Austritt → 409 (G28) | Aufgabe (`completedById` HR, keine Mail) → Ausgabe → `ReturnItem` (bedingt auf gelesenen `zustand`) → Folgeaufgabe → `linkStatusNeuBerechnenIn`. Zeilen ohne `ausgabeId` wie bisher, nur mit `zustand`. Ein abgeschlossener Austritt nimmt hier eine späte Rückgabe auf (Ausgabe noch an ihn gebunden). |

**Abschluss (G18):**

- Der COMPLETED-Zweig des PATCH läuft in einer Transaktion: Sperre per bedingtem `updateMany` auf `existing.status` (0 → 409 „inzwischen geändert“) → `offeneRueckgabenZaehlenIn` → ohne `bestaetigt` und mit offenen Rückgaben die Ausnahme `RueckgabenOffen` (Rollback) → `exitData`-Upsert (nur in diesem Zweig hierher verlegt) → Update → `offeneAusgabenAbschliessenIn`.
- Kommt ein neuer letzter Arbeitstag im selben PATCH mit, läuft er in derselben Transaktion (`letztenArbeitstagSperren` zuerst).
- Audit wie bisher plus `offeneRueckgaben`.

### 1.8 Oberfläche (neue Dateien nur unter `src/components/ausgaben/`, Sperrklinke Stand 0)

| Datei | Inhalt |
|---|---|
| `ausgabe-vermerk.tsx` | Block auf der Link-Seite (Onboarding) unter `BemerkungKasten`: vermerkte Stücke mit „entfernen“, Formular „Übergabe vermerken“ (Kennung mit `kennungLabel`, Datum mit Vorgabe heute, „+ weiteres Stück“). Nach dem Abhaken ohne Vermerk erscheint der Satz „Übergabe noch nicht vermerkt“ (Zugang: „Einrichtung noch nicht vermerkt“). Nur ohne `readOnly` und ohne `entfaellt`.<br>**Fokus** (Review A4b, wie `DialogRahmen`): Verschwindet der fokussierte Knopf, legt der Block den Fokus weiter – nach „Abbrechen“ und Speichern auf „Übergabe vermerken“ (fehlt er, auf den Block, `tabIndex={-1}`), nach „Entfernen“ auf den nächsten Entfernen-Knopf (sonst den Block), nach „Stück weglassen“ auf „weiteres Stück“, bei einem Fehler auf dessen Text. Zeilen mit stabilen Schlüsseln.<br>**Kontrast:** `aufgaben-seite.tsx` dämpft eine erledigte Aufgabe nur am Titel (grau, durchgestrichen), nie per `opacity` am ganzen Eintrag – sonst fielen Beschriftungen, Fehlertext und Knöpfe des Blocks unter 4,5:1. Gilt für beide Module. |
| `ruecknahme-auswahl.tsx` | Link-Seite (Offboarding): Kennung und Übergabedatum, statt des Hakens die drei Knöpfe „Zurückerhalten“, „Beschädigt zurückerhalten“, „Fehlt“, darunter der neutrale Satz „Bitte wählen Sie: zurückerhalten, beschädigt zurückerhalten oder fehlt.“ Bei SPERREN bleibt der Haken („Gesperrt“). „Wieder öffnen“ wie bisher. Ohne Knöpfe (Seite nur lesbar) steht der Stand als Text da, auch „Zustand: offen“ – sonst trüge an einer offenen Rücknahme weder Haken noch Knopf den Stand (Review A4c). |
| `ausgaben-zeile.tsx` | Karte „Ausstattung & Zugänge“ je Option: „übergeben 28.01.2027 · FES-IPAD-0412 · über den Link“ bzw. „Übergabe nicht vermerkt“ (Zugang: „Einrichtung nicht vermerkt“; gelb, nur bei erledigter Aufgabe ohne Löschmerker) bzw. „Ausgaben nach Ablauf der Aufbewahrungsfrist gelöscht“ (grau); Aktionen nach `aktionen`. Je Vorgang darunter die Zeile „Unterschriebenes Übergabeprotokoll: fehlt / hochgeladen am …“ (`uebersicht.protokoll`, G19). |
| `ausgaben-dialoge.tsx` | Vermerken, Korrigieren, Tauschen (Pflichtwahl „defekt“ / „verloren“; bei einem Schlüssel und „verloren“ der Hinweis „Gebäudewirtschaft wegen der Schließung informieren“), Zurückgenommen (bei FEHLT eines Schlüssels derselbe Hinweis), Entfernen (Rückfrage), alles über `DialogRahmen`. |
| `rueckgaben-karte.tsx` | Reiter Rückgaben:<br>• Kopfzeile nach `lage` (sechs Lagen), mit Einstellung, „Einstellung zuordnen …“ / „Lösen …“ (Rückfrage mit `LOESEN_RUECKFRAGE`) / „Rückgaben aktualisieren“, dazu der Merker „Person bleibt in einer anderen Beschäftigung“ zum Ändern – **nur über eine Rückfrage** (`DialogRahmen`), die nennt, was dabei übernommen wird (`merkerWechsel` des Servers); das Kästchen selbst sendet nie (WCAG 3.2.2), der Fokus kehrt danach auf es zurück (Review A4c);<br>• Hinweise (zentral, andere Einrichtung, ohne Übergabevermerk) mit „Übernehmen“;<br>• Hinweiszeile `SCHON_IM_AUSTRITT` für Stücke, die gerade ein anderer Austritt bindet (ohne Kennung; Vorgangsnummer nur bei Zugriff);<br>• Tabelle mit Stelle und Übergabe, Zustandsauswahl (HR), Kennung korrigieren (an Ausgabe-Zeilen nach `aktionen.korrigieren` aus `ausgabenZeile` mit `austrittId`; Tauschen, Zurücknehmen und Entfernen der Karte bietet der Reiter nicht an), Löschen nur manueller Zeilen;<br>• Zeile „Sperraufgaben an …“;<br>• Zeile „Rückgabeprotokoll: fehlt / hochgeladen am …“ (G19);<br>• Gedächtnisstütze-Satz. |
| `einstellung-zuordnen-dialog.tsx` | Vorschläge mit Stufe und Begründung, Suche, Merker „Person bleibt in einer anderen Beschäftigung“, Vorschau des Vorschlags (im Kopf Name und Vorgangsnummer der gewählten Einstellung; Rückgaben, Sperraufgaben, Hinweise, Arbeitsort), „Zuordnen“. Verschwindet die gewählte Einstellung aus der Liste (Suche geändert oder geleert), gilt die Wahl nicht mehr (`wahlSichtbar`, Review A4c). Leerzustände: `KEIN_VORSCHLAG`, `SUCHE_ZU_KURZ`, `KEIN_TREFFER`; eine Vorschau ohne vorschlagbare Stücke zeigt den Text ihrer Lage. Fehlertexte des Servers (`EINSTELLUNG_VERGEBEN` u. a.) im Dialogfuß. |
| `protokoll-upload.tsx` | Onboarding, Reiter Dokumente: „Unterschriebenes Übergabeprotokoll hochladen“. Seit Review A4d darunter die Liste der hochgeladenen Protokolle („Datei · hochgeladen am TT.MM.JJJJ“) mit „Entfernen …“ und Rückfrage (`DialogRahmen`); der Dialog schließt erst nach dem Neuladen, der Fokus geht dann auf den Titel der Karte. |

**Bestehende Dateien binden nur ein:**

- `aufgaben-seite.tsx`
- `ausstattung-karte.tsx`
- `tab-returns.tsx` (wird dünn, ohne `rueckgaben` die bisherige Liste nur lesend)
- `tab-overview.tsx`:
  - Text und `erledigt` aus `rueckgaben.schritt`, der Fortschritt aus `rueckgaben.fortschritt` (Review A4c);
  - Hinweis `ZUORDNUNG_EMPFOHLEN` mit Knopf am Schritt „Rückgaben einsammeln“, wenn `rueckgaben.zuordnungEmpfohlen` (G12);
  - Fehler „Zuständig = Rohwert der Kategorie“ beheben: `RETURN_CATEGORY_LABELS`.
- `tab-checklist.tsx` (Offboarding): An Aufgaben mit `herkunft` ≠ null den Haken nur mit Bearbeitungsrecht; bei RUECKGABE-Aufgaben der Zustand als Text („fehlt“) und der Verweis „Zustand im Reiter Rückgaben wählen“. Der bestehende Haken schickt weiter nur `{ isCompleted }` und heißt ZURUECK (G15). Eine Stellenauswahl gibt es in diesem Reiter heute nicht und kommt nicht dazu.
- `src/components/abteilungsaufgaben/abteilungen-karte.tsx`: Hinweis `ZUORDNUNG_EMPFOHLEN` über „Abteilungen informieren“ (Daten aus `rueckgaben`, Eigenschaft optional; ohne sie gleiche Ausgabe wie bisher).
- `src/components/ausstattung/katalog-tab.tsx`: Knopf „Rückgabe-Vorgaben übernehmen …“ mit Rückfrage (G27).
- `offboarding-detail-content.tsx`:
  - Abschluss über einen verallgemeinerten `abschluss-dialog.tsx`, der Texte und Absender als Eigenschaften bekommt; Onboarding unverändert. Im Offboarding nennt er ein fehlendes Rückgabeprotokoll als Hinweiszeile. Er öffnet aus dem Status-Menü, das im selben Rendern zugeht: `fokusZiel` = „Status ändern“ (`STATUS_KNOPF_ID`), nach dem Abschluss (Knopf weg) die Vorgangsnummer im Kopf (`KOPF_ID`, `tabIndex={-1}`) – nie `body` (Review A4c);
  - `confirmReturn` entfällt.
- Reiter Dokumente des Onboardings.

### 1.9 Word: Listen-Platzhalter

**ONBOARDING-Resolver:**

- `ausgaben_je_stelle`: Liste von `{ ausgabe_stelle, gegenstaende: [{ ausgabe_gegenstand, ausgabe_kennung, ausgabe_uebergeben_am }] }`, nur aktive Ausgaben der Einstellung.
- `ausgaben_liste`: Text wie `ausstattung_liste`.
- `ausgaben_anzahl`.

**OFFBOARDING-Resolver:**

- `rueckgaben_je_stelle`: Liste von `{ rueckgabe_stelle, gegenstaende: [{ rueckgabe_gegenstand, rueckgabe_kennung, rueckgabe_zustand, rueckgabe_am }] }`. Manuelle Zeilen stehen unter „Personalabteilung“; offene Zeilen haben einen leeren Zustand (zum Ausfüllen von Hand).
- Die bisherigen `rueckgaben_liste`, `_offen_liste` und `_offen_anzahl` bleiben als Namen. `offen` heißt ab jetzt `rueckgabeOffen` (G16).
- **`rueckgaben_liste` listet ab A4 jede Zeile mit Zustand**, nicht nur `isReturned` (heute `doc-template-resolvers.ts:689–704`), jede über `rueckgabeZeileText` mit Zustandswort: „— zurueck am …“ (unverändert für ZURUECK und Altbestand), „— beschädigt zurück am …“, „— fehlt“, „— verbleibt“, „— entfällt“. Sonst fielen FEHLT, VERBLEIBT und ENTFAELLT (`isReturned = false`, aber nicht mehr offen) aus **beiden** Listen, und eine Rückgabebestätigung verschwiege den fehlenden Schlüssel; BESCHAEDIGT stünde ohne Hinweis auf den Schaden da. Jede Zeile steht genau in einer der beiden Listen (Test).

**Gemeinsame Regeln:**

- Jedes innere Feld ist immer gesetzt (`""` statt fehlend). Sonst griffe der Ausdrucks-Parser auf gleichnamige Werte der Person zurück oder setzte `___`.
- Innere Namen tragen ein Präfix und kommen in `sensiblePlatzhalter` nicht vor (Test).
- **`PlaceholderDef`** bekommt optional `liste?: { felder: { name; label }[]; unterliste? }`. `variablen-katalog.tsx` zeigt Listen eingerückt.
- Der Editor (`brief-vorlagen-content.tsx`) zeigt für innere Namen bekannter Listen kein Eingabefeld.
- `generate/route.ts` überschreibt nie einen Wert, den der Resolver als Array liefert.
- Der Kommentar „nur Zeichenketten“ im Zwischenspeicher von `dokumentenpaket.ts` wird berichtigt: Arrays werden geteilt, aber nie beschrieben.

**System-Vorlagen** (`public/system-dokumente/`, öffentlich abrufbar, deshalb nur Platzhalter):

- `uebergabeprotokoll-ausstattung.docx` und `rueckgabeprotokoll-ausstattung.docx`, erzeugt von `scripts/system-vorlagen/ausstattungsprotokolle.js` (PizZip, schreibt `document.xml` mit Tabellenzeilen-Schleife, Seitenumbruch je Stelle und Unterschriftszeilen „Übergeben/Zurückgenommen (Stelle)“ und „Erhalten/Zurückgegeben ({vorname} {nachname})“, dazu den Leerblock `{^…}`).
- Das Skript läuft nur zum Erzeugen; die Dateien werden eingecheckt.

### 1.10 Protokoll (`AUSGABEN_AUDIT`, Labels per Spread in `audit-log-content.tsx`)

| Code | Bezug | `details` |
|---|---|---|
| `AUSGABE_VERMERKT` | Onboarding | `checklistItemId`, `departmentKey`, `anzahl`, `mitKennung`, `ueber` („LINK“/„PORTAL“) |
| `AUSGABE_KORRIGIERT` | Onboarding | `ausgabeId`, `felder` |
| `AUSGABE_GETAUSCHT` | Onboarding | `alt`, `neu`, `grund`, `zustandAlt` (ERSETZT bzw. FEHLT) |
| `AUSGABE_ZURUECKGENOMMEN` | Onboarding | `ausgabeId`, `zustand` |
| `AUSGABE_ENTFERNT` | Onboarding | `ausgabeId`, `ueber` |
| `AUSGABE_UEBERNOMMEN` | beide | `anzahl`, Aufgaben-IDs (ohne Vermerk) |
| `EINSTELLUNG_ZUGEORDNET` | beide | `stufe`, `gruende` (Schlüssel), `arbeitsortUebernommen`, `weitereBeschaeftigung` (Boolean) |
| `EINSTELLUNG_GELOEST` | beide | `geloeschteAufgaben`, `geloeschteRueckgaben`, `informierteStellen` (Anzahl), `arbeitsortZurueckgesetzt` |
| `RUECKGABEN_AKTUALISIERT` | Offboarding | `rueckgaben`, `sperraufgaben`, `weitereBeschaeftigungGeaendert` |
| `RUECKGABEN_VORGESCHLAGEN` | Offboarding | `rueckgaben`, `sperraufgaben`, `hinweise` |
| `AUSGABE_ZUSTAND_GEAENDERT` | Offboarding | `ausgabeId`, `von`, `nach`, `ueber`, `folgeaufgabe` |
| `AUSGABEN_GELOESCHT` | Herkunft | `anzahl`, `rueckgabenGeleert`, `kommentareGeleert`, `protokolle`, `erzeugteProtokolle` |

Bestehende Codes bleiben: `RETURN_ITEM_*` (nur ID, Kategorie, Feldnamen; neu der Zustand), `STATUS_CHANGED` (+ `offeneRueckgaben` im Offboarding, + `ausgabenMitFrist` beim EXPIRED des Onboardings), `DOCUMENT_UPLOADED` (Onboarding-Upload, wie im Offboarding). In `AUSSTATTUNG_AUDIT` kommt `RUECKGABE_VORGABEN_UEBERNOMMEN` (`AUSSTATTUNG_RUECKGABE_VORGABEN_UEBERNOMMEN`: Positions-IDs, Vorschlagsschlüssel, Anzahl) dazu.

### 1.11 Löschfristen im Lauf (G20)

**Ablauf von `ausgabenLoeschen({ jetzt, dryRun })`:**

1. Kandidaten lesen: `ausgabe.findMany({ where: { loeschenAb: { not: null, lte: jetzt } }, orderBy: { loeschenAb: "asc" }, take: 500 })`, gruppiert nach `onboardingId`; ohne Herkunft einzeln. Dazu je Gruppe die beziehenden Austritte (`austrittsBezuegeLaden`).
2. Im Probelauf nur zählen. Antwort `{ aufbewahrungMonate, verjaehrungJahre, wuerdeLoeschen, ohneFristAelterDreiJahre }`.
3. Sonst je Gruppe eine Transaktion, **in der Sperrreihenfolge G24**:
   1. **Austritte sperren:** die gelesenen Austritte nach `id` sortiert, je `updateMany({ id }, { updatedAt })` (unabhängig vom Status).
   2. **Einstellung sperren:** `vorgangSperrenIn(tx, onboardingId, { auch: ["COMPLETED", "EXPIRED"] })`. Ab hier ändert kein anderer Schreiber Zustand oder Bezug dieser Ausgaben: Jeder Offboarding-Weg sperrt zuerst seinen Austritt, jeder Onboarding-Weg und jede neue Zuordnung zuerst die Einstellung.
   3. **Menge festlegen:** Ausgaben der Gruppe mit `loeschenAb <= jetzt` neu lesen (Zustand, Aufgaben, `ReturnItem`-IDs). Was nicht mehr fällig ist (etwa nach einem Zustandswechsel kurz vor der Sperre), fällt heraus. Bezieht inzwischen ein weiterer, nicht gesperrter Austritt eine Ausgabe, fällt sie für diesen Lauf heraus (der nächste Lauf nimmt ihn mit).
   4. **Kommentare leeren**, nur für genau diese IDs: `offboardingChecklistItem.updateMany({ where: { ausgabeId: { in } }, data: { abteilungKommentar: null, abteilungKommentarAm: null } })`; an der Onboarding-Ausstattungsaufgabe (`checklistItemId`) `abteilungKommentar` leeren, sobald sie nach diesem Lauf keine Ausgabe mehr hat.
   5. **Ausgaben löschen:** `ausgabe.deleteMany({ where: { id: { in }, loeschenAb: { lte: jetzt } } })` (dank der Sperren kann sich der Zustand nicht mehr bewegt haben; das `loeschenAb` im WHERE bleibt als Netz).
   6. **Kopie in `ReturnItem` leeren**, über die in Schritt 3 gelesenen IDs (die FK steht nach dem Löschen auf `null`): `serialNumber`, `condition`, `notes`.
   7. **Merker:** `ChecklistItem.ausgabenGeloeschtAm = jetzt` für jede Ausstattungsaufgabe dieser Ausgaben; `onboardingProcess.ausgabenGeloeschtAm = jetzt`, wenn die Einstellung keine Ausgabe mehr hat; ebenso für jeden betroffenen Austritt ohne verbliebenen Ausgabebezug.
   8. Audit `AUSGABEN_GELOESCHT` je Vorgang, nur Anzahlen.
   Test per `invocationCallOrder` (Austritte → Einstellung → Aufgaben → Ausgaben → Rückgaben → Merker).
4. Danach, auch für Merker aus früheren Läufen, das heißt idempotent, jeweils Datei zuerst, dann die Zeile:
   - **Einstellungen** mit `ausgabenGeloeschtAm` und ohne Ausgaben: Dokumente `UEBERGABEPROTOKOLL` (`dateiLoeschen` unter `uploads/<onboardingId>`) und `GeneratedDocument` des Übergabeprotokolls (`templateId` einer System-Vorlage aus `SYSTEM_VORLAGEN`, `modul` ONBOARDING, `refId` = Einstellung; `pfadDocx`/`pfadPdf` wie im bestehenden Block des Laufs).
   - **Austritte** mit Merker und ohne Ausgabebezug: `OffboardingDocument` `RUECKGABEPROTOKOLL` unter `uploads/offboarding/<id>` und `GeneratedDocument` des Rückgabeprotokolls (`modul` OFFBOARDING, `refId` = Austritt).
   - Bleibt eine Datei wegen eines Fehlers stehen, versucht es der nächste Lauf erneut.
5. Jeder neue Vermerk setzt die Merker der Einstellung und der Aufgabe zurück (1.7).
6. **Zähler ohne Frist:** `ausgabe.count({ where: { loeschenAb: null, zustand: { in: AUSGABE_AKTIV }, uebergebenAm: { lt: jetzt − 3 Jahre } } })` → `ohneFristAelterDreiJahre`. Nur eine Zahl im Bericht (kein „bitte prüfen“), damit nie zugeordnete Bestände sichtbar werden (Abschnitt 6, Frage 7).

**Antwort und Auswertung:**

- Antwortfeld `ausgaben: { aufbewahrungMonate, verjaehrungJahre, geloescht, rueckgabenGeleert, protokolleGeloescht, erzeugteProtokolleGeloescht, ohneFristAelterDreiJahre, fehler }`.
- `AUSWERTER["dokumente-aufbewahrung"]` liest es (`fehler` aufsummieren, im Probelauf nicht verlangen).
- Die Beschreibung in `zeitplaner/katalog.ts` nennt die Ausgaben.
- Ohne eingeschalteten Lauf wird nie gelöscht.

---

## 2. Datenmodell A4 (`prisma/schema.prisma`, nur additiv)

Zustände sind Zeichenketten mit der Wertliste im Kommentar. `ausstattung-schema.test.ts` hält die Kommentare gegen die Konstanten in `src/lib/ausgaben.ts` (Muster S1).

```prisma
// ---------- Ausgaben je Stueck (A4, E-A30) ----------
// Der Bestand lebt laenger als der Onboarding-Vorgang: KEIN Cascade an der
// Herkunft. Einziger Schreiber: src/lib/ausgaben-schreiben.ts (G3).
// zustand: "AUSGEGEBEN" | "ZURUECK" | "BESCHAEDIGT" | "FEHLT" | "VERBLEIBT" | "ENTFAELLT" | "ERSETZT"
// beiAustritt: "RUECKGABE" | "SPERREN"
// quelle: "LINK" | "HR"
model Ausgabe {
  id                 String             @id @default(uuid())
  employeeId         String? // Personalakte; bleibt bis zur LOGA-Anbindung leer (E-A31)
  employee           Employee?          @relation(fields: [employeeId], references: [id], onDelete: SetNull)
  onboardingId       String? // Herkunft, OHNE Cascade
  onboarding         OnboardingProcess? @relation("OnboardingAusgaben", fields: [onboardingId], references: [id], onDelete: SetNull)
  checklistItemId    String? // Ausstattungsaufgabe, an der vermerkt wurde
  checklistItem      ChecklistItem?     @relation(fields: [checklistItemId], references: [id], onDelete: SetNull)
  organizationId     String // Einrichtung, der das Stueck gehoert (Empfaenger-Einrichtung der Einstellung)
  organization       Organization       @relation(fields: [organizationId], references: [id])
  zentral            Boolean            @default(false) // Position galt zentral (E-A35)
  departmentKey      String // ausgebende Stelle
  bezeichnung        String // "Schluessel: Haupteingang"; max. 200, nie Freitext
  kennungLabel       String? // Momentaufnahme ausgabeKennung, max. 40
  kennung            String? // max. 60
  rueckgabeKategorie String? // ReturnCategory-Wert, nur bei RUECKGABE
  beiAustritt        String
  quelle             String
  erfasstVonId       String? // HR-Konto bei quelle HR (kein FK)
  uebergebenAm       DateTime           @db.Date
  zustand            String             @default("AUSGEGEBEN")
  zustandAm          DateTime           @default(now())
  ersetztDurchId     String?            @unique
  ersetztDurch       Ausgabe?           @relation("AusgabeTausch", fields: [ersetztDurchId], references: [id], onDelete: SetNull)
  ersetzt            Ausgabe?           @relation("AusgabeTausch")
  loeschenAb         DateTime? // E-A37, gesetzt mit jedem Zustandswechsel (ausgabeZustandDaten)
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  rueckgaben          ReturnItem[]
  offboardingAufgaben OffboardingChecklistItem[]

  @@index([onboardingId])
  @@index([employeeId])
  @@index([checklistItemId])
  @@index([organizationId])
  @@index([loeschenAb])
  @@map("ausgaben")
}
```

**Ergänzungen bestehender Modelle**

| Modell | Neu | Hinweis |
|---|---|---|
| `OffboardingProcess` | • `onboarding OnboardingProcess? @relation("OffboardingEinstellung", fields: [onboardingId], references: [id], onDelete: SetNull)` an die vorhandene Spalte `onboardingId`, dazu `@@index([onboardingId])`<br>• `arbeitsortId String?` + `arbeitsort Organization? @relation("OffboardingArbeitsort", …, onDelete: SetNull)` + `@@index([arbeitsortId])`<br>• die bestehende Relation `organization` wird `"OffboardingEinrichtung"` benannt<br>• `ausgabenGeloeschtAm DateTime?` (1.11)<br>• `weitereBeschaeftigung Boolean?` (G13; `null` = nie zugeordnet) | Neuer FK auf eine bestehende Spalte: Vor dem Deploy muss sie leer bzw. gültig sein (Abschnitt 4). Relationsnamen gibt es nur in Prisma; der Name `offboarding_processes_organizationId_fkey` bleibt (S21 prüft das). |
| `OnboardingProcess` | `austritte OffboardingProcess[] @relation("OffboardingEinstellung")`, `ausgaben Ausgabe[] @relation("OnboardingAusgaben")`, `ausgabenGeloeschtAm DateTime?` | |
| `Organization` | `offboardings … @relation("OffboardingEinrichtung")` (nur benannt), `offboardingArbeitsorte OffboardingProcess[] @relation("OffboardingArbeitsort")`, `ausgaben Ausgabe[]` | `_count`-Leser bleiben gültig (Feldname unverändert) |
| `Employee` | `ausgaben Ausgabe[]` | |
| `ChecklistItem` | `ausgaben Ausgabe[]`, `ausgabenGeloeschtAm DateTime?` (Kommentar: „A4: Ausgaben dieser Ausstattungsaufgabe nach Ablauf der Frist gelöscht; ein neuer Vermerk setzt zurück“) | G20; ohne den Merker forderte die Karte nach der Löschung wieder einen Vermerk |
| `SupervisorData` | `ausgabenAngeboten Boolean?` (Kommentar: „A4: Katalogausschnitt enthielt eine Position mit RUECKGABE/SPERREN; gesetzt mit der Momentaufnahme; null = Altfall oder ohne Ausstattungsschritt“) | E-A36, `rueckgabeLage` |
| `OffboardingChecklistItem` | • Kommentar: `// herkunft: null = Vorlage \| "AUSGABE" \| "AUSGABE_FEHLT"`<br>• `herkunft String?`, `ausgabeId String?` + `ausgabe Ausgabe? @relation(…, onDelete: SetNull)`<br>• `@@unique([offboardingId, ausgabeId, herkunft])`, `@@index([ausgabeId])` | NULL zählt als verschieden; Altzeilen kollidieren nicht. Je Austritt und Ausgabe höchstens eine Folgeaufgabe: Ein erneutes FEHLT öffnet die erledigte wieder, statt eine zweite anzulegen (G17, `folgeAufgabeSchritt`) |
| `ReturnItem` | • Kommentar: `// zustand: null = offen \| "ZURUECK" \| "BESCHAEDIGT" \| "FEHLT" \| "VERBLEIBT" \| "ENTFAELLT"; isReturned folgt (G16)`<br>• `zustand String?`, `ausgabeId String?` + `ausgabe Ausgabe? @relation(…, onDelete: SetNull)`<br>• `@@unique([offboardingId, ausgabeId])` | |
| `DocumentType` (Enum) | `UEBERGABEPROTOKOLL` | Ein zusätzlicher Wert ist für `db push` unkritisch. Er steht nicht in `SELECTABLE_DOCUMENT_TYPES` (Fragebogen), das Label kommt in `DOCUMENT_TYPE_LABELS`. |

---

## 3. Arbeitsschritte

**Pflicht am Ende jedes Schritts** (aus dem Worktree, Werkzeuge aus S0):

```bash
npx prisma generate            # nur wenn schema.prisma geändert wurde (schreibt nur in den Worktree)
npx prisma validate            # nur wenn schema.prisma geändert wurde
npx tsc --noEmit
npx next lint
npx jest <betroffene Tests>    # zuerst gezielt
npx jest                       # dann vollständig — Sperrklinke, Katalog- und Payload-Tests liegen quer
```

Es gelten die Grundregeln aus dem Feinplan A1–A3 (Abschnitt 2):

- nicht committen und nicht pushen;
- neue Oberflächendateien mit Sperrklinke 0, nur Tokens, `lucide-react`, `formatDatumDE`, `DialogRahmen`;
- keine Palettenklassen in bestehenden Dateien;
- kein `toLocale…String` ohne `timeZone`;
- Browserproben nur gegen `hr_portal_ausstattung` und den Dev-Server des Worktrees (Port 3200);
- **jede neue reine Funktion bekommt im selben Schritt ihren Unit-Test** (`src/__tests__/lib/ausgaben.test.ts`).

Die Fake-DB (`src/__tests__/hilfen/abteilungs-fake-db.ts`) kennt Relationsfilter, `createMany … skipDuplicates` und Datumsvergleiche nicht. Kandidaten- und Löschabfragen werden deshalb mit eigenem `mockPrisma` getestet (Muster `ausstattung-lauf.test.ts`). Neue Methoden der Fake-DB hängt der jeweilige Schritt an (S24 `ausgabe`, S29 `returnItem` und die neuen Felder der Offboarding-Aufgaben).

### A4a – Grundlagen

#### S21 Schema und Grundkonstanten

- **Ziel:** Das vollständige Schema für A4 (Abschnitt 2) steht. Kein späterer Schritt ändert es, auf dem Server gibt es einen einzigen Push.
- **Dateien:**
  - `prisma/schema.prisma`.
  - **neu** `src/lib/ausgaben.ts`, vorerst nur mit den Konstanten aus 1.3, `AUSGABE_ZUSTAND_LABELS`, `AUSGABEN_AUDIT`/`_LABELS` und den Typen.
  - `src/lib/required-documents.ts` (Label „Übergabeprotokoll Ausstattung“, **nicht** in `SELECTABLE_DOCUMENT_TYPES`).
  - `src/app/(portal)/audit-log/audit-log-content.tsx` (Spread der Labels).
  - Test-Fixtures, die volle Modelltypen bauen (`OffboardingProcess`, `ReturnItem`, `OffboardingChecklistItem`, `ChecklistItem`, `SupervisorData`), bekommen die neuen Felder mit `null`; tsc zeigt die Stellen.
  - `RUECKGABE_KATEGORIEN` zieht von `validations/offboarding.ts` nach `src/lib/constants.ts` (Re-Export bleibt, 1.3).
- **Tests:**
  - `ausstattung-schema.test.ts`: `NEUE_MODELLE` + `Ausgabe`; die neuen Felder `ChecklistItem.ausgabenGeloeschtAm`, `SupervisorData.ausgabenAngeboten`, `OffboardingProcess.weitereBeschaeftigung` vorhanden und nullbar; Kommentare gegen `AUSGABE_ZUSTAENDE`, `AUSGABE_BEI_AUSTRITT`, `AUSGABE_QUELLEN`, `RUECKGABE_ZUSTAENDE`, `OFFBOARDING_AUFGABEN_HERKUNFT`; `AUSGABE_BEI_AUSTRITT` ⊂ `BEI_AUSTRITT` ohne NICHTS; `RUECKGABE_KATEGORIEN` = `$Enums.ReturnCategory`; `onDelete: SetNull` an `Ausgabe.onboardingId`, `ReturnItem.ausgabeId` und `OffboardingChecklistItem.ausgabeId` (Zeilentest).
  - `audit-log-labels.test.tsx`: Schleife über `AUSGABEN_AUDIT`.
  - Test der Dokumentarten: `UEBERGABEPROTOKOLL` ist nicht wählbar.
- **Abnahme:**
  - `git show main:prisma/schema.prisma > <scratch>/schema-main.prisma` und `git show HEAD:prisma/schema.prisma > <scratch>/schema-a3.prisma`, dann `npx prisma migrate diff --from-schema-datamodel <scratch>/schema-a3.prisma --to-schema-datamodel prisma/schema.prisma --script`.
  - Erwartet werden nur `CREATE TABLE "ausgaben"`, `ADD COLUMN`, `CREATE [UNIQUE] INDEX`, `ADD CONSTRAINT … FOREIGN KEY` (darunter `offboarding_processes_onboardingId_fkey` und `…_arbeitsortId_fkey`) und `ALTER TYPE "DocumentType" ADD VALUE`.
  - Kein `DROP`, kein `RENAME`, `offboarding_processes_organizationId_fkey` unverändert.
  - Dasselbe von `main` aus; das Skript kommt in die Übergabe.
  - `npx prisma db push` gegen `hr_portal_ausstattung`.
  - Pflichtprüfung.
- **Abhängigkeiten:** keine (A1–A3 stehen).

#### S22 Reine Regeln und Zod

- **Ziel:** Alle Regeln von A4 liegen rein und getestet vor.
- **Dateien:**
  - `src/lib/ausgaben.ts`: alle Funktionen aus 1.3.
  - `src/lib/abteilungsaufgaben.ts`: `empfaengerEinrichtung` (+ Alias), `nachInfoNeu` in `abteilungsZeilenBauen`.
  - **neu** `src/lib/validations/ausgaben.ts`.
  - `src/lib/validations/abteilungsaufgaben.ts`: `offboardingAufgabeLinkPatchSchema`, `portalAufgabePatchSchema` + `zustand`, `OHNE_KLAMMERN_STEUERZEICHEN` exportieren.
  - `src/lib/validations/offboarding.ts`: `rueckgabeAendernSchema`, `bestaetigt`.
  - `src/lib/validations/ausgaben.ts` exportiert `kennungSchema` (G15).
- **Tests (`ausgaben.test.ts`)** – jede Funktion aus 1.3 hat hier ihren Test:
  - `ausgabeLoeschenAb`:
    - ZURUECK am 31.08. ergibt 28./29.02., Sommer- und Winterzeit;
    - FEHLT am 31.12.2027 23:30 Berlin ergibt **1.1.2031**; FEHLT am 01.01.2028 00:30 Berlin (= 31.12.2027 23:30 UTC) ergibt **1.1.2032**. Genau dieses Paar belegt, dass das Berliner Jahr zählt, nicht das UTC-Jahr;
    - AUSGEGEBEN ergibt `null`; mit `austrittAbgeschlossenAm` drei Jahre ab Jahresende: Abschluss am 31.12.2027 um 23:30 Berlin ergibt 1.1.2031, am 01.01.2028 um 00:30 Berlin 1.1.2032 (G18); mit `vorgangEingestelltAm` ebenso (G10);
    - VERBLEIBT ergibt `null`.
  - `ausgabeZustandDaten`: liefert für **jeden** Zustand `zustandAm = jetzt` und das `loeschenAb` aus `ausgabeLoeschenAb` (Schleife über `AUSGABE_ZUSTAENDE`).
  - `bindetAusgabe`: laufend bindet jeden Zustand; COMPLETED bindet alles außer VERBLEIBT (auch ein offenes AUSGEGEBEN); CANCELLED bindet nie.
  - `ausgabeMoeglich`: RUECKGABE/SPERREN ja; NICHTS, `null`, ANGABE, gestrichen nein.
  - `ausgabenAngeboten`: Ausschnitt mit RUECKGABE bzw. SPERREN ja; nur NICHTS bzw. leer nein; ANGABE zählt nie.
  - `ausgabeBezeichnung`: Position mit und ohne Option; nie Freitext.
  - `namensSchluessel`: „Müller“ in NFC und NFD ergibt denselben Schlüssel; doppelte und führende Leerräume; „Mueller“ ≠ „Müller“ (keine Unschärfe).
  - `vermerkPruefen`: 0 bzw. 11 Stück, Datum morgen, Grenze aktiver Stücke.
  - `rueckgabeZustand` und `rueckgabeOffen` (Altbestand), `rueckgabeDaten`.
  - `rueckgabeZeileText`: jeder Zustand mit seinem Wort; Altbestand `isReturned` ohne Zustand wie bisher „— zurueck am …“.
  - `ruecknahmeAufgabe`: Titel ohne Kennung, Fälligkeit vor/nach heute, HR-Stelle.
  - `folgeAufgabe` und `brauchtFolgeStelle` (nur SCHLUESSEL, auch beim Verlassen von FEHLT).
  - `folgeAufgabeSchritt`: FEHLT ohne Folgeaufgabe → anlegen; FEHLT → erledigt → ZURUECK → FEHLT öffnet **dieselbe** Zeile wieder (offen, fällig heute, Kommentar leer), auch von AUSGEGEBEN bzw. `null` aus; FEHLT bei offener → nichts; FEHLT verlassen → offene löschen, erledigte bleibt; kein Schlüssel bzw. kein Wechsel → nichts; nie ein Schritt ohne `brauchtFolgeStelle` (Matrix).
  - `zuordnungsVorschlaege`:
    - E-Mail privat gegen Einladungsadresse ergibt STARK;
    - Geburtsname ergibt MITTEL;
    - nur Nachname ohne Einrichtung ergibt keinen Vorschlag;
    - keine Adresse in der Ausgabe;
    - höchstens 10, Reihenfolge.
  - `rueckgabeVorschlag`:
    - Einrichtung bzw. Arbeitsort des Austritts;
    - Einstellung mit Arbeitsort an **anderer** Einrichtung als der Austritt ergibt einen Hinweis, keinen Vorschlag; gleiche Einrichtung (OGS-Fall) ergibt einen Vorschlag;
    - zentral mit und ohne Merker, unabhängig von der Einrichtung;
    - Bezug zu laufendem Austritt (`schonImAustritt`), zu CANCELLED (frei), zu COMPLETED mit VERBLEIBT (frei, wird vorgeschlagen), zu COMPLETED mit offenem AUSGEGEBEN (gebunden);
    - VERBLEIBT eingeschlossen.
  - `ohneVermerk`: entfallene Aufgabe nein; offene nein; mit Ausgabe nein; ohne `beiAustritt` bzw. mit NICHTS nein; mit `ausgabenGeloeschtAm` nein; erledigt mit RUECKGABE ohne Ausgabe ja.
  - `rueckgabeLage`: alle sechs Lagen, dazu:
    - „nach Einführung nichts gewählt“ (Merker `true`, keine Zeile mit RUECKGABE/SPERREN) ergibt `NICHTS_AUSGEGEBEN`;
    - „nur NICHTS-Positionen gewählt“ mit Merker `true` ergibt `NICHTS_AUSGEGEBEN`, mit Merker `false` (Katalog ohne Rückgabe-Positionen) `VOR_EINFUEHRUNG`;
    - „Ehrenamt ohne Modalitäten“ (Merker `null`, keine Zeilen) ergibt `VOR_EINFUEHRUNG`;
    - alle Ausgaben gelöscht ergibt `GELOESCHT`, nicht `NICHTS_ERFASST`.
  - `ausgabenZeile` als Matrix: AUSGEGEBEN ohne Bezug (alle Aktionen), gebunden im Austritt (keine Aktion, `sperrGrund` mit bzw. ohne Vorgangsnummer), VERBLEIBT frei (korrigieren, tauschen, zurückgenommen), ERSETZT (keine Aktion), Quelle LINK bzw. HR, ohne Recht (keine Aktion, Anzeige bleibt), Aufgabe gelöscht (grauer Satz, keine gelbe Aufforderung); im eigenen Austritt (`austrittId`) nur `korrigieren` und nur bei RUECKGABE (laufend, abgeschlossen, VERBLEIBT), bindet daneben ein anderer Austritt, dessen Sperrgrund.
  - `protokollStand`: ohne Ausgaben mit RUECKGABE nicht nötig; nötig ohne Dokument; jüngstes Dokument zählt.
  - `offeneRueckgaben`: je Stück einmal.
  - `rueckgabenSchritt`.
  - Mailfelder: maskiert, flach, `""` ohne Inhalt.
  - `protokollStellen`.
  - `RUECKGABE_VORGABEN`: jeder Schlüssel kommt in `VORSCHLAEGE` vor; `VORSCHLAEGE` trägt **kein** `beiAustritt` (die Prüfung gegen `positionPruefen` folgt in S23).
  - Zod: Kennung mit `<` bzw. Steuerzeichen ergibt 400, `\r\n` wird normalisiert, Datum 31.02. ergibt 400; `tauschen` ohne `grund` ergibt 400; `aktualisieren` nimmt `weitereBeschaeftigung` optional; `updateOffboardingSchema` mit nur `bestaetigt` ergibt „Mindestens ein Feld erforderlich“ (Route: 400 ohne Update und ohne Protokoll, `abteilungsaufgaben-routen.test.ts`).
  - Weiter:
    - `abteilungsaufgaben.test.ts`: `nachInfoNeu`, ohne Feld gleiche Ausgabe wie bisher.
    - `abteilungsaufgaben-validierung.test.ts`: Das Onboarding-Schema verwirft `zustand` still (unverändert), das Offboarding-Schema nimmt es nur mit `isCompleted: true`.
    - Kreisfreiheit: `ausstattung.ts` importiert `ausgaben.ts` nur als Typ.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S21.

#### S23 Katalog: A4-Felder pflegbar

- **Ziel:** G8 und G27 (Einschalten nur über eine bewusste Handlung), dazu der Merker `ausgabenAngeboten` (E-A36).
- **Dateien:**
  - `src/lib/ausstattung.ts`: `PositionEntwurf`, `KATALOG_FELDER`, `positionPruefen`. `VORSCHLAEGE` bleibt **unverändert**.
  - `src/lib/validations/ausstattung.ts`: `katalogPositionFelder`, `frei`.
  - `src/lib/ausstattung-katalog.ts` (Schreibweg über die Positivliste, Protokoll über `katalogAenderungen`; **neu** `rueckgabeVorgabenUebernehmen` mit Webhook-Hinweis, G21/G27).
  - **neu** `src/app/api/settings/ausstattung/rueckgabe-vorgaben/route.ts` (`adminHandler`, dünn wie `…/vorschlaege`).
  - `src/lib/ausstattung.ts`: `AUSSTATTUNG_AUDIT.RUECKGABE_VORGABEN_UEBERNOMMEN` samt Label.
  - `src/lib/ausstattung-dienst.ts`: `freieMomentaufnahme` übernimmt `beiAustritt`/`rueckgabeKategorie` aus `frei`; `fuehrungskraftWahlSpeichernIn` setzt `SupervisorData.ausgabenAngeboten` aus dem Ausschnitt, den es ohnehin liest (bei `mitAusstattung`). Die Abgabe der Modalitäten (`POST /api/modalitaeten/[token]`) setzt den Merker in ihrer Transaktion, falls er dann noch `null` ist (die Führungskraft hat den Schritt nie gespeichert und die Vorauswahl übernommen).
  - `src/components/ausstattung/position-dialog.tsx`: Feldgruppe „Beim Austritt“ (Zurückgeben / Sperren / nichts) mit dem Satz aus G27, „Rückgabekategorie“ und „Kennung abfragen (Beschriftung)“ neben „Gilt für Personengruppen“; `formularPruefen` über `positionPruefen`.
  - `src/components/ausstattung/katalog-tab.tsx`: Spalte bzw. Unterzeile „beim Austritt: zurückgeben“; Knopf „Rückgabe-Vorgaben übernehmen …“ mit Rückfrage.
  - Dialog „Position hinzufügen…“ der Karte (freie Position): optional „Beim Austritt“.
- **Tests:** Die Stellen, die heute „nicht schreibbar“ festhalten, werden umgeschrieben:

  | Datei | Stellen |
  |---|---|
  | `ausstattung-validierung.test.ts` | :6, :49–51, :88, :312, :318, :419 |
  | `settings-ausstattung.test.ts` | :11, :117–119, :230, :440 |
  | `ausstattung.test.ts` | :1122, :1199 |

  - Die Testwerte `"IT_GERAET"`/`"IT"` (`ausstattung-validierung.test.ts:50`, `settings-ausstattung.test.ts:118`, `ausstattung.test.ts:652`) werden zu gültigen Werten.
  - `formularGruppen` streicht A4 weiter (`ausstattung.test.ts:681–703` bleibt).
  - Neu: `positionPruefen`-Matrix (ANGABE mit A4 ergibt Fehler, RUECKGABE ohne Kategorie, Kennung bei NICHTS); jede Zeile von `RUECKGABE_VORGABEN` besteht `positionPruefen`; Momentaufnahme übernimmt die Werte (`:1734`); `position-dialog`-Komponententest.
  - **„Vorschläge übernehmen“ setzt nach A4 weiterhin kein `beiAustritt`** (`settings-ausstattung.test.ts`, alle angelegten Positionen mit `beiAustritt`, `rueckgabeKategorie`, `ausgabeKennung` = `null`).
  - `rueckgabeVorgabenUebernehmen`: setzt nur an Positionen mit `vorschlagSchluessel` und leerem `beiAustritt`; eine von HR gesetzte Position bleibt; zweiter Aufruf ändert nichts; Audit mit IDs und Schlüsseln; `hinweis` nur bei aktivem Offboarding-Webhook; Route 403 ohne `ADMIN_ROLES`. WHERE mit `art: { not: "ANGABE" }`: wird die Position zwischen Lesen und Schreiben zur Angabe, bleiben ihre drei Felder leer und die Meldung nennt „ist eine Angabe“; eine schon im Katalog stehende Angabe mit Vorschlagsschlüssel heißt in Rückfrage, Sperrgrund und Meldung nie „hat schon einen Wert“ (`rueckgabeVorgabenPlan` mit `grund`, Komponententest der Katalogseite).
  - `ausstattung-dienst.test.ts`: `ausgabenAngeboten` nach dem Speichern mit Katalog mit bzw. ohne Rückgabe-Position; ohne `mitAusstattung` bleibt er `null`.
- **Abnahme:** Pflichtprüfung. Browserprobe: Vorschläge übernehmen (keine A4-Werte), dann „Rückgabe-Vorgaben übernehmen …“; Position mit „Beim Austritt: zurückgeben“ anlegen; das Protokoll zeigt beides.
- **Abhängigkeiten:** S22.

### A4b – Ausgabe im Onboarding

#### S24 Ausgaben-Server: Schreiber, HR-Route, Karte

- **Ziel:** G2 bis G5, G7 auf dem Server.
- **Dateien:**
  - **neu** `src/lib/ausgaben-schreiben.ts` (ohne `ausgabeGleichlaufIn`, das kommt in S30) und `src/lib/ausgaben-daten.ts`.
  - **neu** `src/lib/ausgaben-dienst.ts` und `src/app/api/onboarding/[id]/ausgaben/route.ts`.
  - `src/lib/ausstattung-dienst.ts`: `uebersichtBauen` lädt die Ausgaben je Aufgabe (eine Abfrage, nur für `HR_EDIT_ROLES`), die Austrittsbezüge samt Bindung (G28) und das jüngste `UEBERGABEPROTOKOLL` (`protokoll`, G19); `aendernIn`/`streichenIn` lesen nach der Vorgangssperre `mitAusgabe` (G5).
  - `src/lib/ausstattung.ts`: `AusstattungsAufgabeStand.ausgaben`, `ausgabeMoeglich`, `ausgabenBearbeitbar`, `aenderungPruefen`.
  - `src/lib/abteilungsaufgaben-onboarding.ts`: nichts Neues (`vorgangSperrenIn` mit `auch` gibt es); Kopfkommentar von `vorgangSperrenIn` nennt den neuen Aufrufer.
- **Tests:**
  - **neu** `src/__tests__/lib/ausgaben-dienst.test.ts` (Fake-DB, erweitert um `ausgabe`):
    - Vermerk an offener und an erledigter Aufgabe;
    - an entfallener Aufgabe 409;
    - an Zeile ohne `beiAustritt` 409;
    - 11 Stück 400;
    - Datum morgen 400;
    - bei COMPLETED und EXPIRED erlaubt; nach EXPIRED tragen neu vermerkte und eingetauschte Stücke die Frist der Absage, Status und `expiredAt` nach der Sperre gelesen (Review A4b, G10);
    - Tausch eines Zugangs (SPERREN) 400 `ZUGANG_KEIN_TAUSCH` (Review A4b);
    - Tausch DEFEKT: alte ERSETZT mit 6-Monats-Frist + neue Zeile, `ersetztDurchId` gesetzt;
    - Tausch VERLOREN: alte FEHLT mit 3-Jahres-Frist (Jahresende), `ersetztDurchId` gesetzt; bei SCHLUESSEL `meldung` = `GEBAEUDEWIRTSCHAFT_INFORMIEREN`;
    - Tausch einer freigegebenen VERBLEIBT-Ausgabe erlaubt;
    - `zurueckgenommen` FEHLT ergibt die Frist zum Jahresende (bei SCHLUESSEL mit Hinweis);
    - Entfernen nur ohne Austrittsbezug, sonst 409 `AUSGABE_IM_AUSTRITT` (Bezug nach der Sperre gelesen);
    - Bindung nach G28: Ausgabe in laufendem Austritt → 409; VERBLEIBT aus abgeschlossenem Austritt → frei (Korrigieren und Tauschen gehen); offenes AUSGEGEBEN aus abgeschlossenem Austritt → 409; Bezug nur zu CANCELLED → frei; Vorgangsnummer in der Meldung nur mit Zugriff auf den Austritt (die Bezüge liefert hier ein eigener `mockPrisma` für `austrittsBezuegeLaden`, weil die Fake-DB keine Relationsfilter kennt);
    - fremder Mandant 404;
    - Audit ohne Kennung;
    - die Merker `ausgabenGeloeschtAm` an Einstellung und Aufgabe werden beim Vermerk zurückgesetzt;
    - Übersicht: `protokoll` „fehlt“ bzw. mit Datum, nur bei aktiven Ausgaben mit RUECKGABE.
  - `ausstattung-dienst.test.ts`: Abwählen bzw. Streichen bzw. Stellenwechsel mit aktiver Ausgabe ergibt 409 `AUSGABE_VORHANDEN`.
  - **neu** `src/__tests__/api/onboarding-ausgaben.test.ts`: Route, 403 für EINRICHTUNGSLEITUNG/VORGESETZTER/SERVICE, 404 fremd gleich unbekannt, kaputtes JSON 400.
  - **neu** Wächter `src/__tests__/lib/ausgaben-schreiber.test.ts`: kein `.ausgabe.(create|…)` außerhalb `ausgaben-schreiben.ts`.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S22 (S23 nicht nötig: Die Fake-DB setzt `beiAustritt` direkt).

#### S25 Vermerk über den Link der Stelle, Mail an HR

- **Ziel:** G6 und G9. Mockup 6.5, Block „Übergabe vermerken“.
- **Dateien:**
  - `src/lib/abteilungsaufgaben-uebergaenge.ts`:
    - `oeffentlicheAusgabeVermerken`, `oeffentlicheAusgabeEntfernen`;
    - `aufgabenDerAbteilung` (Onboarding: Feld `ausgabe` nur an Aufgaben mit `ausgabeMoeglich` der eigenen Stelle);
    - `aufgabeErledigtMelden` (Onboarding: `ausgabeVermerkMailFelder` aus dem frisch gelesenen Stand).
  - **neu** `src/app/api/onboarding-tasks/[token]/[itemId]/ausgaben/route.ts` (POST) und `…/ausgaben/[ausgabeId]/route.ts` (DELETE), Muster der PATCH-Route (IP-Bremse zuerst, `json().catch(() => undefined)`).
  - **neu** `src/components/ausgaben/ausgabe-vermerk.tsx`; `src/components/abteilungsaufgaben/aufgaben-seite.tsx` (Typ `OeffentlicheAufgabe` + `ausgabe`, Einbindung nach `BemerkungKasten`, eigener Aufruf neben `aendern`).
  - `src/lib/events.ts`: Beispiel + `ausgabe_vermerk*`; `ONBOARDING_ERLEDIGT_BETREFF_OHNE` + beide.
  - `src/lib/default-email-templates.ts`: `onboarding-task-completed`, flacher Block `{{#ausgabe_vermerk}}` mit Zeile „Vermerkt: {{ausgabe_vermerk_html}}“ in der Infotabelle, ebenso im Textteil, Variablenliste. (Review A4b: Beschriftung „Vermerkt“ statt „Übergeben“ – bei einem Zugang stand sonst „Übergeben: eingerichtet 25.09.2026“.)
  - `src/lib/mailer.ts` (`FREITEXT_VARIABLEN` + `ausgabe_vermerk`).
- **Tests:**
  - `onboarding-tasks.test.ts`:
    - Vermerk über den Link mit dem echten Dienst;
    - 410 bei EXPIRED und abgelaufenem Link, 409 bei COMPLETED;
    - fremde Stelle 404;
    - IP-Bremse vor dem Token;
    - Entfernen nur des eigenen Link-Vermerks;
    - Aufgaben ohne Ausgabe-Möglichkeit haben **keinen** Schlüssel `ausgabe` (gepinnte Felder bleiben grün);
    - eine fremde Stelle sieht die Kennung nicht.
  - `onboarding-abteilungs-mails.test.ts`:
    - echte Payload = Katalogbeispiel (:986, :1059);
    - Vermerk vor dem Abhaken ergibt eine Zeile in der Mail, ein Vermerk allein keine Mail;
    - Render ohne verwaiste Marker;
    - exakte `betreffOhne`-Liste (:1635).
  - `events-catalog.test.ts` :170 (Liste).
  - `email-vorlagen-standard.test.ts` (flach).
  - `email-template-syntax.test.ts` (Betreff mit `ausgabe_vermerk` ergibt 400).
  - `aufgaben-seite.test.tsx` (Block erscheint nur mit `ausgabe`, nicht bei `readOnly` bzw. „entfällt“, Fehlertext des Servers).
- **Abnahme:** Pflichtprüfung. Browserprobe: Link-Seite IT, zwei Stück vermerken, eines entfernen.
- **Abhängigkeiten:** S24.

#### S26 Karte „Ausstattung & Zugänge“: Ausgaben

- **Ziel:** G7 in der Oberfläche.
- **Dateien:**
  - **neu** `src/components/ausgaben/ausgaben-zeile.tsx` und `src/components/ausgaben/ausgaben-dialoge.tsx`.
  - `src/components/ausstattung/ausstattung-karte.tsx` (Einbindung je Option; Aufruf `POST …/ausgaben` neben `ausstattungAktionSenden`; Aktionen auch in NUR_LESEN, wenn `ausgabenBearbeitbar`).
- **Tests:**
  - **neu** `src/__tests__/components/ausgaben-karte.test.tsx`:
    - Zeile mit und ohne Kennung;
    - „Übergabe nicht vermerkt“ nur bei erledigter Aufgabe; mit `ausgabenGeloeschtAm` stattdessen „Ausgaben nach Ablauf der Aufbewahrungsfrist gelöscht“ ohne gelbe Aufforderung;
    - Aktionen nur mit Recht, auch bei COMPLETED;
    - gesperrter Grund bei Austrittsbezug;
    - Tausch-Dialog: Grund ist Pflicht; „verloren“ bei einem Schlüssel zeigt den Hinweis zur Gebäudewirtschaft;
    - Protokollzeile „fehlt“ bzw. „hochgeladen am …“, nur mit Ausgaben mit RUECKGABE;
    - Dialoge mit Fehlertext des Servers.
  - `ausstattung-karte.test.tsx` bleibt grün (neue Eigenschaften optional).
  - Sperrklinke.
- **Abnahme:** Pflichtprüfung. Browserprobe: abgeschlossener Vorgang, Ausgabe nachtragen und tauschen.
- **Abhängigkeiten:** S24 (S25 nicht nötig).

#### S27 Absage nennt die Ausgaben (Rückbau)

- **Ziel:** G10, samt Frist bei Absage.
- **Dateien:**
  - `src/lib/abteilungsaufgaben-dienst.ts` bzw. Adapter (`absagePayload`: `ausgabenListeMailFelder` je Stelle, aktive Ausgaben mit `departmentKey` der Stelle).
  - `src/app/api/onboarding/[id]/route.ts` (EXPIRED-Zweig: `ausgabenFristBeiAbsageIn` nach dem bedingten Statuswechsel, Audit `ausgabenMitFrist`) und `src/lib/ausgaben-schreiben.ts` (`ausgabenFristBeiAbsageIn`).
  - `src/lib/events.ts` (Beispiel, `betreffOhne` + `ausgaben_liste*`).
  - `src/lib/default-email-templates.ts` (`onboarding-department-abgesagt`: flacher Block `{{#hat_ausgaben}}` „Laut Portal ausgegeben – bitte zurücknehmen bzw. sperren:“ + `{{ausgaben_liste_html}}`, Textteil).
  - `src/lib/mailer.ts` (`ausgaben_liste`).
  - `src/components/ausstattung/absage-block.tsx`: Satz „Ausgegebenes vermerken Sie nach der Rücknahme in der Karte (‚zurückgenommen‘).“
- **Tests:**
  - `abteilungsaufgaben-onboarding.test.ts`:
    - Absage mit und ohne Ausgaben;
    - nur Ausgaben der eigenen Stelle;
    - keine Link-Felder;
    - Positivliste der Payload erweitert.
  - `onboarding-abteilungs-mails.test.ts` (Payload = Beispiel, Render).
  - `onboarding-status-patch.test.ts`: EXPIRED setzt `loeschenAb` aller aktiven Ausgaben ohne Austrittsbezug auf drei Jahre ab Jahresende von `expiredAt` (im selben Commit, Rollback bei 409); Ausgaben in einem Endzustand behalten ihre Frist; ohne Ausgaben keine zusätzliche Abfrage außer der Zählung.
  - `ereignis-liste.test.ts` unverändert grün.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S24.

### A4c – Rückgaben im Offboarding

#### S28 Einstellung zuordnen, Arbeitsort am Austritt

- **Ziel:** G11 und G12, vorerst ohne Rückgabe-Vorschlag. `zuordnen` schreibt Bezug, Arbeitsort, Merker `weitereBeschaeftigung` und Audit; `loesen` setzt sie zurück (in S28 gibt es noch keine Ausgabe-Aufgaben). Die Übernahme und das Löschen der Aufgaben beim Lösen kommen in S29.
- **Dateien:**
  - **neu** `src/lib/offboarding-ausgaben.ts` (`einstellungVorschlaegeLaden`, `einstellungAktionAusfuehren` mit `zuordnen`/`loesen`, Versandsperre wie in 1.7, Sperre und Prüfung der Einstellung).
  - **neu** `src/app/api/offboarding/[id]/einstellung/route.ts` (GET, POST).
  - `src/lib/abteilungsaufgaben-dienst.ts`: `VORGANG_AUSWAHL` + `arbeitsortId`, `offboardingVersandModul` und `abteilungsUebersichtLaden` mit `empfaengerEinrichtung` (G12).
  - `src/app/api/offboarding/[id]/route.ts` (GET: Feld `rueckgaben` vorerst mit `einstellung`, `lage` und `zuordnungEmpfohlen`, nur `HR_EDIT_ROLES`).
  - Die Kandidatenabfrage nimmt `getAllowedOrgIds` bzw. `canAccessProcess`, `processType: "EINSTELLUNG"`, `status: { not: "EXPIRED" }`, dazu `OR` über `email` (Index), `personalData.emailPrivate`, `lastName`/`personalData.lastName`/`birthName` mit `mode: "insensitive"`, höchstens 50 Zeilen; die Bewertung macht die reine Funktion.
- **Tests:**
  - **neu** `src/__tests__/api/offboarding-einstellung.test.ts` (eigener `mockPrisma`):
    - 403 bzw. 404 (Austritt fremd, Einstellung fremd, Einstellung nicht EINSTELLUNG);
    - Vorschläge ohne Adressen;
    - Suche ab 3 Zeichen;
    - Zuordnen schreibt bedingt; zweites Zuordnen ergibt 409;
    - eine an Austritt A (laufend) hängende Einstellung ergibt für Austritt B 409 `EINSTELLUNG_VERGEBEN`; nach COMPLETED von A ist sie für B wählbar (Versetzung); nach CANCELLED ebenso;
    - EXPIRED-Einstellung per `onboardingId` im Body ergibt 409 `EINSTELLUNG_ABGESAGT`, obwohl sie nicht in der Kandidatenliste stand;
    - die Einstellung wird nach dem Austritt gesperrt (`invocationCallOrder`);
    - Zuordnen während eines laufenden Versands („Abteilungen informieren“ hält die Versandsperre) ergibt 409 `VERSAND_LAEUFT`, die Sperre ist danach wieder frei;
    - Arbeitsort nur ohne versendeten Link **und** nur bei gleicher Einrichtung von Einstellung und Austritt;
    - `weitereBeschaeftigung` gespeichert (Vorbelegung bei VERSETZUNG);
    - Lösen (Bezug, Arbeitsort, Merker zurück);
    - Audit mit beiden IDs, ohne Namen;
    - **Rollen:** Der Detail-GET (`GET /api/offboarding/[id]`) liefert mit Sitzungen der Rollen EINRICHTUNGSLEITUNG und VORGESETZTER `rueckgaben === null`, ohne `ausgabe`, `returnItem` oder Kandidaten abzufragen (direkter Aufruf des Handlers ohne Middleware, Muster A3 für `ausstattung`, Feinplan A1–A3, 1.11). `GET …/einstellung` antwortet diesen Rollen und SERVICE mit 403.
  - `abteilungsaufgaben-dienst.test.ts`: Empfänger des Offboardings über `arbeitsortId`; ohne `arbeitsortId` unverändert.
  - `zuordnungEmpfohlen`: wahr nur ohne Zuordnung, bei laufendem Austritt und mit STARK- bzw. MITTEL-Vorschlag.
  - `offboarding-mails.test.ts`: Payload unverändert (:447, :565, :679).
  - `offboarding-routen-zugriff.test.ts`: neue Unterroute in der Rollen- und Mandantenmatrix.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S22.

#### S29 Rückgabe-Vorschlag, Rücknahme- und Sperraufgaben

- **Ziel:** G13, G14, G21 (Wächter).
- **Dateien:**
  - `src/lib/offboarding-ausgaben.ts`: `rueckgabenUebernehmenIn` (Ablauf 1.7), `zuordnen` mit Übernahme, `aktualisieren` (mit gespeichertem bzw. mitgeschicktem `weitereBeschaeftigung`), `ohne-vermerk`, **`loesen` erweitert** um das Löschen der Ausgabe-Aufgaben und -Rückgaben samt Linkstatus (Ablauf „Lösen“ in 1.7), `rueckgabenUebersichtLaden` (Lage, Vorschlag, Hinweise, `schonImAustritt`, Zeilen mit Stelle und Übergabe, `schritt`, `protokoll` aus `RUECKGABEPROTOKOLL`).
  - `src/lib/ausgaben-schreiben.ts` (Anlage `quelle "HR"` für „ohne Vermerk“).
  - `src/lib/abteilungsaufgaben-dienst.ts`: `abteilungsUebersichtLaden` rechnet `nachInfoNeu` (offene Aufgaben mit `createdAt > lastSentAt ?? sentAt`, nur Offboarding).
  - `src/lib/abteilungsaufgaben-uebergaenge.ts`: `aufgabeImPortalAendern` für `herkunft ≠ null` (403, 409 `assigneeDepartment`).
- **Tests:**
  - **neu** `src/__tests__/lib/offboarding-ausgaben.test.ts` (eigener `mockPrisma` für `createMany … skipDuplicates`):
    - Vorschlag nach E-A35, ein Hinweis bleibt ohne Aufgabe;
    - Einstellung mit Arbeitsort an einer anderen Einrichtung: Ausgabe nur als Hinweis;
    - RUECKGABE ergibt Aufgabe + Rückgabe, SPERREN nur eine Aufgabe;
    - Titel und Beschreibung ohne Kennung;
    - Fälligkeit max(letzter Arbeitstag, heute);
    - zweites Aktualisieren legt nichts doppelt an;
    - Aktualisieren übernimmt bei gespeichertem Merker `weitereBeschaeftigung` **keine** zentralen Ausgaben; mit `weitereBeschaeftigung: false` im Body werden sie übernommen und der Merker gespeichert;
    - Ausgabe inzwischen ERSETZT fällt heraus;
    - CANCELLED-Austritt gibt frei;
    - **zweiter Austritt zur selben Einstellung** nach einem COMPLETED-Austritt mit VERBLEIBT-Stück: Zuordnung erlaubt, das Stück wird vorgeschlagen und übernommen (Zustand bleibt VERBLEIBT, neue Aufgabe und Rückgabe offen); ein beim Abschluss offen gebliebenes AUSGEGEBEN wird **nicht** vorgeschlagen;
    - Links verlängert, WIEDER_OFFEN protokolliert;
    - „ohne Vermerk“ legt die Ausgabe mit dem Erledigt-Tag an;
    - **Lösen nach Übernahme** entfernt Ausgabe-Aufgaben und -Rückgaben, lässt die Ausgaben unverändert; eine informierte Stelle, deren übrige Aufgaben erledigt sind, steht danach auf „fertig“ (Linkstatus neu berechnet, keine Mail); 409 `LOESEN_GESPERRT` bei erledigter Ausgabe-Aufgabe bzw. Rückgabe mit Zustand, ohne Änderung; Arbeitsort nur ohne informierte Stelle zurückgesetzt;
    - Aktualisieren, Lösen und „ohne Vermerk“ während eines laufenden Versands ergeben 409 `VERSAND_LAEUFT`;
    - Sperrreihenfolge per `invocationCallOrder` (Austritt → Einstellung → Links → Ausgaben → neue Zeilen; beim Lösen Austritt → Links → Aufgaben → Rückgaben).
  - **Wächter (G21)** in `offboarding-mails.test.ts`: Vorgang mit Ausgabe-Aufgaben und Kennung „KENNUNG-0412“; Informieren, Erinnern (Knopf und Lauf) und Abhaken liefern Payloads ohne diese Zeichenkette.
  - `onboarding-abteilungen.test.ts` bzw. `abteilungsaufgaben-routen.test.ts`: Portal-PATCH an einer Ausgabe-Aufgabe mit SERVICE ergibt 403, mit `assigneeDepartment` 409; Vorlagenaufgaben unverändert.
  - `abteilungen-karte.test.tsx`: Hinweis „nach der Information hinzugekommen“.
  - `ausgaben-dienst.test.ts` (aus S24) bekommt den Fall aus dem echten Ablauf: Die VERBLEIBT-Ausgabe aus dem abgeschlossenen ersten Austritt lässt sich über `POST /api/onboarding/[id]/ausgaben` korrigieren; sobald der zweite Austritt sie übernommen hat und läuft, ergibt dieselbe Aktion 409 `AUSGABE_IM_AUSTRITT`.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S24, S28.

#### S30 Zustände und Gleichlauf, „fehlt“

- **Ziel:** G15, G16, G17.
- **Dateien:**
  - `src/lib/ausgaben-schreiben.ts`: `ausgabeGleichlaufIn`; die Folgeaufgabe nur über `folgeAufgabeSchritt` (G17: liest die vorhandene Folgeaufgabe nach der Sperre des FACILITY-Links, `ANLEGEN` per `create`, `WIEDEROEFFNEN` per `update` derselben Zeile, `LOESCHEN` bedingt auf `isCompleted: false`) – nie `create` ohne diese Prüfung und nie `skipDuplicates` für die Folgeaufgabe.
  - `src/lib/abteilungsaufgaben-uebergaenge.ts`:
    - `oeffentlichAendern`, Offboarding: Schema nach Modul, `zustand` nur an RUECKGABE-Aufgaben (sonst 400), RUECKGABE ohne `zustand` = ZURUECK, **Austrittssperre bei `herkunft ≠ null`** (bedingt auf „nicht COMPLETED und nicht CANCELLED“, G18; im Kopfkommentar die Begründung, Muster A3 – allein dieser Schritt baut sie, S31 nicht), FACILITY mitsperren, Bindung nach G28, Gleichlauf, Linkstatus beider Stellen;
    - `aufgabeImPortalAendern` (`zustand`, RUECKGABE ohne `zustand` = ZURUECK, Zustandswechsel an erledigter Aufgabe, CANCELLED-Prüfung + `zustandWechsel`);
    - `aufgabenDerAbteilung` (Offboarding: Feld `ausgabe` an Ausgabe-Aufgaben der eigenen Stelle und **nur lesend** an der Folgeaufgabe von FACILITY; `herkunft`/`ausgabeId` gehen nicht hinaus).
  - `src/lib/offboarding-ausgaben.ts`: `rueckgabeAendern` (mit `kennungSchema` für `serialNumber`, Bindung nach G28).
  - `src/app/api/offboarding/[id]/return-items/route.ts`: PATCH mit `ausgabeId` ruft den Dienst; DELETE 409 für vorgeschlagene Zeilen; Zeilen ohne `ausgabeId` wie bisher plus `zustand`, bedingt auch auf `zustand`; die lokale Hilfsfunktion `vorgangZugaenglich` wird durch `offboardingZugaenglich` (`offboarding-zugriff.ts`) ersetzt.
  - Die Leser von `isReturned` laufen über `rueckgabeOffen` bzw. „erledigt“:
    - `api/offboarding/route.ts` (`returnProgress`)
    - `api/offboarding/export/route.ts`
    - `doc-template-resolvers.ts` (`rueckgaben_offen_*`, dazu `rueckgaben_liste` über `rueckgabeZeileText`, 1.9)
- **Tests:**
  - `offboarding-ausgaben.test.ts`:
    - drei Wege ergeben denselben Stand;
    - Wiederöffnen setzt AUSGEGEBEN und löscht die offene Folgeaufgabe (die erledigte bleibt);
    - **FEHLT → „Schließung prüfen“ erledigt → ZURUECK (bzw. Wiederöffnen) → wieder FEHLT** ergibt wieder eine offene Folgeaufgabe: dieselbe Zeile (gleiche ID), fällig heute, ohne Erledigung und ohne Kommentar der Stelle, keine zweite Zeile, kein P2002 – über Link, Portal-PATCH (reiner Zustandswechsel an erledigter Aufgabe) und Reiter; `offeneRueckgaben` zählt sie wieder;
    - FEHLT an einem Nicht-Schlüssel ergibt keine Folgeaufgabe;
    - `loeschenAb` gesetzt;
    - gleichzeitiger zweiter Weg findet den Stand nach der Sperre;
    - FACILITY-Link in der Sperrliste;
    - RUECKGABE mit `isCompleted: true` ohne `zustand` ergibt ZURUECK, über Link und Portal;
    - ein Austritt, der eine Ausgabe nicht (mehr) bindet, weil ein anderer laufender sie übernommen hat, bekommt 409 `AUSGABE_IM_AUSTRITT`; späte Rückgabe im Reiter eines abgeschlossenen Austritts (offenes AUSGEGEBEN) geht und setzt die 6-Monats-Frist.
  - `offboarding-rueckgaben.test.ts`:
    - `zustand` und Altbody `isReturned`;
    - Löschen einer vorgeschlagenen Zeile ergibt 409;
    - Kennung korrigieren zieht die Ausgabe mit; eine Kennung mit `<`, Steuerzeichen oder über 60 Zeichen ergibt an einer Ausgabe-Zeile 400 (an einer manuellen Zeile gelten weiter die 100 Zeichen);
    - zwei Zustandswechsel auf demselben gelesenen Stand: der zweite ergibt 409 (bedingt auf `zustand`), auch an manuellen Zeilen;
    - CANCELLED ergibt 409;
    - Audit ohne Freitext.
  - `abteilungsaufgaben-routen.test.ts` / Link-Tests:
    - `zustand` an Vorlagenaufgabe ergibt 400;
    - gepinnte Schlüssel der übrigen Aufgaben unverändert;
    - Onboarding-Link mit `zustand` unverändert;
    - Link-PATCH einer Ausgabe-Aufgabe nach COMPLETED ergibt 409 (Austrittssperre);
    - Portal-PATCH mit reinem `zustand`-Wechsel an einer erledigten Ausgabe-Aufgabe eines CANCELLED-Austritts ergibt 409;
    - **FACILITY sieht die Kennung an der Folgeaufgabe** (nur lesend, ohne `auswahl`), die ausgebende Stelle nur an ihrer eigenen Aufgabe; keine andere Stelle sieht `ausgabe`.
  - `offboarding-resolver.test.ts`: offen = ohne Zustand; `rueckgaben_liste` mit Zustandswort; **kein Stück fällt aus beiden Listen** (je eine Zeile ZURUECK, BESCHAEDIGT, FEHLT, VERBLEIBT, ENTFAELLT, offen und Altbestand).
  - Liste/Export-Tests.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S29.

#### S31 Abschluss mit Warnung

- **Ziel:** G18.
- **Dateien:**
  - `src/app/api/offboarding/[id]/route.ts` (COMPLETED-Zweig in der Transaktion, Ausnahme `RueckgabenOffen`, 409, Audit, `offeneAusgabenAbschliessenIn`; der `exitData`-Upsert wandert in diesem Zweig hinter Sperre und Zählung).
  - `src/lib/offboarding-ausgaben.ts` (`offeneRueckgabenZaehlenIn`).
  - Die Austrittssperre im Link-PATCH baut S30; S31 ändert `abteilungsaufgaben-uebergaenge.ts` nicht.
- **Tests:**
  - **neu** `src/__tests__/api/offboarding-status-patch.test.ts` (Muster `onboarding-status-patch.test.ts`):
    - offene Rückgabe ohne Bestätigung ergibt 409 mit Liste, ohne Schreiben – auch mit `exitData` im selben Body (kein `offboardingExitData.upsert`);
    - mit Bestätigung 200, Audit `offeneRueckgaben`, `loeschenAb` der offenen Ausgaben;
    - keine offenen Rückgaben ergibt keine Rückfrage;
    - ein PATCH nur mit `bestaetigt` bleibt 400 „Mindestens ein Feld erforderlich“ (1.4; seit A4a in `abteilungsaufgaben-routen.test.ts`);
    - Admin-Override bleibt;
    - Webhook `offboarding-completed` unverändert;
    - neuer letzter Arbeitstag im selben PATCH verschiebt weiter;
    - `exitData` ohne Statuswechsel wird wie bisher geschrieben.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S30.

#### S32 Oberfläche im Offboarding

- **Ziel:** Mockup 6.8, E-A36 sichtbar, Abschluss-Dialog.
- **Dateien:**
  - **neu** `src/components/ausgaben/rueckgaben-karte.tsx`, `einstellung-zuordnen-dialog.tsx` und `ruecknahme-auswahl.tsx`.
  - `src/app/(portal)/dashboard/offboarding/[id]/tabs/tab-returns.tsx` (dünn).
  - `tabs/tab-overview.tsx` (Schritt aus `rueckgaben.schritt`, Hinweis `ZUORDNUNG_EMPFOHLEN`, Label statt Rohwert).
  - `tabs/tab-checklist.tsx` (Haken an Aufgaben mit `herkunft` nur mit Bearbeitungsrecht; Zustand als Text und Verweis auf den Reiter Rückgaben; 1.8).
  - `src/components/abteilungsaufgaben/abteilungen-karte.tsx` (Hinweis `ZUORDNUNG_EMPFOHLEN` mit Knopf, optionale Eigenschaft).
  - `offboarding-detail-content.tsx`:
    - Laden und Neuladen nach Aktionen;
    - Zähler am Reiter „erledigt“;
    - `confirmReturn` entfällt;
    - Abschluss über den verallgemeinerten Dialog.
  - `types.ts` (`ReturnItemData` + `zustand`, `ausgabeId`; `OffboardingData` + `rueckgaben`).
  - `src/components/ausstattung/abschluss-dialog.tsx` (Texte und Absender als Eigenschaften, Onboarding-Vorgaben unverändert).
  - `src/components/abteilungsaufgaben/aufgaben-seite.tsx` (Offboarding: `ruecknahme-auswahl` an Ausgabe-Aufgaben).
- **Tests:**
  - **neu** `rueckgaben-karte.test.tsx`: sechs Lagen, Hinweise, Hinweiszeile `SCHON_IM_AUSTRITT` (ohne Kennung; Vorgangsnummer nur mit Zugriff), Zustandswahl, Löschen nur manueller Zeilen, Protokollzeile „fehlt“ bzw. „hochgeladen am …“, Lösen-Rückfrage mit Zahl der informierten Stellen, Merker „weitere Beschäftigung“.
  - **neu** `einstellung-zuordnen-dialog.test.tsx`: Stufen, Suche, Merker, Vorschau, Fehlertext des Servers (`EINSTELLUNG_VERGEBEN`); Leerzustände „Kein Vorschlag …“, „Mindestens 3 Zeichen“, „Kein Treffer“ und eine Vorschau ohne vorschlagbare Stücke mit dem Text ihrer Lage.
  - `aufgaben-seite.test.tsx`: Rücknahme mit drei Knöpfen, Sperraufgabe mit Haken, Kennung sichtbar; Folgeaufgabe zeigt die Kennung nur lesend mit normalem Haken.
  - `abteilungen-karte.test.tsx` und Stepper (`tab-overview`): Hinweis „Einstellung zuordnen, bevor Sie die Abteilungen informieren“ nur mit `zuordnungEmpfohlen`; ohne die Eigenschaft gleiche Ausgabe wie bisher.
  - `tab-checklist`: Ausgabe-Aufgabe ohne Bearbeitungsrecht ohne Haken; RUECKGABE mit Verweis auf den Reiter Rückgaben.
  - `abschluss-dialog.test.tsx` (Onboarding unverändert, Offboarding-Texte, Hinweiszeile „Rückgabeprotokoll fehlt“).
  - **Sperrklinke:** `offboarding-detail-content.tsx` `confirm` sinkt; `tab-returns.tsx` `hexKlasse`/`svg` sinken. Danach `SPERRKLINKE_STAND=schreiben npx jest ui-sperrklinke` und `gesamt` im Test nachziehen (nur senken).
- **Abnahme:** Pflichtprüfung. Browserprobe:
  1. Austritt anlegen; Abteilungskarte zeigt „Einstellung zuordnen, bevor Sie die Abteilungen informieren“;
  2. Einstellung zuordnen (Vorschlag „gleiche E-Mail“);
  3. Vorschau, übernehmen;
  4. IT-Link: „Zurückerhalten“; FACILITY-Link: „Fehlt“ → Folgeaufgabe;
  5. Abschluss mit Rückfrage.
- **Abhängigkeiten:** S30, S31, S26 (gemeinsame Bausteine).

### A4d – Protokolle, Fristen, Vorlagen, Abschluss

#### S33 Listen-Platzhalter und System-Vorlagen

- **Ziel:** G19 (Vorlagen und Erzeugen).
- **Dateien:**
  - `src/lib/placeholder-catalog.ts` (`PlaceholderDef.liste`, Gruppen „Ausgaben“ bzw. „Rückgaben“).
  - `src/lib/doc-template-resolvers.ts` (ONBOARDING `ausgaben_*`, OFFBOARDING `rueckgaben_je_stelle`; Stellennamen über `stellenNamenLaden`).
  - `src/app/api/brief-vorlagen/[id]/generate/route.ts`: Arrays nie mit `values` überschreiben. Dabei wird `readFile(template.dateipfad)` (`generate/route.ts:152`, heute ohne Pfadprüfung) durch `leseVorlagenDatei` ersetzt (CLAUDE.md, Dokumentenpaket Regel 4); die Funktion ist heute nicht exportiert (`dokumentenpaket.ts:416`) und wird dafür exportiert.
  - `src/app/(portal)/brief-vorlagen/brief-vorlagen-content.tsx` (keine Eingabefelder für innere Namen), `src/components/variablen-katalog.tsx`.
  - `src/lib/dokumentenpaket.ts` (Kommentar).
  - **neu** `scripts/system-vorlagen/ausstattungsprotokolle.js` und die zwei `.docx` unter `public/system-dokumente/`.
  - `prisma/seed-check.js`: `SYSTEM_VORLAGEN` (exportiert; Führungszeugnis + zwei neue), `ensureSystemDocumentTemplates` mit Suchschlüssel `{ isSystem: true, modul, originalName }` über `findMany` mit `orderBy: { createdAt: "asc" }`: die älteste eingeschaltete Zeile wird aktualisiert (ohne eingeschaltete die älteste), bei mehreren eingeschalteten die Warnung „Duplikat der System-Vorlage …“ ins Protokoll, nichts gelöscht (Review A4d). Beim Aktualisieren nur Datei, Hash, Größe und Platzhalter; `aktivBeiAnlage` (Übergabeprotokoll `false`).
  - Review A4d: `src/app/api/brief-vorlagen/[id]/route.ts` (PATCH: Modul einer System-Vorlage fest, 409), `src/app/api/brief-vorlagen/route.ts` (Liste liefert `isSystem`), `src/lib/brief-vorlagen-filter.ts` (`systemVorlageModulGesperrt`, `SYSTEM_VORLAGE_MODUL_FEST`), Bearbeiten-Dialog in `brief-vorlagen-content.tsx` (Feld gesperrt, nicht gesendet).
- **Tests:**
  - **neu** `src/__tests__/lib/system-vorlagen.test.ts`:
    - jedes Asset existiert;
    - `extractPlaceholders` entspricht `platzhalter` der Liste;
    - Rendern mit zwei Stellen und drei Stücken ergibt drei Tabellenzeilen und zwei Seitenumbrüche;
    - leere Liste ergibt den Leersatz;
    - kein innerer Name in `sensiblePlatzhalter`;
    - Seed: Umbenennung durch HR legt kein Duplikat an, eine ausgeschaltete Vorlage bleibt aus;
    - Seed mit zwei vorhandenen Zeilen gleichen `originalName` (Altlast des alten Seeds): die ältere wird aktualisiert, die jüngere bleibt unberührt, die Warnung steht im Protokoll, nichts wird gelöscht.
    - Review A4d: ein deaktiviertes Duplikat löst keine Warnung aus; ist die ältere Zeile abgeschaltet, bekommt die eingeschaltete den neuen Stand; alle aus → die älteste, `isActive` unberührt; Beschreibungen ohne internen Paketnamen.
  - Review A4d: `brief-vorlagen-patch.test.ts` (409 vor jedem Schreiben, dasselbe Modul ist keine Änderung, gewöhnliche Vorlage frei), `brief-vorlagen-filter.test.ts` (`systemVorlageModulGesperrt`), `brief-vorlagen-listen.test.tsx` (Feld gesperrt mit Hinweis, Modul nicht gesendet).
  - `doc-template-resolvers.test.ts` und `offboarding-resolver.test.ts`:
    - Listen ohne Bemerkung;
    - Mandantenprüfung;
    - inneres Feld immer gesetzt;
    - `ausgaben_*` nicht im Offboarding-Katalog.
  - Erzeugen-Route: Handwert für eine Liste wird ignoriert; Pfad außerhalb der Wurzeln wird abgewiesen.
  - Editor-Komponente.
- **Abnahme:** Pflichtprüfung. Browserprobe: Übergabeprotokoll erzeugen (Word und PDF), eine Seite je Stelle.
- **Abhängigkeiten:** S24, S30.

#### S34 Unterschriebenes Übergabeprotokoll hochladen

- **Ziel:** G19 (Hochladen im Onboarding, die Person sieht das Protokoll nicht).
- **Dateien:**
  - **neu** `src/app/api/onboarding/[id]/documents/route.ts` (POST, Spiegel der Offboarding-Route):
    - `HR_EDIT_ROLES`, `canAccessProcess`;
    - `contentLengthZuGross(request, …)` **vor** dem Lesen des Bodys (413), höchstens 9 MB Rohbytes (wie die individuelle E-Mail, unter der 10-MiB-Grenze der Middleware);
    - Typ aus den Bytes (`erkenneDateityp`), `anzeigeNameBereinigen`;
    - Ablage unter `uploads/<onboardingId>/` (`zielVerzeichnisPruefen`);
    - eine Transaktion: `Document` (Status APPROVED, `reviewedAt`/`reviewedById`) + Audit `DOCUMENT_UPLOADED`.
  - `src/app/api/fragebogen/[token]/documents/route.ts`: GET, PATCH und DELETE nur für Typen aus `SELECTABLE_DOCUMENT_TYPES` (G19); jedes andere Dokument ergibt bei PATCH und DELETE dieselbe 404.
  - **neu** `src/components/ausgaben/protokoll-upload.tsx`, eingebunden im Reiter Dokumente.
  - Review A4d: `DELETE` in `src/app/api/onboarding/[id]/documents/[docId]/route.ts` (nur `UEBERGABEPROTOKOLL`, 1.6) und in der Karte die Liste mit „Entfernen …“; Texte in `PROTOKOLL_UPLOAD_MELDUNGEN`, Label `DOCUMENT_DELETED` in `audit-log-content.tsx`.
  - Prüfen, dass Nachweis-Logik, Warnbalken und „Offene Nachweise“ den Typ ignorieren (`nachweisLagen` liest nur Pflichtarten).
- **Tests:**
  - **neu** `src/__tests__/api/onboarding-dokument-upload.test.ts`: 403 bzw. 404, falscher Typ 415, zu groß 413, **Content-Length über der Grenze ergibt 413, ohne den Body zu lesen** (`formData` nicht aufgerufen), anderer `type` 400, Pfad, Audit.
  - Fragebogen-Route (`fragebogen-dokumente.test.ts` oder im bestehenden Fragebogen-Test): GET listet ein `UEBERGABEPROTOKOLL` des Vorgangs nicht; DELETE und PATCH darauf ergeben 404, Datei und Zeile bleiben; Dokumente der wählbaren Typen unverändert.
  - `dokument-dateinamen.test.ts` (Download-Name).
  - Ein Test, dass `UEBERGABEPROTOKOLL` keinen Nachweisbalken auslöst.
  - Review A4d: **neu** `src/__tests__/api/onboarding-dokument-entfernen.test.ts` (401/403, 404 für unbekannt/fremd/anderen Typ ohne Dateizugriff, Datei vor Zeile, „fehlte“ räumt die Zeile ab, Pfad außerhalb → 500 und Zeile bleibt, gleichzeitiger zweiter Aufruf → 404 ohne Audit); `protokoll-upload.test.tsx` (Liste, Rückfrage, DELETE, Neuladen vor dem Schließen, Fehler im Dialog).
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S21.

#### S35 Löschfristen (E-A37)

- **Ziel:** G20.
- **Dateien:**
  - **neu** `src/lib/ausgaben-lauf.ts`.
  - `src/lib/ausgaben-schreiben.ts` (`ausgabenLoeschenIn`).
  - `src/lib/laeufe/dokumente-aufbewahrung.ts` (eigener Block mit `try`, Probelauf und scharf).
  - `src/lib/zeitplaner/bericht.ts` (`AUSWERTER["dokumente-aufbewahrung"]`).
  - `src/lib/zeitplaner/katalog.ts` (Beschreibung).
- **Tests:**
  - **neu** `src/__tests__/lib/ausgaben-lauf.test.ts` (eigener `mockPrisma`):
    - Grenze genau am Tag;
    - Sperrreihenfolge per `invocationCallOrder`: Austritte (nach `id`) → Einstellung → Aufgaben-Kommentare → Ausgaben löschen → `ReturnItem` leeren → Merker;
    - die Löschmenge wird **nach** den Sperren gelesen: Eine Ausgabe, deren Zustand sich vor der Sperre geändert hat (nicht mehr fällig), behält ihre Kopie in `ReturnItem` und ihre Kommentare;
    - Kopie in `ReturnItem` und Kommentare (Offboarding-Aufgaben und Onboarding-Ausstattungsaufgabe ohne verbleibende Ausgabe) geleert;
    - VERBLEIBT und AUSGEGEBEN ohne Frist bleiben; AUSGEGEBEN mit Frist aus Abschluss bzw. Absage fällt;
    - `ChecklistItem.ausgabenGeloeschtAm` gesetzt; die Aufgabe steht danach nicht mehr in `ohneVermerk` (über `rueckgabenUebersichtLaden`);
    - Protokolle erst ohne verbleibende Ausgabe, Datei vor Zeile; dazu die `GeneratedDocument` beider System-Vorlagen mit `refId` = Vorgang, andere erzeugte Dokumente des Vorgangs bleiben;
    - Merker idempotent (zweiter Lauf löscht eine stehengebliebene Datei);
    - `ohneFristAelterDreiJahre` zählt nur aktive Ausgaben ohne Frist mit altem `uebergebenAm`;
    - Fehler je Vorgang nur mit `fehlerKennung`;
    - Audit nur Anzahlen;
    - Probelauf schreibt nichts.
  - `dokumente-aufbewahrung-lauf.test.ts`: Block verdrahtet, Fehler im Block lässt die übrigen Blöcke unberührt, „Bericht liest die echte Antwort“.
  - `zeitplaner.test.ts` (:446–495, Probelauf ohne `fehler`, Beschreibung).
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S30, S31, S33 (`SYSTEM_VORLAGEN` für die erzeugten Protokolle), S34.

#### S36 Pauschale Sperrpunkte der Offboarding-Vorlagen

- **Ziel:** G25.
- **Dateien:**
  - `prisma/seed.ts`: `description` an den Punkten:
    - Standard/Bildung: „Rueckgabe aller Arbeitsmittel“, „IT-Zugaenge zur Sperrung vorbereiten“, „IT-Zugaenge und E-Mail-Konto sperren“, „Physische Zugaenge entziehen (Schlüssel, Karten)“;
    - Beamte: „Rueckgabe Dienstausweis und Arbeitsmittel“, „IT-Zugaenge und Dienstmail sperren“, „Physische Zugaenge entziehen“;
    - Minijob: „Arbeitsmittel zurueckgeben“, „IT-Zugaenge sperren (falls vorhanden)“, „Schlüssel / Zugangskarten einziehen“.
  - `prisma/seed-check.js`: Migration `OFFBOARDING_SPERRPUNKTE_V1`:
    - nur `ChecklistTemplateItem` mit exakt diesem Titel, `description` leer, Vorlagenname beginnt mit „Offboarding:“;
    - Merker in `SystemMigration` und Änderung in **einer** Transaktion;
    - exportierte Plan-Funktion, Aufruf in `main()` vor dem Seed.
  - Die Zuordnungstabelle steht zweimal: als TS-Konstante `SPERRPUNKT_HINWEISE` in einer **eigenen** reinen Datei `src/lib/offboarding-sperrpunkte.ts` (nicht in `ausgaben.ts`, das fast jeder Schritt ändert) und als JS-Kopie in `seed-check.js`; ein Test hält beide gleich.
- **Tests:**
  - **neu** `src/__tests__/lib/offboarding-sperrpunkte-migration.test.ts`: geänderter Titel bzw. gepflegte Beschreibung bleibt, Merker, zweiter Lauf ohne Wirkung.
  - `seed-schutz.test.ts` grün.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S22, **S33** (beide ändern `prisma/seed-check.js`; S36 läuft danach).

#### S37 CLAUDE.md, Gesamtabnahme

- **Ziel:** Die Regeln stehen dauerhaft in `CLAUDE.md`.
- **Dateien – `CLAUDE.md`:**
  - **Abschnitt „Ausstattung & Zugänge“:** Kopfsatz „Stufe 2 … ist nicht gebaut“ ersetzen, Paket A4 mit G1 bis G28 in Kurzform als Regeln 20 und folgende (ausdrücklich: Austrittsbezug G28, Einschalten nur über „Rückgabe-Vorgaben übernehmen …“ G27, Webhook-Handgriff G21), Routen ergänzen.
  - **Regel 14 dort:** Absage nennt Ausgaben, keine Rückbau-Aufgaben.
  - **Abteilungsaufgaben, Regel 4:** Sperrreihenfolge nach G24.
  - **Abteilungsaufgaben, Regel 7:** Im **Offboarding** gilt `arbeitsortId ?? organizationId` (G12).
  - **Abteilungsaufgaben, Regel 8:** Feld `ausgabe` auf beiden Link-Seiten, Kennung nur dort.
  - **Abteilungsaufgaben, Routen:** neue Unterrouten.
  - **Abschnitt „Dokumente & Starterpaket“:**
    - System-Vorlagen als Liste `SYSTEM_VORLAGEN`, Suchschlüssel (älteste Zeile, Duplikat-Warnung), HR-Pflege bleibt;
    - Listen-Platzhalter;
    - `generate` liest über `leseVorlagenDatei`;
    - die öffentliche Fragebogen-Route zeigt nur Dokumente der wählbaren Typen.
  - **Abschnitt „Docker / Deployment“:** der Vorab-Check des neuen FK (Abschnitt 4).
  - **Abschnitt „Einmalige Datenmigrationen“:** `OFFBOARDING_SPERRPUNKTE_V1`.
- **Abnahme:**
  - `npm run pruefen`.
  - Durchgang im Browser (Worktree, Datenbank `hr_portal_ausstattung`):
    1. „Vorschläge übernehmen“ (ohne A4-Werte), dann „Rückgabe-Vorgaben übernehmen …“ und eine Katalogposition mit „Beim Austritt“ einschalten;
    2. Einstellung bis zur Information durchlaufen;
    3. über den Link vermerken und abhaken (die Mail ohne SMTP: FAILED/SKIPPED prüfen, nicht umgehen);
    4. Vorgang abschließen, als HR nachtragen und tauschen (einmal „defekt“, einmal „verloren“);
    5. Austritt als Versetzung anlegen, Einstellung zuordnen, ein Stück auf „verbleibt“, Rücknahme über den Link mit „fehlt“, abschließen; zweiten Austritt anlegen, dieselbe Einstellung zuordnen, das VERBLEIBT-Stück wird vorgeschlagen;
    6. Rückgaben-Reiter, Abschluss mit Rückfrage;
    7. Protokolle erzeugen und hochladen; das hochgeladene Übergabeprotokoll erscheint nicht in der Dokumentenliste des Fragebogens;
    8. Lauf „Aufbewahrung“ als Probelauf.
  - Ergebnis als Abschnitt „Browserprobe A4“ in diesem Feinplan.
- **Abhängigkeiten:** alle.

**Reihenfolge und Parallelität**

- S21 → S22, dann drei Stränge:
  - **Katalog:** S23.
  - **Onboarding:** S24 → (S25 ∥ S26 ∥ S27).
  - **Offboarding:** S28 → S29 → S30 → S31 → S32.
- S29 setzt S24 voraus (Ausgaben müssen entstehen können).
- S33 nach S24 und S30; S34 jederzeit nach S21; S35 nach S30, S31, S33, S34; S36 nach S22 **und nach S33** (beide ändern `prisma/seed-check.js`); S37 zuletzt.
- Gemeinsame Dateien (Schritte, die sie ändern, laufen nacheinander):

  | Datei | Schritte |
  |---|---|
  | `src/lib/ausgaben.ts` | fast alle (S36 nicht: seine Konstante liegt in `offboarding-sperrpunkte.ts`) |
  | `src/lib/ausstattung.ts` | S23, S24 |
  | `src/lib/ausstattung-dienst.ts` | S23, S24 |
  | `src/lib/abteilungsaufgaben-uebergaenge.ts` | S25, S29, S30 (die Austrittssperre im Link-PATCH baut **nur** S30; S31 ändert die Datei nicht) |
  | `src/lib/abteilungsaufgaben-dienst.ts` | S27, S28, S29 |
  | `src/lib/events.ts`, `default-email-templates.ts`, `mailer.ts` | S25, S27 |
  | `src/app/api/onboarding/[id]/route.ts` | S27 |
  | `src/app/api/offboarding/[id]/route.ts` | S28, S31, S32 |
  | `src/components/abteilungsaufgaben/aufgaben-seite.tsx` | S25, S32 |
  | `src/components/abteilungsaufgaben/abteilungen-karte.tsx` | S32 (S29 ändert nur `abteilungen-karte.test.tsx`) |
  | `prisma/seed-check.js` | S33, S36 |
  | `src/__tests__/hilfen/abteilungs-fake-db.ts` | S24, S25, S29, S30 |
  | `offboarding-mails.test.ts` | S28, S29 |

- Praktisch laufen nur S23 ∥ S28, S26 ∥ S28 und S34 neben allem; der Rest in einer Reihe.

---

## 4. Betroffene Mail- und Word-Vorlagen

Gespeicherte DB-Vorlagen überschreiben den Code vollständig. „Text auf Standard zurücksetzen“ behält An, CC, BCC, Reply-To und den Aktiv-Schalter. **Werden A1–A3 und A4 zusammen deployt** (Empfehlung: ein Branch, ein Deploy), fallen die Rücksetzungen mit denen aus dem Feinplan A1–A3, Abschnitt 3, zusammen: `onboarding-task-completed` dann einmal im Deploy-Schritt (Handgriff 0 dort).

| Vorlage | Änderung | Zurücksetzen nötig? |
|---|---|---|
| `onboarding-task-completed` (an HR) | Zeile „Vermerkt: {{ausgabe_vermerk_html}}“ im flachen Block `{{#ausgabe_vermerk}}`, auch im Textteil; `betreffOhne` + `ausgabe_vermerk*`. **Gebaut in S25:** HTML – eigene Zeile der Infotabelle mit Beschriftung „Vermerkt“ (artneutral seit Review A4b, vorher „Übergeben“ – bei einem Zugang „Übergeben: eingerichtet …“) und Wert `{{ausgabe_vermerk_html}}` (maskiert, Stücke durch `<br>` getrennt), zwischen „Erledigt über“/„Gemeldet über“ und „Vertragsbeginn“; Text – `{{#ausgabe_vermerk}}Vermerkt: {{ausgabe_vermerk}}` vor „Vertragsbeginn“; Variablenliste + `{{ausgabe_vermerk}}`, `{{ausgabe_vermerk_html}}`; Betreff unverändert. Payload und Katalogbeispiel tragen beide Felder immer (ohne Vermerk `""`), `FREITEXT_VARIABLEN` maskiert den Rohtext im HTML. | **Ja.** Zusammen mit A3: Handgriff 0 des A3-Deploys deckt es ab. Nach A3 allein deployt: nach dem A4-Deploy zurücksetzen. Ohne Zurücksetzen fehlt nur die Zeile; die Mail bleibt richtig. Vorher prüfen, dass der gespeicherte Betreff weder `ausgabe_vermerk` noch `ausgabe_vermerk_html` nennt (`betreffOhne` wirkt nur beim Speichern; Abfrage unten). |
| `onboarding-department-abgesagt` (an die Stelle) | Block `{{#hat_ausgaben}}` mit `{{ausgaben_liste_html}}`, Textteil; `betreffOhne` + `ausgaben_liste*`. **Gebaut in S27:** HTML – nach dem Block `{{#hat_erledigte}}` und vor „Für noch offene Aufgaben …“ der flache Block `{{#hat_ausgaben}}` mit dem Satz „Laut Portal ausgegeben – bitte zurücknehmen bzw. sperren:“ und einem grauen Kasten mit `{{ausgaben_liste_html}}` (maskiert, Stücke durch `<br>` getrennt, „Dienst-Laptop/PC · FES-NB-0412 · übergeben 28.09.2026“, ein Zugang „… · eingerichtet …“); Text – derselbe Satz, Leerzeile, `{{ausgaben_liste}}`; Variablenliste + `{{ausgaben_liste}}`, `{{ausgaben_liste_html}}`, `{{hat_ausgaben}}`; Betreff unverändert. Payload und Katalogbeispiel tragen die drei Felder immer (ohne Stück `""`; das Beispiel nennt Zugang und Notebook der IT), `FREITEXT_VARIABLEN` maskiert den Rohtext im HTML. | Nur, wenn es eine DB-Zeile gibt. Ohne Speicherung gilt der Code-Default; mit gespeicherter Vorlage fehlen die Ausgaben in der Absage („Text auf Standard zurücksetzen“). Vorher prüfen, dass der gespeicherte Betreff weder `ausgaben_liste` noch `ausgaben_liste_html` nennt (`betreffOhne` wirkt nur beim Speichern; Abfrage unten). |
| `onboarding-department-assigned`, `-reminder`, `-completed`, `onboarding-ausstattung-offen` | keine | Nein |
| `offboarding-department-assigned`, `offboarding-reminder` | Keine Textänderung. Die Rücknahme- und Sperraufgaben stehen über `{{aufgabenliste_html}}` automatisch drin, ohne Kennung (G14, G21). **Sichtbar neu ab dem Deploy, auch ohne Einschalten von A4:** Bei Austritten, die nach dem Deploy angelegt werden, steht unter den pauschalen Sperrpunkten („Rueckgabe aller Arbeitsmittel“, „IT-Zugaenge … sperren“, „Physische Zugaenge entziehen …“ usw.) der Hinweis aus der Migration `OFFBOARDING_SPERRPUNKTE_V1` als graue Zeile („Gemeint ist alles, was nicht als eigene Aufgabe unter „Ausstattung & Zugänge“ steht …“, `SPERRPUNKT_HINWEIS`), im Textteil eingerückt darunter; laufende Austritte behalten ihre Kopie ohne Hinweis (G25). | Nein (der Hinweis kommt über `aufgabenliste_html`, nicht über die Vorlage) |
| `offboarding-task-completed`, `offboarding-department-completed`, `offboarding-completed` | keine (Payload Byte für Byte gleich) | Nein |
| `automatischer-lauf-bericht` | keine Textänderung; die neuen Zähler baut der Code | Nein |

**Word und Exporte**

| Vorlage | Änderung | Handgriff |
|---|---|---|
| **neu** System-Vorlage „Übergabeprotokoll Ausstattung“ (ONBOARDING) | eine Seite je Stelle, Liste der Ausgaben, Unterschriftszeilen | Wird **ausgeschaltet** angelegt; vor dem Einschalten von A4 in Brief-Vorlagen einschalten (unten, „Vor dem Einschalten“, Punkt 3). |
| **neu** System-Vorlage „Rückgabeprotokoll Ausstattung“ (OFFBOARDING) | eine Seite je Stelle, Rückgaben mit Zustand (offene leer zum Ausfüllen) | eingeschaltet; nichts |
| System-Vorlage „Aufforderung erweitertes Führungszeugnis“ | Asset unverändert. Der Seed überschreibt künftig weder Name noch Aktiv-Schalter und aktualisiert bei Duplikaten die älteste eingeschaltete Zeile. Das Modul lässt sich in Brief-Vorlagen nicht mehr ändern (Review A4d). | Nichts. Prüfen, dass der erste Start nach dem Deploy kein Duplikat anlegt und keine Duplikat-Warnung schreibt (Protokoll des Seed-Checks); eine Warnung heißt: in Brief-Vorlagen alle Zeilen bis auf eine deaktivieren (Vorab-Abfrage unten). |
| Brief-Vorlagen von HR mit `{rueckgaben_offen_liste}`/`{rueckgaben_offen_anzahl}` | „offen“ heißt ab jetzt „ohne Zustand“: FEHLT, VERBLEIBT und ENTFAELLT gelten nicht mehr als offen (G16) | Nichts; in der Übergabe erwähnen |
| Brief-Vorlagen von HR mit `{rueckgaben_liste}` | Listet ab A4 **jede** Zeile mit Zustand samt Zustandswort („— fehlt“, „— beschädigt zurück am …“, „— verbleibt“, „— entfällt“); ZURUECK und Altbestand unverändert „— zurueck am …“ (1.9). Eine Rückgabebestätigung nennt damit auch fehlende Stücke. | Nichts; in der Übergabe erwähnen. Wer eine Vorlage als reine „Bestätigung der Rückgabe“ nutzt, prüft den Wortlaut um die Liste. |
| Neue Platzhalter `{#ausgaben_je_stelle}…`, `{ausgaben_liste}`, `{ausgaben_anzahl}` (Onboarding), `{#rueckgaben_je_stelle}…` (Offboarding) | nur in den neuen System-Vorlagen genutzt; HR kann sie in eigenen Vorlagen verwenden | Nichts |
| PDF-Export Onboarding, JSON-/CSV-Export | keine (Ausgaben nicht im PDF). `ReturnItem.zustand` erscheint im Offboarding-Export nur über die Zählung. | entfällt |

**Vor dem Deploy** (auf dem Server, nur lesend):

```sql
SELECT count(*) FROM offboarding_processes WHERE "onboardingId" IS NOT NULL;
SELECT count(*) FROM offboarding_processes o WHERE o."onboardingId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM onboarding_processes n WHERE n.id = o."onboardingId");
SELECT event, "isActive", subject FROM email_templates WHERE event IN ('onboarding-task-completed', 'onboarding-department-abgesagt');
SELECT "originalName", modul, count(id) FROM document_templates WHERE "isSystem" AND "isActive" GROUP BY 1, 2 HAVING count(id) > 1;
```

1. Die zweite Zahl muss 0 sein, sonst scheitert der neue FK im `db push` und der Container startet nicht (nach der Sicherung). Laut Code schreibt heute niemand `onboardingId`; die erste Zahl sollte schon 0 sein. Ist sie es nicht, die Werte mit dem Projektverantwortlichen klären, bevor deployt wird.
2. Betreffzeilen auf die neuen gesperrten Variablen prüfen (`betreffOhne` wirkt nur beim Speichern).
3. Die letzte Abfrage zeigt eingeschaltete Duplikate von System-Vorlagen aus dem alten Seed (je Zeile höchstens ein `*`, deshalb `count(id)` – Sternchenpaare gehen beim Kopieren aus dem Chat verloren). Je Treffer mit HR klären, mit welcher Zeile gearbeitet wird (Name, Mandant, Standardpaket unter Mandanten → Dokumentenpaket: eine deaktivierte Vorlage fällt aus dem Paket heraus), und die übrigen in Brief-Vorlagen **deaktivieren** – Löschen gibt es dort nicht. Danach warnt der Seed-Check nicht mehr und aktualisiert die eingeschaltete Zeile; bleiben mehrere eingeschaltet, aktualisiert er die älteste und warnt bei jedem Start.

**Nach dem Deploy:**

1. Rücksetzungen nach der Tabelle oben.
2. Übergabeprotokoll bleibt aus, bis A4 eingeschaltet wird („Vor dem Einschalten“, Punkt 3).
3. Im Protokoll des Seed-Checks: drei System-Vorlagen „angelegt/aktuell“ ohne Duplikat-Warnung (steht sie da: wie unter „Vor dem Deploy“, Punkt 3, deaktivieren), Migration `OFFBOARDING_SPERRPUNKTE_V1` mit Anzahl.
4. Die Löschfristen laufen nur mit eingeschaltetem Lauf „Aufbewahrung erzeugter Dokumente“; vor dem ersten scharfen Lauf nach A4 „Probelauf jetzt“ (Zeilen „Würde löschen (Ausgaben nach Ablauf der Frist)“ und „Ausgaben ohne Löschfrist, älter als drei Jahre“). Scharf geschaltet wird er erst vor dem Einschalten von A4 (Punkt 2 dort), falls er nicht schon läuft.
5. „Vorschläge übernehmen“ ist für den A1–A3-Pilot gefahrlos: Es legt keine A4-Werte an (G27).

**Vor dem Einschalten von A4** (nach der MAV-Beteiligung und der Fristbestätigung des DSB, G27):

1. Aktive Webhooks auf die Offboarding-Abteilungsereignisse prüfen, nur lesend (G21):

   ```sql
   SELECT event, url, "isActive" FROM webhook_configs WHERE "isActive" AND (event LIKE 'offboarding-department-%' OR event IN ('offboarding-reminder', 'offboarding-task-completed'));
   ```

   Steht dort eine Zeile, den Webhook mit dem Projektverantwortlichen klären und in Einstellungen → Webhooks löschen oder ausschalten, **bevor** Positionen ein `beiAustritt` bekommen: Über `token`/`link` der Payload öffnet der Empfänger die Link-Seite samt Kennungen.
2. Lauf „Aufbewahrung erzeugter Dokumente“ scharf einschalten (Einstellungen → Automatische Läufe): erst „Probelauf jetzt“ und den Bericht lesen (derselbe Lauf löscht auch erzeugte Dokumente und den Text individueller E-Mails nach 12 Monaten), dann einschalten bzw. „als Probelauf“ abwählen. Ohne ihn werden Kennungen, Kommentare der Stellen und Protokolle nie gelöscht – die vom DSB bestätigten Fristen (E-A37) liefen ins Leere (Review A4d).
3. „Übergabeprotokoll Ausstattung“ in Brief-Vorlagen einschalten („Deaktivierte Vorlagen anzeigen“, „Reaktivieren“). Sonst meldet die Karte „Unterschriebenes Übergabeprotokoll: fehlt“, ohne dass HR das Protokoll erzeugen kann (Review A4d).
4. Dann „Rückgabe-Vorgaben übernehmen …“ bzw. „Beim Austritt“ an einzelnen Positionen. Die Antwort der Aktion meldet aktive Webhooks noch einmal als Hinweis.

---

## 5. Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| **Neuer FK auf eine bestehende Spalte** (`offboarding_processes.onboardingId`): Ein ungültiger Wert lässt `db push` scheitern, der Container startet nicht. | Vorab-SQL (Abschnitt 4). Der Entrypoint sichert vorher (`pg_dump`). S21 prüft das Delta mit `migrate diff` gegen A3 und gegen `main`. |
| **Verklemmung zwischen den Modulen** (Onboarding und Offboarding schreiben dieselbe Ausgabe) | Globale Reihenfolge G24, auch im Löschlauf und beim Lösen. Onboarding-Wege sperren nie den Austritt; Ausgaben nach `id`. Der Austrittsbezug wird nach der Sperre gelesen, und gebundene Ausgaben ändert nur der Austritt (G7, G28). Tests prüfen `invocationCallOrder`. |
| **Ein Stück friert ein** (VERBLEIBT nach Versetzung, offen beim Abschluss) | Eine Definition der Bindung (G28): VERBLEIBT gibt mit dem Abschluss frei; ein offen gebliebenes Stück bleibt beim abgeschlossenen Austritt, dessen Reiter die späte Rückgabe aufnimmt. Gemessen am Stand beim Austritt, der jüngste Bezug gilt (`bezugBindet`); ein offen übernommenes VERBLEIBT wird beim Abschluss AUSGEGEBEN mit Frist (G18). Tests in S22, S24, S29 und nach der Durchsicht von A4c (`offboarding-ausgaben.test.ts`: B ändert nach dem ersten Wechsel weiter, auf allen drei Wegen). |
| **Drei Zeilen für ein Stück laufen auseinander** (Aufgabe, `ReturnItem`, Ausgabe) | Ein Gleichlauf (`ausgabeGleichlaufIn`), drei Wege, ein Test „drei Wege, derselbe Stand“ (S30). Einziger Schreiber der Tabelle (G3, Wächter). |
| **Kennung gelangt in Webhook, Betreff oder Protokoll** | Titel und Beschreibung ohne Kennung, Offboarding-Payload unverändert, Wächter-Test mit Kennung (S29), `betreffOhne` für die Onboarding-Felder, Audit nur `mitKennung`. |
| **Webhook-Empfänger öffnet die Link-Seite** (die Offboarding-Payload trägt `token`/`link`; dort stehen ab A4 Kennungen, und Zustände lassen sich setzen) | Bewusst offen gelassen (G21): Handgriff „aktive Offboarding-Webhooks prüfen und löschen“ vor dem Einschalten (Abschnitt 4), Hinweis in der Antwort von „Rückgabe-Vorgaben übernehmen …“. Seit dem Zeitplaner braucht kein Lauf n8n. |
| **A4 wird mit dem A1–A3-Pilot versehentlich eingeschaltet** | `VORSCHLAEGE` ohne A4-Werte, eigene Aktion nur für `ADMIN_ROLES` mit Rückfrage, Test „Vorschläge übernehmen setzt kein `beiAustritt`“ (G27). |
| **Zuordnen und „Abteilungen informieren“ gleichzeitig** (Arbeitsort trotz Versand gesetzt, neue Aufgaben fehlen in der Mail) | Dieselbe Versandsperre für alle schreibenden Aktionen am Austritt (G26), Test in S28. |
| **Ausgaben bleiben ohne Frist** (Absage ohne vermerkte Rücknahme, nie zugeordnete Einstellung, nur als Hinweis gezeigte Ausgaben) | Absage setzt drei Jahre ab Jahresende (G10); der Bericht zählt alte Ausgaben ohne Frist; die übrigen Fälle sind Restfrage 7 an den DSB. |
| **Gemeinsamer Kern mit festen Erwartungen** (Byte-gleiche Offboarding-Payload, gepinnte Schlüssel der öffentlichen Aufgabe, Onboarding-Link-Schema, Positivlisten) | Neue Felder nur an Ausgabe-Aufgaben und nur im jeweiligen Modul, ein eigenes Offboarding-Link-Schema, `aufgabeLinkPatchSchema` unverändert. Jeder Schritt nennt die Tests. |
| **`isReturned` hat sechs Leser** | Abgeleitet beibehalten, eine reine Funktion `rueckgabeOffen`, Altbestand ohne Migration (G16). Alle Leser in S30. |
| **Sperrklinke** (`tab-returns.tsx`, `offboarding-detail-content.tsx`, `tab-overview.tsx`) | Neues Markup nur in `src/components/ausgaben/`; bestehende Dateien binden ein. Der Stand wird nur gesenkt (S32). |
| **Fake-DB kann `createMany … skipDuplicates`, Relations- und Datumsfilter nicht** | Eigene `mockPrisma` für Vorschlag, Kandidaten und Lauf; die Fake-DB nur für Link- und Portalwege, erweitert im jeweiligen Schritt. |
| **Arbeitsort am Austritt ändert die Empfänger aller Offboarding-Aufgaben** | Nur gesetzt, solange keine Stelle informiert ist (G12); der Dialog nennt den Arbeitsort vor dem Zuordnen. Ohne Zuordnung bleibt alles wie heute. |
| **Neue Aufgaben für schon informierte Stellen im Offboarding** (kein Nachtrag) | Hinweis in der Abteilungskarte, „Erneut senden“ mit gleichem Token, Link verlängert und wieder offen. Die nächste Erinnerung nimmt sie mit. Die Link-Seite zeigt sie sofort. |
| **Ein Schlüssel fehlt im selben Austritt zum zweiten Mal** (der Unique-Index lässt keine zweite Folgeaufgabe zu) | Die erledigte Folgeaufgabe wird wieder geöffnet statt neu angelegt (G17, `folgeAufgabeSchritt`). Tests in S22 (rein) und S30 (drei Wege, kein P2002). |
| **HR erfährt „fehlt“ nicht per Mail** | Folgeaufgabe an FACILITY, Zustand im Reiter, Rückfrage beim Abschluss. Eine Mail mit Zustand bräuchte ein neues Feld in der Offboarding-Payload und ist bewusst später. |
| **Word-Listen** (innere Namen als Eingabefelder, Rückgriff auf Werte der Person, stumme Leerliste) | Präfixe, jedes Feld gesetzt, Leerblock, Katalog mit Listen, Editor-Filter, Erzeugen überschreibt keine Arrays. Ein Test rendert eine echte `.docx` (S33). |
| **System-Vorlagen öffentlich abrufbar** (`public/`) | Nur Platzhalter in den Assets, keine Daten (Test: kein Wert außer Platzhaltern und festen Texten). |
| **Löschlauf scharf ohne neuen Probelauf** (der Lauf hatte schon einen) | Die Tabelle startet leer; vor dem ersten fälligen Termin (frühestens sechs Monate nach der ersten Rückgabe) läuft der Block im Bericht als Zähler. Der Handgriff „Probelauf jetzt“ steht in der Übergabe. |
| **Unterschriebene oder erzeugte Protokolle überleben die Frist** | Merker `ausgabenGeloeschtAm`, idempotente Löschung von Datei und Zeile, auch der `GeneratedDocument` der beiden System-Vorlagen (1.11). Die Regel bestätigt der DSB (Abschnitt 6, Frage 2). |
| **Die Person sieht oder löscht das Übergabeprotokoll** (öffentliche Fragebogen-Route listete und löschte jedes `Document`) | Positivliste `SELECTABLE_DOCUMENT_TYPES` für GET, PATCH und DELETE (G19), Test in S34. |
| **Mehrere Einstellungen einer Person** (Wiedereinstellung, zwei Verträge) | Bis zur LOGA-Anbindung zählt nur die zugeordnete Einstellung. Die übrigen Ausgaben stehen im Reiter nicht. Gedächtnisstütze-Satz (E-A36). |
| **Zuordnung mit falscher Person** | Nur Bestätigung durch HR, Begründungen sichtbar, „Lösen“ solange nichts bestätigt ist, Audit mit Stufe und Gründen. |
| **Zusammenführung mit `ux-umbau`** (`/dashboard`-Wächter, Bausteine) | Keine neue Zeichenkette `/dashboard`: Verweise nur über vorhandene Hilfen (`ausstattungPortalLink` bleibt die einzige Stelle). Oberfläche nur in `src/components/ausgaben/`, damit U4 nur die Einbindung verschiebt. Konflikte in `tab-returns.tsx`, `tab-overview.tsx` und `offboarding-detail-content.tsx` im Logbuch des Umbaus vermerken. |
| **Ein `npx jest`-Durchlauf dauert** | Erst gezielt, dann vollständig; nie nur mit gezielt grünen Tests abschließen. |

---

## 6. Offene technische Fragen

Nur echte Punkte; fachlich ist alles entschieden. Zu jedem Punkt gibt es einen Vorschlag, mit dem gebaut werden kann.

1. **Anker der Frist „3 Jahre ab Jahresende“ (E-A37).**
   - Gebaut wird mit dem Berliner Jahr, in dem FEHLT gesetzt wurde, bzw. mit dem Jahr des Abschlusses für Stücke, die beim Abschluss offen blieben, bzw. mit dem Jahr der Absage (G10).
   - Alternativen: Jahr des letzten Arbeitstags oder Jahr der Ausgabe.
   - Die Wahl steckt in **einer** Funktion (`ausgabeLoeschenAb`) und lässt sich nach dem DSB-Gespräch ändern. Bestehende `loeschenAb` rechnet dann eine einmalige Migration neu.
2. **Aufbewahrung der unterschriebenen Protokolle.**
   - Vorschlag (gebaut): Ein Protokoll fällt mit der letzten Ausgabe seines Vorgangs (1.11), das hochgeladene wie das vom Portal erzeugte (`GeneratedDocument`, sonst zwölf Monate nach Erzeugung).
   - Ein Rückgabeprotokoll eines Austritts mit manuellen und Portal-Rückgaben fällt damit auch für die manuellen.
   - Der DSB bestätigt oder nennt eine eigene Frist; dann wäre es ein eigener Zeitstempel je Dokument.
3. **Unschärfe der Namenssuche (E-A31).**
   - Vorschlag: keine Unschärfe, nur `namensSchluessel` (NFC, klein, Leerräume), dazu die Suche über die Vorgangsnummer.
   - Doppelnamen und Umlaut-Schreibweisen („Mueller“/„Müller“) findet dann nur die Suche. Ob das reicht, zeigt der Pilot.
4. **Arbeitsort am Austritt nach informierten Stellen (G12).**
   - Vorschlag: nicht nachträglich setzen, nur der Hinweis im Dialog. Damit die Zuordnung im Normalablauf früh genug kommt, zeigen Abteilungskarte und Stepper vor dem Informieren „Einstellung zuordnen, bevor Sie die Abteilungen informieren“ (G12).
   - Wer ihn trotzdem braucht, bräuchte einen eigenen PATCH mit „Adresse geändert“-Folgen für die Links (neuer Token bei „Erneut senden“); das wäre ein eigenes kleines Paket.
5. **`@db.Date` in der Fake-DB und in `createMany`.**
   - Vorschlag: Werte immer über `kalendertagAlsDatum` schreiben und über `ablaufKalendertag` lesen, wie bei den Unterlagen.
   - S21 belegt mit `db push` und einem Rundlauf im Test, dass Prisma Mitternacht UTC liefert.
6. **Wortlaut der Hinweise an den Sperrpunkten (G25) und der Rücknahme-Texte (1.3).**
   - Vorschlag wie angegeben.
   - Die Personalabteilung kann ihn nach dem Pilot in den Vorlagen selbst ändern; die Migration fasst nur unveränderte Punkte an.
7. **Frist für Ausgaben, die nie in einen Austritt gelangen** (Restfrage an den DSB, E-A37).
   - Betroffen: Ausgaben einer Einstellung, der nie ein Austritt zugeordnet wird; Ausgaben, die im Austritt nur als Hinweis standen (andere Einrichtung, zentral bei weiterer Beschäftigung) und nicht übernommen wurden. Sie behalten `loeschenAb = null`.
   - Gebaut: Bei einer Absage setzt das Portal drei Jahre ab Jahresende (G10); der Bericht des Laufs zählt aktive Ausgaben ohne Frist, die älter als drei Jahre sind (`ohneFristAelterDreiJahre`), damit sie sichtbar werden.
   - Zu klären: eine Höchstfrist ab Übergabe (etwa drei Jahre nach Ende des Jahres der letzten Änderung) oder Prüfung von Hand anhand des Zählers. Die Wahl steckt wieder nur in `ausgabeLoeschenAb` und einer Abfrage des Laufs.
8. **Dokumente, die HR geprüft hat, in der Fragebogen-Route.** A4 nimmt dort nur Typen außerhalb von `SELECTABLE_DOCUMENT_TYPES` heraus (G19). Angenommene Nachweise aus Paket 4 (`reviewedById` gesetzt) sieht und löscht die Person dort weiterhin, solange der Fragebogen offen ist. Das ist Bestand außerhalb von A4 und gehört in einen eigenen kleinen Fix (Übergabe).

---

## 7. Verworfene Einwände

Die Mängelliste der Durchsicht vom 13.10.2026 (37 Punkte, davon sechs doppelt gemeldet) ist in dieser Fassung eingearbeitet. Ganz unberechtigt war keiner. Nicht übernommen wurden diese Teile bzw. Alternativen:

| Einwand (Teil) | Warum nicht |
|---|---|
| AUSGEGEBEN nach dem Abschluss des Austritts freigeben und `loeschenAb` bei der Übernahme in einen neuen Austritt zurücksetzen | Ein beim Abschluss offen gebliebenes Stück bleibt an den abgeschlossenen Austritt gebunden (G28), weil die Karte es sonst auf ZURUECK setzen könnte, während dessen Rückgabe offen bleibt, und ein Onboarding-Weg keine Offboarding-Zeile schreiben darf (G24); das Zurücksetzen der Frist entfällt, weil das allein freigegebene VERBLEIBT nie eine Frist hat. |
| VERBLEIBT gibt die Ausgabe sofort frei, auch in einem laufenden Austritt | Solange der Austritt läuft, bindet er die Ausgabe weiter, damit „Wieder öffnen“ dort möglich bleibt und keine Karte oder zweite Zuordnung gleichzeitig daran schreibt; frei wird sie mit dem Abschluss (G28). |
| Im Reiter Checkliste des Offboardings die Stellenauswahl an Ausgabe-Aufgaben entfernen | `tab-checklist.tsx` hat keine Stellenauswahl (nur Haken und Notiz), es gibt dort nichts zu entfernen; der 409 des Servers bei `assigneeDepartment` genügt. |
| Bei einem verlorenen Schlüssel ohne Austritt eine Onboarding-Aufgabe „Schließung prüfen“ an FACILITY | Die Karte arbeitet auch bei COMPLETED und EXPIRED, wo keine Mail und kein lebender Link die Stelle erreicht; deshalb der feste Hinweis in Dialog und Meldung (G7). |
| Kennung auf der Offboarding-Link-Seite ausblenden („siehe Übergabeprotokoll“) | Ohne Kennung findet die Stelle das Stück nicht, und das Protokoll hat sie nicht zwingend; gewählt ist der Handgriff vor dem Einschalten samt Hinweis der Aktion (G21). |
| Globaler Schalter (`SystemSetting`), den `ausgabeMoeglich` mitprüft | `beiAustritt` je Position ist schon der Schalter; ein zweiter Ort müsste von jedem Leser geprüft werden. Gewählt ist die eigene Aktion „Rückgabe-Vorgaben übernehmen …“ (G27). |
| Protokoll als Download auf der Link-Seite der Stelle | Dafür bräuchte es eine neue öffentliche Route, die ein Word mit Name und Kennungen ausliefert; HR gibt die Seite der Stelle weiter (G19). |
| In der Fragebogen-Route auch geprüfte Dokumente (`reviewedById`) ausnehmen | Betrifft angenommene Nachweise aus Paket 4, also Bestand außerhalb von A4; als Restfrage 8 und eigener Fix notiert, die Positivliste schützt das Übergabeprotokoll schon. |
| Erzeugte Protokolle nicht löschen, sondern die längere Frist dem DSB vorlegen | Löschen mit der letzten Ausgabe ist mit dem vorhandenen Merker billig und hält E-A37 ein; Frage 2 an den DSB bleibt trotzdem. |
| Zuordnen: Einstellung mit `auch: ["COMPLETED", "EXPIRED"]` sperren und EXPIRED danach mit 404 abweisen | `auch: ["COMPLETED"]` weist EXPIRED schon in der Sperre ab; eine eigene 409 `EINSTELLUNG_ABGESAGT` sagt HR den Grund, statt eine bekannte Einstellung als „nicht gefunden“ zu melden. |
| Die Konstante der Sperrpunkte in `ausgaben.ts` vom Parallelbetrieb ausnehmen | Sie liegt stattdessen in einer eigenen Datei `offboarding-sperrpunkte.ts`; so entsteht der Konflikt gar nicht (S36). |

---

## 8. Gesamtabnahme S37 und Browserprobe A4

Stand: 13.10.2026, nach S33 bis S36 (nicht committet).

**`CLAUDE.md` nachgezogen (S37):**

- Abschnitt „Ausstattung & Zugänge“ heißt jetzt „(Pakete A1–A4)“. Der Kopfsatz sagt, dass Stufe 2 gebaut ist und getrennt eingeschaltet wird. „Wo die Regeln liegen“ und „Routen“ haben einen Teil für A4.
- Die Regeln 20 bis 32 fassen G1 bis G28 zusammen. Ausdrücklich darin: die Bindung an einen Austritt (G28, Regel 24), das Einschalten nur über „Rückgabe-Vorgaben übernehmen …“ (G27, Regel 20) und der Webhook-Handgriff (G21, Regel 29).
- Angepasst sind dort Regel 1 (die A4-Felder sind pflegbar), Regel 8 (`AUSGABE_VORHANDEN`), Regel 14 (die Absage nennt die Ausgaben, Rückbau-Aufgaben gibt es nicht), Regel 15 (`betreffOhne`) und Regel 17 (Listen-Platzhalter).
- Neuer Punkt „Vorlagen und Betrieb A4“ mit den Handgriffen vor, mit und nach dem Deploy und vor dem Einschalten (Abschnitt 4 dieses Feinplans).
- Abschnitt „Abteilungsaufgaben“: die neuen Unterrouten; Regel 4 mit der Sperrreihenfolge G24; Regel 7 mit `arbeitsortId ?? organizationId` im Offboarding (G12); Regel 8 mit dem Feld `ausgabe` auf beiden Link-Seiten (die Kennung steht nur dort).
- Abschnitt „Dokumente & Starterpaket“: `SYSTEM_VORLAGEN` samt Suchschlüssel, älteste Zeile und Duplikat-Warnung, das Erzeugungsskript und `PROTOKOLL_SYSTEM_VORLAGEN`; die Listen-Platzhalter; Regel 4 (`generate` liest über `leseVorlagenDatei`); die Fragebogen-Route zeigt nur Dokumente der wählbaren Typen; der HR-Upload `POST /api/onboarding/[id]/documents`.
- Abschnitt „E-Mail-Versand“: `ausgabe_vermerk` und `ausgaben_liste` stehen bei den maskierten Freitexten.
- Abschnitt „Docker / Deployment“: neuer Unterabschnitt mit der Vorab-Prüfung des neuen Fremdschlüssels (Abschnitt 4).
- Abschnitt „Einmalige Datenmigrationen“: `OFFBOARDING_SPERRPUNKTE_V1`.
- Die SQL-Zeilen in `CLAUDE.md` haben höchstens ein `*` je Zeile; die Duplikat-Abfrage zählt deshalb `count(id)` statt `count(*)`.

**Pflichtprüfung (Worktree, ohne Dev-Server):** `npx prisma validate` gültig (Schema unverändert), `npx tsc --noEmit` ohne Fehler, `npx next lint` ohne Fehler (6 Warnungen, alle in Dateien außerhalb von A4), `npx jest` 229 Suites mit 7084 Tests grün.

**Browserprobe A4: offen.** Ohne Anmeldung im Portal ist sie nicht möglich, und in S33 bis S37 lief kein Dev-Server. Ersatz waren Komponenten- und Routentests, die LibreOffice-Konvertierung der Protokolle sowie Seed-Check und Migration gegen `hr_portal_ausstattung`. Nachzuholen im Worktree (Datenbank `hr_portal_ausstattung`, Dev-Server Port 3200), in dieser Reihenfolge:

1. „Vorschläge übernehmen“ (legt keine A4-Werte an), dann „Rückgabe-Vorgaben übernehmen …“, eine Katalogposition mit „Beim Austritt“ einschalten.
2. Einstellung bis zur Information der Stellen durchlaufen.
3. Über den Link vermerken und abhaken. Ohne SMTP ergibt die Mail FAILED bzw. SKIPPED; das wird geprüft, nicht umgangen.
4. Vorgang abschließen, als HR nachtragen und tauschen (einmal „defekt“, einmal „verloren“).
5. Austritt als Versetzung anlegen, Einstellung zuordnen, ein Stück auf „verbleibt“, eine Rücknahme über den Link mit „fehlt“, abschließen. Zweiten Austritt anlegen und dieselbe Einstellung zuordnen; das VERBLEIBT-Stück wird vorgeschlagen.
6. Reiter „Rückgaben“, Abschluss mit Rückfrage.
7. Protokolle erzeugen und hochladen:
   - Übergabeprotokoll als Word und als PDF (Gotenberg) aus dem Reiter Dokumente, eine Seite je Stelle; die Darstellung zusätzlich in MS Word prüfen (bisher nur LibreOffice und python-docx).
   - Übergabeprotokoll hochladen. Die Karte erscheint nur mit einem aktiven Stück, das zurückkommt, oder wenn schon ein Protokoll vorliegt. Danach zeigt die Karte „Ausstattung & Zugänge“ „hochgeladen am …“.
   - Das hochgeladene Übergabeprotokoll erscheint nicht in der Dokumentenliste des Fragebogens.
8. Lauf „Aufbewahrung erzeugter Dokumente“ als Probelauf (Einstellungen → Automatische Läufe). Im Bericht stehen „Würde löschen (Ausgaben nach Ablauf der Frist)“ und „Ausgaben ohne Löschfrist, älter als drei Jahre“.

Das Ergebnis kommt als eigener Abschnitt hierher, mit Screenshots wie die Browserprobe A1 bis A3 im Feinplan A1–A3, Abschnitt 7.

**Review A4d (13.10.2026), eingearbeitet:**

- Das Modul einer System-Vorlage ist fest: PATCH 409 (`SYSTEM_VORLAGE_MODUL_FEST`), Feld im Bearbeiten-Dialog gesperrt und nicht gesendet; Suchschlüssel und Löschlauf bleiben unverändert (G19).
- `DELETE /api/onboarding/[id]/documents/[docId]` nur für `UEBERGABEPROTOKOLL`, mit Liste und „Entfernen …“ in der Upload-Karte (G19, 1.6, 1.8).
- Seed-Check: aktualisiert die älteste **eingeschaltete** Zeile und warnt nur bei mehreren eingeschalteten; „bereinigen“ heißt in Brief-Vorlagen deaktivieren. Die Vorab-Abfrage zählt nur eingeschaltete Duplikate (G19, Abschnitt 4).
- Beschreibungen der beiden Protokoll-Vorlagen ohne „(A4)“: „System-Vorlage (Ausstattung & Zugänge)“ (Test). Die Datenbank `hr_portal_ausstattung` trägt aus dem Seed-Lauf in S33 noch die alte Beschreibung (der Seed schreibt sie nur beim Anlegen); für Produktion ohne Belang, da dort erst der Deploy anlegt.
- Abschnitt 4: „Vor dem Einschalten“ um Lauf „Aufbewahrung erzeugter Dokumente“ und das Einschalten des Übergabeprotokolls ergänzt; `count(id)` statt `count(*)`; „Nachholen“ gestrichen (gehört zum Lauf „Onboarding-Erinnerungen“); Sperrpunkt-Hinweis in den Offboarding-Abteilungsmails aufgeführt.
- Pflichtprüfung danach (Worktree, ohne Dev-Server): `npx tsc --noEmit` ohne Fehler, `npx next lint` ohne Fehler (Warnungen nur außerhalb von A4), `npx jest` 231 Suites mit 7115 Tests grün.

**Offen nach S37, nicht Teil von A4:**

- **Zu entscheiden (S34):** Soll die Upload-Karte auch bei Vorgängen erscheinen, die nur Zugänge (SPERREN) haben? Das Übergabeprotokoll listet Zugänge mit, `protokoll.noetig` zählt aber nur RUECKGABE.
- **Fachlich ungeklärt (S35):** Das Rückgabeprotokoll eines Austritts fällt mit dessen letzter Ausgabe, auch wenn der Austritt noch nicht abgeschlossen ist. Der Feinplan unterscheidet hier nicht nach Status; zusammen mit Frage 2 an den DSB.
- **Eigener kleiner Fix:**
  - Im Offboarding gibt es für hochgeladene Dokumente (auch `RUECKGABEPROTOKOLL`) keinen Löschweg – dieselbe Lücke, die Review A4d im Onboarding für `UEBERGABEPROTOKOLL` geschlossen hat.
  - Die Offboarding-Upload-Route erlaubt 10 MB ohne Content-Length-Prüfung und nimmt den Typ aus `file.type`.
  - Der DELETE der Fragebogen-Route löscht per `path.join` + `unlink` ohne Wurzelprüfung.
  - Restfrage 8: Paket-4-Nachweise bleiben über den Fragebogen-Link sichtbar und löschbar.
- **DSB und MAV vor dem Einschalten:** Fragen 1, 2 und 7 aus Abschnitt 6, die förmliche MAV-Beteiligung (E-A15). Den Wortlaut der Sperrpunkt-Hinweise (Frage 6) bestätigt die Personalabteilung im Pilot.
- **Zusammenführung mit `ux-umbau`:** die Konflikte in `tab-returns.tsx`, `tab-overview.tsx` und `offboarding-detail-content.tsx` im Logbuch des Umbaus vermerken (Abschnitt 5). `ausstattungPortalLink` bleibt die einzige Stelle mit `/dashboard`.

---

## 9. Ablaufprobe gegen die Testdatenbank (13.10.2026)

Gegen `hr_portal_ausstattung` und den Dev-Server des Worktrees (Port 3200), ohne Mailserver und ohne Webhooks (vom Skript vor dem ersten Schreiben geprüft). Skript: `scripts/ausstattung-probe-a4.js` (`node --env-file=.env scripts/ausstattung-probe-a4.js [--screenshots]`; bricht ab, wenn Server oder Datenbank nicht lokal sind, die Datenbank nicht `hr_portal_ausstattung` heißt oder SMTP/Webhooks aktiv sind). Ergebnis: **106 von 107 Prüfpunkten OK, kein Fehler im Anwendungscode.**

| Schritt | Geprüft |
|---|---|
| Rückgabe-Vorgaben | 13 Positionen übernommen, Wiederholung folgenlos, Werte je Vorschlag richtig |
| Onboarding | Merker der Schrittliste, Formular, Abgabe, Momentaufnahme „Beim Austritt“, Aufgaben je Option |
| Übergabe vermerken | über die Link-Seiten von IT und Gebäudewirtschaft (fremde Aufgabe 404), Zustand AUSGEGEBEN, Kennung in keinem Titel, keiner Beschreibung und keinem Protokoll |
| HR-Karte | Ausgaben mit Aktionen, Kennung mit `<` → 400, Korrektur |
| Offboarding | Vorschlag „stark“ (E-Mail, Name, Einrichtung) ohne Adresse, Zuordnung, Rücknahmeaufgaben ohne Kennung bei der ausgebenden Stelle, Rückgaben mit Kennung, „ohne Übergabevermerk“ für einen abgehakten Zugang |
| Zustände | Schlüssel „fehlt“ → Folgeaufgabe „Schließung prüfen“, Frist 1.1.2030; iPad im Portal ohne Zustand abgehakt → „zurück“, Frist 13.04.2027 |
| Abschluss | ohne Bestätigung 409 mit der offenen Folgeaufgabe, nichts geschrieben; mit Bestätigung 200 |
| Querprüfung | keine Kennung in AuditLog und Betreffzeilen, keine Mail zugestellt |
| Löschfrist (von Hand nachgeholt, lokales `CRON_SECRET`) | Probelauf zählt 2 fällige Stücke und löscht nichts; echter Lauf löscht beide, leert die Seriennummer der Rückgabe, löst `ausgabeId` und setzt `ausgabenGeloeschtAm` an der Ausstattungsaufgabe |

Screenshots: `screenshots/ausstattung/a4-onboarding-link-it.png` (iPad mit Übergabevermerk), `screenshots/ausstattung/a4-offboarding-link-facility.png` (Folgeaufgabe „Schließung prüfen“ nur lesend, Rücknahme mit Zuständen).

Beobachtungen ohne Handlungsbedarf: Der Vorlagenpunkt „Physische Zugaenge entziehen (Schlüssel, Karten)“ trägt im Titel kein Umlaut-ä; der Titel ist zugleich Schlüssel der Migration `OFFBOARDING_SPERRPUNKTE_V1` und bleibt deshalb. Die Links in API-Antworten folgen `APP_URL`.
