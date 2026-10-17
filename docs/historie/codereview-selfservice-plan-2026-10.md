# Code-Review Self-Service-Konzeptplan (Fassung 5)

```
╔══════════════════════════════════════════════════════════════╗
║              SUPERHERO CODE REVIEW REPORT                    ║
║                                                              ║
║  Datum: 17.10.2026     Sprache: Konzeptplan (HTML, deutsch)  ║
║  Gegenstand: Branch feat/selfservice-portal-plan             ║
╚══════════════════════════════════════════════════════════════╝
```

**Gegenstand.** Der Branch `feat/selfservice-portal-plan` enthält keinen ausführbaren Code,
sondern den Konzeptplan `docs/module/selfservice/selfservice-portal-plan.html` (Fassung 5) und
eine README-Zeile. Geprüft wurde deshalb der **technische Entwurf**: Wäre das System
produktionsreif, wenn es genau so gebaut würde — und stimmen die Aussagen über den Bestand?

**Vorgehen.** Sieben Fachagenten (Security, UI/UX, Performance, Architecture, Testing,
Error Handling, Code Quality) haben den Plan gegen die Codebasis (`main 5595cf7`, Zweig
`ux-umbau`) und das validierte Schema-Delta geprüft. Jedes CRITICAL- und MAJOR-Finding wurde von
einem eigenen Agenten **adversarial gegengeprüft** (Auftrag: widerlegen, im Zweifel verwerfen;
Volltextsuche im ganzen Plan, ob er das Thema schon löst). 75 Agenten, 0 Ausfälle.
MINOR- und INFO-Findings sind nicht gegengeprüft und als solche gekennzeichnet.

## GoLive-Status (Fassung 5): 🔴 NICHT BEREIT

Drei kritische Themen würden gebaut zu einer Sicherheitslücke oder einem Ausfall führen:
Die neue Beschäftigtenrolle erreicht über das gemeinsame Portal-JWT die HR-Bestandsrouten, die
Erstzuordnung eines Kontos hängt an einer E-Mail-Adresse, die der Benutzer in Keycloak selbst
ändern kann, und der Nummernkreis für Tickets ohne Mandant läuft nach wenigen Zuordnungen fest.
Alle drei sind mit wenigen Absätzen im Plan behebbar; der Entwurf als Ganzes ist tragfähig.

## Findings-Übersicht (nach Gegenprüfung)

| Bereich | CRITICAL | MAJOR | MINOR | INFO | verworfen |
|---|---|---|---|---|---|
| 🔐 Security | 2 | 4 | 6 | 0 | 0 |
| 🎨 UI/UX | 0 | 1 | 9 | 0 | 2 |
| ⚡ Performance | 1 | 3 | 6 | 1 | 0 |
| 🏗️ Architecture | 1 | 5 | 4 | 1 | 1 |
| ✅ Testing | 1 | 5 | 4 | 0 | 2 |
| 🛡️ Error Handling | 1 | 7 | 4 | 0 | 0 |
| 💎 Code Quality | 1 | 7 | 4 | 0 | 0 |
| **TOTAL** | **7** | **32** | **37** | **2** | **5** |

Die 7 CRITICAL und 32 MAJOR bündeln sich zu **3 kritischen und 18 wesentlichen Themen** —
mehrere Agenten haben dieselbe Lücke unabhängig voneinander gefunden.

## GoLive-Checkliste (Themen)

Muss vor Baubeginn im Plan behoben sein:
- [ ] **K1** Beschäftigtenrolle: Middleware-Sperre mit Allowlist, Sitzung mit `employeeId`, Test über alle `route.ts` (Security, Architecture, Testing, Code Quality)
- [ ] **K2** Erstzuordnung nur über unveränderliche, vom Identitätsanbieter gelieferte Merkmale; E-Mail-Attribut in Keycloak schreibgeschützt (Security, Testing)
- [ ] **K3** Nummernkreis ohne Mandant: Zählung über das Maximum bzw. eine Sequenz statt `count()` (Performance, Error Handling)
- [ ] **M1** Sitzungsverlängerung `GET /api/auth` hebt 8 h und `isActive` auf
- [ ] **M2** Lokale Keycloak-Passwörter umgehen Entra und den zweiten Faktor
- [ ] **M3** Besondere Kategorien: Freitexte unverschlüsselt, erste Freigabe, Umstufung, zwei Schalter
- [ ] **M4** Abmelden am geteilten Rechner lässt die Microsoft-Sitzung offen
- [ ] **M5** Statusmodell ohne Übergangstabelle (Zurückziehen, Verwerfen, Wiedereröffnung, Antwort auf geschlossenes Ticket)
- [ ] **M6** Stammabgleich: Laufklammer über mehrere Stapel, Stilllegen nur bei vollständigem Lauf, sichtbare Teilfehler
- [ ] **M7** Jahresverbrauch nach Kalenderjahr der Freistellung statt Anlagejahr
- [ ] **M8** Löschlauf: Chronik im AuditLog bleibt stehen; Reihenfolge Datenbank/Postfach
- [ ] **M9** Grunddaten „mit dem Seed" kommen in Produktion nie an
- [ ] **M10** „Unterlagen nachreichen": Bezug auf Vorgänge so nicht baubar
- [ ] **M11** Sichtbarkeit aus vier Quellen, Feld „Personalgruppe" fehlt
- [ ] **M12** Fristen in Arbeitstagen ohne Rechenregel und Feiertage
- [ ] **M13** Dauerhaft scheiterndes Verschieben blockiert den Posteingang
- [ ] **M14** Wartezustände ohne Zeitgrenze; Genehmigungsschritt unterbestimmt
- [ ] **M15** Fehlerpfade der Anmeldung ohne Maske und Text
- [ ] **M16** Reiter „E-Mails": fünfte Änderungsstelle in der Mails-Route
- [ ] **M17** „Vorige IBAN bleibt erhalten" ohne Datenquelle
- [ ] **M18** Verbindliche Katalogschlüssel, Ereignisnamen und Wertlisten fehlen

## Inline-Annotationen (kritische Stellen im Plan)

```html
<!-- ⚠️ CRITICAL [Security/Architecture]: 4.3 — die Middleware schottet heute nur BEM_BEAUFTRAGTER
     und die Mandantenrollen ab; viele Routen prüfen nur, ob eine Sitzung besteht
     (src/middleware.ts:61-106, src/app/api/onboarding/[id]/notes/route.ts:21-27) -->
Damit ändert sich an Middleware und Rollenprüfung nichts — mit einer Ausnahme   <!-- ← PROBLEM -->
<!-- Besser: dritte Sperre in der Middleware — die Beschäftigtenrolle erreicht per Allowlist nur
     /api/auth und /api/mein/**, alles andere 403; HR-Seiten verlangen PORTAL_ROLES. -->
```

```html
<!-- ⚠️ CRITICAL [Security]: 4.4/11.1 — das email-Attribut des Keycloak-Benutzers ist im Standard
     vom Benutzer in der Kontokonsole änderbar -->
einmal über die Dienstadresse aus dem eigenen Tenant zugeordnet   <!-- ← PROBLEM -->
<!-- Besser: E-Mail-Merkmal in Keycloak schreibgeschützt und aus Entra synchronisiert
     (Sync-Modus „Force", „Trust Email"), Kontokonsole aus; zugeordnet wird nur bei genau einem
     aktiven Treffer, der sub per bedingtem Schreiben festgehalten (umgesetzt in 4.5, 11.1). -->
```

```html
<!-- ⚠️ CRITICAL [Performance/Error Handling]: 8.5 — Zählweise „Anzahl im Jahr + 1" -->
Gezählt wird nach dem Vorbild von Vertragsende, BEM und Elternzeit   <!-- ← PROBLEM -->
<!-- Im Kreis ohne Mandant sinkt die Anzahl durch Zuordnung, Verwerfen und Löschung; nach drei
     Ereignissen sind alle geprobten Nummern vergeben. Besser: höchste vergebene Nummer + 1. -->
```

## Empfohlene Prioritäten

**Vor Baubeginn (im Plan zu korrigieren):** K1, K2, K3, dann M1, M2, M3, M5, M6.

**Mit dem jeweiligen Paket:** M7 (S4), M8 (S3), M9 (S3/S4), M12–M16 (S3/S3b), M17 (S4), M18 (S3).

**Backlog:** die MINOR-Findings, soweit sie nicht ohnehin mit den Themen oben erledigt werden.

---

## Umsetzung in Fassung 6 (17.10.2026)

Alle 3 kritischen und 18 wesentlichen Themen sind im Plan behoben. Die Korrekturen hat je
Themenblock ein Agent als exakte Textänderungen entworfen; angewendet, zusammengeführt und
geprüft wurden sie zentral. Das Schema-Delta ist danach erneut gegen das echte Schema validiert
(`npx prisma validate`: gültig, 105 Modelle, 95 vorhandene und 10 neue).

| Thema | Lösung im Plan | Abschnitt |
|---|---|---|
| K1 Beschäftigtenrolle | Sitzungsrolle `BESCHAEFTIGTE` mit `employeeId`, Sperre in Middleware und `verifySessionToken`, Routen nur unter `/api/mein`, Test über alle `route.ts` | 4.3, S2 |
| K2 Erstzuordnung | E-Mail-Merkmal schreibgeschützt aus Entra, Kontokonsole aus, genau ein aktiver Treffer, bedingtes Schreiben, `ANMELDUNG_ABGEWIESEN` | 4.5, 11.1 |
| K3 Nummernkreis | Zähler `AnliegenNummernkreis`, der nie sinkt; P2002-Fang als Netz | 8.5, 11.2 |
| M1 Sitzungsverlängerung | Beschäftigte ohne Verlängerung (8 h), HR mit Obergrenze ab Anmeldung, `isActive` je Anfrage (nur Cookie-Sitzungen) | 4.3 |
| M2 lokale Passwörter | Portal nimmt Keycloak-Anmeldungen nur über den Entra-Anbieter an; Weg A nur für externe BEM-Beauftragte, von der IT angelegt | 4.4, 5.2, 11.1 |
| M3 besondere Kategorien | ein Feld `zugriffBeschraenkt`, erste Freigabe über `User.isAnliegenVertraulich`, Freitexte mit BEM-Schlüssel, Einstufung im Vorgang | 11.2, 11.3, 12.3, E-S29 |
| M4 Abmelden | Entscheidung des Auftraggebers vom 17.10.2026: Abmelden beendet Portal und Keycloak, nicht Microsoft 365. Gegen das stille Wiederanmelden am gemeinsam genutzten Rechner zeigt Microsoft bei jeder Anmeldung die Kontoauswahl (`prompt=select_account`); die Abmeldeseite bietet „Auch bei Microsoft abmelden". Restrisiko (Klick auf das fremde Konto) offen benannt und getragen | 4.3, 12.1, E-S5 |
| M5 Statusmodell | Übergangstabelle mit Auslöser und Nachricht, Zurückziehen, Verwerfen (schließt, löscht nicht), Wiedereröffnung, Antwort nach Abschluss | 8.1 |
| M6 Stammabgleich | Stilllegen nur bei ausdrücklichem Austritt je Anstellung, Protokoll je Aufruf, Block „Zu prüfen" | 5.1, S0 |
| M7 Jahresverbrauch | je Anstellung nach Kalenderjahr der Freistellung, Höchstwert je Anlass, Index | 11.4, 11.2 |
| M8 Löschlauf | Chronik mit Kaskade, ein Löschnachweis, erst Postfach dann Datenbank über `graphMessageId` | 12.3, E-S28 |
| M9 Seed | Startmigrationen in `prisma/seed-check.js` | 6.2, 11.3 |
| M10 Unterlagen nachreichen | Vorgangsnummer nur als Freitext; Auswahl eigener Vorgänge später | 6.1, 15 |
| M11 Sichtbarkeit | `Employment.beschaeftigungsgruppe`, eine Funktion `anliegenSichtbar` | 5.1, 11.3 |
| M12 Fristen | Arbeitstage Mo–Fr in `src/lib/anliegen/fristen.ts`, Frist ab Eingang | 8.3 |
| M13 Verschieben blockiert | Ordner je Lauf gesucht/angelegt, Grundcodes, roter Hinweis | 10.1, 10.2 |
| M14 Wartezustände | Link 7 Tage, „liegen geblieben" nach 2 Arbeitstagen, Ablauf zurück an HR, Nachricht bei jedem Wechsel | 8.1, 8.6 |
| M15 Fehlerpfade Anmeldung | Seite `/login/fehler` mit drei Fällen | 9.1 |
| M16 Reiter „E-Mails" | fünf Änderungsstellen inkl. Mail-Route | 11.5 |
| M17 vorige IBAN | Vorzustand führt LOGA; Portal speichert nur die gemeldete IBAN | 12.1 |
| M18 Katalog-Namen | acht Katalogschlüssel, 13 Ereignisnamen, feste Listen der Protokollwerte | 6.1, 8.4, 8.6 |

Zusätzlich sind die MINOR-Findings eingearbeitet, soweit sie nicht in den Themen aufgehen; einzelne
sind mit Begründung bewusst nicht übernommen (etwa die Mengenbremse beim Stammabgleich, weil am
Schuljahresende berechtigt viele Verträge enden).

**Konsistenzprüfung nach der Überarbeitung.** Weil neun Agenten parallel geschrieben hatten, prüften
sieben weitere den Plan und das neue Designkonzept auf neue Widersprüche. Gefunden wurden rund 40
unterschiedliche Stellen, meist doppelt gemeldet — etwa ein Löschabsatz, der verworfene Tickets
löschen ließ, obwohl „Verwerfen" nur schließt, verschieden benannte Protokollwerte und ein
Beispiel, das beim Todesfall eine Genehmigung zeigte. Alle sind korrigiert. Eine Stelle wurde
bewusst anders gelöst als vorgeschlagen: Eine Mail, für die nicht einmal das Rückfall-Ticket
entsteht, bleibt im Eingang und wird erneut versucht, statt in einem Ordner ohne Alarm zu liegen.

## GoLive-Status (Fassung 6): 🟢 BEREIT — als Konzept zum Push

Keine offenen CRITICAL- oder MAJOR-Befunde. Offen sind Abstimmungen (DSB, MAV, IT) und Abfragen
(DokuBit, LOGA), keine Mängel des Entwurfs. Vor dem Bau von S0 müssen die Vorbedingungen aus
Abschnitt 13 erfüllt sein.

---

## Detaillierte Findings (Nummern F1–F83, auf die Plan und Designkonzept verweisen)

#### F1 · CRITICAL · Security · bestätigt
**Neue Beschäftigtenrolle erreicht die HR-Bestandsrouten, weil die Middleware laut Plan unverändert bleibt**  
*Ort (Fassung 5):* 4.3, Z. 669 (dazu 3, Z. 568-569; 4.1, Z. 618; S2, Z. 3783-3785)  
*Problem:* Beschäftigte bekommen dasselbe Portal-JWT (credo_session) mit einer neuen Rolle. Der Plan sagt dazu, an Middleware und Rollenprüfung ändere sich außer dem isActive-Check nichts. Im Bestand prüfen die Routen die Rolle aber nicht durchgängig: apiHandler ohne roles lässt jede Sitzung durch, und viele der 228 route.ts rufen getSession() direkt auf. Einige prüfen nur, ob überhaupt eine Sitzung besteht, etwa GET/POST /api/onboarding/[id]/notes. Andere sperren nur BEM_BEAUFTRAGTER über eine Sperrliste, etwa /api/dashboard/stats. Die Middleware schottet nur BEM_BEAUFTRAGTER und die mandantenbeschränkten Rollen ab, und /dashboard lässt jedes gültige JWT durch. Das Mitarbeiterportal ist laut S2 eine eigene Routengruppe derselben Anwendung, also sind alle Bestandsrouten auch für diese Sitzung erreichbar. Die Sitzung selbst ist für Beschäftigte nicht beschrieben: SessionPayload kennt nur userId, also eine User-Zeile, und Beschäftigte haben keine.  
*Warum:* Ab S2 hätten rund 600 Beschäftigte über ungeprüfte Endpunkte Lese- und teils Schreibzugriff auf fremde Personaldaten, interne HR-Notizen und Statistiken. Das ist IDOR über die gesamte Altlast und genau die Lücke, die der Bestand selbst für EINRICHTUNGSLEITUNG beschreibt.  
*Fix:* 1) In 4.3, Z. 669, den Satz ersetzen: „Die Middleware bekommt eine dritte Sperre nach dem Muster BEM_BEAUFTRAGTER bzw. mandanten-gate.ts: Die Beschäftigtenrolle erreicht per Allowlist nur /api/auth und /api/mein/**. Jeder andere API-Pfad antwortet mit 403, jede HR-Seite (/dashboard, /audit-log, Admin-Pfade) leitet auf die Startseite des Mitarbeiterportals um. Zusätzlich lassen die HR-Seiten nur PORTAL_ROLES herein.“ Z. 569 und Z. 618 entsprechend auf „das bestehende Rollen- und Mandantenmodell bleibt, die Middleware bekommt eine Sperre für die neue Rolle“ ändern.
2) In 4.3 oder 11.1 die Sitzung der Beschäftigten festlegen: Das JWT trägt employeeId statt userId. Den Wert ermittelt der Callback serverseitig aus keycloakSub, nie aus dem Request. /api/mein/** liest nur diesen Wert. AuditLog-Einträge einer Beschäftigten haben userId = null; die handelnde Person steht im Eintrag, zum Beispiel in details.employeeId. Wer beide Rollen hat (hr-team und beschaeftigte, Z. 649-651), erhält je Portal eine eigene Sitzung bzw. Rolle.
3) In S2, Z. 3789, einen Test ergänzen: beschaeftigte-isolation.test.ts. Er ruft jede route.ts unter src/app/api und jede HR-Seite mit einer Beschäftigten-Sitzung auf und erwartet außerhalb der Allowlist 403 bzw. eine Umleitung. Eine neue Route ist damit automatisch gesperrt.

#### F2 · CRITICAL · Security · bestätigt
**Erstzuordnung über die E-Mail im Keycloak-Token, die der Benutzer selbst ändern kann**  
*Ort (Fassung 5):* 11.1, Z. 3038-3045; 8.2, Z. 1656-1657; 4.4, Z. 715-717; 4.5, Z. 744  
*Problem:* Bei der ersten Anmeldung bindet das Portal den Employee, beim HR-Team den User, über die E-Mail-Adresse dauerhaft an den sub. Das Portal sieht dabei aber nicht die Adresse aus Entra ID, sondern das email-Attribut des Keycloak-Benutzers. Im Keycloak-Standard (deklaratives Benutzerprofil, email mit edit-Recht für ‚user‘, ‚Verify email‘ aus) kann jeder angemeldete Benutzer diese Adresse in der Kontokonsole /realms/credo/account ändern. Die Caddy-Sperrliste aus 4.5 lässt die Kontokonsole offen. Der Plan legt weder die Quelle des Merkmals noch einen Schreibschutz noch eine Prüfung von email_verified bzw. identity_provider fest.  
*Warum:* So läuft der Angriff: Ein Beschäftigter meldet sich über Entra an und trägt in der Kontokonsole die Adresse einer Kollegin ein, die sich noch nicht angemeldet hat. Das geht auch mit der Adresse eines HR-Users, der sich noch nicht über Keycloak angemeldet hat, etwa eines neu angelegten SUPER_ADMIN. Öffnet er danach das Portal, wird er dauerhaft an diese Akte bzw. an dieses HR-Konto gebunden. Er sieht dann fremde Anliegen, kann im fremden Namen eine Bankverbindung melden oder hat volle HR-Rechte. Das ist Kontoübernahme bzw. Rechteausweitung.  
*Fix:* Minimale Ergänzungen am Plan:

(a) 4.5, neue Pflichtzeile „Identitätsmerkmale schreibschützen“:
- Benutzerprofil des Realms credo: email, firstName und lastName nur für admin bearbeitbar (permissions.edit = ["admin"]).
- Entra-Anbieter: Sync-Modus „Force“ und „Trust Email“ an. Issuer mandantenspezifisch (login.microsoftonline.com/<Tenant-Id>/v2.0), nicht /common. App-Registrierung nur für den eigenen Tenant. Bei zwei Verzeichnissen (E-S5) je ein eigener Anbieter.
- Kontokonsole abschalten: manage-account aus den Standardrollen nehmen und /realms/credo/account in die Caddy-Sperrliste aufnehmen.

(b) 11.1 Z. 3038-3047 richtigstellen: Der Wert ist das email-Attribut des Keycloak-Kontos und kommt nur dank (a) aus Entra. Der Callback bindet per E-Mail nur unter zwei Bedingungen:
- email_verified = true
- das Ziel (Employee bzw. User) hat noch keinen keycloakSub
Sonst gibt es keinen Zugang, und HR erhält eine Meldung wie beim Fehlschlag der Zuordnung. Für Weg-A-Konten setzt die HR-Leitung beim Anlegen „E-Mail bestätigt“.

(c) 4.4 und 8.2: Formulierung entsprechend anpassen und auf 11.1 verweisen.

(d) S1-Tests (Z. 3771): anmeldung-callback.test.ts erweitern. Bei email_verified = false wird nicht zugeordnet. Hat das Ziel schon einen keycloakSub, wird nicht zugeordnet und HR erhält eine Meldung. Zur Abnahme von S1 in der Vorabumgebung mit 26.8 nachweisen: Ein Benutzer kann seine Adresse nicht selbst ändern, und /realms/credo/account ist gesperrt.

(e) 12.1: Diesen Angriffsweg und seine Abwehr in einem Satz nennen, damit das Restrisiko aus E-S21 nicht als einziges Modell dasteht.

#### F3 · CRITICAL · Performance · bestätigt
**Nummernkreis „X“ läuft per count() nach wenigen Zuordnungen fest, danach steht der Postfachabruf**  
*Ort (Fassung 5):* 8.5 Nummer und Sichtbarkeit, Z. 1823–1838; 9.10, Z. 2549–2552; 12.3 Löschung, Z. 3615; 10.2, Z. 2792 und 2817–2820  
*Problem:* Der Plan übernimmt die Zählweise der Bestandsmodule: laufende Nummer = Anzahl der Vorgänge des Kreises im Jahr + 1 (+ Versuch). Im Kreis ohne Mandant (AN-2026-X-…) sinkt diese Anzahl aber laufend. Jede Zuordnung in 9.10 setzt organizationId, die Nummer bleibt ausdrücklich stehen. Jedes „Verwerfen“ löscht das Ticket, und nicht zugeordnete Tickets werden nach 90 Tagen gelöscht. Nach k solchen Vorgängen schlägt count+1 … count+3 (Onboarding-Muster: +5) nur bereits vergebene Nummern vor. Die P2002-Wiederholung probiert genau diese Nummern und scheitert ebenfalls. Zählt man stattdessen über das Präfix der displayId, gilt dasselbe wegen der Löschungen.  
*Warum:* Ab dem dritten bis fünften zugeordneten oder verworfenen Ticket im Jahr (realistisch in der ersten Betriebswoche) lässt sich kein Ticket ohne Mandant mehr anlegen. Das betrifft unbekannte Absender und ebenso das Rückfall-Ticket „Inhalt nicht übernommen“. Die Nachrichten bleiben im Eingang. Weil der Abruf „höchstens 50, älteste zuerst“ liest, belegen sie nach 50 aufgelaufenen Fällen alle Plätze dauerhaft. Dann kommt auch keine Mail bekannter Absender mehr an: Der zweite Eingang fällt still aus, und zwar bis zum Jahreswechsel.  
*Fix:* 1) In 8.5 den Satz „Gezählt wird je Mandant wie bei Vertragsende, BEM und Elternzeit" ersetzen durch: „Die laufende Nummer kommt aus einem Zähler je Kreis und Vorgangsjahr. Kreis ist das Mandantenkürzel oder ‚X'. Der Zähler wird in der Anlage-Transaktion hochgezählt (INSERT … ON CONFLICT DO UPDATE SET letzte = letzte + 1 RETURNING letzte). Er sinkt nie, auch nicht bei Zuordnung, Verwerfen oder Löschung, und vergibt deshalb keine Nummer doppelt oder erneut. Die Zeilensperre bis zum Commit verhindert gleichzeitige Doppelvergabe. Der P2002-Fang auf displayId bleibt nur als Netz."

2) In 11 ein kleines Modell ergänzen: model AnliegenNummer { kreis String; jahr Int; letzte Int; @@id([kreis, jahr]); @@map("anliegen_nummer") }. Den Kreis legt allein das Anlegen fest, ein späteres Zuordnen ändert ihn nicht.

3) In 13/S3 unter anliegen-dienst.test.ts einen Test ergänzen: drei X-Tickets anlegen, zwei zuordnen, eines verwerfen. Das nächste X-Ticket bekommt X-004, und eine gelöschte Nummer wird nie neu vergeben.

4) In 10.2 ergänzen: „Scheitert auch das Rückfall-Ticket, wird die Nachricht trotzdem nach ‚Nicht verarbeitet' verschoben. letzterAbrufStatus erhält einen Grundcode, und der rote Hinweis erscheint. So blockiert keine Nachricht dauerhaft einen der 50 Plätze." Dazu ein Fall in postfach-abruf.test.ts.

5) In 15 den Bestandsbefund (1) erweitern: Die Zählung count+1 kollidiert außerdem nach Löschungen im laufenden Jahr. Elternzeit löscht Vorgänge (src/app/api/elternzeit/[id]/route.ts:173).

#### F4 · CRITICAL · Architecture · bestätigt
**Beschäftigten-Sitzung im bestehenden Portal-JWT ohne Abschottung von den HR-APIs**  
*Ort (Fassung 5):* 4.3 (Z. 669, 677), 13 Paket S2 (Z. 3781-3785), 4.2 (Z. 650)  
*Problem:* Der Plan setzt für Beschäftigte „das bestehende Portal-JWT“ mit einer neuen Rolle und erklärt, an Middleware und Rollenprüfung ändere sich nichts. getSession() prüft aber nur die Signatur. Die Middleware schottet nur BEM_BEAUFTRAGTER und die Mandantenrollen ab, weil Route-Handler den Zugriff „nicht durchgängig selbst prüfen“. 138 Routen rufen getSession() direkt auf, mehrere davon ohne Rollenprüfung (z. B. GET /api/onboarding/[id]/notes, /api/civil-service/[id]/documents, /api/vorlagen). Offen bleibt außerdem, wer das Subjekt einer Beschäftigten-Sitzung ist: SessionPayload.userId und AuditLog.userId verweisen auf User, Beschäftigte haben aber keinen User (passwordHash ist Pflicht). Ebenso fehlt eine Festlegung, ob mein.fes-credo.de dieselbe App mit demselben Cookie ist.  
*Warum:* So gebaut, kommt jede der rund 600 Beschäftigten mit ihrem gültigen Cookie an jede Route ohne Rollenprüfung, also an HR-Notizen, Verbeamtungsunterlagen und Vorlagen aller 16 Mandanten. Zusätzlich führt jeder AuditLog-Eintrag mit session.userId = Employee-Id zu einer FK-Verletzung und damit zu einer 500. Das ist eine Datenschutzlücke im Live-Betrieb.  
*Fix:* 1) 4.3, Z. 669: Den Satz ersetzen durch: „Die Middleware bekommt eine Regel nach dem Muster von BEM_BEAUFTRAGTER und mandanten-gate.ts. Die Beschäftigtenrolle erreicht nur /api/mein/* und /api/auth, alles andere bekommt 403. Die Regel ist fail-closed: Außerhalb dieser Allowlist kommt nur durch, wer eine bekannte HR-Rolle oder SERVICE hat.“ Begründung dazu: Mehrere Routen prüfen nur die Sitzung (onboarding/[id]/notes, civil-service/[id]/documents, vorlagen) oder sperren nur BEM per Sperrliste (dashboard/stats, offboarding/analytics).
2) 4.3, Ablaufschritt „Sitzung“ (Z. 677): Das Token von Beschäftigten trägt employeeId und einen Typ-Claim (z. B. typ="beschaeftigte"), aber keine userId. getSession/verifySessionToken liefern für die HR-Routen bei diesem Typ null. Das ist die zweite Verteidigungslinie. Für Personen in beiden Gruppen (4.2) festlegen, welche Rolle die Sitzung trägt, z. B. „unter mein.fes-credo.de immer die Beschäftigtenrolle“.
3) 11.1, AuditLog: „Handlungen von Beschäftigten mit userId = null; Akteur über ein neues nullbares employeeId (FK auf Employee, @@index)“. Damit hat die Chronik aus 8.4 ein Subjekt und es entsteht keine FK-Verletzung.
4) 13, S2, Tests: beschaeftigte-api-sperre.test.ts ergänzen. Der Test geht alle route.ts unter src/app/api durch und erwartet mit einem Beschäftigten-Token 401 oder 403, ausgenommen /api/mein und /api/auth.
Fix-Punkt (4) des Findings (Selbstbearbeitung) nicht übernehmen, weil er E-S21 berührt.

#### F5 · CRITICAL · Testing · bestätigt
**Neue Beschäftigtenrolle ohne Sperre und ohne Test gegen die bestehenden HR-Routen**  
*Ort (Fassung 5):* 4.3 (Z. 668–670) und 13/S2 (Z. 3784–3791)  
*Problem:* Der Plan gibt rund 600 Beschäftigten dasselbe Portal-JWT. Er erklärt Middleware und Rollenprüfung für unverändert, bis auf die isActive-Prüfung. Getestet wird nur „nur eigene Daten“ an den neuen Anliegen-Routen (nur-eigene-daten.test.ts). Im Bestand gibt es aber Routen, die nur prüfen, ob eine gültige Sitzung da ist, und keine Rolle abfragen. Geprüft sind GET/POST /api/onboarding/[id]/notes, GET/POST /api/civil-service/[id]/documents und GET /api/vorlagen. Eine heuristische Suche findet rund zehn solcher Routen. Für BEM_BEAUFTRAGTER wurde aus genau diesem Grund eine eigene Sperre in der Middleware gebaut. Der Plan überträgt sie nicht auf die neue Rolle.  
*Warum:* So gebaut, liest jede Beschäftigte mit ihrer normalen Sitzung interne HR-Notizen zu Onboardings und die Verbeamtungsunterlagen anderer Personen, sofern sie die Vorgangs-Id kennt. Außerdem sieht sie alle Formularvorlagen. Keiner der geplanten Tests würde das bemerken. Das ist ein Datenschutzverstoß im Live-Betrieb.  
*Fix:* 4.3, Z. 669 ersetzen durch: „An der Middleware ändert sich eine Stelle: Die Beschäftigtenrolle wird dort wie BEM_BEAUFTRAGTER per Allowlist abgeschottet, siehe unten.“ Dazu im gelben Kasten von 4.3 einen dritten Punkt ergänzen:

(a) Die Beschäftigtenrolle bekommt einen festen Namen, z. B. BESCHAEFTIGTE. Sie steht weder in PORTAL_ROLES noch in BEM_PORTAL_ROLES.

(b) Alle API-Routen für Beschäftigte liegen unter einem eigenen Präfix /api/mein/** und nicht unter dem HR-Pfad /api/anliegen.

(c) In src/middleware.ts kommt ein dritter Fall neben bemGesperrt: Für BESCHAEFTIGTE liefert jeder /api-Pfad außer /api/mein und /api/auth eine 403. Der Vergleich läuft auf Segmentgrenze wie bei apiPfadErlaubt. Jeder Seitenpfad außerhalb der Routengruppe des Mitarbeiterportals leitet auf deren Startseite um, das betrifft auch /dashboard.

S2, Z. 3789 bei den Tests ergänzen: beschaeftigte-gate.test.ts. Für die Rolle prüft er stichprobenhaft, dass /api/onboarding/x/notes, /api/civil-service/x/documents, /api/offboarding/analytics, /api/dashboard/stats und /api/vorlagen eine 403 liefern und /dashboard umleitet. /api/mein/... und /api/auth/... müssen durchkommen. Den Test, der alle route.ts einliest, kann man optional nach dem Muster von zeitzone-waechter.test.ts bauen. Nötig ist er nicht, weil die Allowlist schon von sich aus alles Unbekannte sperrt.

#### F6 · CRITICAL · Error Handling · bestätigt
**Nummernkreis „ohne Mandant“ läuft nach drei Zuordnungen oder Löschungen fest**  
*Ort (Fassung 5):* 8.5 Nummer und Sichtbarkeit (Z. 1823–1838); 9.10 (Z. 2552); 12.3 Löschung (Z. 3615); 11.2 (Z. 3052, 3140–3143)  
*Problem:* Der Plan übernimmt die Zählweise des Bestands: Anzahl der Vorgänge des Jahres im Kreis, plus 1, mit drei Proben. Diese Anzahl sinkt im Kreis X aber laufend. Jede Zuordnung in 9.10 setzt organizationId, die Nummer bleibt dabei stehen. „Verwerfen“ entfernt das Ticket, und nach 90 Tagen löscht der Löschlauf nicht zugeordnete Mails, also noch im selben Jahr. Nach drei solchen Ereignissen sind alle drei geprobten Nummern belegt. Der P2002-Wiederholungsweg aus dem Onboarding rechnet dann dreimal dieselben Kandidaten und scheitert endgültig. Liegt eine gelöschte Nummer im Probenbereich, wird sie neu vergeben. Stufe 3 der Zuordnung (Nummer im Betreff) hängt dann alte Antworten an das neue Ticket.  
*Warum:* Laut Plan ist das genau der Fall, „den das Postfach am häufigsten erzeugt“. Wenige Tage nach dem Start von S3b scheitert jede Mail eines unbekannten Absenders. Auch das Ersatz-Ticket für eine kaputte Nachricht braucht eine Nummer. Die Mails bleiben also im Eingang und verstopfen über „älteste zuerst“ den ganzen Abruf. Das ist ein Ausfall im Live-Betrieb.  
*Fix:* In 8.5 den zweiten Punkt ersetzen: „Die laufende Nummer wird nicht gezählt, sondern aus dem Höchstwert bestimmt: MAX(sequentialNumber) + 1 je Vorgangsjahr und Nummernkreis. Der Kreis steht in einer eigenen, beim Anlegen gesetzten und danach nie geänderten Spalte nummernkreis (Mandantenkürzel oder „X“). Er wird also nicht aus organizationId abgeleitet, die sich bei der Zuordnung ändert. Gleichzeitige Anlage: Bei P2002 auf displayId neu bestimmen, bis zu drei Versuche, wie im Onboarding.“

In 11.2 neben sequentialNumber ergänzen: nummernkreis String (unveränderlich), dazu @@index([nummernkreis, erstelltAm]).

In 9.10 / 8.1 „Verwerfen“ nicht als Löschung ausführen, sondern als ABGELEHNT mit dem Grund „kein Anliegen“ und loeschenAb = jetzt + 90 Tage. Das ist dasselbe Muster wie beim Zurückziehen und braucht keinen neuen Zustand. Die Zeile unter der Tabelle entsprechend anpassen.

In S3 bei anliegen-dienst.test.ts ergänzen: „Drei Zuordnungen und ein Verwerfen im Kreis X; die nächste Nummer ist frei und höher als jede bisher vergebene.“

Eine eigene Zählertabelle ist nicht nötig. Mit MAX und Verwerfen als Endzustand ist der Fehler behoben, und das Modell bleibt einfacher.

#### F7 · CRITICAL · Code Quality · bestätigt
**Sitzung der Beschäftigten nicht festgelegt – „an Middleware ändert sich nichts“ öffnet HR-APIs**  
*Ort (Fassung 5):* 4.3 (Z. 669, 677, 689–696), 4.2 (Z. 648–651), 9.1 (Z. 2028), 13 S2 (Z. 3781–3791)  
*Problem:* Laut Plan bekommen Beschäftigte das bestehende Portal-JWT, und an Middleware und Rollenprüfung ändert sich außer der Laufzeit nichts. Offen bleibt: (1) Wie heißt die Rolle? (2) Was steht in SessionPayload.userId? Das Feld ist Pflicht und war bisher immer eine User.id. (3) Welche Sitzung entsteht, wenn dieselbe sub in User.keycloakSub und in Employee.keycloakSub steht (HR-Kraft ist zugleich Beschäftigte, 4.2)? (4) Teilen sich mein.fes-credo.de und hr.fes-credo.de App und Cookie? (5) Wer setzt die Keycloak-Gruppen hr-team/beschaeftigte bei der ersten Anmeldung über Microsoft? 9.1 sagt „Keycloak entscheidet, wer wohin darf“, 4.1 sagt das Gegenteil.  
*Warum:* Im Bestand prüfen viele Routen nur „Sitzung vorhanden und nicht BEM_BEAUFTRAGTER“. Die Middleware sagt selbst, dass die Route-Handler nicht durchgängig prüfen. Deshalb isoliert sie BEM_BEAUFTRAGTER und die Mandantenrollen über Allowlists. Eine neue Beschäftigtenrolle im selben Cookie credo_session ohne eigene Allowlist erreicht damit HR-Endpunkte wie /api/dashboard/stats. AuditLog.userId ist ein Fremdschlüssel auf User: Steht dort eine Employee-Id, scheitert jede Protokollierung mit 500. Die isActive-Prüfung „im API-Wrapper“ erfasst nur die 24 Routendateien mit apiHandler; 138 Routendateien rufen getSession direkt auf.  
*Fix:* 4.3, Z. 669, ersetzen durch: „Die Middleware bekommt einen dritten Isolationsfall nach dem Muster BEM_BEAUFTRAGTER: Die Sitzungsrolle BESCHAEFTIGTE gibt es nur im JWT, nicht in UserRole. Sie darf ausschließlich /api/mein/** und /api/auth aufrufen, alles andere bekommt 403. Seiten außerhalb der Beschäftigten-Routengruppe leiten auf die Startseite um. Die Zeichenkettenlogik steht neben mandanten-gate.ts.“ Weitere Festlegungen in 4.3:
(a) SessionPayload bekommt employeeId?. Bei Beschäftigten bleibt userId leer bzw. ist nie eine Employee-Id.
(b) AuditLog-Einträge von Beschäftigten schreiben userId = null und employeeId in details. Ein zentraler Helfer kapselt das, so wie heute die Weiche für „n8n-service“.
(c) Regel für die Doppelidentität: Der Anmeldeweg bzw. Host bestimmt die Sitzungsart. hr.* sucht nur in User, mein.* nur in Employee. Eine HR-Kraft hat damit zwei getrennte Sitzungen.
(d) Die Keycloak-Gruppen hr-team/beschaeftigte in 4.2 streichen und den Satz in 9.1 an 4.1 angleichen: Die Zuordnung trifft allein das Portal.
(e) isActive-Prüfung in einem eigenen Wrapper, den alle /api/mein-Routen nutzen müssen.
S2-Tests ergänzen: beschaeftigte-gate.test.ts. Eine Beschäftigten-Sitzung bekommt auf jedem Nicht-/api/mein-Pfad 403, mit Segmentgrenze wie bei apiPfadErlaubt. Ein Protokolleintrag einer Beschäftigten scheitert nicht am Fremdschlüssel.

#### F8 · MAJOR · Security · bestätigt
**Bestehende Sitzungsverlängerung hebt die 8-Stunden-Grenze und die isActive-Sperre auf**  
*Ort (Fassung 5):* 4.3, Z. 689-696; 5.2, Z. 921; 15, Z. 4362  
*Problem:* Der Plan sagt zu, dass eine Sitzung spätestens nach 8 Stunden endet. GET /api/auth stellt aber für jede noch gültige Sitzung ein neues Token mit voller Laufzeit aus, ohne Obergrenze und ohne Datenbankabfrage. Die Oberfläche ruft das über ‚Sitzung verlängern‘ auf. Der isActive-Check sitzt laut Plan nur im API-Wrapper, und /api/auth läuft nicht über ihn. Für HR-Sitzungen (7 Tage) ist gar keine isActive-Prüfung vorgesehen. Dabei sieht ein HR-Konto alle IBANs und SV-Nummern, und weder die Sperre in Entra noch die in Keycloak beendet eine laufende Portalsitzung.  
*Warum:* Eine einmal erlangte Sitzung lässt sich unbegrenzt verlängern, etwa eine am geteilten Rechner liegen gelassene oder die einer ausgetretenen Person. Die Zusage ‚spätestens nach 8 Stunden‘ stimmt deshalb nicht. Ein ausgetretenes HR-Mitglied behält bis zu 7 Tage Vollzugriff, und diese Frist lässt sich ebenfalls verlängern.  
*Fix:* In 4.3 unter „Deshalb zwei kleine Festlegungen“ einen dritten Punkt ergänzen: „Verlängern nur bis zur festen Grenze. Die Sitzung trägt den Anspruch anmeldungAm. Er kommt in SessionPayload und wird von verifySessionToken durchgereicht (heute wirft die Funktion alles außer den fünf Feldern weg). GET /api/auth übernimmt anmeldungAm unverändert und setzt die Ablaufzeit (exp) auf höchstens anmeldungAm + Rollenlaufzeit (Beschäftigte 8 h, HR 7 Tage). Vorher prüft GET /api/auth isActive (Employee bzw. User) und antwortet sonst mit 401. Das maxAge des Cookies folgt derselben Rollenlaufzeit.“

Zusätzlich die isActive-Prüfung je Anfrage im Wrapper auf HR-Sitzungen ausdehnen (User.isActive, dieselbe einzelne Abfrage). Andernfalls muss der Plan in Z. 689-690 ausdrücklich sagen, dass eine laufende HR-Sitzung nach Sperrung bis zu 7 Tage weiterläuft, und das als zu tragendes Restrisiko in Abschnitt 14 zur Entscheidung stellen.

S1 („Sitzung wie heute“) und S2 entsprechend anpassen. Den Test sitzung-beschaeftigte.test.ts um zwei Fälle ergänzen: Verlängerung nach Ablauf von anmeldungAm + 8 h und Verlängerung bei isActive = false liefern 401.

Einfachere Alternative für Beschäftigte: GET /api/auth lehnt die Rolle Beschäftigte grundsätzlich ab, und die Sitzung endet hart nach 8 h. Die erneute Anmeldung über Entra geht per SSO ohne Passwort. Dann sollte im Plan aber stehen, wie lange Formulareingaben vor dem Ablauf gesichert werden.

#### F9 · MAJOR · Security · bestätigt
**Lokale Keycloak-Passwörter umgehen Entra-Sperre und zweiten Faktor; die Sperre bei Austritt ist so nicht baubar**  
*Ort (Fassung 5):* 5.1, Z. 856; 5.2, Z. 908 und 921; 5.3, Z. 941; 9.1, Z. 2021-2022  
*Problem:* Der Plan behält im selben Realm für alle sichtbar das Formular ‚Mit E-Mail und Passwort anmelden‘. Ein föderierter Benutzer kann in Keycloak ein lokales Passwort bekommen: sicher durch die HR-Leitung mit manage-users in der Keycloak-Verwaltung, vermutlich auch selbst über ‚Passwort einrichten‘ in der Kontokonsole (für 26.8 ungeprüft). Mit diesem Passwort meldet er sich an Entra vorbei an, ohne Microsoft-MFA (E-S8) und auch nach Sperrung des Dienstkontos. Zugleich behauptet 5.1, der Abgleich sperre den Keycloak-Zugang. 5.2 schließt die dafür nötige Admin-API-Anbindung aber ausdrücklich aus. Für HR-User gibt es überhaupt keine Kopplung an den Austritt.  
*Warum:* Die Aussagen ‚Mit dem Dienstkonto endet der Zugang von selbst‘ und ‚Doppelt gesichert‘ stimmen nicht. Wirksam bliebe nur das isActive des Portals. Das fehlt bei HR und greift bei Verzug in DokuBit zu spät; der Plan nennt selbst bis zu drei Wochen.  
*Fix:* Minimale Änderungen am Plan:

(a) 4.5, neue Zeile „Lokale Passwörter nur für Weg A“:
- Die Kontokonsole wird abgeschaltet: Client account-console deaktivieren und manage-account aus den Default-Rollen des Realms nehmen. So kann sich niemand selbst ein lokales Passwort einrichten. Ein Profil, das Benutzer selbst ändern, braucht das Portal nicht.
- Mapper vom Typ „User Session Note“ für identity_provider ins ID-Token, dazu der Gruppen-Claim.

(b) 4.3/S1, Callback-Regel: Eine Sitzung für Beschäftigte oder HR entsteht nur, wenn identity_provider gleich dem Entra-Alias ist. Ausnahme ist die Keycloak-Gruppe „lokal“ (Weg A), deren Mitglieder ein OTP haben müssen. Für HR-User prüft der Callback außerdem User.isActive, wie heute authenticateUser es tut. In anmeldung-callback.test.ts kommen zwei Fälle dazu: „lokale Anmeldung ohne Gruppe lokal → kein Zugang“ und „User.isActive=false → kein Zugang“.

(c) Z. 856 richtigstellen. Neuer Wortlaut: „isActive = false — das Portal verweigert ab dann Anmeldung (Callback) und jede Anfrage; Keycloak selbst bleibt unberührt.“ Z. 921 und Z. 941 sprachlich entsprechend anpassen. Z. 4057 ergänzen: „außer bei lokalen Weg-A-Konten“.

(d) Zuständigkeitstabelle (Z. 419) bzw. 4.4: Beim Austritt eines HR-Mitglieds setzt die HR-Leitung User.isActive = false. Das ist ein Punkt der Offboarding-Checkliste.

Ein bedingter Browser-Ablauf in Keycloak ist nicht nötig. Die Prüfung im Callback reicht und ist einfacher zu warten.

#### F10 · MAJOR · Security · bestätigt
**Besondere Kategorien: Freitexte unverschlüsselt, Erstfreigabe und Umstufung fehlen**  
*Ort (Fassung 5):* 11.2, Z. 3076-3077 und 3109; 11.3, Z. 3188, 3205, 3294-3298; 12.3, Z. 3600-3604  
*Problem:* Mit dem BEM-Schlüssel verschlüsselt wird nur datenBesonders. Rückfragen, Antworten, Notizen, Abschlussvermerk und Ablehnungsgrund liegen im Klartext, obwohl gerade dort etwa bei der Erkrankung eines Angehörigen die Gesundheitsangaben stehen. Das BEM-Vorbild verschlüsselt genau diese Freitexte. Ungeregelt ist auch, wer bei einem von der Beschäftigten eingereichten Art.-9-Anliegen die erste AnliegenZugriff-Freigabe bekommt. Ohne Eintrag sieht es niemand, und ohne Regel entsteht ein Durchgriff für Administratoren. Schließlich fehlt ein Weg, ein Mail-Ticket mit Gesundheitsangaben nachträglich als besondere Kategorie einzustufen.  
*Warum:* Art.-9-Daten stünden im Klartext in der Datenbank und in den pg_dump-Sicherungen. Die Aussage in 12.3 gegenüber dem DSB geht damit zu weit. Ein unsichtbares Ticket verpasst seine Frist, und ein Notbehelf mit Durchgriff hebelt das Zugriffsmodell aus.  
*Fix:* (a) In 11.2/11.3 ergänzen: Bei besondereKategorie = true werden AnliegenAntwort.text, AnliegenNotiz.text, abschlussVermerk, ablehnungsGrund und anlassBezeichnung mit encryptBem gespeichert und nur nach canAccess-Prüfung entschlüsselt. Mail-Betreffe und Protokolle dieser Vorgänge tragen keinen Anlass. Test in anliegen-dienst.test.ts.

(b) In 11.3 eine Regel zur Erstfreigabe: Beim Anlegen eines Vorgangs mit besondereKategorie oder zugriffBeschraenkt bekommen die Nutzer automatisch einen AnliegenZugriff-Eintrag, die für diese Art benannt sind. Benannt werden sie über einen neuen Katalogeintrag wie zugriffStelle: "BEM_BEAUFTRAGTE" | "DSB_BEARBEITER", aufgelöst über ein User-Flag nach dem Muster isBemBeauftragte. Das geschieht in derselben Transaktion und wird protokolliert. Gibt es keine benannte Person, ist die Anlage gesperrt und beim Start erscheint ein Hinweis, wie beim DSB-Eintrag (Z. 3649). Die Fristeskalation geht an diese Stelle, nicht an die HR-Leitung ohne Zugriff.

(c) In 11.4 ein Merkmal besondereKategorie an SonderurlaubAnlass (true für die Buchst.-e-Fälle der TV-L-Vorlage). Beim Anlegen wird es auf das Anliegen kopiert.

(d) In 9.7 die Aktion „als besondere Kategorie einstufen“ (nur Richtung strenger): Sie setzt das Flag, vergibt die Freigaben nach (b), schlüsselt die Freitexte nach (a) um und protokolliert. Die bisherigen Bearbeiter verlieren den Zugriff, sofern sie nicht benannt sind.

(e) Z. 3602 präzisieren: „Formularangaben und Freitexte dieser Vorgänge verschlüsselt mit dem BEM-Schlüssel; Nachweisdateien nach 12.4“.

#### F11 · MAJOR · Security · bestätigt
**Abmelden am geteilten Rechner wirkt bei Weg C nicht, weil die Microsoft-Sitzung bestehen bleibt**  
*Ort (Fassung 5):* 4.3, Z. 705-707; 9.1, Z. 2028  
*Problem:* Der Plan begründet die Abmeldung bei Keycloak mit den geteilten Rechnern im Lehrerzimmer. Bei der Föderation an Entra ID bleibt aber die Microsoft-Sitzung im Browser bestehen. Der nächste Klick auf ‚Anmelden‘ führt laut 9.1 mit Anmeldehinweis direkt zu Microsoft und meldet ohne Passworteingabe wieder als vorige Person an. Eine Weitergabe der Abmeldung an Entra ist nicht vorgesehen.  
*Warum:* Die nächste Person am Lehrerzimmer-Rechner arbeitet unter der Identität der vorigen, bis hin zur Bankverbindungsmeldung in deren Namen.  
*Fix:* In 4.3 den dritten Spiegelpunkt (Z. 705-707) so ergänzen:

„Bei Weg C reicht das nicht. Die Abmeldung muss bis zu Microsoft durchgehen, sonst meldet der nächste Klick auf ‚Anmelden‘ ohne Passwort wieder als vorige Person an. Deshalb gilt:
(1) Entra wird in Keycloak als generischer Anbieter ‚OpenID Connect v1.0‘ über den Discovery-Endpunkt des Tenants angelegt, nicht als eingebauter Anbieter ‚Microsoft‘. Die Logout-URL ist der `end_session_endpoint`, ‚Backchannel logout‘ ist aus, ‚Send ID token on logout‘ ist an.
(2) In der App-Registrierung trägt die IT die Rücksprungadresse von Keycloak für die Abmeldung (`…/broker/<alias>/endpoint/logout_response`) als Umleitungs-URI ein.
(3) ‚Abmelden‘ im Portal ist eine Weiterleitung des Browsers, kein `fetch`: Das Portal löscht sein Cookie und leitet auf den `end_session_endpoint` von Keycloak weiter, mit `client_id` und fest hinterlegter `post_logout_redirect_uri`.
(4) Der Hinweis auf der Abmeldeseite lautet: ‚Sie sind auch bei Microsoft abgemeldet.‘ Das gilt für den ganzen Browser, also auch für Outlook im Web.“

In S1 (Z. 3768) „Abmelden auch bei Keycloak“ ersetzen durch „Abmelden bis zu Microsoft (4.3)“ und als Abnahme ergänzen: „Nach dem Abmelden verlangt ‚Anmelden‘ am selben Browser wieder Konto und Passwort bei Microsoft.“ Dieselbe Prüfung in die Quartalsroutine in 4.5 (Z. 740) aufnehmen.

`prompt=select_account` nicht übernehmen: Es schützt bei einer offenen Microsoft-Sitzung nicht und kostet bei jeder Anmeldung einen Klick.

#### F12 · MAJOR · UI/UX · bestätigt
**Zurückziehen: kein Bedienweg, keine Bestätigung, Anzeige und Mail lauten „Abgelehnt“**  
*Ort (Fassung 5):* 8.1 Z. 1641–1643; 8.6 Zeile 11, Z. 1890; 9.5 Z. 2240–2265; 11.4 Z. 3380  
*Problem:* Beschäftigte können ihr Anliegen zurückziehen. Gespeichert wird das als ABGELEHNT mit dem Grund „zurückgezogen“. Keine Maske zeigt dafür einen Knopf, eine Bestätigung ist nicht vorgesehen. Nicht festgelegt ist, was Statuspille, Verlauf und Mail #11 („Abgelehnt oder zurückgezogen – mit Pflichtbegründung“) der Beschäftigten anzeigen. Offen bleibt auch, ob ein noch offener Genehmigungslink der Schulleitung entwertet wird.  
*Warum:* Ohne Festlegung zeigt „Meine Anfragen“ für den eigenen Rückzug die Pille „Abgelehnt“, und die Mail meldet eine Ablehnung. Das verunsichert und erzeugt Anrufe. Ein versehentlicher Fingertipp am Handy ohne Bestätigung lässt sich nicht zurücknehmen. Die Schulleitung kann einen zurückgezogenen Antrag weiter genehmigen.  
*Fix:* (a) In 8.1 und 11.2: Der Rückzug wird nicht über den Freitext erkannt, sondern über ein Feld `abschlussArt String?` mit den Werten ABGELEHNT und ZURUECKGEZOGEN. Es gilt dasselbe Muster wie für den Status, also Wertliste mit Test. Der Status bleibt ABGELEHNT, damit 11.4 unverändert bleibt. Beide Sichten zeigen bei ZURUECKGEZOGEN eine graue Pille „Zurückgezogen“, wie im Bestand bei unterlagen.ts:1711.
(b) In 9.5 auf der Detailseite der Beschäftigten (S3): ein Knopf „Anliegen zurückziehen“ als sekundäre Aktion. Er erscheint nur in EINGEGANGEN, GENEHMIGUNG und RUECKFRAGE. Vorher öffnet sich der BestaetigungsDialog aus ux-umbau mit dem Satz „Die Personalabteilung bearbeitet Ihr Anliegen dann nicht weiter.“ Die Begründung ist für die Beschäftigte freiwillig. Ab IN_BEARBEITUNG geht ein Rückzug nur über eine Antwort an HR.
(c) In 8.6, Zeile 11: Die Vorlage verzweigt wie Zeile 3. Beim Rückzug gibt es keine Pflichtbegründung und nicht das Wort „abgelehnt“. Ist eine Bearbeiterin zugewiesen, bekommt sie einen Hinweis. Die Zahl der Vorlagen bleibt bei 13.
(d) Klarstellung in 11.3: Beim Rückzug werden offene AnliegenLink-Einträge mit entwertetGrund = ZURUECKGEZOGEN entwertet. Die Link-Prüfung lehnt Endzustände ab, wie es unterlagen.ts:1097 heute schon tut.

#### F13 · MAJOR · Performance · bestätigt
**Stammabgleich: Stapel bis 200 bei ~600+ Zeilen, Stilllegen über mehrere Aufrufe nicht definiert**  
*Ort (Fassung 5):* 5.1, Z. 770–771, 852–857, 872–878; 13 Paket S0, Z. 3741–3749; 14 E-S15, Z. 4145–4146  
*Problem:* S0 übernimmt die Stapelgrenze 200 des Vertragsende-Webhooks. Der Stamm hat rund 600 Beschäftigte, laut 5.1 sogar eine Zeile je Person und Mandant. Das sind mindestens drei bis vier Aufrufe je Nacht. Gleichzeitig filtert die neue Abfrage auf „aktiv beschäftigt“. Ausgetretene kommen also gar nicht mehr an, und MASTATUS kann in gelieferten Zeilen nie „ausgetreten“ sein. „Stilllegen“ lässt sich dann nur aus dem Fehlen in der Lieferung ableiten. Wann eine Lieferung über mehrere Stapel vollständig ist, legt der Plan nirgends fest: kein Laufkennzeichen, kein Abschlussaufruf, keine Plausibilitätsgrenze.  
*Warum:* Die naheliegende Umsetzung („wer in diesem Aufruf fehlt, wird stillgelegt“) legt mit dem ersten Stapel jede Nacht rund 400 Personen still. Weil isActive bei jeder Anfrage geprüft wird, enden dabei auch deren Sitzungen. Bricht n8n nach Stapel 2 ab, bleiben Hunderte bis zur nächsten Nacht ausgesperrt. Die vorsichtige Umsetzung legt dagegen nie jemanden still – also genau den Fall, den Z. 797 ausschließen will. Dazu kommt die Laufzeit: Nach dem Bestandsmuster stellt jede Zeile eigene Abfragen (Kette Personalnummer → E-Mail → Name, Anlage, Anstellungen). Das sind einige Tausend Abfragen nacheinander.  
*Fix:* Zwei Stellen im Plan ändern:

1. In 5.1 bei „Was der Lauf tut“ (Z. 856) und in S0 (Z. 3745) eine Regel festschreiben: Eine Stilllegung wird nie aus dem Fehlen einer Person in einem einzelnen Aufruf abgeleitet. Dazu eine Variante wählen:
   - **(A, empfohlen):** Die Abfrage liefert die aktiven Beschäftigten und dazu die Austritte der letzten 30 Tage, jede Zeile mit MASTATUS bzw. EVTLLDA. Stillgelegt wird nur eine Zeile, die ausdrücklich als ausgetreten kommt. Damit ist jeder Stapel für sich gültig, und die Stapelgrenze 200 kann bleiben. Z. 874 und Z. 4146 entsprechend ändern: Der Filter heißt dann „aktiv oder kürzlich ausgetreten“.
   - **(B):** n8n sendet eine Laufkennung je Ausführung und zum Schluss einen Abschlussaufruf. Erst dieser legt still, wessen lastSyncAt vor dem Laufbeginn liegt. Wären mehr als 5 % oder mehr als 20 Personen betroffen, bricht er ab und meldet einen Zweifelsfall.

2. Die Testliste in S0 (Z. 3753) um einen Fall ergänzen: „Teillieferung (ein Stapel von mehreren) legt niemanden still“.

Die Maps zur Laufzeit sind optional und nicht nötig, weil die Last unkritisch ist.

#### F14 · MAJOR · Performance · bestätigt
**Jahresverbrauch nach Anlagejahr statt Kalenderjahr der Freistellung; der Index trägt die falsche Achse**  
*Ort (Fassung 5):* 11.4, Z. 3374–3389; 11.2, Z. 3131; 6.2, Z. 1203; 8.3, Z. 1710; 8.2, Z. 1693–1695  
*Problem:* Der Deckel wird als Summe „im Vorgangsjahr“ gerechnet und vom Index [employeeId, art, erstelltAm] getragen. Das Vorgangsjahr ist im Portal das Jahr der Anlage, denn vorgangsjahr.ts zählt über createdAt. Der Tarifdeckel gilt aber je Kalenderjahr der Freistellung, und der Plan lässt rückwirkende Anträge ausdrücklich zu. Zeiträume über den Jahreswechsel sind nicht geregelt. Personen mit zwei Anstellungen und zwei Regelwerken auch nicht, denn die Summe läuft „über alle Anliegen dieser Person“.  
*Warum:* Beispiel: Ein Kind ist vom 29. bis 31.12. krank, der Antrag kommt am 4.1. Die Tage zählen dann auf das neue Jahr. Im alten Jahr greift die Deckelsperre nicht, im neuen fehlen der Beschäftigten zu Unrecht Tage. Bei zwei Anstellungen verbraucht eine Freistellung im Minijob den TV-L-Deckel der Lehrkraft. Das führt zu fehlerhaften Bescheiden mit Entgeltwirkung.  
*Fix:* Änderungen am Plan:

1. In 11.4 Z. 3376 ersetzen: „im Vorgangsjahr“ durch „deren vonDatum im selben Kalenderjahr liegt wie das vonDatum des neuen Antrags“. vonDatum ist @db.Date, daher gilt der Vergleich als Datumsbereich [JJJJ-01-01, JJJJ+1-01-01). Dafür ist keine Zeitzonenrechnung nötig.
2. Den Filter in derselben Zeile ergänzen: art = ARBEITSBEFREIUNG, zaehltAufDeckel = true, Status ≠ ABGELEHNT. Außerdem dieselbe employmentId, solange die Anstellungen bei verschiedenen Rechtsträgern bestehen. Beim selben Rechtsträger entscheidet HR, ob der Deckel gemeinsam gilt. Das kommt als offener Punkt zu E-S11.
3. In 11.2 Z. 3131 @@index([employeeId, art, erstelltAm]) ersetzen durch @@index([employmentId, art, vonDatum]). Den Verweis in 11.4 Z. 3386/3387 entsprechend anpassen.
4. In 9.3 bzw. 11.4 einen Satz ergänzen: Ein Zeitraum über den Jahreswechsel wird im Formular nicht angenommen; dafür stellt man zwei Anträge.
5. Die Sperre „erst sperren, dann zählen“ bleibt unverändert.
6. In 13/S4 Z. 3858 bei regelwerk.test.ts ergänzen: Ein rückwirkender Antrag im Januar für Dezember zählt auf Dezember; ein Zeitraum über den Jahreswechsel wird abgewiesen.

#### F15 · MAJOR · Performance · bestätigt
**Löschlauf erfasst die Chronik nicht: AuditLog.anliegen ohne onDelete wird auf NULL gesetzt**  
*Ort (Fassung 5):* 11.1, Z. 3024–3030; 12.3 Löschung, Z. 3619–3624; 8.4, Z. 1795–1797  
*Problem:* AuditLog.anliegen ist im Delta ohne onDelete deklariert. Prisma setzt bei optionalen Beziehungen dann SetNull. Der Löschlauf löscht das Anliegen, und die Kaskade erfasst laut Plan nur Antworten, Notizen, Links und Dateien. Die Chronik-Zeilen im AuditLog bleiben mit anliegenId = NULL und vollem details-Inhalt stehen, zum Beispiel mit der Absenderadresse aus dem Fremdabsender-Ereignis in 10.2. Einen Aufräumweg für AuditLog gibt es im Bestand nicht.  
*Warum:* Die Löschfristen aus 12.3 werden für die Chronik nicht eingehalten (Speicherbegrenzung nach Art. 5 Abs. 1 Buchst. e DSGVO bzw. DSG-EKD). Danach lassen sich die Zeilen keinem Vorgang mehr zuordnen, weder für eine Auskunft noch für eine gezielte Bereinigung. Die Tabelle wächst um verwaiste Zeilen, die niemand mehr gezielt löschen kann.  
*Fix:* Mindestens diese Stellen im Plan ändern:

(a) 11.1, Z. 3027, auf die einfachste Variante umstellen:
`anliegen Anliegen? @relation(fields: [anliegenId], references: [id], onDelete: Cascade)`
Dazu ein Satz: Das ist eine bewusste Abweichung vom SetNull-Muster der sieben Bestandsmodule, weil Anliegen nach Frist hart gelöscht werden.

(b) 12.3, Z. 3619–3621: In der Klammer die Kaskade auf „Antworten, Notizen, Links, Dateien, Zugriffe und Chronik (AuditLog)“ erweitern. Ergänzen: Nach der Löschung schreibt der Lauf genau einen AuditLog-Eintrag ohne anliegenId, mit processType „ANLIEGEN“, action „ANLIEGEN_GELOESCHT“ und in details nur Nummer, Art und Löschdatum. Vorbild ist der Löschnachweis in src/lib/laeufe/bem-aufbewahrung.ts:75-85, nicht dessen Erhalt des AuditLog.

(c) 8.4, Z. 1795f.: „nie überschrieben oder gelöscht“ präzisieren zu „bis zum Ablauf der Aufbewahrungsfrist (12.3) nie überschrieben oder gelöscht“.

(d) Testfall in das Paket mit dem Löschlauf aufnehmen: Nach dem Lauf gibt es keine AuditLog-Zeile mehr mit Bezug auf das gelöschte Anliegen, dafür genau einen Löschnachweis ohne Inhalt.

Wer die Chronik als Nachweis behalten will (BEM-Weg), muss stattdessen eine Hülle mit Status GELOESCHT vorsehen statt hart zu löschen, und eine eigene Frist für die Chronik in die Löschtabelle aufnehmen. Eines von beiden muss im Plan entschieden sein.

#### F16 · MAJOR · Architecture · bestätigt
**Auslieferung „mit dem Seed“ kommt in Produktion nie an**  
*Ort (Fassung 5):* 6.2 (Z. 1144, 1164-1173), 11.3 (Z. 3319-3322), 11.4 (Z. 3367-3369)  
*Problem:* Die TV-L-Vorlage (feste Kennung) und die globalen Katalogzeilen je Art (anliegen_katalog:<ART>:global) sollen „mit dem Seed“ kommen. Der Entrypoint startet prisma/seed.js aber nur, wenn noch kein Benutzer existiert. Auf dem Produktivserver läuft der Seed also nie. Neue Grunddaten für Bestands-Datenbanken liefert im Haus nur eine ensure-/migriere-Funktion in prisma/seed-check.js.  
*Warum:* Nach dem Deploy von S3/S4 gibt es in Produktion keine Katalogzeilen (aktiv ist ohnehin standardmäßig false) und kein TV-L-Regelwerk. Der Katalog bleibt leer, die Rücknahme „aktiv = false“ hat keine Zeile zum Umschalten, und HR kann kein Regelwerk zuweisen. Das fällt erst beim Go-Live auf.  
*Fix:* In 6.2, 11.3 und 11.4 „Seed“ durch die Startmigration in prisma/seed-check.js ersetzen. Sie folgt dem Muster migriereAusstattungStandardkatalog und kommt in main() nach dem Schema-Abgleich und vor der userCount-Prüfung:
- (a) ensureTvlRegelwerk(): Das Regelwerk mit fester Id und seinen Anlässen wird nur angelegt, wenn die feste Id fehlt, und zwar in einer Transaktion. Nie update oder delete.
- (b) ensureAnliegenKatalog(): Je Art aus src/lib/anliegen/katalog.ts wird die globale Zeile `anliegen_katalog:<ART>:global` per upsert mit `update: {}` und `aktiv = false` angelegt. Die Art Arbeitsbefreiung ist ausgenommen (6.2: kein globaler Eintrag).

Da seed-check.js auch auf frischen Datenbanken vor seed.js läuft, kommt nichts davon in seed.ts. Einen Gleichhaltetest braucht es dann nicht.

Den Satz Z. 1171-1173 korrigieren in: „Die Startmigration legt nur an, was unter der festen Id fehlt, und ändert nie Bestehendes.“

In S3 und S4 je einen Test und einen Abnahmepunkt ergänzen: Ein zweiter Lauf auf einer Datenbank mit Benutzern legt nichts doppelt an und ändert nichts. Nach dem Deploy auf eine Bestandskopie sind das Regelwerk und die globalen Zeilen vorhanden.

#### F17 · MAJOR · Architecture · bestätigt
**Statusmodell ohne Übergangstabelle: Verwerfen, Wiedereröffnung und Zurückziehen nicht festgelegt**  
*Ort (Fassung 5):* 8.1 (Z. 1637-1646), 9.10 (Z. 2548-2552), 11.2 (Z. 3116), 10.2 (Z. 2795)  
*Problem:* Der Plan nennt acht Zustände, aber nicht, welche Übergänge erlaubt sind, wer sie auslöst und welche Nebenwirkungen sie haben (fristRuhtSeit, laufendSchluessel, erledigtAm, Mail-Ereignis). Maske 9.10 zeigt „Kein Anliegen / Verwerfen“, bei dem „nur das Ticket entfällt“. Dafür gibt es keinen Zustand, und gelöscht werden darf nach 8.4 nichts. Wiedereröffnung gibt es nur als Zähler. Es fehlt, was eine Mail-Antwort auf ein ERLEDIGT- oder ABGELEHNT-Ticket auslöst (10.2 regelt nur RUECKFRAGE) und was mit einem inzwischen neu belegten laufendSchluessel passiert. „Zurückgezogen“ steckt als Freitext in ablehnungsGrund.  
*Warum:* Jede Entwicklerin baut die Übergänge anders, und anliegen-status.test.ts hat keine Vorgabe, gegen die er prüft. Wird das Verwerfen als Löschung gebaut, entstehen Lücken im Nummernkreis und verwaiste Chronik. Ist die Antwort auf erledigte Tickets nicht geregelt, entstehen Dubletten oder still angehängte Mails an geschlossene Vorgänge. Die Auswertung unterscheidet Ablehnung und Rücknahme nur über einen Textvergleich.  
*Fix:* 1. In 8.1 nach der Wertliste eine kompakte Übergangstabelle aufnehmen, als Abnahmegrundlage für anliegen-status.test.ts. Spalten: von → nach | Auslöser (Beschäftigte, HR, Magic Link, Postfachabruf) | Feldwirkung (fristRuhtSeit, erledigtAm, laufendSchluessel, Wartezähler) | Ereignis-Nr. aus 8.6. Alle nicht aufgeführten Übergänge werden mit 409 abgewiesen.

2. Verwerfen ohne neuen Zustand, damit „acht Zustände“ überall stimmt: Verwerfen ist nur aus NICHT_ZUGEORDNET erlaubt und führt nach ABGELEHNT mit dem festen Grund „Kein Anliegen“. Es geht keine Mail hinaus, denn das Ticket hat keine Person. Ereignis 11 nur bei gesetzter employeeId. In 9.10 Z. 2552 den Satz ändern zu „Das Ticket wird ohne Nachricht geschlossen; Nummer und Verlauf bleiben.“

3. Wiedereröffnung festlegen: Eine Antwort (Mail oder Portal) auf ERLEDIGT oder ABGELEHNT innerhalb von 14 Tagen nach erledigtAm wird angehängt. Der Vorgang geht nach IN_BEARBEITUNG mit erledigtAm = null und wiedereroeffnungen + 1, der laufendSchluessel wird in derselben Transaktion neu gesetzt. Ist der Schlüssel belegt (P2002) oder die Frist verstrichen, entsteht ein neues Ticket mit bezugModul = "ANLIEGEN" und bezugId = altes Ticket (das Feld sieht 11.2 bereits vor). In 10.2 Schritt 4 einen Satz dazu ergänzen. In 9.7 im Menü „⋯“ den Eintrag „Wieder öffnen“ für HR vorsehen.

4. In der S3b-Rücknahme (Z. 3839f.) ergänzen: „zurückziehen ohne Benachrichtigung (Ereignis 11 unterdrückt)“.

Das Feld abschlussArt aus dem Finding entfällt. Zurückziehen als Ablehnung mit Grund ist in 8.1 bewusst entschieden.

#### F18 · MAJOR · Architecture · bestätigt
**„Unterlagen nachreichen“: Bezug auf bestehende Vorgänge ist so nicht baubar**  
*Ort (Fassung 5):* 6.1 (Z. 1057), 11.2 (Z. 3070-3073), 13 S0 (Z. 3752)  
*Problem:* Die Beschäftigte soll den Bezug aus „ihren offenen Vorgängen“ wählen (bezugModul/bezugId ohne FK). Die Vorgänge (Elternzeit, Mutterschutz, BEM, Verbeamtung, Vertragsende, Offboarding) haben zwar employeeId, aber keine Oberfläche setzt es. S0 ergänzt es nur beim Abschluss eines Onboardings. Die Liste „meine offenen Vorgänge“ ist also leer. Es fehlen außerdem die Liste der wählbaren Module, die Eigentumsprüfung der vom Client gelieferten bezugId und eine Regel für Vorgänge, die eine Beschäftigte noch nicht kennen darf (etwa ein Vertragsende in Vorbereitung). Als Muster dient UnterlagenDatei.uebernommenId, eine Übernahme-Zielzeile. Das Hausmuster für „Bezug auf einen Vorgang“ ist UnterlagenNachforderung: je Modul ein nullbarer FK mit Cascade.  
*Warum:* Die Funktion liefert im Betrieb nichts oder wird mit einer Ad-hoc-Abfrage über sieben Module gebaut. Dabei droht IDOR über bezugId, und interne HR-Vorgänge könnten offengelegt werden. Ohne FK bleibt bezugId nach dem Löschen des Vorgangs verwaist.  
*Fix:* 1) 6.1, Z. 1057: Den Satz zum Bezug ersetzen durch: „Den Bezug wählt die Beschäftigte aus ihren eigenen offenen Anliegen. Zu einem Vorgang aus einem Fachmodul gibt sie optional die Vorgangsnummer als Freitext an. Die Sachbearbeitung ordnet zu und legt die Datei im Modul von Hand ab. ‚Kein Bezug' bleibt zulässig." Den Halbsatz zum Übernahmevermerk auf das beschränken, was es gibt: Der Vermerk existiert heute nur für Onboarding→Dokument (src/lib/unterlagen.ts:152).

2) 11.2, Z. 3070–3073: `bezugModul` und `bezugId` streichen. Stattdessen aufnehmen:
`bezugAnliegenId String?`
`bezugAnliegen Anliegen? @relation("AnliegenBezug", fields: [bezugAnliegenId], references: [id], onDelete: SetNull)`
`bezugVon Anliegen[] @relation("AnliegenBezug")`
`bezugVorgangsnummer String? // Freitext, max. 40, nur Anzeige für HR`
SetNull statt Cascade, damit das Aufräumen eines älteren Anliegens das neuere nicht mitlöscht. Dazu die Regel mit Test: Der Server prüft `bezugAnliegen.employeeId === employeeId der Sitzung`. Sonst antwortet er mit derselben Meldung wie bei „unbekannt" (vgl. Z. 3661). Das delta.prisma entsprechend anpassen.

3) S4, Z. 3851: „Bezug auf ein eigenes offenes Anliegen oder Vorgangsnummer als Freitext". Test ergänzen: Eine fremde oder unbekannte bezugAnliegenId wird abgewiesen.

4) Abschnitt 15, neue Zeile „Bezug auf Fachmodul-Vorgänge (Welle 2)":
- Voraussetzung: Die Module setzen employeeId verlässlich.
- Umsetzung nach dem Muster UnterlagenNachforderung, also ein nullbarer FK je Modul (schema.prisma:1606–1612).
- Eine feste, im Code benannte Liste der für Beschäftigte sichtbaren Module, ausdrücklich ohne Vertragsende, Offboarding und BEM.

#### F19 · MAJOR · Architecture · bestätigt
**Sichtbarkeit eines Anliegens hängt an vier Quellen, und für die Personalgruppe fehlt das Datenfeld**  
*Ort (Fassung 5):* 5.1 (Z. 799), 6.2 (Z. 1142-1147), 8.2 (Z. 1667), 11.3 (Z. 3312-3322), 11.4 (Z. 3355)  
*Problem:* Ob eine Kachel erscheint, entscheiden laut Plan: (1) die „sichtbaren Personalgruppen“ im Code-Katalog, (2) die Katalogzeile je Mandant bzw. global, (3) bei der Arbeitsbefreiung zusätzlich die Regelwerk-Zuordnung über Anstellung oder Mandant und (4) SonderurlaubAnlass.personalgruppen (String ohne Format). BESCHAEFTIGUNGSGRUPPE soll nach „Personalgruppe“ gehen, aber weder Employee noch Employment haben ein solches Feld, und das Delta fügt keins hinzu. Das vorhandene enum Personalgruppe (TARIF_TV_L, BEAMTER, PLANSTELLENINHABER) hat Elternzeit-Semantik. Nicht festgelegt ist, ob Mandanten- und globale Zeile zeilen- oder feldweise zusammenwirken. Die Empfängerkette in 8.2 nennt die globale Zeile nicht, sodass ein Auskunftsersuchen mit globalem Empfänger DSB bei HR landen könnte.  
*Warum:* Die Personalgruppen-Regel ist nicht auswertbar (S0 kann den Wert nicht speichern, S2/S4 nicht filtern). HR muss für die Arbeitsbefreiung zwei Schalter synchron halten (Regelwerk zugewiesen und Katalogzeile je Mandant aktiv), sonst fehlt die Kachel ohne erkennbaren Grund. Mehrdeutige Vorrangregeln führen zu unterschiedlichen Implementierungen und zu Fehlleitung sensibler Anliegen.  
*Fix:* Minimale Änderungen am Plan:

(1) Zielfeld festlegen:
- In 11.1 bei Employment `beschaeftigungsgruppe String? // Rohwert BESCHAEFTIGUNGSGRUPPE aus DokuBit` ergänzen.
- Alternative: eine bewusste Entscheidung, auf das vorhandene `Employment.contractType` abzubilden. Das ginge nur, wenn sich die DokuBit-Werte eindeutig auf UNBEFRISTET/BEFRISTET/BEAMTER/MINIJOB/EHRENAMT/PRAKTIKUM abbilden lassen.
- Das vorhandene `enum Personalgruppe` (Elternzeit) ausdrücklich nicht verwenden.
- In der Tabelle 5.1 (Z. 799) die Spalte „Im Portal“ auf dieses Feld setzen. In S0 (Z. 3741 ff.) im Abgleich übernehmen.

(2) In E-S15 eine fünfte Abfrage aufnehmen: `SELECT DISTINCT BESCHAEFTIGUNGSGRUPPE`. Aus dem Ergebnis entsteht die Wertliste in `src/lib/constants.ts`, abgesichert mit einem Test.

(3) Format festlegen:
- 11.4 `personalgruppen String[] // leer = alle; Werte aus derselben Wertliste`.
- Die „sichtbaren Personalgruppen“ im Code-Katalog (Z. 3313) bekommen denselben Typ.

(4) In 11.3 einen Satz zum Vorrang ergänzen:
- `aktiv` kommt aus der Mandantenzeile, falls vorhanden, sonst aus der globalen Zeile.
- `fristTage` und `empfaenger` werden feldweise aufgelöst: Mandantenzeile, dann globale Zeile.
- Ausgewertet wird an genau einer Stelle, `src/lib/anliegen/katalog.ts`, mit Tests für vier Fälle: nur global, Mandantenzeile mit leerem Empfänger, Mandantenzeile aus, Personalgruppe passt nicht.

(5) Empfängerkette in 8.2 (Z. 1667) ändern zu: `Mandantenzeile.empfaenger → globale Zeile.empfaenger → Organization.hrEingangEmail → SmtpConfig.replyToEmail`.

(6) In 6.2 (Z. 1145) die Sichtbarkeit benennen: Die Arbeitsbefreiung ist sichtbar, wenn ein Regelwerk auflösbar ist UND die Mandantenzeile aktiv ist UND die Personalgruppe passt. Maske 9.9 zeigt beim Zuweisen eines Regelwerks den Zustand des Katalogschalters für diesen Mandanten an.

#### F20 · MAJOR · Architecture · bestätigt
**Jahresdeckel nach Erstellungsjahr statt Kalenderjahr des Anlasses; Höchstwerte je Anlass nicht abbildbar**  
*Ort (Fassung 5):* 11.4 (Z. 3374-3389), 6.2 Tabelle (Z. 1198-1200), 9.9 (Z. 2495)  
*Problem:* Der Verbrauch ist die Summe der tage „im Vorgangsjahr“, getragen vom Index [employeeId, art, erstelltAm]. Im Haus ist das Vorgangsjahr das Jahr der Anlage (vorgangsjahrInBerlin). § 29 TV-L zählt aber je Kalenderjahr der Freistellung. Ein rückwirkender Antrag im Januar für Ende Dezember zählt so ins falsche Jahr. Die Summe läuft je Person, auch über Anstellungen mit verschiedenen Regelwerken. Außerdem gelten aa „1 je Kalenderjahr“ und bb/cc „bis 4 je Kalenderjahr“ zusätzlich zum Gruppendeckel 5. SonderurlaubAnlass kennt aber nur tagesRegel, tage und zaehltAufDeckel. Maske 9.9 zeigt „bis 2 im Jahr“, ohne dass das Modell es halten kann.  
*Warum:* Das Formular „sperrt beim Überschreiten“. Falsche Zählung verweigert also berechtigte Freistellungen oder lässt mehr zu, als der Tarif hergibt (z. B. fünfmal aa im Jahr). Ein Bescheid wäre dann nicht begründbar, und das ist der Kern des Alleinstellungsmerkmals von Welle 1.  
*Fix:* 1) 11.4, Kasten Jahresverbrauch: „im Vorgangsjahr" ersetzen durch „im Kalenderjahr von vonDatum (Berliner Kalendertag)". Dazu ein Satz: Anliegen mit zaehltAufDeckel dürfen den Jahreswechsel nicht überspannen. Die Zod-Prüfung verlangt vonDatum und bisDatum im selben Jahr, sonst stellt man zwei Anliegen. Das ist einfacher als ein Aufteilen. Den Verweis auf den Index [employeeId, art, erstelltAm] als Träger der Summe streichen und in 11.2 @@index([employeeId, vonDatum]) ergänzen. 2) SonderurlaubAnlass: ein additives Feld jahresHoechstTage Decimal? @db.Decimal(4,2) mit dem Kommentar „Höchstwert je Anlass und Kalenderjahr; TV-L aa 1, bb 4, cc 4". Festlegen, dass tage (FEST/BIS_ZU) immer je Fall gilt. Die Rechnung in 11.4 prüft zusätzlich die Summe je kopierter anlassId im selben Kalenderjahr gegen jahresHoechstTage. 9.9 zeigt „bis X im Jahr" nur aus diesem Feld. 3) Nebenbei: SonderurlaubAnlass.tage als Decimal? @db.Decimal(4,2) statt Float?, gleich wie Anliegen.tage. Die Summe je employmentId statt je employeeId bilden, weil die Anstellung beim Antrag ohnehin abgefragt wird (8.2). 4) S4-Tests in regelwerk.test.ts ergänzen: Antrag im Januar für Erkrankung im Dezember zählt auf das Vorjahr; zweiter aa-Antrag im selben Kalenderjahr wird gesperrt; bb über 4 Tage im Jahr wird gesperrt, auch wenn der Gruppendeckel noch frei ist.

#### F21 · MAJOR · Testing · bestätigt
**Erstzuordnung Anmeldung → Personalakte (E-Mail → keycloakSub) ohne Test**  
*Ort (Fassung 5):* 11.1 (Z. 3038–3046), 4.4 (Z. 715–718), 13/S1 und S2 Tests (Z. 3771–3773, 3789–3791)  
*Problem:* Der einmalige Abgleich über die E-Mail-Adresse legt dauerhaft fest, wessen Vorgänge eine Anmeldung sieht, einschließlich der Bankverbindung. Employee.email ist nullbar und nicht eindeutig. Keine der genannten Testdateien deckt diese Fälle ab: 0, 1 oder mehr als 1 Treffer; abweichende Groß- und Kleinschreibung; Treffer nur bei aktiver Person; sub schon an eine andere Person gebunden (P2002 muss zu „kein Zugang“ führen, nicht zu 500); Person hat schon einen anderen sub; Meldung an HR; dieselbe Person als User (HR) und als Employee. Ungeprüft ist außerdem, ob nur Identitäten aus den eigenen Entra-Verzeichnissen zugeordnet werden (E-S5: eventuell zwei IdPs). Lokal angelegte Keycloak-Konten, deren E-Mail der Nutzer selbst ändern kann, dürften nicht zuordnen.  
*Warum:* Eine Fehlzuordnung bleibt bestehen, weil danach nur noch der sub zählt. Die Person sieht dann die Vorgänge einer anderen. Das ist genau der Fall „ein Zugang, der an die falsche Person gerät“ (Z. 896).  
*Fix:* 1. In 11.1 nach „Ab da gilt nur noch der sub“ die Regel ausdrücklich festhalten:
   - Die Erstzuordnung gelingt nur bei genau einem aktiven Employee, dessen E-Mail ohne Rücksicht auf Groß- und Kleinschreibung übereinstimmt und dessen keycloakSub noch leer ist.
   - Das Festschreiben geschieht bedingt, als updateMany mit der Bedingung keycloakSub = null. Ändert das 0 Zeilen, gibt es keinen Zugang.
   - Bei 0 oder mehr als 1 Treffer, bei inaktiver Person oder bei schon belegtem sub gibt es keinen Zugang, und HR erhält eine Meldung. Nie raten und nie überschreiben, wie in 10.2.
2. Ebenfalls in 11.1 festhalten: Zugeordnet wird nur ein Konto, das über den Entra-Identitätsanbieter kommt (Alias in einer Positivliste, bei zwei Verzeichnissen beide). Die E-Mail muss dabei von Entra stammen. Keycloak wird so eingerichtet, dass der Nutzer die E-Mail weder bei „Review Profile“ noch in der Kontoverwaltung selbst eingeben oder ändern kann. Laut User-Profile darf nur ein Admin die E-Mail bearbeiten.
3. Für lokale Konten (Weg A): Die HR-Leitung setzt die E-Mail beim Anlegen als verifiziert. Der Nutzer kann sie nach der Einstellung aus Punkt 2 nicht ändern. Das ist reine Konfiguration und bleibt im Rahmen von „kein eigener Bau“.
4. Unter S2 → Tests ergänzen: anmeldung-zuordnung.test.ts. Die Zuordnung ist eine reine Funktion mit Fake-DB. Fälle: 0, 1 und mehr als 1 Treffer; abweichende Groß- und Kleinschreibung; nur inaktiver Treffer; Treffer hat schon einen anderen sub; fremder Identitätsanbieter oder nicht verifizierte E-Mail führt zu keiner Zuordnung; Meldung an HR wird erzeugt.

#### F22 · MAJOR · Testing · bestätigt
**8-Stunden-Sitzung wird vom bestehenden Refresh auf 7 Tage verlängert, ohne Test**  
*Ort (Fassung 5):* 4.3 (Z. 689–696), 13/S2 Tests (Z. 3790–3791)  
*Problem:* sitzung-beschaeftigte.test.ts prüft nur „Laufzeit, Abbruch bei isActive = false“. Im Bestand erneuert GET /api/auth jede gültige Sitzung über createSessionToken, und das immer mit SESSION_EXPIRY = 7 Tage. Der Client ruft das aus der Sitzungswarnung auf. Der Plan erwähnt diesen Refresh nicht.  
*Warum:* Eine Beschäftigtensitzung ließe sich gleitend auf 7 Tage und darüber hinaus verlängern. Laut Plan sind die 8 Stunden aber der Ersatz für den fehlenden Back-Channel-Logout und der Schutz an gemeinsam genutzten Rechnern im Lehrerzimmer.  
*Fix:* In 4.3 ergänzen: „Die bestehende Verlängerung (GET /api/auth) setzt für Beschäftigte keine neue Gesamtlaufzeit. Das JWT erhält den Claim angemeldetAm. verifySessionToken gibt ihn ausdrücklich mit zurück (die Feldliste in src/lib/auth.ts:98–104 lässt sonst alles Fremde fallen). createSessionToken setzt die Laufzeit nach Rolle: Für Beschäftigte gilt exp = min(jetzt + 8 h, angemeldetAm + 8 h), für das HR-Team bleiben es 7 Tage gleitend. GET /api/auth prüft für Beschäftigte zusätzlich isActive. Die Sitzungswarnung erhält die Laufzeit als Prop statt der festen 7 Tage.“

Einfachere Alternative: Beschäftigte bekommen gar keinen Refresh. Nach 8 Stunden genügt eine erneute Anmeldung, die über Entra per SSO mit einem Klick geht.

In S2 bei sitzung-beschaeftigte.test.ts drei Testfälle ergänzen:
1. Ein Refresh nach 7 Stunden ergibt kein exp über angemeldetAm + 8 h. Rolle und angemeldetAm bleiben erhalten.
2. Ein Refresh mit isActive = false ergibt 401.
3. Ein Refresh einer HR-Sitzung ergibt weiterhin jetzt + 7 Tage.

#### F23 · MAJOR · Testing · bestätigt
**Stilllegen im Stammabgleich: Lauf über mehrere Stapel ungeregelt und ungetestet**  
*Ort (Fassung 5):* 5.1 (Z. 783–785, 856), 14/E-S15 (Z. 4145–4146), 13/S0 (Z. 3741–3757)  
*Problem:* n8n liefert nur aktive Beschäftigte, weil MASTATUS laut E-S15 „der Filter der neuen Abfrage“ ist. Ausgetretene erkennt der Abgleich also nur daran, dass sie fehlen. Bei rund 600 Personen, eventuell mit einer Zeile je Mandant, und höchstens 200 Einträgen je Aufruf braucht ein Lauf mindestens drei Aufrufe. Der Plan definiert keinen Laufrahmen (Laufkennung, Abschlussaufruf, Plausibilitätsbremse). personalstamm-abgleich.test.ts deckt nur einen einzelnen Stapel ab. Ein Routentest für den Webhook (Bearer, Stapelgrenze, Teilfehler) fehlt ebenfalls, obwohl der Bestand dafür contract-end-webhook.test.ts hat.  
*Warum:* Die naheliegende Umsetzung „nicht im Stapel → stilllegen“ legt bei jedem Aufruf zwei Drittel des Personals still. Dann bekommt jede ihrer Anfragen 401. Ein leerer oder abgebrochener n8n-Lauf würde alle sperren. Ohne jede Regel würde dagegen niemand stillgelegt.  
*Fix:* In 5.1 unter „Was der Lauf tut“ und in S0 das Erkennen eines Austritts ausdrücklich festlegen. Der Plan wählt einen von zwei Wegen.

(A) Bevorzugt, weil einfacher: Die n8n-Abfrage liefert neben den Aktiven auch Personen mit Austritt in den letzten N Tagen und gibt bei jeder Zeile MASTATUS bzw. EVTLLDA mit. Das Portal setzt isActive je Zeile aus dem Statuswert. Der Lauf ist damit unabhängig von den Stapeln und lässt sich beliebig wiederholen; auf das Fehlen einer Person kommt es nicht an. In E-S15 den Satz „Das ist der Filter der neuen Abfrage“ entsprechend ändern.

(B) Nur falls DokuBit Ausgetretene nicht mehr führt: Jeder Lauf trägt eine laufId. Die Stapel werden gesammelt, und stillgelegt wird erst beim Abschlussaufruf. Vorher prüft eine Bremse den Lauf; sie greift, wenn er weniger als etwa 90 % des aktiven Bestands enthält oder mehr als etwa 5 % stilllegen würde. Dann wird nichts stillgelegt, und HR bekommt eine Zweifelsfall-Meldung.

Für beide Wege gilt: Die Bremse gegen Massenstilllegung gehört dazu. Den Satz in Z. 770–771 für den Stamm richtigstellen, denn hier sind es mindestens drei Aufrufe.

In S0 die Tests ergänzen:
- personalstamm-abgleich.test.ts: drei Stapel (plus Abschluss bei B) legen nur die tatsächlich Ausgetretenen still. Ein leerer oder halber Lauf legt niemanden still und löst die Bremse aus. Derselbe Lauf zweimal ändert nichts.
- personalstamm-webhook.test.ts nach dem Vorbild von src/__tests__/api/contract-end-webhook.test.ts: 401 ohne oder mit falschem Bearer, 500 ohne CRON_SECRET, 400 bei leerem oder zu großem Stapel, kaputte Zeile bricht den Stapel nicht ab.

#### F24 · MAJOR · Testing · bestätigt
**Zugriffsbeschränkung (AnliegenZugriff) und Mitarbeitersicht des Verlaufs ohne Test**  
*Ort (Fassung 5):* 8.4 (Z. 1798–1801), 8.5 (Z. 1852–1854), 10.2 (Z. 2884), 11.3 (Z. 3294–3298), 12.3 (Z. 3583–3590), 13/S3 Tests (Z. 3810–3816)  
*Problem:* S3 liefert die „Zugriffsbeschränkung über AnliegenZugriff“ für Art.-9-Vorgänge und Auskunftsersuchen. Außerdem liefert S3 die Mitarbeitersicht der Chronik als feste Liste von action-Werten. Die S3-Testliste nennt für keines von beiden einen Test. Ungeregelt und ungetestet ist auch, wie ein per Mail eingegangenes Auskunftsersuchen (Mails werden immer Freie Anfrage) zur Art „Auskunft“ wird. Dabei müsste AnliegenZugriff gesetzt und der Sachbearbeitung die Sicht entzogen werden. Ebenso ungetestet ist der Protokolleintrag nach dem Muster AKTE_GEOEFFNET.  
*Warum:* An genau diesen beiden Stellen sieht der Plan selbst „die Falle“: interne Notizen oder Mailserver-Details in der Mitarbeitersicht und Gesundheitsangaben, die die ganze Sachbearbeitung sieht. Ohne Test bleibt ein Rückschritt unbemerkt.  
*Fix:* 1) In der S3-Testliste (Z. 3810–3816) zwei Einträge ergänzen:
- anliegen-zugriff.test.ts nach dem Vorbild von bem-permissions.test.ts. Für Anliegen mit besondereKategorie = true oder mit Katalogschalter zugriffBeschraenkt gilt:
  - SUPER_ADMIN, HR_LEITUNG und HR_SACHBEARBEITER ohne aktiven Eintrag erhalten kein Ergebnis in Liste, Detail, Datei-Download und Reiter-Zählern.
  - Mit aktivem Eintrag ist das Lesen erlaubt, nach revokedAt nicht mehr.
  - Das Verwalten der Freigaben ist vom Lesen getrennt.
  - Jedes Öffnen und jeder Download schreibt einen Eintrag nach dem Muster AKTE_GEOEFFNET.
- anliegen-verlauf-sichten.test.ts: Die Mitarbeiter-Route liefert nur action-Werte aus der festen Liste. Sie liefert nie AnliegenNotiz, nie Empfängeradressen oder Fehlertexte aus dem Versandprotokoll und nie Friständerungen oder Erinnerungsstufen. Ein unbekannter action-Wert bleibt unsichtbar (Allowlist).

2) In 10.2 hinter Z. 2884 (Querverweis in 9.10/9.7) den Weg für ein Auskunftsersuchen festlegen, das per Mail eingeht. Vorschlag nach der Vorlage für Elternzeit (Z. 2856–2860), damit kein Widerspruch zur Regel in Z. 1378 entsteht:
- HR legt ein Anliegen der Art „Auskunft und Betroffenenrechte“ neu an.
- Der Eingangszeitpunkt der Mail wird als Fristbeginn übernommen. In 8.3 Z. 1723–1725 kommt dazu eine Ausnahme: Für gesetzliche Fristen läuft die Uhr ab Eingang, auch bei „Nicht zugeordnet“.
- Die Freie Anfrage wird mit neutralem Vermerk geschlossen und erhält dieselbe Zugriffsbeschränkung.
Alternativ eine ausdrückliche Umstufung als benannte Ausnahme zu Z. 1378 zulassen.
Der gewählte Weg kommt mit Fristbeginn und Beschränkung in anliegen-zugriff.test.ts.

#### F25 · MAJOR · Testing · bestätigt
**Fristen in Arbeitstagen: keine Regel, keine Funktion, kein Test; die Abnahme überschätzt den Zeitzonen-Wächter**  
*Ort (Fassung 5):* 8.3 (Z. 1701–1725), 9.6 (Z. 2341), 13 Abnahme (Z. 3731–3732), 13/S3 Tests (Z. 3811–3812)  
*Problem:* Die Fristen stehen in Arbeitstagen (3 oder 5 AT, „nächster Arbeitstag“, „liegen geblieben“ nach 3 AT), dazu kommen Abrechnungsstichtag und „spätestens am Tag vor dem Anlass“. Der Bestand kann keine Arbeitstage rechnen: Es gibt nur naechsterWerktag (Sa/So), Feiertage sind ausdrücklich ausgenommen. Der Plan sagt nicht, ob NRW-Feiertage zählen. Kein Test deckt Fristberechnung oder Erinnerungslauf (drei Stufen, „liegen geblieben“) ab; anliegen-status.test.ts prüft nur Übergänge, Fristenruhe und Wartezähler. Die Abnahme behauptet, sonst schlage der Zeitzonen-Wächter an. Er erkennt aber nur toLocale…String ohne timeZone, nicht toISOString().slice(0, 10) und keine getDate/setDate-Rechnung. Und weil die Frist erst „mit der Zuordnung“ beginnt, stünde bei einem Auskunftsersuchen aus dem Postfach die Monatsfrist zu spät, denn gesetzlich läuft sie ab Eingang.  
*Warum:* Falsche Fristtage (Feiertag, kurz nach Mitternacht UTC, Zeitumstellung am 25.10.) führen zu Fehl-Eskalationen an die HR-Leitung oder zu einer verpassten DSGVO-Frist. Die Abnahme vermittelt dabei falsche Sicherheit.  
*Fix:* (1) In 8.3 einen Satz ergänzen: „Arbeitstag = Montag bis Freitag, Feiertage bleiben außen vor — wie zeitplaner/faelligkeit.ts und ausstattung.ts. Eine Erinnerung kann sich dadurch höchstens verschieben, nie entfallen.“ Dazu: „arbeitstageSpaeter(tag, n) kommt in src/lib/kalendertag.ts, gebaut aus wochentagVon und tageSpaeter.“

(2) fristTage in 11.3 eindeutig machen, zum Beispiel als Kommentar „Arbeitstage; gesetzliche Fristen und Stichtag aus dem Code-Katalog, nicht überschreibbar“.

(3) In 8.3 die Ausnahme zur Zuordnungsregel ergänzen: „Für ‚Auskunft und Betroffenenrechte‘ zählt die Monatsfrist immer ab erstelltAm (Eingang) — auch bei NICHT_ZUGEORDNET und bei Umstufung aus einer Freien Anfrage; sie ruht nie.“

(4) Die S3-Testliste ergänzen:
- anliegen-fristen.test.ts: Ausgangswert je Art, Wochenende, Eingang 22:30 UTC, 25.10.2026, Stichtag im Folgemonat, § 29 vor und nach dem Anlass, Ruhen verschiebt die Frist, DSGVO ab Eingang auch nach Zuordnung oder Umstufung.
- anliegen-erinnerung-lauf.test.ts nach dem Muster von bem-fristen-lauf.test.ts: drei Stufen, „liegen geblieben“, keine Doppelmeldung.

(5) Den Abnahmesatz in Z. 3731–3732 ehrlich formulieren: „Der Zeitzonen-Wächter erkennt nur toLocale…String ohne timeZone; Fristrechnung ohne kalendertag.ts deckt erst anliegen-fristen.test.ts ab.“ Alternativ den Wächter um toISOString().slice(0, 10) erweitern.

#### F26 · MAJOR · Error Handling · bestätigt
**Der Stammabgleich legt Personen still, ohne zu wissen, ob der Lauf vollständig war**  
*Ort (Fassung 5):* 5.1 (Z. 770–776, 784, 797, 856, 873–874); 5.3 (Z. 941); 4.3 (Z. 691–696); 13 S0 (Z. 3741–3757)  
*Problem:* Die neue Abfrage liefert nur aktiv Beschäftigte, in Stapeln bis 200. Bei rund 600 Personen mit einer Zeile je Person und Mandant sind das mehrere Aufrufe. Eintragsfehler brechen den Stapel nicht ab. Wer ausgetreten ist, lässt sich damit nur daran erkennen, dass er in der Lieferung fehlt. Eine Laufklammer, eine Vollständigkeitsprüfung oder eine Plausibilitätsgrenze beschreibt der Plan nicht. Die Zuordnung MASTATUS → isActive (Z. 797) greift nie, wenn schon die Abfrage auf „aktiv“ filtert. Gebaut wie beschrieben gibt es zwei Ausgänge. (a) Fehlen gilt als Austritt: Ein abgebrochener n8n-Lauf, ein Timeout im dritten Stapel oder eine einzelne von Zod verworfene Zeile legt die betroffenen Personen still. (b) Es gibt keine Austrittserkennung: Ausgetretene bleiben aktiv.  
*Warum:* Zu (a): Die Stilllegung wirkt sofort. Die isActive-Prüfung je Anfrage beendet laufende Sitzungen mit 401, und die Mails dieser Personen fallen in „nicht zugeordnet“, weil nur aktive Personen zählen (Z. 2876). Ein Teilausfall von n8n oder MS-SQL wird so zum Ausfall für Hunderte Beschäftigte. Zu (b): Die Zusage aus 4.3 und 5.3, dass die Sitzung mit der Stilllegung endet, liefe ins Leere. Das wäre eine Sicherheitslücke.  
*Fix:* 5.1 „Was der Lauf tut“, Kachel „ausgetreten“ (Z. 856), und S0 (Z. 3741 ff.) ergänzen:

(a) Stillgelegt wird nur ausdrücklich, nie weil jemand fehlt. Die n8n-Abfrage liefert neben den Aktiven auch die Austritte der letzten 90 Tage, mit MASTATUS und EVTLLDA. Der Stichtag für die Sperre ist EVTLLDA, sobald E-S15 klärt, was die Spalte bedeutet. Damit greift die Zeile MASTATUS → isActive (Z. 797) tatsächlich. E-S15 bekommt den Zusatz „Abfrage liefert auch Austritte“.

(b) Sicherheitsnetz: Würde ein Lauf mehr als 15 Personen oder 3 % stilllegen, legt er niemanden still. Er meldet das stattdessen, wie einen Zweifelsfall.

(c) Taucht eine stillgelegte Person wieder als aktiv auf, setzt „auffrischen“ isActive wieder auf true.

(d) Z. 772 präzisieren: Der Stammlauf braucht mehrere Aufrufe. Jeder Stapel wird für sich verarbeitet (idempotent), damit ein Abbruch mittendrin nur Anlegen und Auffrischen unvollständig lässt.

Tests in S0 ergänzen: „Teillauf legt niemanden still“, „leerer Lauf legt niemanden still“, „Zeile mit Formatfehler legt niemanden still“, „Überschreitung der Grenze meldet statt stillzulegen“.

Eine Laufklammer mit laufId, stapelGesamt und Abschlussschritt ist nur nötig, wenn (a) nicht machbar ist und der Austritt doch über das Fehlen erkannt werden muss.

#### F27 · MAJOR · Error Handling · bestätigt
**Dauerhaft scheiterndes Verschieben blockiert den Posteingang, ohne dass es auffällt**  
*Ort (Fassung 5):* 10.2 (Z. 2792, 2800–2821); 9.6 roter Hinweis (Z. 2337–2339); 10.3 (Z. 2935–2938)  
*Problem:* Jeder Lauf liest die 50 ältesten Nachrichten im Eingang. Scheitert das Verschieben, bleibt die Nachricht liegen und kommt im nächsten Lauf wieder zuerst. Die drei Ablageordner haben feste Namen im Code, das Postfach wird aber weiter von Menschen benutzt. Wird „Übernommen“ umbenannt oder gelöscht oder fehlt das Recht, scheitert jedes Verschieben. Dann kreisen dieselben 50 Nachrichten, neue werden nie gelesen. Ob ein gescheitertes Verschieben als Fehler des Laufs zählt, also den roten Hinweis auslöst, ist offen. Dazu zwei Lücken: Bricht der Prozess zwischen Commit und Verschieben ab, wird beim Wiederanlauf nur noch verschoben, und die Eingangsbestätigung entfällt ersatzlos. Und das Ersatz-Ticket für eine kaputte Nachricht trägt laut Plan keinen Prüfschlüssel; gelingt die Verarbeitung später, entsteht ein zweites Ticket.  
*Warum:* Das ist genau der stille Ausfall, den 10.3 verhindern will, nur auf einem anderen Weg. Mails von Beschäftigten bleiben unbearbeitet, und die Eingangsliste wirkt normal.  
*Fix:* 1. Im Kasten von 10.2 nach Z. 2804 einen Satz ergänzen: „Zu Beginn jedes Laufs sucht der Abruf die drei Ordner über ihren Namen und legt fehlende an. Gelingt das nicht, endet der Lauf ohne Verarbeitung mit dem Grundcode ORDNER_FEHLT.“

2. Punkt 3 der Liste (Z. 2812f.) ergänzen: „Ein Lauf, in dem ein Verschieben scheitert, endet mit dem Grundcode VERSCHIEBEN_FEHLGESCHLAGEN und gilt als Fehler im Sinne von 10.3. letzterAbruf wird dann nicht fortgeschrieben.“

3. Den Text in 9.6 (Z. 2338) an 10.3 angleichen: „… länger als 60 Minuten nicht erfolgreich war, der letzte Abruf einen Fehler meldete, oder sein Geheimnis …“.

4. In S3b (Z. 3836f.) die Testliste von postfach-abruf.test.ts um „Ordner fehlt“ und „dauerhaft scheiterndes Verschieben setzt Fehlerstatus“ erweitern.

Optional: In Z. 2817 einen Halbsatz ergänzen: „ebenfalls mit Prüfschlüssel (11.3)“.

Nicht übernehmen: ein neues Feld bestaetigtAm und die Ausnahme vom Limit von 50.

#### F28 · MAJOR · Error Handling · bestätigt
**Ein gescheiterter Versand parkt Tickets in Wartezuständen ohne Zeitgrenze**  
*Ort (Fassung 5):* 8.1 (Z. 1629, 1631); 8.3 (Z. 1710, 1718–1725); 8.6 Zeilen 2 und 6 (Z. 1881, 1885); 11.3 AnliegenLink (Z. 3212–3229); 9.6 (Z. 2340–2342)  
*Problem:* In GENEHMIGUNG und RUECKFRAGE ruht die Frist, und der Erinnerungslauf arbeitet nur über die Frist. Scheitert der Magic Link an die Schulleitung oder die Rückfragemail (FAILED oder SKIPPED), wechselt der Status trotzdem. Das Ticket wartet dann auf jemanden, der nie benachrichtigt wurde. Offen ist auch, was bei Ablauf von gueltigBis geschieht und wer ERINNERUNG_GENEHMIGUNG auslöst. Der Filter „liegen geblieben“ greift nur bei zugewiesenen Tickets. Bei § 29 TV-L ruht damit sogar die Frist „spätestens am Tag vor dem Anlass“. In S3 und S3b, also vor S2, ist die Mail für die Beschäftigte der einzige Kanal.  
*Warum:* Eilfälle wie ein Todesfall (vorrangig) können unbemerkt über den Anlass hinaus liegen bleiben. Die Kennzahlen verbuchen die Zeit als fremde Wartezeit und verdecken den Fehler.  
*Fix:* Ein Absatz in 8.3 hinter Z. 1725 und die Kommentare an AnliegenLink in 11.3 ergänzen:

(1) Gültigkeit und Ablauf der Genehmigung: `gueltigBis` = 5 Arbeitstage, höchstens bis zum Tag vor `vonDatum`. Der Lauf „Anliegen-Erinnerung“ sendet nach 2 Arbeitstagen ohne Entscheidung einmal `ERINNERUNG_GENEHMIGUNG` an die Schulleitung, gemessen über `fristRuhtSeit`. Bei Ablauf entwertet er den Link (`entwertetGrund` = "ABGELAUFEN") und setzt das Ticket auf EINGEGANGEN zurück. Dabei entsteht ein Chronikeintrag „Genehmigung nicht erteilt, Link abgelaufen“, und die Frist läuft wieder. Das ist kein neuer Status und kein neues Ereignis; es greift die HR-Erinnerungsstufe.

(2) Versandfehler in Wartezuständen: Für Genehmigungslink und Rückfragemail das Muster aus UnterlagenLink übernehmen. Der Statuswechsel bleibt bestehen und antwortet mit Warnung. FAILED holt der Lauf nach, höchstens dreimal. SKIPPED oder drei Fehlversuche zeigen in 9.7 unter „Jetzt dran“ den Hinweis „Nachricht nicht zugestellt – Adresse prüfen“ mit dem Knopf „Erneut senden“, in 9.6 als Kennzeichen in der Zeile.

(3) Den Filter „liegen geblieben“ in 9.6 ergänzen: Er erfasst auch nicht zugewiesene Tickets in GENEHMIGUNG mit `fristRuhtSeit` älter als 3 Arbeitstage.

(4) Testumfang: anliegen-status.test.ts (Rücksprung bei Ablauf, Fristwiederanlauf) und genehmigung-link.test.ts (Erinnerung nach 2 Arbeitstagen, Ablauf vor dem Anlass, Nachholen bei FAILED, kein Nachholen bei SKIPPED).

Fix-Punkt (4) des Findings (Rückfrage nach N Tagen) entfällt, weil „liegen geblieben“ ihn schon abdeckt. Fix-Punkt (3) (Anlass-Frist bei vorrangigen Anliegen) höchstens als offene Fachfrage vermerken.

#### F29 · MAJOR · Error Handling · bestätigt
**Eine Antwort auf ein abgeschlossenes Ticket bleibt unbemerkt liegen**  
*Ort (Fassung 5):* 10.2 Zuordnung (Z. 2795, 2824–2848); 9.8 (Z. 2447); 8.6 Zeile 7 (Z. 1886); 11.2 (Z. 3116)  
*Problem:* Die Abschlussmail fordert ausdrücklich zum Antworten auf, und In-Reply-To ordnet die Antwort dem geschlossenen Ticket zu. Der Plan regelt nur, dass eine Antwort die Rückfrage beendet. Für ERLEDIGT und ABGELEHNT fehlt jede Regel. wiedereroeffnungen gibt es als Zähler, aber ohne Auslöser. Ereignis 7 („Antwort eingegangen“ an HR) ist nur für die Rückfrage beschrieben. Die Antwort hängt dann an einem Ticket außerhalb jeder Arbeitsliste.  
*Warum:* Nachfragen und Widersprüche nach dem Abschluss gehen still verloren. Darunter können fristgebundene Erklärungen in Textform sein (10.2, § 16 BEEG), deren Eingang dann niemand sieht.  
*Fix:* 1. In 8.1 nach der Wertliste (Z. 1641) einen Absatz „Wiedereröffnung“ ergänzen:
   - Auslöser: Ein Beitrag der Beschäftigten (Portal oder Mail, richtung MITARBEITER_AN_HR) zu einem ERLEDIGTen oder ABGELEHNTen Anliegen bis 30 Tage nach erledigtAm.
   - Das Anliegen geht in derselben Transaktion auf IN_BEARBEITUNG bei der bisherigen Bearbeiterin. Ist sie nicht mehr aktiv, geht es auf EINGEGANGEN.
   - erledigtAm und loeschenAb werden null, wiedereroeffnungen steigt um 1.
   - Die Frist wird neu nach dem Ausgangswert der Art gesetzt.
   - laufendSchluessel wird wieder gesetzt. Schlägt das wegen P2002 fehl, weil schon ein neueres offenes Anliegen derselben Art besteht, wird nicht wiedereröffnet, sondern wie in Punkt 2 verfahren.
   - Die Chronik erhält den Eintrag „wieder geöffnet“, sichtbar für beide Seiten.
   - Hinweis: Ein wiedereröffnetes Anliegen zählt nach 11.4 wieder auf den Jahresdeckel.

2. Nach Ablauf der 30 Tage legt der Beitrag ein neues Anliegen FREIE_ANFRAGE an, mit bezugModul = "ANLIEGEN" und bezugId = altes Anliegen. Das alte bleibt geschlossen.

3. In 10.2, Schritt 4 (Z. 2795), einen Satz ergänzen: „Eine Antwort auf ein geschlossenes Ticket öffnet es wieder oder legt ein Folgeticket an (8.1).“

4. In 8.6, Zeile 7 (Z. 1886), die HR-Spalte ändern in: „ja — die Frist läuft wieder bzw. das Anliegen ist wieder geöffnet“.

5. In 13 die Tests ergänzen:
   - `anliegen-status.test.ts`: Wiedereröffnung, 30-Tage-Grenze, P2002 auf laufendSchluessel
   - `postfach-zuordnung.test.ts`: Antwort per In-Reply-To auf ein erledigtes Ticket

#### F30 · MAJOR · Error Handling · bestätigt
**Stammabgleich: Teilfehler und Zweifelsfälle verschwinden spurlos**  
*Ort (Fassung 5):* 5.1 (Z. 775–776, 811–819, 857); 13 S0 (Z. 3741–3752)  
*Problem:* Der Empfänger nach dem Bauplan des Vertragsende-Webhooks antwortet auch bei Eintragsfehlern mit HTTP 200 (success:false im Körper). n8n wertet 200 als Erfolg. Zugleich schaltet der Plan für diesen Ablauf das Speichern erfolgreicher Ausführungen ab. Die Fehlerliste wird damit nirgends aufbewahrt. Für „zur Prüfung gemeldet“ (Zweifelsfälle, manuell angelegte Datensätze) gibt es keinen Kanal: kein Modell, keine Maske, kein Ereignis. Die Leseansicht „Personen“ zeigt nur GET /api/employees. Auch ein ausgebliebener Lauf fällt nicht auf; einen Hinweis wie in 10.3 gibt es hier nicht.  
*Warum:* Neue Beschäftigte ohne Datensatz können sich nicht anmelden, weil die Erstzuordnung scheitert, und Zweifelsfälle bleiben ungeklärt. HR erfährt davon erst über Beschwerden.  
*Fix:* In 13 S0 (Z. 3741–3758) und in 5.1 „Was der Lauf tut“ (Z. 852–858) ergänzen, mit möglichst wenig Bauteilen:

(a) Jeder Webhook-Aufruf schreibt einen AuditLog-Eintrag (processType „PERSONALSTAMM“, kein neues Modell). Inhalt: die Zählwerte angelegt, aufgefrischt, stillgelegt, Fehler und Zweifelsfall. Eintragsfehler und Zweifelsfälle stehen darin nur als MANR mit Grundcode (z. B. MANDANT_UNBEKANNT, EMAIL_MEHRDEUTIG, MANUELLER_DATENSATZ), ohne Namen.

(b) Die Leseansicht „Personen“ bekommt einen Block „Zu prüfen“ mit den Zweifelsfällen und Fehlern des letzten Laufs. Behoben wird in DokuBit, eine Zuordnung von Hand gibt es weiterhin nicht. Danach verschwindet der Eintrag mit dem nächsten Lauf von selbst.

(c) Ein roter Hinweis über „Personen“ und auf der Eingangsliste 9.6 nach dem Muster von 10.3. Er erscheint, wenn der jüngste lastSyncAt aller DOKUBIT-Personen älter als 26 h ist oder der letzte Lauf Fehler hatte, und wird beim Öffnen der Seite berechnet.

(d) Im n8n-Ablauf auf success:false eine Verzweigung „Stop and Error“ einbauen. Dadurch gilt der Lauf als Fehllauf, wird trotz abgeschalteter Erfolgsspeicherung aufbewahrt und kann den Fehler-Workflow auslösen. Der Stapel bricht dabei weiterhin nicht ab.

(e) Vor dem ersten Lauf festlegen, wie bestehende Employees mit importSource = null behandelt werden (route.ts:161), sonst landet der Altbestand vollständig in „Zu prüfen“.

(f) In 11.1 (Z. 3044) die „Meldung“ bei gescheiterter Erstzuordnung auf denselben Block „Zu prüfen“ legen.

(g) Den Test personalstamm-abgleich.test.ts um zwei Fälle erweitern: Ein Zweifelsfall erzeugt einen AuditLog-Eintrag ohne Namen, und der Hinweis erscheint bei einem lastSyncAt, der älter als 26 h ist.

#### F31 · MAJOR · Error Handling · bestätigt
**Fehlerpfade der Anmeldung haben weder Maske noch Text**  
*Ort (Fassung 5):* 4.3 (Z. 673–677, 691–696); 9.1 (Z. 1978–2028); 11.1 (Z. 3038–3046); 13 S1-Tests (Z. 3771–3773)  
*Problem:* Beschrieben ist nur der Erfolgsweg. Offen bleiben: ein abgelaufenes state-Cookie (langer MFA-Schritt, zweiter Tab); die Zurück-Taste nach dem Callback (invalid_grant); Keycloak oder Entra nicht erreichbar bzw. error=access_denied oder temporarily_unavailable im Rücksprung. Bei gescheiterter Erstzuordnung „erhält die Personalabteilung eine Meldung“, aber Kanal und Vorlage sind offen; unter den 13 Ereignissen steht sie nicht, und eine Begrenzung je Person fehlt. Bei einer stillgelegten Person mit noch aktivem Dienstkonto prüft der Callback isActive nicht ausdrücklich; jede Anfrage endet dann mit 401 (ungeprüft, ob daraus eine Anmeldeschleife wird). Dass Entra-Fehlertexte (AADSTS…) nie angezeigt werden, steht nicht im Plan.  
*Warum:* Rund 600 Beschäftigte, viele mit wenig Routine (E-S23): Ohne verständliche Seite wird jede Störung zum Anruf bei HR. Eine Meldung je Fehlversuch flutet das HR-Postfach, und rohe Fehlertexte verraten Details des Tenants.  
*Fix:* 1) 4.3, Schritt „Zuordnung“ (Z. 676): „Zugeordnet wird nur auf aktive Datensätze, also User.isActive bzw. Employee.isActive, wie heute in authenticateUser (src/lib/auth.ts:163). Sonst wird keine Sitzung gesetzt.“

2) 9.1 um einen Absatz ergänzen: Jeder Fehler im Callback leitet auf eine Portalseite /login/fehler im CREDO-Look weiter, nie auf JSON oder eine 500. Die Seite kennt drei Texte, gesteuert über eine Fehlerkennung:
(a) Abgelaufen oder abgebrochen: state-Cookie fehlt oder weicht ab, invalid_grant oder error-Parameter im Rücksprung. Text „Die Anmeldung ist abgelaufen“ und ein Knopf „Erneut anmelden“.
(b) Anmeldedienst nicht erreichbar: Discovery oder Token-Tausch scheitert. Dazu ein Hinweis auf den E-Mail-Weg aus 10.4.
(c) Kein Zugang: nicht zugeordnet oder nicht aktiv. Beide Fälle bekommen bewusst denselben Text: „Die Personalabteilung ist informiert. Ihr Anliegen können Sie per E-Mail an … senden.“
Die error_description von Keycloak wird nie angezeigt.

3) 11.1, Z. 3044: Den Kanal festlegen. Vorschlag: Die gescheiterte Erstzuordnung (Entra-Adresse, Zeitpunkt, Fehlerkennung) wird als Zweifelsfall in die Leseansicht „Personen“ aus S0 geschrieben, höchstens einmal je Adresse und Tag. Das gehört zu S2, nicht zu den 13 Ticket-Ereignissen von S3.

4) Tests erweitern:
- S1, anmeldung-callback.test.ts: fehlendes oder abgelaufenes state-Cookie und ein error-Parameter führen auf /login/fehler, nicht auf eine 500; ein inaktiver User bekommt keine Sitzung.
- S2: ein inaktiver Employee bekommt keine Sitzung; die Meldung bei gescheiterter Zuordnung erscheint höchstens einmal je Tag.

#### F32 · MAJOR · Error Handling · bestätigt
**Löschlauf über Datenbank und Postfach ohne Reihenfolge und ohne verlässliche Fundstelle**  
*Ort (Fassung 5):* 12.3 Löschung (Z. 3607–3627); 11.3 AnliegenAntwort (Z. 3182–3198); 10.2 (Z. 2809–2811)  
*Problem:* Der Lauf löscht Anliegen samt Kaskade und im selben Lauf die Mails im Ordner „Übernommen“. Nicht festgelegt sind die Reihenfolge, das Verhalten bei einem Graph-Fehler (Geheimnis abgelaufen, Abruf nach der S3b-Rücknahme aus, Drosselung) und wie die Mail im Postfach gefunden wird. Einziger Bezug ist AnliegenAntwort.messageId: nullbar, „nur zur Nachverfolgung“, und Mails ohne Message-ID gibt es laut Plan. Löscht der Lauf zuerst die Datenbank und scheitert dann Graph, ist der Verweis weg; die Mail bleibt für immer im Postfach. Für „Aussortiert“ und „Nicht verarbeitet“ fehlt eine Löschfrist ganz.  
*Warum:* Dann trifft die Begründung des Plans selbst zu: Ohne diese Frist wäre jede Löschung im Portal wirkungslos. Die festgelegten Löschfristen würden verletzt, ohne dass es jemand merkt.  
*Fix:* Vorschlag für einen Absatz in 12.3 unter der Tabelle (zwei bis drei Sätze plus Schemafeld):

(a) In 11.3 an AnliegenAntwort ein Feld `graphMessageId String?` aufnehmen. Es wird beim Abruf in S3b mit Prefer: IdType="ImmutableId" gelesen und nach dem Verschieben unverändert gespeichert. In 10.2, Schritt 3, steht dazu ein Satz.

(b) Reihenfolge je Anliegen: erst die zugehörigen Mails über graphMessageId im Postfach löschen, dann die Datenbank. Scheitert Graph (Geheimnis abgelaufen, abrufAktiv = false, 429), bleibt das Anliegen unverändert stehen. Der Lauf zählt das als `fehler`, der Laufbericht meldet ein Problem, und der nächste Lauf versucht es erneut. Hat eine Mail kein graphMessageId (Altbestand), gilt als Rückfall eine Suche über internetMessageId, sonst über den quellSchluessel im Ordner. Wird nichts gefunden, steht das ausdrücklich im Bericht.

(c) Die Tabelle anpassen: „Nicht verarbeitet“ wie das zugehörige Anliegen, also gleich wie „Übernommen“. „Aussortiert“ bekommt 90 Tage, am einfachsten als Exchange-Aufbewahrungstag auf den Ordner, ohne eigenen Code. Die Zeile Z. 3615 klarstellen: Gemeint ist entweder „Aussortiert“ oder ein Anliegen im Status „Nicht zugeordnet“, das nie zugeordnet wurde.

(d) Den Löschlauf einem Paket zuordnen (S3b oder S5) und den Test `anliegen-aufbewahrung.test.ts` aufnehmen: „Graph-Fehler → nichts gelöscht, fehler = 1“ und „Probelauf zählt Mails mit“.

Ungeprüft, nur als Hinweis: Ein Graph-DELETE landet zunächst in „Wiederherstellbare Elemente“. Die Frist dort und ein etwaiger Litigation Hold im Tenant gehören in die Betriebsdokumentation.

#### F33 · MAJOR · Code Quality · bestätigt
**Reiter „E-Mails“: nicht vier, sondern fünf Änderungsstellen – sonst 404 und Umgehung der Zugriffsbeschränkung**  
*Ort (Fassung 5):* 11.5 (Z. 3432–3438), 8.6 (Z. 1916–1919), 13 S3 (Z. 3802–3803)  
*Problem:* Der Plan nennt vier Stellen: VorgangTyp, VORGANG_SCHLUESSEL, VORGANGS_MODULE und die Maske. Die Route GET /api/vorgaenge/[modul]/[id]/mails ermittelt den Mandanten aber über eine verschachtelte Ternary-Kette ohne Vollständigkeitsprüfung, deren letzter Zweig mutterschutzProzess ist. Kommt ANLIEGEN nur an den vier Stellen hinzu, fragt die Route still mutterschutzProzess.findUnique(anliegenId) ab, erhält null und antwortet mit 404. Tickets ohne Mandant (NICHT_ZUGEORDNET) liefern immer 404. Außerdem prüft die Route nur canAccessProcess (Mandant), nicht AnliegenZugriff.  
*Warum:* Der Reiter bleibt für jedes Anliegen leer, also genau der Fall, den der Plan verhindern will; TypeScript meldet ihn nicht. Bei zugriffsbeschränkten Vorgängen (Auskunft, Art. 9) sähen alle HR_EDIT_ROLES Empfänger und Betreff am invertierten Zugriffsmodell vorbei.  
*Fix:* 1. In 11.5 Z. 3432–3436 wird aus „vier Stellen“ „fünf Stellen“. Fünfte Stelle: `mandantDesVorgangs` in src/app/api/vorgaenge/[modul]/[id]/mails/route.ts. Die Ternary-Kette wird dabei zu einem switch über VorgangTyp mit `never`-Vollständigkeitsprüfung, damit eine künftige Vorgangsart nicht still im Mutterschutz-Zweig landet.

2. Im selben Absatz ergänzen: Für ANLIEGEN prüft die Route nicht nur canAccessProcess, sondern die Anliegen-Zugriffsprüfung aus S3. Dazu gehören AnliegenZugriff bei besondereKategorie oder einer zugriffsbeschränkten Art sowie der Fall organizationId = null, für den die eigene Berechtigung aus Z. 3145 gilt. Ohne Freigabe antwortet die Route mit 404 und demselben Text wie im Bestand.

3. In 8.6 Z. 1917 und S3 Z. 3803 „vier“ durch „fünf“ ersetzen.

4. In der S3-Testliste einen Routentest ergänzen. Er prüft:
   - Ein Anliegen mit Mandant liefert Zeilen.
   - Ein NICHT_ZUGEORDNET-Anliegen liefert Zeilen, wenn die Berechtigung vorliegt.
   - Ein zugriffsbeschränktes Anliegen ohne Freigabe liefert 404, auch für HR_SACHBEARBEITER.

#### F34 · MAJOR · Code Quality · bestätigt
**Zugriffsbeschränkung: Auslöser, zwei sich überschneidende Schalter, keine erste Freigabe**  
*Ort (Fassung 5):* 11.2 (Z. 3109), 11.3 (Z. 3294–3298, 3313–3314), 12.3 Nr. 3 (Z. 3583–3590), 12.3 Nr. 4 (Z. 3600–3604)  
*Problem:* (a) Wann besondereKategorie = true gesetzt wird, steht nirgends. SonderurlaubAnlass hat kein Merkmal dafür, obwohl 12.3 die Erkrankungsanlässe als Art.-9-Fall nennt und HR Anlässe frei anlegt (9.9). (b) Zwei Schalter für dasselbe: besondereKategorie am Ticket und zugriffBeschraenkt im Code-Katalog (Auskunft). Welcher die Prüfung steuert, ist offen. (c) Es gibt keine erste Freigabe: Im BEM legt eine interne Person den Fall an und erhält automatisch die Freigabe. Ein Anliegen legen dagegen die Beschäftigte oder der Postfachabruf an. (d) Empfänger der Auskunft ist der Abteilungseintrag DSB, eine reine Mailadresse ohne Portalkonto; die Eingangsmail verweist aber ins Portal.  
*Warum:* Nach dem invertierten Modell sieht ohne Eintrag niemand den Vorgang, auch nicht die Administratoren. Ein Auskunftsersuchen (Frist ein Monat, die Uhr ruht nicht) oder eine Art.-9-Arbeitsbefreiung wäre für niemanden sichtbar. Folge wäre ein Fristverstoß nach Art. 12 Abs. 3 DSGVO.  
*Fix:* Am Plan sind vier Stellen zu ändern.

1) Ein Schalter statt zwei (11.2, Z. 3109): Das Feld heißt künftig Anliegen.zugriffBeschraenkt Boolean @default(false). Es wird beim Anlegen einmalig gesetzt, nämlich auf katalog[art].zugriffBeschraenkt ODER anlass.besondereKategorie. Danach darf es nur noch von false auf true wechseln, durch eine Person mit Freigabe oder durch ADMIN_ROLES. Der Text in 11.3, 12.3 und der Test lastansicht.test.ts (Z. 3873) verweisen auf dieses eine Feld.

2) Merkmal je Anlass (11.4, Z. 3343ff.): Neue Spalte SonderurlaubAnlass.besondereKategorie Boolean @default(false). Der Seed setzt sie für § 29 Abs. 1 Buchst. e aa–cc und für Gewerkschaftstagungen auf true. Die Pflegemaske 9.9 zeigt dafür eine Spalte „vertraulich (Art. 9)“.

3) Erste Freigabe (11.3, Z. 3294–3298): Neues Feld User.isAnliegenVertraulich Boolean @default(false), analog zu isBemBeauftragte (schema.prisma:1119). Beim Anlegen eines beschränkten Anliegens bekommen in derselben Transaktion alle aktiven Nutzer mit diesem Merkmal einen AnliegenZugriff, wie in src/app/api/bem/route.ts:174. Die Freigaben verwalten ADMIN_ROLES nach dem Muster von canManageBemAccess; das Verwalten berechtigt nicht zum Lesen. Die HR-Liste (9.6) zeigt für alle anderen nur „n vertrauliche Anliegen“, ohne Inhalt. Die Erinnerungen und „liegen geblieben“ gehen bei solchen Vorgängen nur an die Personen mit Freigabe. Beim Start meldet das Portal (wie Z. 3649), wenn kein aktiver Nutzer das Merkmal trägt.

4) Auskunft (12.3 Nr. 3, Z. 3586): Neben dem Abteilungseintrag DSB als Mailadresse wird eine bearbeitende Person mit Portalkonto und isAnliegenVertraulich benannt, etwa die Datenschutzkoordination. Diese Benennung kommt als Aufgabe in Paket S3 (Z. 3801f.).

#### F35 · MAJOR · Code Quality · bestätigt
**Statusmodell ohne Übergangstabelle; Wiedereröffnung und Antworten auf geschlossene Tickets ungeregelt**  
*Ort (Fassung 5):* 8.1 (Z. 1620–1646), 11.2 (Z. 3116), 9.8 (Z. 2447), 10.2 (Z. 2795), 13 S3 Tests (Z. 3811–3812)  
*Problem:* Die acht Zustände sind benannt, aber es fehlt eine Übergangstabelle: von welchem Zustand in welchen, ausgelöst von wem (Portal, Mail, HR, Link, Lauf) und mit welchen Folgen für frist, fristRuhtSeit, laufendSchluessel, erledigtAm und das Ereignis. anliegen-status.test.ts soll Übergänge prüfen, die nirgends festgelegt sind. Wiedereröffnung gibt es nur als Feldkommentar. Was mit einer Mail-Antwort auf ein ERLEDIGT- oder ABGELEHNT-Ticket geschieht, ist offen, obwohl die Abschlussmail ausdrücklich dazu einlädt. „Zurückgezogen“ ist ein fester Text in einem Freitextfeld: Die Beschäftigte sieht für ihre eigene Rücknahme die Pille „Abgelehnt“, und eine Ablehnungsquote zählt Rücknahmen mit.  
*Warum:* Je nach Entwickler öffnet ein „Danke!“ auf die Abschlussmail das Ticket wieder (mit Benachrichtigung, neuer Frist und möglicher Kollision bei laufendSchluessel) oder hängt still an einem Vorgang, den niemand mehr ansieht. Portal-Route und Postfachabruf würden auseinanderlaufen.  
*Fix:* 1. In 8.1 nach der Wertliste eine kleine Übergangstabelle ergänzen (Von → Nach, Auslöser: Portal, Mail, HR, Link oder Lauf), nach dem Hausmuster `erlaubteFolgestatus`/`getErlaubteVorgaenger` (src/lib/bem-workflow.ts:202/237). Der Wechsel geschieht atomar per updateMany mit dem Vorgängerstatus im WHERE. Die Feldfolgen werden nur auf 8.3 und 11.2 verwiesen, nicht wiederholt. anliegen-status.test.ts prüft genau diese Tabelle.
2. Regel für Antworten an ERLEDIGT oder ABGELEHNT ergänzen, für Portal und Mail gleich: Die Antwort wird als AnliegenAntwort angehängt. Der Status bleibt, und es beginnt keine Frist. In 9.6 kommt ein Segment „Neue Antwort nach Abschluss“ dazu (über gelesenAm). Zeile 7 der Matrix in 8.6 erhält für geschlossene Tickets eine Verzweigung ohne „Frist läuft wieder“.
3. Wiedereröffnen darf nur HR. Der Status geht dann zurück auf IN_BEARBEITUNG, erledigtAm wird null gesetzt, wiedereroeffnungen um 1 erhöht, die Frist neu nach Art berechnet und laufendSchluessel neu gesetzt. Kommt es dabei zu P2002, gibt es 409 mit dem Hinweis auf das bereits offene Ticket.
4. Nach einer festen Spanne (z. B. 30 Tage nach erledigtAm) wird aus einer Mail-Antwort eine neue Freie Anfrage mit bezugModul/bezugId auf das alte Ticket.
5. Die Rücknahme bleibt Status ABGELEHNT, wie in 11.4 begründet. Statt des Freitexts kommt ein Grund-Code dazu: `abschlussGrund String? // "ZURUECKGEZOGEN" | null`, als Wertliste mit Test. Die Pille in 9.5 („Zurückgezogen“) und Zeile 11 in 8.6 (ohne Pflichtbegründung bei Rücknahme) richten sich nach diesem Code.

#### F36 · MAJOR · Code Quality · bestätigt
**Genehmigungsschritt: Empfänger, Wertliste, Linklaufzeit, Erinnerung und Eskalation fehlen**  
*Ort (Fassung 5):* 6.2 (Z. 1123–1127), 8.1 (Z. 1629), 8.6 Zeile 2 (Z. 1881), 9.9 (Z. 2492–2497), 11.3 (Z. 3216–3219), 11.4 (Z. 3354), E-S13 (Z. 4121–4126)  
*Problem:* Nicht festgelegt ist: (a) woher die Adresse der Schulleitung oder Führungskraft kommt. Der Bestand hat Organization.ezDefaultLeiterEmail (im Elternzeit-Ablauf genutzt), der Plan nennt das Feld nicht. (b) die Wertliste von genehmigungsweg: Nur der Default "NUR_HR" steht fest, der Text nennt Schulleitung, Führungskraft und Geschäftsführung. (c) die Laufzeit gueltigBis. (d) die Erinnerung an die Genehmigerin: anlass kennt "ERINNERUNG_GENEHMIGUNG", unter den 13 Ereignissen gibt es aber weder eine solche Mail noch einen Auslöser. (e) die Eskalation: In GENEHMIGUNG ruht die Frist, also greift der Erinnerungslauf nie, und „liegen geblieben“ setzt eine Zuweisung voraus. (f) Ist die Antragstellerin selbst die Leitung, geht der Link an sie selbst.  
*Warum:* Ein unbeantworteter Link lässt das Ticket unbegrenzt in GENEHMIGUNG hängen, auch beim Todesfall (vorrangig), ohne jede Warnung. S4 ist ohne eigene Fachentscheidungen des Entwicklers nicht baubar.  
*Fix:* 1) Zu E-S13 und 11.4 je einen Satz ergänzen: Die Wertliste ist genehmigungsweg = "NUR_HR" | "LEITUNG" mit Test. "GESCHAEFTSFUEHRUNG" kommt erst mit § 28 in Welle 2. Der Empfänger bei LEITUNG ist der Bestand Organization.ezDefaultLeiterEmail. Er wird schon unter Mandanten → Elternzeit-Konfiguration gepflegt, also kein neues Feld. Fehlt die Adresse oder stimmt sie mit der Dienstadresse der Antragstellerin überein, geht kein Link raus. Das Ticket bleibt dann EINGEGANGEN mit dem Hinweis „Genehmigung: Empfänger wählen". HR versendet über das vorhandene „erneut senden" (8.6 Zeile 2).

2) An AnliegenLink.gueltigBis die Laufzeit festlegen, z. B. 5 Arbeitstage. Läuft der Link ab, wird er entwertet, das Ticket geht zurück auf EINGEGANGEN mit Eintrag im Verlauf, und die Frist läuft wieder.

3) Die einfachste Lösung, bei der die Zählung von dreizehn Ereignissen bleibt: "ERINNERUNG_GENEHMIGUNG" aus dem Kommentar zu anlass streichen. Stattdessen den Filter „liegen geblieben" in 9.6 und 8.3 erweitern auf: „zugewiesen ohne Verlaufseintrag seit 3 Arbeitstagen ODER seit 2 Arbeitstagen in GENEHMIGUNG". Solche Tickets erscheinen damit auch in der Erinnerungsstufe der HR-Leitung.

4) In den Masken 9.3 und 9.7 statt des Todesfalls einen Anlass zeigen, der eine Genehmigung braucht, z. B. „Erkrankung eines Kindes". Alternativ den Genehmigungsschritt aus diesen Masken entfernen, damit sie zu 9.9 passen.

#### F37 · MAJOR · Code Quality · bestätigt
**Zuordnungstabelle für den Personalstamm (S0) nennt Zielfelder, die es nicht gibt; Namenskollision „Personalgruppe“**  
*Ort (Fassung 5):* 5.1 Tabelle (Z. 790–802), 4.1 (Z. 605), 6.2 (Z. 1128–1129), 11.1 (Z. 2994–3030), 11.4 (Z. 3355), E-S10 (Z. 4080–4081)  
*Problem:* Die Tabelle ordnet Spalten Ziele zu, die weder im Bestand noch im Delta existieren: BESCHAEFTIGUNGSGRUPPE → „Personalgruppe“ (steuert, welche Anliegen jemand sieht), TARIF → „Anzeige im Ticket“, TARIFGRUPPE/TARIFSTUFE → „workingHoursWeek u. a.“. Die Wochenarbeitstage gibt es laut 6.3 „heute nicht“. „Personalgruppe“ kollidiert mit dem bestehenden enum Personalgruppe {TARIF_TV_L, BEAMTER, PLANSTELLENINHABER}, das eine andere Bedeutung hat. Für SonderurlaubAnlass.personalgruppen String? fehlt das Format. Das naheliegende Bestandsfeld Employment.contractType (MINIJOB, EHRENAMT, BEAMTER …) wird nicht erwähnt. E-S10 empfiehlt einen Eindeutigkeitsindex, der schon besteht.  
*Warum:* Die Sichtbarkeit des Katalogs je Personalgruppe (4.1, 11.3) und der Anlassfilter „für wen es gilt“ haben keine Datenquelle. S0 ist mit „3–5 Tage, Muster steht“ geschätzt, das Ziel ist aber offen; Entwickler würden ein Enum erweitern, Json nehmen oder ein neues Feld anlegen.  
*Fix:* 1. 11.1 `model Employment`: ein Feld `beschaeftigungsgruppe String? // DokuBit BESCHAEFTIGUNGSGRUPPE, Rohwert` ergänzen und ins Delta übernehmen. Alternativ ausdrücklich festlegen, dass BESCHAEFTIGUNGSGRUPPE auf das vorhandene `contractType` abgebildet wird. Gegen diese Alternative spricht, dass `contractType` Befristung und Gruppe vermischt.
2. 5.1, Z. 799: Zielspalte „Personalgruppe“ durch `Employment.beschaeftigungsgruppe` ersetzen. Z. 798 (TARIF): `Employment.tarif String?` ergänzen oder „nur Ticket-Snapshot, nicht gespeichert“ schreiben. Z. 796: „u. a.“ streichen, nur TEILZEITSTUNDEN → `workingHoursWeek` nennen und für die Anteiligkeit auf Welle 2 verweisen (6.3).
3. Den Begriff in 4.1, 6.2, 11.3 und 11.4 durchgehend in „Beschäftigungsgruppe“ umbenennen und an einer Stelle festhalten, dass das Bestands-Enum `Personalgruppe` (schema.prisma:3610) etwas anderes bedeutet und nicht verwendet wird.
4. 11.4: `personalgruppen String?` wird zu `beschaeftigungsgruppen String[] // leer = alle`, mit derselben Wertliste.
5. E-S15: als fünfte Abfrage `SELECT DISTINCT BESCHAEFTIGUNGSGRUPPE FROM dokubitmitarbeiter` aufnehmen; daraus entsteht die Wertliste.
6. E-S10: „mit Eindeutigkeitsindex im Portal“ ersetzen durch „der Eindeutigkeitsindex besteht bereits (personalNumber @unique, schema.prisma:153)“.

#### F38 · MAJOR · Code Quality · bestätigt
**„Vorige IBAN bleibt erhalten“ ohne Datenquelle und ohne Feld**  
*Ort (Fassung 5):* 12.1 (Z. 3470, 3483), 13 S4 (Z. 3847, 3860), E-S7 (Z. 4046), E-S21 (Z. 4259), 15 (Z. 4351)  
*Problem:* Der Plan sagt viermal zu, dass die vorige IBAN mit Datum erhalten bleibt, und S4 testet den „Vorzustand“. Woher die vorige IBAN kommt, steht nirgends: Formular 9.4 fragt sie nicht ab, laut Abschnitt 15 gibt es keinen Stammsatz mit Bankverbindung, und frühere Bank-Anliegen werden nach 3 Jahren gelöscht. Im Schema gibt es kein Feld dafür. Auch „maskiert wie mit maskValue“ ist nicht direkt wiederverwendbar: maskValue ist eine nicht exportierte Funktion in einer einzelnen Route.  
*Warum:* Eine Maßnahme, die der Plan als Kontrolle ausweist und auf die sich E-S21 stützt, ist so nicht baubar. Der Entwickler erfindet eine Quelle oder lässt sie weg, und der Test „Vorzustand“ prüft etwas Beliebiges.  
*Fix:* Variante A ist die einfachste und passt zu „melden statt ändern“ und Z. 3611:
- Die Tabellenzeile in 12.1 Z. 3483 wird ersetzt durch: „Portal überschreibt nichts — Vorzustand führt LOGA. Das Portal hält nur die gemeldete IBAN je Anliegen (verschlüsselt in datenSensibel, mit Meldedatum) für 3 Jahre (12.3). Die vorige Bankverbindung belegt im Betrugsfall die Abrechnungshistorie in LOGA.“
- Z. 3470 („Drittens bleibt der Vorzustand erhalten“), S4 Z. 3847, E-S7 Z. 4046 und E-S21 Z. 4259 werden sinngemäß angepasst.
- In Z. 3860 entfällt im Test „Vorzustand“. Stattdessen wird geprüft: „gemeldete IBAN bleibt je Anliegen erhalten, kein Update auf PersonalData“.

Variante B gilt nur, wenn der Träger den Vorzustand ausdrücklich im Portal will:
- Die Sachbearbeitung trägt beim Abschluss die bisherige IBAN aus LOGA in ein Pflichtfeld der Maske ein.
- Gespeichert wird verschlüsselt in datenSensibel als { neu, vorher, vorherBis }, mit derselben Löschfrist wie die Meldung.
- Der Test „Vorzustand“ prüft genau dieses Pflichtfeld.

In beiden Fällen wird Z. 3484 korrigiert: statt „wie es die bestehenden Routen mit maskValue bereits tun“ heißt es „nach dem Muster von maskValue (src/app/api/onboarding/[id]/personal-data/route.ts:99), als exportierte Hilfsfunktion nach src/lib/ verschoben und dort von Personaldaten-Route und Anliegen gemeinsam genutzt“. Diese Verschiebung wird im Paket S4 als Arbeitsschritt genannt.

#### F39 · MAJOR · Code Quality · bestätigt
**Verbindliche Namen und Auflösungsregeln des Katalogs fehlen**  
*Ort (Fassung 5):* 6.1 (Z. 1010–1065), 8.1 (Z. 1637–1640), 8.2 (Z. 1667–1668), 8.4 (Z. 1798–1801), 8.6 (Z. 1894–1904), 11.2 (Z. 3072), 11.3 (Z. 3257, 3267–3276, 3319–3322), 13 S3 (Z. 3806)  
*Problem:* Als Bauvorlage fehlen die Namen: (1) Ein Katalogschlüssel steht nur für FREIE_ANFRAGE fest; die sieben übrigen Arten aus Welle 1 sind unbenannt, werden aber in laufendSchluessel "<ART>:…" und in Tests verwendet. (2) Die 13 Ereignisnamen fehlen; im Bestand sind es kebab-case-Namen wie "unterlagen-angefordert". (3) Die „feste Liste von action-Werten“ für die Mitarbeitersicht fehlt. (4) Es fehlen die Wertlisten für AnliegenZugriff.rolle, AnliegenLink.mailStatus und bezugModul ("…"). (5) Es fehlt die Zuordnung Status → Ton der Statuspille, die der UX-Umbau ausdrücklich dem Katalog des Moduls überlässt. Außerdem ist offen, wie globale Zeile und Mandantenzeile in AnliegenKatalogEintrag zusammenwirken. Wegen aktiv @default(false) schaltet eine Mandantenzeile, die nur den Empfänger ändern soll, die Art dort ab. Die Empfängerkette in 8.2 nennt nur die Zeile „je Art und Mandant“; der globale DSB-Eintrag der Auskunft fiele also auf die HR-Adresse zurück. Die Kacheln in 9.2 nennen Welle-2-Anliegen (Zeugnis, Mehrarbeit), die in 6.3 fehlen.  
*Warum:* Die Mitarbeitersicht filtert über die action-Liste, das ist datenschutzrelevant; ohne festgelegte Namen entsteht die Liste beim Bau nebenbei. Eine Auskunft, die bei HR statt beim DSB landet, widerspricht 12.3.  
*Fix:* Den Namensteil des Findings streichen. Stattdessen nur die Auflösungsregel ergänzen:

(a) In 11.3 nach Z. 3322 einen Absatz „Auflösung“ einfügen. Inhalt: Eine einzige Funktion in src/lib/anliegen/katalog.ts, z. B. katalogEintragFuer(art, organizationId), liest die Mandantenzeile und die globale Zeile. Sie löst feldweise auf:
- aktiv: Mandantenzeile → globale Zeile → false.
- fristTage: Mandantenzeile → globale Zeile → Vorgabefrist aus dem Code-Katalog.
- empfaenger: Mandantenzeile → globale Zeile → Organization.hrEingangEmail → SmtpConfig.replyToEmail.
- Ausnahme Arbeitsbefreiung: nur die Mandantenzeile zählt (6.2).
- Anliegen ohne Mandant (NICHT_ZUGEORDNET): nur die globale Zeile.

(b) Im Schema in Z. 3271 aktiv auf „Boolean? // null = erbt von der globalen Zeile“ ändern. Die globale Zeile setzt der Seed immer explizit. Eine Mandantenzeile, die nur Frist oder Empfänger trägt, schaltet die Art dann nicht mehr ab.

(c) In 8.2 Z. 1667 die Kette so formulieren: „Mandantenzeile → globale Zeile → hrEingangEmail → replyToEmail“.

(d) Für AUSKUNFT im Seed die globale Zeile mit empfaenger = "DSB" festhalten.

(e) In S3 die Tests für anliegen-katalog.test.ts um drei Fälle ergänzen:
- Eine Mandantenzeile nur mit Frist lässt die Art aktiv.
- Eine Auskunft ohne Mandantenzeile geht an DSB.
- Die Arbeitsbefreiung ohne Mandantenzeile ist inaktiv.

Optional (MINOR/INFO): Die Zuordnung Status → Ton der Statuspille als Feld im Code-Katalog erwähnen (11.3, Z. 3311).

#### F40 · MINOR · Security · bestätigt
**Antworten per Mail an bestehende Tickets werden ohne Absender-Authentifizierung angehängt**  
*Ort (Fassung 5):* 10.2, Z. 2843-2848 und 2865-2878; 10.4, Z. 2953-2955  
*Problem:* Die Authentifizierung (intern bzw. dmarc=pass) ist nur als Bedingung formuliert, ‚bevor ein Ticket einer Person zugeordnet wird‘, also nur für neue Tickets. Für Antworten auf bestehende Tickets genügt nach der Absenderschranke, dass die Adresse zum Vorgang gehört. Ticketnummern sind fortlaufend und damit erratbar (AN-2026-GYM-014), und die Nummer im Betreff reicht als Stufe 3 für die Zuordnung. Außerdem regelt der Plan nicht, welche Authentication-Results-Zeile zählt; ein Absender kann eigene Zeilen mit dmarc=pass mitschicken.  
*Warum:* Mit gefälschter Absenderadresse einer Beschäftigten lässt sich in ihren laufenden Vorgang eine ‚Antwort‘ einschleusen. Sie beendet die Rückfrage, erscheint in beiden Sichten unter ihrem Namen und kann z. B. bei einer offenen Bankverbindungsänderung eine ‚korrigierte‘ IBAN nennen. Damit wird 12.1 unterlaufen (‚Aus einer Mail entsteht nie eine Bankverbindungsänderung‘).  
*Fix:* (1) In 10.2 nach dem Satz zur Schranke (Z. 2844–2849) ergänzen: „Die Schranke prüft neben der Adresse auch die Authentifizierung aus ‚Wer hat geschrieben?‘. Eine nicht authentifizierte Nachricht wird auch bei passender Nummer oder Kennung nicht angehängt. Sie wird behandelt wie ein Verstoß gegen die Schranke: neue Anfrage im gemeinsamen Eingang, Vermerk im Audit-Log.“ (2) Im ersten Punkt von „Wer hat geschrieben?“ (Z. 2869–2875) ergänzen: „Gezählt wird nur die Prüfzeile, die der eigene Mailserver selbst gesetzt hat. Vom Absender mitgeschickte Zeilen zählen nicht. Woran die eigene Zeile zu erkennen ist, legt der Vorlauf von S3b an echten Mails fest.“ (3) In S3b, Z. 3834, die Tests von postfach-zuordnung.test.ts um den Fall ergänzen: „gefälschte Antwort mit passender Nummer im Betreff, ohne Authentifizierung → nicht angehängt“. Den dritten Teil des ursprünglichen Fixes (Mail-Antwort bei Arten mit Geldfluss nie als fachliche Angabe übernehmen) streichen. Das regeln Z. 2884–2886 und Z. 3487 bereits.

#### F41 · MINOR · Security · bestätigt
**Keine Vorgabe zur HTML-Behandlung von Mailinhalten: gespeichertes XSS, die CSP schützt nicht**  
*Ort (Fassung 5):* 10.2, Z. 2792-2815; 11.3, Z. 3188; 12.4, Z. 3662  
*Problem:* Der Plan legt nicht fest, in welcher Form der Text eingehender Mails gespeichert und angezeigt wird. Graph liefert den Body standardmäßig als HTML. AnliegenAntwort.text ist ein freier String und erscheint in der HR- und in der Mitarbeitersicht. 12.4 nennt die Inhaltsrichtlinie (CSP) der Middleware als Schutz, doch die erlaubt in Produktion script-src 'unsafe-inline'.  
*Warum:* Jeder externe Absender, auch ein nicht zugeordneter, kann HTML mit Ereignis-Attributen einliefern. Beim Öffnen in der HR-Sicht läuft der Code mit deren Sitzung und erreicht alle Personaldaten und IBANs.  
*Fix:* In 10.2 nach Schritt 1 einen Satz ergänzen: „Der Abruf fordert den Text per Kopfzeile Prefer: outlook.body-content-type="text" an. Bei Antworten auf ein bestehendes Ticket wird uniqueBody übernommen, also nur der neue Teil ohne den zitierten Verlauf. Gespeichert wird nur Text, gekürzt auf eine feste Höchstlänge mit dem Vermerk ‚gekürzt, vollständig im Postfach‘.“

In 11.3 am Feld text vermerken: „Nur Text, nie HTML. Die Ausgabe erfolgt ausschließlich als React-Text, nie über dangerouslySetInnerHTML. Das gilt ebenso für Betreff, Absendername und Dateinamen.“

In S3b den Test postfach-abruf.test.ts um einen Fall mit HTML-Text ergänzen (z. B. ein img-Tag mit onerror-Attribut), der als Text ankommt.

In 12.4 den Punkt zur CSP um einen Halbsatz ergänzen: „Die CSP erlaubt in Produktion 'unsafe-inline' und ist daher kein XSS-Schutz. Den leistet die reine Textausgabe.“

#### F42 · MINOR · Security · bestätigt
**Genehmigungs-Link: Entscheidung per Klick, Laufzeit, Einmaligkeit und Inhalt der Seite nicht festgelegt**  
*Ort (Fassung 5):* 7, Z. 1555; 8.6, Z. 1881; 9.9, Z. 2495; S4, Z. 3859  
*Problem:* Die Genehmigung heißt im Plan ‚Magic Link mit Ja/Nein‘ bzw. ‚ein Klick‘. Löst schon der Aufruf per GET die Entscheidung aus, entscheiden Link-Prüfer wie Microsoft Defender Safe Links in den M365-Postfächern selbst. Offen sind außerdem: die Laufzeit (Bestandsstandard 720 h), die Einmaligkeit, die Entwertung des alten Links beim erneuten Senden und was die Seite zeigt. Bei den Erkrankungsfällen nach Buchst. e (in 9.9 mit Genehmigung durch die Führungskraft) sähe die Schulleitung Art.-9-Angaben und Nachweise, ohne AnliegenZugriff und ohne Protokoll.  
*Warum:* Anträge würden automatisch genehmigt oder abgelehnt, ohne dass ein Mensch entscheidet. Gesundheitsdaten lägen hinter einem weiterleitbaren, 30 Tage gültigen Link.  
*Fix:* In 11.3 beim Absatz zu AnliegenLink (Z. 3285ff) einen Satz ergänzen: „Die Genehmigungsseite zeigt nur Name, Einrichtung, Anlass, Zeitraum und Tage. Sie zeigt keine Nachweise, keinen Inhalt aus datenBesonders und keine E-Mail-Adresse. Jeder Aufruf mit gültigem Token erzeugt einen Verlaufseintrag (Muster AKTE_GEOEFFNET). Die Gültigkeit beträgt 14 Tage als Konstante in src/lib/constants.ts, nicht die 720 h aus MAGIC_LINK_EXPIRY_HOURS.“ In 8.6 Zeile 2 statt „Magic Link mit Ja/Nein“ schreiben: „Magic Link auf eine Entscheidungsseite (der Aufruf ändert nichts, entschieden wird per POST, Muster elternzeit-leiter)“. In S4 bei genehmigung-link.test.ts die Prüfung „Aufruf ändert nichts, Seite ohne Nachweise“ ergänzen. Zu Einmaligkeit und Entwertung beim erneuten Senden ist nichts zu ändern, beides ist über das Vorbild UnterlagenLink bereits festgelegt.

#### F43 · MINOR · Security · bestätigt
**Personalstamm-Webhook steuert mit dem geteilten CRON_SECRET identitätsrelevante Adressen**  
*Ort (Fassung 5):* 5.1, Z. 766-769, 783 und 855; S0, Z. 3742  
*Problem:* Der neue Webhook nutzt dasselbe CRON_SECRET wie der Vertragsende-Webhook und alle Cron-Routen. Er überschreibt nachts automatisch alle belegten Felder, auch Employee.email. Diese Adresse ist im Plan zugleich der Schlüssel der Erstanmeldung (11.1) und der Absenderzuordnung (10.2). Außerdem ist sie Ziel aller Statusmails, auch der beiden Bankverbindungs-Meldungen, die E-S21 als einzige Kontrolle trägt.  
*Warum:* Wer das CRON_SECRET kennt (es ist in mehreren n8n-Abläufen hinterlegt), kann die Adresse einer noch nicht angemeldeten Person auf sein eigenes Konto setzen. Meldet er sich dann an, wird er an deren Akte gebunden. Ebenso kann er die Benachrichtigungen einer Person auf sich umlenken. Aus einem Geheimnis für Erinnerungsläufe wird damit eines für Identitäten.  
*Fix:* In 5.1 (Z. 768) und S0 (Z. 3742) wird „Bearer CRON_SECRET“ ersetzt durch: „Bearer PERSONALSTAMM_SECRET: ein eigenes Geheimnis, als eigenes Credential nur im Stammablauf von n8n, nicht der Cron-Schlüssel. Es wird mit cronAnmeldungPruefen-artigem SHA-256-Vergleich geprüft.“

In 5.1 unter „Auffrischen“ (Z. 855) kommt ein Satz dazu: „Eine geänderte E-Mail-Adresse wird übernommen und mit altem und neuem Wert im AuditLog protokolliert.“

In personalstamm-abgleich.test.ts kommen zwei Testfälle dazu: Der Webhook lehnt CRON_SECRET mit 401 ab, und eine Adressänderung erzeugt einen AuditLog-Eintrag.

Eine Sperre der Adressänderung für Personen mit keycloakSub ist nicht nötig, denn sie schützt nicht den beschriebenen Fall.

#### F44 · MINOR · Security · bestätigt
**Notfallzugang: SUPER_ADMIN nur mit Passwort und aus dem Internet erreichbar**  
*Ort (Fassung 5):* 4.4, Z. 722-726; E-S4, Z. 3994-3995; S1, Z. 3769-3773  
*Problem:* Ein SUPER_ADMIN behält die Passwortanmeldung. Abgesichert ist sie nur durch eine ‚gesonderte Adresse‘ und einen Protokolleintrag. Es fehlen eine Netzbeschränkung, ein Schalter zum Abschalten, ein Alarm und ein zweiter Faktor. Die Lastbegrenzung des Logins ist prozesslokal (12.4).  
*Warum:* Das mächtigste Konto (alle Mandanten, Benutzerverwaltung, BEM-Freigaben) wird zum einfachsten Angriffspunkt, an Entra-MFA und Keycloak-Sperren vorbei. Eine gesonderte Adresse schützt nicht, und ein Protokolleintrag fällt erst im Nachhinein auf.  
*Fix:* Den Satz im Kasten 4.4 und gleichlautend in E-S4 so ergänzen: „Die gesonderte Adresse ist in Caddy auf das Verwaltungsnetz bzw. den VPN-Zugang beschränkt und ist von außen nicht erreichbar. Jede erfolgreiche Anmeldung und jeder Fehlversuch löst neben dem Protokolleintrag sofort eine Mail an die IT und die HR-Leitung aus. Das Passwort ist lang, zufällig erzeugt und im Tresor hinterlegt.“

In S1 bei den Tests ergänzen: „Der Notfallzugang schreibt einen Protokolleintrag und verschickt die Meldung; über die normale Adresse ist die Passwortanmeldung nicht erreichbar.“

Ein Umgebungsschalter, der den Zugang standardmäßig ausschaltet, ist optional. Er bringt nur etwas, wenn bei einem Ausfall jemand mit Serverzugang verfügbar ist.

#### F45 · MINOR · UI/UX · bestätigt
**„Ich bin krank“: das Lebensereignis mit dem meisten Aufkommen ist eine ausgegraute, nicht bedienbare Kachel mit Projektsprache**  
*Ort (Fassung 5):* 9.2 Z. 2062, 2101, 2107–2112; CSS Z. 236; 6.3 Z. 1236  
*Problem:* Die Kachel „Ich bin krank“ ist in Welle 1 ausgegraut (opacity .62), nicht bedienbar und trägt den Text „ab Welle 2 · … (E-S14)“. Insgesamt sind 9 von 21 Kacheln so dargestellt, eine davon mit „Zuschnitt offen (E-S1)“. Für eine Krankmeldung bleibt nur die Kachel „Freie Anfrage – Alles, was oben nicht steht“. Laut Text sollen die grauen Kacheln einen Hinweis mit Ansprechpartner zeigen. Die Maske zeigt aber nur die Welle.  
*Warum:* Beispiel: Eine Küchen- oder Kita-Kraft will sich um 6 Uhr krankmelden und landet in der Freien Anfrage. Die Meldung liegt dann mit 5 Arbeitstagen Frist in der Warteschlange der Personalabteilung. Die Einrichtung erfährt nichts, Vertretung und Aufsicht fehlen. „Welle“ und „E-S14“ versteht niemand (verstößt gegen E-S23). Der gedimmte Text trägt Information und liegt unter dem Kontrast von 4,5:1, den 12.5 verlangt.  
*Fix:* Ausgrauen bleibt, wie in Z. 2117 entschieden, nichts wird ausgeblendet. Vier kleine Änderungen am Plan:
(1) Z. 2062: Die Kachel „Ich bin krank“ wird in Welle 1 ein aktiver Wissensartikel, gebaut wie „Steuerklasse ändern?“ in S4 (Z. 3856). Kurztext der Kachel: „Bitte wie bisher vor Dienstbeginn bei Ihrer Einrichtung melden“. Der Artikel nennt zusätzlich, wohin die AU-Bescheinigung geht.
(2) In allen spaeter-Kacheln (Z. 2064–2096, 2081) entfallen „ab Welle n“, „(E-S…)“ und „Zuschnitt offen“. Stattdessen ein Satz für Beschäftigte, z. B. „Kommt später – bis dahin über die Freie Anfrage“. Z. 2112 wird entsprechend umformuliert: „ausgegraut mit einem Hinweis, wohin man sich bis dahin wendet“.
(3) Ins Formular „Freie Anfrage“ kommt ein Satz: „Krankmeldungen bitte nicht hier, sondern wie bisher an Ihre Einrichtung.“
(4) CSS Z. 236: Die Deckkraft wirkt nur noch auf Rahmen und Symbol (z. B. gestrichelter Rahmen, `.ic { opacity: .5 }`). Der Text behält --ui-muted ohne Absenkung, damit 4,5:1 aus 12.5 gehalten wird.
Der Katalog in 11.3 erhält dafür kein neues Modell. Ein optionaler Hinweistext je Katalogeintrag im Code-Katalog (katalog.ts) genügt.

#### F46 · MINOR · UI/UX · bestätigt
**Masken für Beschäftigte und Schulleitung fehlen; 12.5 lässt die Anmeldung und die Link-Seiten aus**  
*Ort (Fassung 5):* 6.6 Z. 1456–1462; 9.3 Z. 2172; 9.5 Z. 2240/2251; 8.6 Z. 1881; 12.5 Z. 3676–3677; 13 S2 Z. 3785–3786  
*Problem:* 6.6 behauptet, diese Muster seien „in die Masken eingegangen“: Zusammenfassung vor dem Absenden, Bestätigungsseite mit Nummer, Fehlerzusammenfassung oben. 9.3 und 9.4 führen aber direkt auf „Anliegen absenden“. Folgende Seiten sind weder gezeichnet noch einem Paket zugeordnet: (1) die Detailseite hinter „Antworten“ und „Ansehen“ (Rückfrage beantworten, Nachweis nachreichen, Zurückziehen), (2) die Bestätigungsseite, (3) die Link-Seite der Schulleitung mit Ja/Nein und Pflichtbegründung. S2 nennt nur 9.2 und 9.5. 12.5 verlangt WCAG 2.1 AA nur für 9.2–9.5 und 9.8, nicht für die Keycloak-Anmeldung 9.1 und nicht für die Genehmigungsseite.  
*Warum:* Die Rückfrage ist nach 8.6 eine Nachricht, die eine Handlung verlangt. Ohne gezeichnete Antwortmaske wird die wichtigste Interaktion beim Bau improvisiert. Die Anmeldeseite benutzen alle rund 600 Beschäftigten. Fällt sie aus der Abnahme, wird ausgerechnet der Eingang nicht auf Barrierefreiheit geprüft.  
*Fix:* Keine neuen Masken zeichnen, nur drei kleine Ergänzungen im Text:

(1) Den Widerspruch in 6.6 auflösen. Entweder unter 9.3 einen Satz ergänzen: „‚Anliegen absenden‘ führt auf eine Zusammenfassung mit Änderungslinks je Abschnitt; erst dort wird verbindlich abgeschickt. Danach folgt die Bestätigungsseite mit Nummer und den nächsten Schritten aus der Karte ‚Was danach passiert‘.“ Den Knopf in 9.3 und 9.4 dann in „Weiter zur Zusammenfassung“ umbenennen. Oder 6.6 auf das zurücknehmen, was die Masken tatsächlich zeigen.

(2) In S2 (Z. 3785–3786) ergänzen: „dazu die Detailansicht eines Anliegens für Beschäftigte (Verlauf in der Mitarbeitersicht nach 8.4, Antwortfeld zur Rückfrage mit Upload, Ziel des Antwortlinks aus 8.6, Knopf ‚Zurückziehen‘ mit Bestätigungsdialog, solange das Anliegen weder erledigt noch abgelehnt ist)“. In 8.1 (Z. 1641) die Fundstelle „(Detailansicht, S2)“ anfügen.

(3) Optional in 12.5 (Z. 3676) den Geltungsbereich klarstellen: „alle Seiten, die Beschäftigte oder Schulleitungen sehen, einschließlich der Detailansicht und der Genehmigungsseite per Link; die Keycloak-Seite nur, soweit sie nicht per Anmeldehinweis übersprungen wird“.

Für die Genehmigungsseite genügt ein Verweis auf das bestehende Muster src/app/elternzeit-leiter/[token]/page.tsx.

#### F47 · MINOR · UI/UX · bestätigt
**Bedienung am Handy ab 390 px nur behauptet, weder gezeichnet noch abgenommen**  
*Ort (Fassung 5):* 15 Z. 4354; 9.2 Kopfzeile Z. 2039–2048; 9.3/9.4 Z. 2146, 2199; 13 Abnahme Z. 3728–3733  
*Problem:* Alle Masken sind für den Desktop gezeichnet (560–720 px breit). Die Kopfzeile in 9.2 hat fünf Elemente nebeneinander: Anliegen stellen, Meine Anfragen, Avatar, Name mit Einrichtung, Abmelden. Die Formulare sind zweispaltig. Der Plan sagt nichts zu mobiler Navigation, Spaltenzahl der Kacheln, Tippflächen von mindestens 44 px oder Upload über die Kamera. Die Abnahme der Pakete prüft nur die vier Punkte aus 12.5, keine Darstellung bei 390 px – anders als die Abnahme des UX-Umbaus.  
*Warum:* In Reinigung, Küche und Kita gibt es keinen eigenen Arbeitsplatzrechner; das Handy ist das Hauptgerät. Bricht dort die Kopfzeile oder ist der Upload umständlich, weichen genau diese Gruppen auf die Mail aus. Dann wird das Ziel „über 60 % angemeldet“ (Z. 4370) verfehlt. Ungeprüft: ob Entra-Richtlinien (bedingter Zugriff, MFA) die Anmeldung auf privaten Handys überhaupt zulassen.  
*Fix:* (1) Abschnitt 13, Z. 3733: Die gemeinsame Abnahme ergänzen um „Masken für Beschäftigte (9.2–9.5, 9.8): Bilder bei 1366×768 und 390 px, in keiner Breite breiter als das Fenster (WCAG 1.4.10); Tastaturprobe von Hand – Verfahren wie scripts/ux-abnahme.js des UX-Umbaus.“

(2) Abschnitt 9.2, Z. 2033 oder in der Bildunterschrift: Einen Satz ergänzen: „Unter 768 px zeigt die Kopfzeile nur Logo, ‚Meine Anfragen‘ und einen Menüknopf mit Anliegen stellen, Name/Einrichtung und Abmelden – nach dem Muster von src/components/rahmen/portal-kopf.tsx; Kacheln und zweispaltige Felder werden einspaltig.“ Eigene Handy-Zeichnungen sind dafür nicht nötig.

(3) Optional, als ungeprüft gekennzeichnet: In die IT-Abfrage zu E-S8 (Z. 3938) die Frage aufnehmen, ob bedingter Zugriff in Entra ID die Anmeldung von privaten Geräten erlaubt.

#### F48 · MINOR · UI/UX · bestätigt
**Lade-, Leer- und Fehlerzustände sowie Optimistic Updates nicht festgelegt**  
*Ort (Fassung 5):* 9 (gesamt, kein Treffer für Lade-/Leer-/Fehlerzustand/optimist); 11.1 Z. 3042–3044; 5.3 Z. 939; 8 Z. 1616  
*Problem:* Die Hausregel verlangt Leerzustände, Ladezustände und Optimistic Updates mit Rollback. Der Plan legt keinen davon fest. Konkret offen: (a) Was sieht eine Beschäftigte, deren Erstzuordnung scheitert oder die am ersten Arbeitstag vor dem nächtlichen Abgleich kommt? Der Plan sagt nur „kein Zugang, HR erhält Meldung“. (b) „Meine Anfragen“ ohne Anliegen. (c) Upload-Fehler: Der Bestand meldet technisch „Dateityp image/heic nicht erlaubt …“; bei iPhone-Fotos ist das wahrscheinlich (HEIC, ungeprüft). (d) Absenden: Doppelklick, Laden, Fehler – bleiben die Eingaben erhalten? (e) Welche Aktionen im HR-Bereich arbeiten optimistisch?  
*Warum:* Eine Sackgasse direkt nach der Microsoft-Anmeldung („Zugriff verweigert“) beendet für Menschen ohne IT-Affinität den Kanal und erzeugt Anrufe. Bei der Einführung trifft das alle gleichzeitig, deren Mailadresse in DokuBit anders geschrieben ist (E-S15, Abfrage 4).  
*Fix:* 1) Unter 9.1 einen kurzen Absatz ergänzen: „Anmeldung ohne Zuordnung“. Das ist eine Hinweisseite im Mitarbeiterportal (Baustein Hinweis, Anrede „Sie“), keine Fehlermeldung. Vorschlag für den Text: „Ihr Zugang wird noch eingerichtet. Die Personalabteilung ist informiert. Bis dahin erreichen Sie uns unter [Eingangsadresse des Mandanten bzw. hr_postfach].“ Dazu ein Knopf „Abmelden“ (inkl. Keycloak-Abmeldung, 4.3).

2) In Z. 3044 festlegen, wie HR von einer gescheiterten Erstzuordnung erfährt. Entweder ein vierzehntes Ereignis in 8.6, gedrosselt auf eine Meldung je Adresse und Tag, oder ein Eintrag in der Liste „Nicht zugeordnet“ (9.10) mit derselben Zuordnen-Aktion. Die Zählung „dreizehn Ereignisse“ in 8.6 und 8 entsprechend anpassen.

3) In 9.3 einen Satz ergänzen, wo der Entwurf gespeichert wird. Entweder im Browser des Geräts, dann ohne Schemaänderung (Hinweis auf gemeinsam genutzte Rechner in 4.3 beachten), oder die Zeile im Mockup streichen.

4) In 8 (Datei-Härtung) einen Halbsatz ergänzen: Der Bestandstext aus file-upload.ts:205 wird im Mitarbeiterportal durch einen Satz in klarer Sprache ohne MIME-Typ ersetzt (E-S23). Beispiel: „Dieses Dateiformat können wir nicht annehmen. Bitte laden Sie ein PDF oder Foto (JPEG, PNG) hoch.“

Keine Optimistic Updates einführen. Das Muster des UX-Umbaus (gesperrt bis neuer Stand, stilles Neuladen) gilt unverändert, und das sollte im Plan unter 9 so auch in einem Satz stehen.

#### F49 · MINOR · UI/UX · bestätigt
**Maske verspricht automatisches Speichern, das im Plan nirgends gebaut wird**  
*Ort (Fassung 5):* 9.3 Z. 2171; 8.1 Z. 1626–1640; Delta Anliegen.status  
*Problem:* Maske 9.3 verspricht, Entwürfe automatisch zu speichern. Das Statusmodell (acht Zustände, Vorgabe EINGEGANGEN) und das Datenmodell kennen keinen Entwurf, und kein Paket baut einen.  
*Warum:* Beim Bau muss jemand die Speicherung erfinden; naheliegend wäre localStorage. Auf geteilten Rechnern (Lehrerzimmer, Kita-Büro) läge dann „Tod eines Elternteils“ oder eine halb eingegebene IBAN lesbar für die nächste Person im Browser. Dateien lassen sich ohnehin nicht als Entwurf halten, die Beschäftigte glaubt aber, alles sei gesichert.  
*Fix:* Bevorzugt Z. 2171 in 9.3 ersetzen durch `<small>Ihre Angaben werden erst mit „Anliegen absenden“ übermittelt</small>`, also kein Versprechen einer Zwischenspeicherung. Die Formulare sind kurz, das entspricht „Simplicity First“.

Falls die Funktion doch gewollt ist: In S3 unter „Formular-Maschinerie“ einen Satz ergänzen: „Entwurf nur in sessionStorage nach dem Muster bem-detail-content.tsx (Paket G). Schlüssel mit employeeId und Anliegensart, ohne Dateien und ohne Felder, die in datenSensibel landen (Bankverbindung). Gelöscht beim Absenden, bei Abbrechen und beim Abmelden. Hinweis an Dateifeldern: ‚Dateien werden erst beim Absenden übernommen‘.“ Dazu einen Testfall in anliegen-dienst.test.ts oder einem Komponententest: kein Entwurf nach dem Abmelden, kein Entwurf einer anderen Person.

#### F50 · MINOR · Performance · bestätigt
**Abruf startet nach dem letzten ERFOLGREICHEN Abruf: im Fehlerfall jede Minute, ohne Backoff und Retry-After**  
*Ort (Fassung 5):* 10.1, Z. 2765–2771 und Z. 2785–2787; 11.5, Z. 3397–3405  
*Problem:* Der Abruf startet, wenn „der letzte Abruf älter als 15 Minuten“ ist, und letzterAbruf ist laut 11.5 der letzte erfolgreiche. Scheitert ein Lauf, wird die Sperre freigegeben, letzterAbruf bleibt aber alt. Ursachen können ein abgelaufenes Geheimnis sein, Graph 429/503, das Netz oder ein Fehler mitten im Stapel. Der nächste Minuten-Takt der Uhr startet dann sofort wieder. Unter den neun Feldern gibt es keines für den letzten Versuch oder den frühesten nächsten Start. Graph-Drosselung (429, Retry-After) wird nirgends behandelt.  
*Warum:* Im Fehlerfall wird aus dem 15-Minuten-Takt ein 1-Minuten-Takt. Das sind 1.440 Token-Anfragen am Tag gegen Entra ID bei abgelaufenem Geheimnis. Bei Drosselung wird ohne Wartezeit wiederholt, was die Drosselung verlängert. Bei einem Fehler mitten im Stapel startet jede Minute ein neuer Lauf über bis zu 50 Nachrichten. Das ist genau das Gegenteil der Begründung, die der Plan selbst für den Takt gibt.  
*Fix:* Minimal, ohne neues Feld:

1. 11.5, Z. 3404: Den Kommentar von letzterAbruf ändern in „Beginn des letzten Versuchs; gesetzt beim Beanspruchen, wie tagErledigt in laufBeanspruchen“.

2. 10.1, Z. 2768: Diesen Satz ergänzen: „Auch ein gescheiterter Abruf zählt als Abruf; der nächste Versuch folgt frühestens 15 Minuten nach dem Start des vorigen.“

3. 10.3, Z. 2936: Die Bedingung für den roten Hinweis umformulieren in „letzterAbrufStatus meldet einen Fehler, oder letzterAbruf ist älter als 60 Minuten“. Das ist gleichwertig: War der letzte Versuch erfolgreich, ist er auch der letzte Erfolg. War er es nicht, ist der Hinweis ohnehin rot.

4. Den Grundcode DROSSELUNG für 429/503 in die Liste der Grundcodes aufnehmen: Lauf abbrechen, keine Wiederholung innerhalb des Laufs. Der 15-Minuten-Abstand liegt weit über üblichen Retry-After-Werten.

5. Im S3b-Testumfang von postfach-abruf.test.ts (Z. 3836) ergänzen: „gescheiterter Lauf → der nächste Minutentakt startet keinen neuen Lauf“.

Im Finding den Beleg korrigieren: uhr.ts:33 statt :35.

#### F51 · MINOR · Performance · bestätigt
**Abrufsperre übernimmt das 2-Stunden-Verwaistmuster, ohne Laufbudget und ohne Timeouts**  
*Ort (Fassung 5):* 10.1, Z. 2769–2771; 11.5, Z. 3403; 10.3, Z. 2935–2938  
*Problem:* Die Sperre soll „nach demselben Muster“ wie laufBeanspruchen gebaut werden. Dieses Muster gibt eine verwaiste Sperre erst nach 2 Stunden frei. Das passt für Tagesläufe, nicht für einen 15-Minuten-Abruf. Der Plan nennt weder ein eigenes Verwaist-Fenster noch eine Zeitgrenze je Graph- bzw. SMTP-Aufruf oder je Lauf. Ein hängender fetch ohne Timeout hält die Sperre ebenfalls bis zum Verwaisen.  
*Warum:* Jeder Neustart des Containers mitten im Abruf legt den Mail-Eingang bis zu 2 Stunden still. Das passiert bei jedem Deploy, denn der Entrypoint führt dabei db push aus. Nach 60 Minuten erscheint der rote Hinweis, ohne dass jemand etwas tun kann. Ein Lauf mit 50 Nachrichten, Anhängen und 50 Bestätigungsmails dauert ein bis drei Minuten, das trifft also grob jedes zehnte Deploy. Wird das Muster nur halb übernommen, also ohne Verwaist-Fenster, bleibt der Abruf dauerhaft stehen.  
*Fix:* 10.1 Z. 2770f ergänzen: „… damit sich zwei Abrufe nie überholen. Die Sperre gilt nach 10 Minuten als verwaist, festgelegt in einer eigenen Konstante ABRUF_SPERRE_VERWAIST_MS und nicht über SPERRE_VERWAIST_MS (2 h, für Tagesläufe). Ein Neustart mitten im Abruf verzögert den Eingang so höchstens um ein Fenster, und der 60-Minuten-Hinweis bleibt aussagekräftig. Jeder Graph-Aufruf läuft mit AbortSignal.timeout(30 s). Nach 5 Minuten Laufzeit beginnt der Abruf keine neue Nachricht mehr, der Rest folgt im nächsten Lauf. Das Verwaist-Fenster muss größer sein als dieses Budget plus die Bearbeitung einer Nachricht.“
11.5 Z. 3403: Kommentar ändern zu „// Sperre, Muster laufBeanspruchen, verwaist nach 10 min (eigene Konstante)“.
S3b Z. 3834f: Unter postfach-abruf.test.ts ergänzen: „Sperre jünger als 10 min wird nicht übernommen, ältere schon; Laufbudget überschritten bricht nach der laufenden Nachricht ab“.
Für SMTP ist keine Änderung nötig, denn src/lib/mailer.ts:88–90 hat bereits Timeouts.

#### F52 · MINOR · Performance · bestätigt
**„Liegen geblieben“ zählt Systemeinträge mit und greift daher praktisch nie; dazu teure Unterabfragen**  
*Ort (Fassung 5):* 9.6, Z. 2340–2343; 8.4, Z. 1771 und 1793–1795; 13 S3, Z. 3801; 15, Z. 4360  
*Problem:* Der Filter „liegen geblieben“ ist die einzige Vertretungsregel: zugewiesen, aber seit drei Arbeitstagen ohne Eintrag im Verlauf. Die Chronik enthält aber auch alles, was das System selbst tut. Dazu gehören versandte Benachrichtigungen, Erinnerungsstufen, Friständerungen und bei besonderen Kategorien jedes Öffnen (AKTE_GEOEFFNET). Schon der Hinweis drei Tage vor Fristende schreibt also einen Eintrag und setzt die Uhr zurück. Technisch braucht der Filter je Ticket ein „kein Eintrag seit X“ über drei Tabellen (AuditLog, AnliegenAntwort, AnliegenNotiz).  
*Warum:* Bei Fristen von 3 bis 5 Arbeitstagen greift der Filter vor Fristablauf praktisch nie. Die Vorgänge einer erkrankten Sachbearbeiterin fallen erst bei der Eskalation nach Überschreitung auf. Die HR-Leitung verlässt sich auf eine Vertretung, die es nicht gibt.  
*Fix:* In 9.6, Z. 2341, „seit drei Arbeitstagen ohne Eintrag im Verlauf“ ersetzen durch:

„seit drei Arbeitstagen ohne Bearbeitung durch eine Person (Antwort, Notiz, Statuswechsel, Nachweisentscheidung, Zuweisung). Erinnerungen, Benachrichtigungen, Friständerungen durch den Lauf und Lesezugriffe (AKTE_GEOEFFNET) zählen nicht.“

In 11.2 an Anliegen ergänzen: `letzteBearbeitungAm DateTime? // nur durch menschliche Handlungen gesetzt, in derselben Transaktion; Grundlage für „liegen geblieben“ (9.6)`. Dazu ein Satz, warum aktualisiertAm dafür nicht taugt: Der Erinnerungslauf schreibt erinnertStufe.

Die Filterabfrage läuft gegen diese Spalte. Einen zusätzlichen Index braucht es bei dieser Datenmenge nicht.

In S3 (Z. 3801) einen Test ergänzen: Erinnerungslauf, Mailversand und AKTE_GEOEFFNET verändern letzteBearbeitungAm nicht; Antwort, Notiz und Statuswechsel setzen es.

Optional in 15 (Z. 4360) einen Halbsatz ergänzen: Bei kurzen Fristen von 3–5 Arbeitstagen fällt der Filter nahezu mit der Eskalation zusammen. Sein Nutzen liegt bei den Arten mit langer Frist.

#### F53 · MINOR · Architecture · bestätigt
**Löschlauf widerspricht der unveränderlichen Chronik und findet die Postfach-Mails nicht verlässlich**  
*Ort (Fassung 5):* 12.3 Punkt 5 (Z. 3615-3627), 8.4 (Z. 1795-1797), 11.1 (Z. 3027), 11.3 (Z. 3190)  
*Problem:* Der Löschlauf löscht die Anliegen-Zeile. Die AuditLog-Relation im Delta hat kein onDelete, also greift der Prisma-Standard SetNull. Die Chronik (details-Json) bleibt dann als verwaiste Zeile ohne Bezug stehen: weder gelöscht noch auffindbar. Das widerspricht 8.4 („nie überschrieben oder gelöscht“) und dem Hausmuster aus bem-aufbewahrung, wo die Hülle und das AuditLog bleiben. Für die Mails im Ordner „Übernommen“ wird nur die eingehende Message-ID gespeichert, keine Graph-Kennung. Laut Plan gibt es Mails ohne Message-ID. Die Ordner „Aussortiert“ und „Nicht verarbeitet“ haben keine Frist. Zeile 3615 („Mails ohne Anliegen“) widerspricht 10.2 (jede Mail wird ein Ticket).  
*Warum:* Personenbezogene Chronikdaten bleiben unbegrenzt, sind aber nicht mehr dem Vorgang zuzuordnen. Damit fehlt sowohl der Nachweis (§ 36 HinSchG, Art. 15) als auch die Löschung. Die Postfach-Löschung kann einzelne Mails nicht finden, und die zwei Ordner wachsen ohne Frist.  
*Fix:* Nur 12.3 ergänzen, kein Hülle-Umbau und kein neues Feld:
(1) In der Fristentabelle Z. 3615 umbenennen in „Postfachordner ‚Aussortiert‘ (Mails ohne Anliegen)“, Frist 90 Tage.
(2) In der Fristentabelle eine neue Zeile „Postfachordner ‚Nicht verarbeitet‘ — wie das zugehörige Anliegen“.
(3) Im Absatz Z. 3619 ff. die Reihenfolge festlegen: Zuerst die Mails im Postfach löschen. Gefunden werden sie über die internetMessageId, sonst über den neu berechneten quellSchluessel der Antworten des Anliegens. Erst danach in der Datenbank löschen. Scheitert Graph, bleibt das Anliegen stehen und wird beim nächsten Lauf erneut versucht.
(4) Einen Satz ergänzen: „Die AuditLog-Einträge des Anliegens bleiben ohne IP-Adresse bestehen; anliegenId wird beim Löschen auf null gesetzt (onDelete: SetNull, wie bei den übrigen Modulen)“. Im Delta von 11.1 onDelete: SetNull ausdrücklich angeben.

#### F54 · MINOR · Architecture · bestätigt
**Postfach-Zuordnung: Invariante bricht bei der Zuordnung, „gemerkte“ Adresse hat keinen Speicherort**  
*Ort (Fassung 5):* 11.2 (Z. 3059-3061, 3143-3144), 9.10 (Z. 2526), 10.2 (Z. 2876-2878), 10 (Z. 2670-2671)  
*Problem:* Die Regel „genau eines von employeeId oder absenderMail ist gesetzt“ verbietet genau den Übergang, den Maske 9.10 vorsieht: Ein NICHT_ZUGEORDNET-Ticket bekommt eine Person, und der Absender muss als Nachweis bleiben. Maske 9.10 verspricht „die Adresse wird dann für künftige E-Mails gemerkt“. Im Delta gibt es dafür kein Feld und kein Modell, und 10.2 sucht nur die dienstliche Adresse (bzw. die private bei Ausgetretenen). Abschnitt 10 behauptet, der Abruf brauche „keinen Mitarbeiterstamm“, die Zuordnung in 10.2 sucht aber im gespiegelten Stamm aus S0. Diese Abhängigkeit fehlt in Tabelle 13.  
*Warum:* Entweder wird die Invariante verletzt, oder der Absender wird beim Zuordnen gelöscht und der Nachweis geht verloren. Mails von privaten Adressen aktiver Beschäftigter landen dauerhaft im gemeinsamen Eingang, obwohl die Oberfläche anderes zusagt. Ohne S0 wird jede Mail NICHT_ZUGEORDNET.  
*Fix:* 1) Z. 2526: Den Teilsatz „die Adresse wird dann für künftige E-Mails gemerkt" streichen und ersetzen durch: „Die Zuordnung gilt für diese Anfrage; Antworten darauf finden das Ticket über die Ticketnummer." Kein neues Modell.
2) Z. 3060–3061 und Z. 3144: „genau eines von employeeId oder absenderMail ist gesetzt" ersetzen durch „mindestens eines von employeeId oder absenderMail ist gesetzt". Das ist einfacher zu testen und erlaubt beim Zuordnen kein Leeren mehr. Alternativ die bestehende Regel behalten und ergänzen: „Beim Zuordnen wird absenderMail geleert; die Adresse bleibt im ersten Verlaufseintrag (AnliegenAntwort.absender)."
3) Z. 2671: „weder Keycloak noch einen Mitarbeiterstamm" ändern in „weder Keycloak noch Zugänge, wohl aber den Stamm aus S0 für die Zuordnung (10.2)". In Tabelle 13, Zeile S3b, einen Halbsatz ergänzen: „setzt S0 voraus; ohne Stamm wird jede Mail NICHT_ZUGEORDNET".

#### F55 · MINOR · Architecture · bestätigt
**Trennlinie unscharf: Keycloak-Gruppen doppeln die Zugangsentscheidung, HR-Erstzuordnung per E-Mail ungesichert**  
*Ort (Fassung 5):* 4.1 (Z. 615-617), 4.2 (Z. 648-651), 4.4 (Z. 715-718), 9.1 (Z. 1995, 2028), 11.1 (Z. 3038-3046)  
*Problem:* 4.1 sagt, Keycloak bekommt „keine Rollen, die über das Portal entscheiden“. 4.2 führt aber die Gruppen hr-team und beschaeftigte ein, und 9.1 sagt „Keycloak entscheidet danach, wer wohin darf“. Bei Föderation entstehen Konten erst mit der Anmeldung. Wer die Gruppen pflegt, ist offen, und das Portal entscheidet über keycloakSub → User bzw. Employee ohnehin selbst. Die HR-User werden bei der ersten Anmeldung „über die Dienstadresse“ zugeordnet. Die heutigen HR-Logins laufen auf @credo-gruppe.de (Plan 9.1, Seed-Admin), die M365-Domänen laut Plan sind fes-credo.de und fes-minden.de (ungeprüft gegen die Produktivdaten). Eine Regel für „kein Treffer“ gibt es nur für Beschäftigte. Es fehlt auch die Festlegung, die Föderation auf die eigene Tenant-Id zu beschränken und über einen stabilen Verzeichnisschlüssel statt über den E-Mail-Claim zuzuordnen.  
*Warum:* Zwei Stellen entscheiden über den HR-Zugang (Keycloak-Gruppe und Portal-Rolle) und laufen auseinander. Passt die Adresse nicht, ist das HR-Team beim Go-Live von S1 ausgesperrt, und es bleibt nur der Notfallzugang. Eine Zuordnung über einen frei setzbaren Claim ist ein bekannter Übernahmeweg.  
*Fix:* 1. Den Gruppen-Absatz in Z. 648-651 ersetzen durch: „Keycloak führt keine Gruppen. Wohin jemand kommt, entscheidet das Portal: Ein Treffer auf `User` über `keycloakSub` öffnet den HR-Bereich, ein Treffer auf `Employee` das Mitarbeiterportal. Die aufgerufene Adresse (`hr.` bzw. `mein.`) wählt die Sitzung. Wer beides ist, kommt an beide Adressen.“

2. In Z. 2028 „Keycloak entscheidet danach, wer wohin darf, und leitet …“ ändern in „Danach entscheidet das Portal anhand der Zuordnung, wer wohin darf, und leitet …“.

3. In 4.4 nach Z. 718 einen Satz ergänzen: „Vor dem Umschalten gleicht die HR-Leitung die gespeicherten Adressen der rund zwölf `User` mit ihren Microsoft-Anmeldenamen ab und korrigiert Abweichungen. Ein Konto ohne Treffer erhält keinen Zugang (Test in S1). Der Umgebungsschalter bleibt bis zur Abnahme von S2 der Rückweg.“

4. In der S1-Zeile (Z. 3766 f.) „Föderation an Entra ID“ ergänzen um: „Identitätsanbieter mit der Tenant-Id des eigenen Verzeichnisses (kein `common`/`organizations`), je Verzeichnis einer (E-S5)“.

Keine Umstellung auf oid/UPN, denn DokuBit liefert keine oid, und nach der Erstzuordnung ist `keycloakSub` bereits der stabile Schlüssel.

#### F56 · MINOR · Testing · bestätigt
**anmeldung-callback.test.ts kann state, nonce und PKCE so nicht prüfen**  
*Ort (Fassung 5):* 4.3 (Z. 666–678), 4.4 (Z. 722–726), 13/S1 (Z. 3771–3775)  
*Problem:* openid-client 6 ist ein reines ES-Modul ("type": "module"), ebenso seine Abhängigkeit jose 6. Die Jest-Konfiguration (ts-jest, CommonJS) lädt solche Module nicht. Der Bestand mockt jose deshalb in mehreren Testdateien. Der geplante Test müsste openid-client also mocken und würde die Prüfung von state, nonce und PKCE nur an einer Attrappe zeigen. Außerdem fehlen Testfälle: abgelaufenes oder fremdes ID-Token (iss/aud), fehlendes oder fremdes state-Cookie, Rücksprung nur auf interne Ziele. Es fehlt auch der Fall, dass nach S1 die alte Passwortanmeldung (POST /api/auth) für alle außer dem Notfallkonto gesperrt ist und nur über die gesonderte Adresse erreichbar bleibt. Beide Stellungen des Umgebungsschalters sind ebenfalls nicht getestet.  
*Warum:* Der Test vermittelt falsche Sicherheit auf dem kritischsten Pfad. Bliebe die Passwortanmeldung offen, umginge sie den zweiten Faktor von Microsoft, solange die Hashes bis zur Abnahme von S2 stehen.  
*Fix:* In 13/S1 (Z. 3771–3773) die Testzeile so ersetzen: „Tests: anmeldung-callback.test.ts. openid-client wird nur in src/lib/oidc.ts importiert und im Test gemockt (ES-Modul, Muster wie bei jose). Geprüft wird: Ohne state-Cookie oder bei abweichendem state gibt es keine Sitzung. expectedState, Nonce und PKCE-Verifier gehen unverändert an die Bibliothek. Wirft die Bibliothek einen Fehler, gibt es keine Sitzung. Ein unbekanntes Konto erhält keinen Zugang. POST /api/auth weist jedes Konto außer dem Notfallkonto ab, die Notfalladresse schreibt einen Protokolleintrag. Beide Stellungen des Umgebungsschalters werden geprüft.“ Dazu in der Abnahme von S1 ein Satz: „Einmal gegen die Vorabumgebung aus 4.5 geprüft: manipulierter state und wiederverwendeter code werden abgewiesen.“ Weitere Testfälle (Rücksprungziel, iss/aud) nicht aufnehmen, weil der Plan keinen frei wählbaren Rücksprung vorsieht und die Bibliothek die Token prüft.

#### F57 · MINOR · Testing · bestätigt
**Postfach-Tests ohne Graph-Attrappe und echte Testdaten; Sperre, Tagesgrenze und Rundlauf der Message-ID ungetestet**  
*Ort (Fassung 5):* 10.1–10.3 (Z. 2766–2771, 2792–2816, 2828–2841, 2935–2938), 13/S3b (Z. 3825–3841)  
*Problem:* Im Bestand gibt es keinen HTTP-Client für den Server und kein Muster, eine externe API im Jest-Lauf zu ersetzen; fetch wird nur in Komponententests gemockt. Der Plan nennt zwei Testdateien, aber weder die Testnaht (eine Schnittstelle für den Graph-Client) noch die Testdaten. Die Kopfzeilen, an denen Authentifizierung und Automatik-Erkennung hängen, ermittelt erst der Vorlauf an echten Mails. Selbst ausgedachte Kopfzeilen in Tests würden das echte Verhalten von Exchange verfehlen. Diese Fälle sind nicht genannt: eigene Sperre samt verwaister Sperre (Muster SPERRE_VERWAIST_MS); höchstens 50 Mails je Lauf, älteste zuerst; eine Bestätigung je Absender und Tag nach Berliner Zeit; ausgehende Auto-Submitted- und X-Auto-Response-Suppress-Kopfzeilen; Rundlauf der Message-ID vom Versand zu Stufe 1 der Zuordnung; Graph-Fehler 401 (abgelaufenes Geheimnis) und 429; die Berechnung des roten Hinweises (60 Minuten, Fehler, 30 Tage vor Ablauf).  
*Warum:* Der Abruf verschiebt echte Nachrichten, und eine Rücksicherung holt sie nicht zurück (Z. 3840–3841). Fehler in Sperre oder Schleifenschutz erzeugen Doppeltickets oder eine Mailschleife übers Wochenende. Ist der Hinweis falsch berechnet, bleibt der Ausfall wieder unbemerkt.  
*Fix:* In S3b (Z. 3834–3837) die Testliste minimal ergänzen.

1. postfach-abruf.test.ts zusätzlich:
- „Sperre: zweiter Abruf läuft nicht parallel, verwaiste Sperre wird übernommen"
- „höchstens 50 je Lauf, älteste zuerst"
- „Graph-Fehler 401/429 → letzterAbrufStatus mit Grundcode, keine Nachricht verschoben"

Graph wird dabei wie Gotenberg per jest.mock der eigenen Hülle in src/lib/postfach/ ersetzt. Eine eigene Schnittstelle oder Fake-Datei braucht es nicht.

2. Neue Datei postfach-schleifenschutz.test.ts:
- ausgehende Eingangsbestätigung trägt Auto-Submitted: auto-replied und X-Auto-Response-Suppress: OOF, AutoReply
- übrige Anliegen-Mails tragen auto-generated
- höchstens eine Bestätigung je Absender und Berliner Kalendertag, mit dem Fall 23:30 bzw. 00:30

3. Neue Datei postfach-hinweis.test.ts für die Hinweisberechnung als reine Funktion:
- älter als 60 Minuten
- letzter Status ist ein Fehler
- Geheimnis läuft in weniger als 30 Tagen ab
- Normalfall ohne Hinweis

4. Beim Vorlauf einen Halbsatz ergänzen: „Ergebnis: anonymisierte Kopfzeilen-Beispiele (intern, extern dmarc=pass/fail, Abwesenheitsnotiz, Unzustellbarkeitsmeldung, Newsletter) als Testdaten für postfach-zuordnung.test.ts".

Optional einen Rundlauf-Fall in postfach-zuordnung.test.ts aufnehmen: Eine vom S3-Versand erzeugte Message-ID wird von Stufe 1 erkannt.

#### F58 · MINOR · Error Handling · bestätigt
**Rücknahme: Code-Rollback löscht die neuen Tabellen, die S3b-Rücknahme verschickt Ablehnungen und schluckt Mails**  
*Ort (Fassung 5):* 13 (Z. 3695; S3 Z. 3817–3819; S3b Z. 3838–3841); 11 (Z. 2976–2980)  
*Problem:* (a) Der Plan sichert nur die Richtung nach vorn ab: Das Delta ist additiv. Das Hausverfahren für einen Rollback ist laut BEM_DEPLOY.md „git checkout <vorheriger Commit> und docker compose up --build“. Mit dem alten schema.prisma sieht der Entrypoint einen Unterschied und führt db push --accept-data-loss aus. Gelöscht werden dabei die Tabellen anliegen* und sonderurlaub* sowie keycloakSub und AuditLog.anliegenId; es bleibt nur die Schutzkopie. (b) Die S3b-Rücknahme „zurückziehen“ bedeutet ABGELEHNT mit Grund „zurückgezogen“. Das löst Ereignis 11 aus, „immer sofort, nie unterdrückt“, an jede Absenderin. (c) Die zurückverschobenen Mails behalten ihren Prüfschlüssel. Wird der Abruf wieder eingeschaltet, scheitert das Anlegen am Index, und die Mail wird nur verschoben. Sie liegt dann unbearbeitet an einem zurückgezogenen Ticket.  
*Warum:* Im Störfall ist der Code-Rollback der naheliegende Griff. Er löscht ausgerechnet die Tickets mit gesetzlichen Fristen (Auskunft, Elternzeit-Eingang); zurück kommen sie nur über eine Rücksicherung von Hand. (b) erzeugt eine Massenmail mit falscher Aussage, (c) einen stillen Mailverlust.  
*Fix:* 1) In 13 nach Z. 3695 einen Satz ergänzen: „Zurückgenommen wird immer über Schalter, nie über einen Code-Rollback auf einen Stand vor dem Schema-Delta. Der Entrypoint würde mit `db push --accept-data-loss` die neuen Tabellen löschen; zurück kämen sie nur aus der Schutzkopie. Muss Code zurückgesetzt werden, bleibt `prisma/schema.prisma` auf dem neuen Stand.“
2) In Z. 4363 („Zwei Befunde im Bestand“) einen dritten Befund aufnehmen, als eigene Aufgabe außerhalb des Vorhabens: Der Entrypoint soll vor dem Push per `migrate diff --script` auf DROP TABLE und DROP COLUMN prüfen und ohne ausdrückliche Freigabe abbrechen. Außerdem ist die Rollback-Aussage in BEM_DEPLOY.md:152-160 falsch.
3) In der S3b-Rücknahme (Z. 3839–3840) festlegen, wie die Tickets geschlossen werden. Entweder mit einem festen Abschlussgrund und Text („wird wieder direkt per E-Mail bearbeitet“) über Ereignis 11, oder ausdrücklich ohne Benachrichtigung. In beiden Fällen nicht als „zurückgezogen“, denn das ist die Handlung der Beschäftigten (Z. 1641).
4) Für das Wiedereinschalten des Abrufs einen Satz ergänzen: Vorher den Eingang sichten und von Hand Erledigtes nach „Aussortiert“ legen. Ein Treffer am Prüfschlüssel eines per Rücknahme geschlossenen Tickets landet in „Nicht verarbeitet“ statt wortlos in „Übernommen“.

#### F59 · MINOR · Error Handling · bestätigt
**Bankverbindung: Die einzige Kontrolle, zwei Mails, kann unbemerkt ausfallen**  
*Ort (Fassung 5):* 8.6 (Z. 1943–1946); 9.4 (Z. 2209, 2217–2219); 12.1 (Z. 3486); 14 E-S21 (Z. 4258–4263)  
*Problem:* E-S21 stützt das getragene Restrisiko auf die Eingangs- und die Umsetzungsnachricht. Der Plan regelt nur, dass beide nie zusammengefasst und nie abgeschaltet werden. Offen bleibt, was geschieht, wenn der Versand scheitert: Störung der OAuth-Anmeldung, volles Postfach, ungültige Adresse oder SKIPPED. sendEventEmail wirft nicht, sondern meldet FAILED. Nach Hausmuster bleibt das Ticket „angelegt, mit Warnung“. HR kann die IBAN in LOGA buchen und abschließen, obwohl die Beschäftigte nie informiert wurde. Auch was die Beschäftigte im Formular sieht, wenn die Bestätigung scheitert, ist nicht festgelegt.  
*Warum:* Die vom Träger gewählte Kontrolle läuft dann gar nicht. Ein Betrugsfall fällt erst am ausbleibenden Gehalt auf. Der Fix ist keine neue Kontrolle im Sinne von E-S21, sondern stellt sicher, dass die entschiedene auch wirkt.  
*Fix:* In 8.6 im Punkt „Ausnahme für sensible Anliegen“ (Z. 1943–1946) einen Satz ergänzen: „Hat eine der beiden Nachrichten nicht den Status SENT (FAILED oder SKIPPED), zeigt der Vorgang in 9.7 und in der Zeile der Eingangsliste 9.6 einen roten Vermerk ‚Nachricht an die Beschäftigte nicht versendet‘ mit dem Knopf ‚Erneut senden‘. Der Vermerk verschwindet erst nach einem erfolgreichen Nachversand.“

Bewusst keine harte Sperre auf ERLEDIGT. Die Buchung in LOGA läuft außerhalb des Portals, und eine Sperre würde die Umsetzungsmail zurückhalten. Stattdessen nennt der Dialog „Abschließen“ den offenen Vermerk ausdrücklich.

In der Kurzanleitung aus S5 (12.1, Z. 3470) einen Satz ergänzen: „Vor dem Buchen einer Bankverbindung prüfen, ob die Eingangsbestätigung versendet ist.“

Den Testumfang von bankverbindung.test.ts (Z. 3860) um diesen Fall ergänzen: Versandergebnis FAILED oder SKIPPED setzt den Vermerk, ein erfolgreicher Nachversand hebt ihn auf.

#### F60 · MINOR · Error Handling · bestätigt
**Postfachabruf: Wiederholung jede Minute, keine Drosselbehandlung, Sperre bis zu zwei Stunden verwaist**  
*Ort (Fassung 5):* 10.1 (Z. 2765–2771); 11.5 (Z. 3397–3405); 10.3 Der stille Ausfall (Z. 2931–2941)  
*Problem:* Der Abruf startet, wenn der letzte Abruf älter als 15 Minuten ist. letzterAbruf ist aber laut 11.5 der letzte erfolgreiche Abruf, und ein Feld für den letzten Versuch fehlt. Nach jedem Fehlschlag (abgelaufenes Geheimnis, Graph 429 oder 503, Netzwerk) startet der Abruf deshalb bei jedem Takt der Uhr neu, also jede Minute. Retry-After, Zeitgrenzen je Graph-Aufruf und ein Zeitbudget für den Lauf fehlen im Plan. Die Sperre folgt dem Muster von laufBeanspruchen und übernimmt damit dessen Verwaist-Grenze von zwei Stunden. Bricht ein Deploy oder Neustart einen Abruf ab, bleibt abrufLaeuftSeit stehen und der Abruf ruht zwei Stunden. Der rote Hinweis erscheint nach 60 Minuten, ohne dass HR etwas tun kann.  
*Warum:* Die minütliche Wiederholung missachtet die Drosselung durch Graph und verlängert sie. Fällt ein Deploy in einen Lauf, steht der Eingang zwei Stunden still, mit roter Warnung, aber ohne Möglichkeit zu handeln.  
*Fix:* 11.5: ein zehntes Feld `abrufVersuchAm DateTime? // Start des letzten Versuchs, gesetzt beim Beanspruchen` ergänzen. „neun Felder“ in Z. 3396 und Z. 3831 auf „zehn“ ändern.

10.1 Z. 2768 neu formulieren: „… und der letzte Versuch älter als 15 Minuten …“. Damit gilt der 15-Minuten-Takt auch nach Fehlern, und es braucht keinen eigenen Backoff. Dazu ein Satz: Die Sperre des Abrufs gilt nach 20 Minuten als verwaist. Das ist eine eigene Konstante, nicht `SPERRE_VERWAIST_MS`. Ein Lauf nimmt nach etwa 5 Minuten keine neue Nachricht mehr an und gibt die Sperre frei. Jeder Graph-Aufruf bekommt ein `AbortSignal.timeout(30 s)` wie in uhr.ts:99. Bei 429 oder 503 endet der Lauf mit dem Grundcode „gedrosselt“, und der nächste Versuch folgt im regulären Takt.

Knopf „Jetzt abrufen“ und Verdopplung des Abstands nicht aufnehmen, weil sie zusätzlich Komplexität bringen und nicht nötig sind.

#### F61 · MINOR · Code Quality · bestätigt
**Fristmodell unterbestimmt: Einheit, Arbeitstag, Ruhen, Ausnahme für die Auskunft**  
*Ort (Fassung 5):* 8.3 (Z. 1701–1725), 11.2 (Z. 3090–3091), 11.3 (Z. 3272, 3311–3316), 12.3 Nr. 3 (Z. 3584–3586)  
*Problem:* (a) fristTage Int? hat keine Einheit (Arbeits- oder Kalendertage). (b) „Arbeitstag“ ist nicht definiert; der Bestand kennt nur Mo–Fr (nurWerktags), keine NRW-Feiertage. (c) „Bis zum Abrechnungsstichtag“, „spätestens am Tag vor dem Anlass“ und „1 Monat“ lassen sich nicht als fristTage ausdrücken. (d) Wie frist nach einem Wartezustand fortgeschrieben wird, fehlt. (e) Für die Auskunft heißt es „die Uhr ruht nicht“, der Schemakommentar setzt fristRuhtSeit aber bei jeder RUECKFRAGE, und der Code-Katalog hat keinen Schalter dafür. (f) Die erste Erinnerungsstufe „drei Tage vor Fristende“ fällt bei der 3-Arbeitstage-Frist der Bescheinigung auf den Eingangstag. (g) Das Ruhen in GENEHMIGUNG schiebt die Frist der Arbeitsbefreiung über den Anlasstag hinaus.  
*Warum:* Fristen steuern Erinnerung, Eskalation, Lastansicht und Kennzahlen. Zwei Entwickler rechnen unterschiedlich, und die gesetzliche Monatsfrist würde im Code trotz Ausschluss ruhen.  
*Fix:* Minimale Änderungen am Plan:

(1) 11.3 Katalog im Code: „Vorgabefrist“ wird zur typisierten `fristRegel`:
- `{ art: "ARBEITSTAGE", n }`
- `| { art: "WOCHEN", n }`
- `| { art: "MONATE", n }`
- `| { art: "ABRECHNUNGSSTICHTAG" }`
- `| { art: "VOR_DATUM", feld }`

Dazu kommt der Schalter `fristRuht: boolean`, Vorgabe true, false bei „Auskunft und Betroffenenrechte“. Satz ergänzen: „`fristTage` in `anliegen_katalog` überschreibt nur `n` einer ARBEITSTAGE-Regel; bei anderen Regeln ist die Spalte leer und die Maske 9.x bietet sie nicht an.“

(2) Schemakommentar Z. 3091 ändern in: „gesetzt in GENEHMIGUNG, RUECKFRAGE und EXTERN, sofern der Katalog fristRuht = true führt (nicht bei der Auskunft, 12.3)“.

(3) 8.3 um einen Satz ergänzen: „Arbeitstag = Mo–Fr, Feiertage bleiben außen vor wie in minijob-fristen und Zeitplaner. Die Rechnung kommt als `arbeitstageSpaeter` mit Test in `src/lib/kalendertag.ts`. Beim Verlassen eines Wartezustands verschiebt sich `frist` um die ruhenden Arbeitstage, bei VOR_DATUM höchstens bis zum Vortag des Datums.“

Ausdrücklich nicht übernehmen:
- NRW-Feiertagsmodul: Bruch der Hauskonvention, zusätzliche Komplexität.
- Wegfall der Erinnerungsstufe 1 bei kurzen Fristen: höchstens als INFO-Hinweis.

#### F62 · MINOR · Code Quality · bestätigt
**Chronik: Quellen und Löschung widersprechen sich; AuditLog-Zeilen bleiben verwaist**  
*Ort (Fassung 5):* 8.4 (Z. 1793–1801), 8.6 (Z. 1916–1919), 12.3 Nr. 5 (Z. 3619–3622), 11.1 (Z. 3024–3030)  
*Problem:* (a) Die Chronik entsteht laut 8.4 aus dem AuditLog und enthält versandte Benachrichtigungen. Laut 8.6 erscheint jede Nachricht über das EmailLog im Verlauf, und das EmailLog wird nach 90 Tagen gelöscht. (b) Die Chronik wird „nie gelöscht“, der Löschlauf „räumt Vorgang, Verlauf und Nachweise ab“. (c) Die neue Relation AuditLog.anliegen hat kein onDelete. Bei optionalen Relationen setzt Prisma dann standardmäßig SetNull. Nach dem Löschlauf bleiben die AuditLog-Zeilen samt details mit anliegenId = NULL stehen. Im Bestand löscht keine Stelle AuditLog-Zeilen.  
*Warum:* E-S21 stützt das getragene Restrisiko auf die zwei Bank-Benachrichtigungen. Zieht die Chronik sie aus dem EmailLog, ist der Nachweis nach 90 Tagen weg. Umgekehrt überleben Personendaten die Aufbewahrungsfrist als verwaiste Zeilen, die sich für Auskunft und Löschung nicht mehr finden lassen.  
*Fix:* (1) 8.6 Z. 1916–1919 ersetzen durch: „Jede Nachricht landet im EmailLog mit Vorgangsbezug und erscheint im Reiter ‚E-Mails' (11.5). Zusätzlich schreibt der Versand einen AuditLog-Eintrag (`action` z. B. `ANLIEGEN_NACHRICHT_VERSANDT`, `details`: Ereignis und Zustellstatus, ohne Adresse). Aus ihm speist sich die Chronik, nicht aus dem EmailLog, das nach 90 Tagen gelöscht wird." Diese action-Werte für Eingangsbestätigung und die beiden Bank-Nachrichten in die feste Mitarbeiter-Liste aus 8.4 aufnehmen.
(2) 8.4 Z. 1795–1796: „nie überschrieben oder gelöscht" ändern in „nie überschrieben; gelöscht nur zusammen mit dem Vorgang nach Ablauf von `loeschenAb` (12.3)".
(3) 12.3 Z. 3619–3621 ergänzen: „Im selben Lauf und in derselben Transaktion `auditLog.deleteMany({ where: { anliegenId } })` vor dem Löschen des Anliegens. Danach ein inhaltsfreier Löschnachweis (Ticketnummer, Art, Datum, ohne `anliegenId`)." Dazu ein Test, der nach dem Lauf null AuditLog-Zeilen mit dem Ticketbezug erwartet.
(4) 11.1 Z. 3026: `onDelete` ausdrücklich setzen, entweder `Cascade` passend zu (3) oder `SetNull` mit Kommentar. Den Prisma-Standard nicht stillschweigend greifen lassen.

Alternative zu (3)/(4) nach dem BEM-Muster (bem-aufbewahrung.ts): Anliegen-Hülle mit Status GELOESCHT behalten, dann bleibt die Verknüpfung erhalten. Dafür müsste 12.3 „räumt Vorgang … ab" entsprechend umformuliert werden.

#### F63 · MINOR · Code Quality · bestätigt
**Mail-Vorlagen: Tagesgrenze der Eingangsbestätigung und Ticketnummer im Betreff widersprüchlich**  
*Ort (Fassung 5):* 8.6 (Z. 1880, 1910–1913, 1934, 1943–1946), 9.8 (Z. 2414, 2436), 10.2 (Z. 2796, 2838–2841), 10.4 (Z. 2958–2960), E-S18 (Z. 4205–4210)  
*Problem:* (a) Laut E-S18 gibt es höchstens eine Eingangsbestätigung je Absender und Tag, und „dieselbe Vorlage dient der Eingangsbestätigung aus dem Portal“. Laut 8.6 wird sie „immer sofort, nie unterdrückt“ verschickt, und bei der Bankverbindung ist sie Teil der einzigen Kontrolle (E-S21). Ob die Tagesgrenze auch für Eingänge aus dem Portal gilt, bleibt offen; 10.4 liest sich, als gelte sie überall. (b) Stufe 3 in 10.2 sucht die Nummer in eckigen Klammern, die Beispielbetreffs in 9.8 haben keine. Außerdem kann HR alle Vorlagen im Wortlaut ändern, also auch den Betreff.  
*Warum:* Wer am selben Tag Adresse und Bankverbindung meldet, bekäme je nach Umsetzung keine Bestätigung für die Bankänderung. Das ist genau die Nachricht, auf die E-S21 das Restrisiko stützt. Bei uneinheitlichem oder von HR gelöschtem Betreff fällt die Rückfallstufe der Zuordnung weg.  
*Fix:* 1) In E-S18 (Z. 4205ff.), 10.2 Schritt 5 (Z. 2796) und 10.3 (Z. 2910) jeweils ergänzen: „Die Tagesgrenze gilt nur für Anliegen mit quelle = MAIL (Schutz vor Antwortschleifen). Gezählt werden nur Bestätigungen auf Mail-Eingänge, je Absenderadresse und Kalendertag in Berlin. Eingänge aus dem Portal werden immer bestätigt (8.6), die Bankverbindung ohne jede Grenze." In 10.4 (Z. 2959f.) „die Bestätigung allein erreicht nicht jeden Eingang" ändern in „… nicht jeden Mail-Eingang".

2) In 8.6 den Punkt aus Z. 1920 ergänzen: „Die Ticketnummer setzt sendEventEmail zusammen mit der Message-ID als Präfix ‚[AN-…] ' vor den gerenderten Vorlagenbetreff, nach dem Vorbild des [TEST]-Präfixes. In der pflegbaren Vorlage steht sie nicht, HR kann sie also nicht entfernen." In 10.2 Stufe 3 das Erkennungsmuster einmal festlegen, damit es auch Kürzel mit Bindestrich und den Kreis ohne Mandant erfasst, z. B. \[AN-\d{4}-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+\] (passt auf AN-2026-KITA-MI-019 und AN-2026-X-007). Abnahmetest dazu in S3.

3) Die Beispielbetreffe in 9.8 angleichen: „[AN-2026-GYM-014] Neues Anliegen (Gymnasium)" und „[AN-2026-GYM-014] Ihr Anliegen ist erledigt".

#### F64 · MINOR · Security · nicht gegengeprüft
**Keycloak-Verwaltung: Zugangsweg, Rechte der HR-Leitung und Ereignisprotokoll nicht geregelt**  
*Ort (Fassung 5):* 4.1, Z. 597; 4.5, Z. 744; 5.2, Z. 908; S2, Z. 3787-3788  
*Problem:* Die HR-Leitung soll Zugänge nach Weg A ‚in der Keycloak-Verwaltung‘ anlegen. Die Konsole ist aber bewusst nicht öffentlich erreichbar, und der Plan nennt weder den Zugangsweg noch die Rechte. Mit realm-admin könnte sie Benutzer übernehmen (Impersonation), Passwörter föderierter Konten setzen und Mapper ändern, also alles, worauf das Portal vertraut. Das Anmeldeprotokoll, das 4.1 Keycloak zuschreibt, setzt eingeschaltete Login- und Admin-Ereignisse voraus. Im Keycloak-Standard sind sie aus (für 26.8 ungeprüft).  
*Warum:* Ein Realm-Administrator wäre faktisch Superuser des Portals. Ohne Ereignisprotokoll fehlen der Nachweis bei einem Vorfall und die Kennzahl ‚Angemeldete Beschäftigte‘ aus Abschnitt 2.  
*Fix:* In 4.5 ergänzen: Zugang zur Konsole nur über das Verwaltungsnetz bzw. einen eigenen Hostnamen mit IP-Begrenzung. Die HR-Leitung bekommt nur manage-users für Weg-A-Konten, kein realm-admin und keine Impersonation. Master-Admins sind nur die IT, mit MFA. Login- und Admin-Ereignisse einschalten, Aufbewahrungsfrist mit dem DSB abstimmen.

#### F65 · MINOR · UI/UX · nicht gegengeprüft
**Kein Statuskatalog je Sicht; Töne in den Masken uneinheitlich**  
*Ort (Fassung 5):* 8.1 Z. 1637–1640; 9.6 Z. 2302/2323; 9.5 Z. 2249; 8.4 Z. 1771; 8.6 Z. 1891; 9.2 Z. 2103  
*Problem:* Der Plan nennt nur die Codewerte. Es fehlt, welchen Text und welchen Ton jeder der acht Zustände in der HR-Sicht und in der Sicht der Beschäftigten trägt. Die Folge zeigt der Plan selbst: „Eingegangen“ ist in 9.6 einmal rot (weil überfällig) und einmal grau. Offen für Beschäftigte: GENEHMIGUNG, EXTERN, ABGELEHNT. 9.5 zeigt der Beschäftigten die Frist. Nach 8.4 sind Friständerungen für sie aber unsichtbar, und eine Überschreitung wird ihr nicht gemeldet. Das angezeigte Datum springt also still oder liegt in der Vergangenheit. Die Kachel „Ich habe ein Problem“ nutzt den Ton critical, den die Statuspille für „überfällig“ und Fehler vorsieht.  
*Warum:* Uneinheitliche Töne zerstören das Prinzip „Farbe und Wort sagen dasselbe“. Ein Fristdatum in der Vergangenheit lesen Beschäftigte als Versäumnis.  
*Fix:* In 8.1 eine Tabelle anlegen: Zustand → HR-Text und Ton → Text und Ton für Beschäftigte. Beispiele: RUECKFRAGE → „Rückfrage“/wait → „Wartet auf Sie“/wait; GENEHMIGUNG → „Bei der Schulleitung“/neutral; ABGELEHNT mit Grund „zurückgezogen“ → „Zurückgezogen“/neutral. Überfälligkeit nur in der Fristspalte zeigen, nie durch Umfärben der Statuspille. Für Beschäftigte die Frist weglassen oder als „voraussichtlich bis …“ ohne Datum in der Vergangenheit zeigen. Kachel „Ich habe ein Problem“ neutral mit Symbol statt critical.

#### F66 · MINOR · UI/UX · nicht gegengeprüft
**„Verwerfen“ im gemeinsamen Eingang ohne Zielzustand und ohne Bestätigung**  
*Ort (Fassung 5):* 9.10 Z. 2548–2552; 8.1 Z. 1637–1640; 8.4 Z. 1795–1797; 10.2 Z. 2796  
*Problem:* Mit „Verwerfen“ soll das Ticket entfallen. „Kein Anliegen“ ist aber kein Wert der Statusliste, und Löschen widerspricht der schreibgeschützten Chronik aus 8.4. Eine Bestätigung ist nicht vorgesehen. Nach 10.2 hat der Absender zu diesem Zeitpunkt schon eine Eingangsbestätigung mit Nummer.  
*Warum:* Bildet der Bau „Verwerfen“ auf ABGELEHNT ab, was naheliegt, geht Mail #11 („abgelehnt, mit Pflichtbegründung“) an den Absender, etwa an einen Fortbildungsanbieter. Wird ein echtes Anliegen von einer privaten Adresse versehentlich verworfen, verschwindet es ohne Spur, obwohl die Person eine Nummer hat. Die Hausregel verlangt eine Bestätigung bei destruktiven Aktionen.  
*Fix:* Verwerfen = ABGELEHNT mit Grund KEIN_ANLIEGEN, ohne Benachrichtigung (Mail #11 für diesen Grund unterdrücken), mit BestaetigungsDialog und wiederherstellbar über ein Segment „Verworfen“. Für 9.7 festhalten: „Abschließen“ und „Ablehnen“ öffnen einen Dialog mit Pflichttext und Hinweis, wer den Text liest. „Ablehnen“ ist in 9.7 derzeit nur im Menü „⋯“ zu vermuten.

#### F67 · MINOR · UI/UX · nicht gegengeprüft
**Sprache und Anrede: Masken widersprechen E-S23 und Hausregel E6; „Frau Voth“ ohne Datengrundlage**  
*Ort (Fassung 5):* 9.3 Z. 2137, 2150; 14 E-S23 Z. 4287–4290; 9.8 Z. 2440; 5.1 Z. 793; 9.6 Z. 2333; 9.10 Z. 2526; 9 Z. 1973  
*Problem:* (a) 9.3 heißt „Arbeitsbefreiung nach § 29 TV-L“ und erklärt einer trauernden Person den „Jahresdeckel … § 29 Abs. 1 Buchst. e TV-L“. E-S23 verlangt eine verständliche Bezeichnung vor der Norm. Bei Mandanten mit Haustarif wäre „§ 29 TV-L“ zudem falsch; der Titel muss aus dem Regelwerk kommen. (b) Die Mail beginnt mit „Guten Tag Frau Voth“. Employee hat kein Anredefeld (prisma/schema.prisma:151 ff.), und der DokuBit-Abgleich liefert nur Vor- und Nachname. (c) Die HR-Masken siezen („für die Sie zuständig sind“, „Ordnen Sie sie zu“). Nach E6 gilt hinter der HR-Anmeldung „du“ bzw. keine Anrede. (d) 9 nennt „Sie“ noch einen Vorschlag, obwohl E-S9 entschieden ist.  
*Warum:* Eine falsche Anrede in Hunderten Mails wirkt unprofessionell. Normzitate sind für Beschäftigte in Reinigung und Küche eine Hürde (E-S23).  
*Fix:* 9.3: Titel aus Regelwerk bzw. Anlass bilden („Freistellung bei einem Todesfall in der Familie“), die Norm klein darunter. Den Deckel-Hinweis nur bei den Erkrankungsfällen zeigen, in einem Satz. Als Mailanrede „Guten Tag Maria Voth,“ festlegen, oder ein Anredefeld aus DokuBit als Abfrage in E-S15 aufnehmen. HR-Texte ohne Anrede formulieren. „Vorschlag“ ändern in „Festgelegt (E-S9)“.

#### F68 · MINOR · UI/UX · nicht gegengeprüft
**Bankverbindung: Maske zeigt einen Banknamen ohne Datenquelle, widerspricht 6.1 und doppelt den Kontoinhaber**  
*Ort (Fassung 5):* 9.4 Z. 2198–2205; 6.1 Z. 1034  
*Problem:* Nach der IBAN-Prüfung zeigt die Maske „Commerzbank, Köln“. Der Bestand prüft aber nur die Prüfsumme (src/lib/utils/iban-validator.ts mit validateIBAN und formatIBAN); ein Bankleitzahlenverzeichnis ist nicht vorgesehen. 6.1 verlangt ein BIC-Feld, die Maske hat keins. Dazu kommen ein frei editierbares Feld „Kontoinhaber“ und darunter das Ankreuzfeld „Das Konto läuft auf einen anderen Namen“; beides zusammen ist unklar. „Gültig ab Abrechnung“ ist frei wählbar, obwohl der Abrechnungsstichtag den frühesten Monat festlegt.  
*Warum:* Ein abgefragter BIC (bei deutscher IBAN überflüssig) und ein doppelter Kontoinhaber erzeugen bei Nutzern ohne IT-Affinität Rückfragen. Den gezeichneten, aber nicht lieferbaren Banknamen lässt der Bau entweder still weg oder holt sich eine ungeplante Abhängigkeit ins Haus (Datei der Bundesbank samt Pflege).  
*Fix:* Banknamen streichen, oder als Arbeitspunkt mit Datenquelle und Pflege aufnehmen. BIC in 6.1 streichen (SEPA), höchstens optional bei ausländischer IBAN. Kontoinhaber aus dem Stamm vorbelegen und schreibgeschützt zeigen; erst das Ankreuzfeld öffnet ein Namensfeld. „Gültig ab“ mit dem frühesten möglichen Monat aus entgeltabrechnungTag vorbelegen und frühere Monate nicht anbieten.

#### F69 · MINOR · Performance · nicht gegengeprüft
**Graph-Abruf ohne festgelegtes Muster für Anhänge und Text: volle Base64-Last im Webprozess, Zitatketten im Verlauf**  
*Ort (Fassung 5):* 10.2, Z. 2792 und 2807; 10.3, Z. 2925–2927; 11.3, Z. 3188  
*Problem:* Der Plan legt fest, dass je Nachricht zusätzlich die Kopfzeilen geholt werden. Wie Anhänge und Text geholt werden, sagt er nicht. Auf dem Standardweg liefert Graph Anhänge samt Inhalt als Base64 im JSON. Die 10-MB-Grenze aus 12.4 greift dann erst, wenn alles geladen ist. Der Text kommt standardmäßig als HTML mit der gesamten zitierten Vorgeschichte, und AnliegenAntwort.text speichert ihn ungekürzt.  
*Warum:* Eine Mail mit 30 MB Anhängen (Exchange lässt bis 150 MB zu) wird als rund 40 MB großer JSON-String im Prozess der Web-App geparst. Das erzeugt eine Speicherspitze und blockiert die Event-Loop für alle Nutzer, solange der Abruf läuft. Jede Antwort per Mail trägt außerdem die ganze Unterhaltung samt der Portalmails erneut in den Verlauf. Der Verlauf in 9.5 und 9.7 wird so mit jeder Runde länger und unlesbar, und die Tabelle wächst quadratisch je Unterhaltung.  
*Fix:* In 10.2 festschreiben:
- Liste mit $select (ohne Inhalt) auf internetMessageHeaders, uniqueBody, sender und receivedDateTime. Ob die Kopfzeilen im Listenaufruf mitkommen, im S3b-Vorlauf prüfen (ungeprüft). Ohne das bleibt es bei 1+50 Aufrufen, was bei diesem Volumen tragbar ist.
- Anhänge zuerst nur als Metadaten laden (id, name, size, contentType, isInline). Was über 10 MB liegt oder unpassend ist, nicht laden, sondern im Ticket vermerken. Erlaubte Anhänge einzeln über /attachments/{id}/$value holen.
- Text über uniqueBody mit Prefer: outlook.body-content-type="text" holen, auf z. B. 20.000 Zeichen kürzen und NUL-Zeichen entfernen, die PostgreSQL ablehnt.

#### F70 · MINOR · Performance · nicht gegengeprüft
**Löschung im Postfach ohne stabilen Schlüssel; drei Ordner ohne Frist**  
*Ort (Fassung 5):* 12.3 Löschung, Z. 3615–3621; 11.3, Z. 3190; 9.10, Z. 2552; 10.2, Z. 2800–2802  
*Problem:* Der Löschlauf soll „die zugehörigen Mails im Ordner ‚Übernommen‘“ löschen. Gespeichert wird aber nur die Internet-Message-ID, ausdrücklich „nur zur Nachverfolgung“. Die Graph-Kennung einer Nachricht ändert sich beim Verschieben in einen anderen Ordner, wenn keine unveränderlichen Kennungen angefordert werden. Wiederfinden heißt dann je Mail eine Suche über den Ordner. Die AnliegenAntwort-Zeilen verschwinden per Kaskade mit dem Anliegen, die Reihenfolge der Löschschritte ist also entscheidend und nicht festgelegt. Für „Aussortiert“, „Nicht verarbeitet“ und die Mails verworfener Tickets gibt es gar keine Frist.  
*Warum:* Mails bleiben nach dem Löschen des Tickets im Postfach. Genau das nennt der Plan selbst „jede Löschung im Portal wirkungslos“. Die drei Ordner wachsen unbegrenzt.  
*Fix:* Beim Abruf mit Prefer: IdType="ImmutableId" arbeiten und die unveränderliche Graph-Kennung als Spalte graphId an AnliegenAntwort speichern (eine Spalte im Delta). Löschlauf: zuerst die Mails per DELETE über graphId löschen, das Anliegen nur bei Erfolg. Scheitert das, folgt der nächste Lauf. Für „Aussortiert“, „Nicht verarbeitet“ und verworfene Nachrichten eine Exchange-Aufbewahrungsrichtlinie auf den Ordner (z. B. 90 Tage). Das braucht keinen Code, nur einen Eintrag in der Betriebscheckliste aus 10.1.

#### F71 · MINOR · Performance · nicht gegengeprüft
**Mengenbremse über EmailLog-Zählung kann laufende Sendungen nicht sehen**  
*Ort (Fassung 5):* 8.6, Z. 1947–1954; 13 S3, Z. 3803–3804  
*Problem:* Die Bremse je Empfängeradresse soll aus dem EmailLog gezählt und „in der Transaktion nach der Sperre des Vorgangs“ geprüft werden. Das EmailLog wird aber erst nach dem SMTP-Versand geschrieben, außerhalb jeder Transaktion, und Schreibfehler werden verschluckt. recipient ist eine kommagetrennte Adressliste ohne Index, und nur gerenderte Adressen werden kleingeschrieben, overrideTo nicht. Die Sperre gilt je Vorgang, die Zählung je Adresse. Das Bestandsvorbild zählt dagegen Zeilen, die in der Transaktion vor dem Versand entstehen.  
*Warum:* Die Prüfung sieht laufende Sendungen nicht und reiht nichts hintereinander. Zwei Vorgänge derselben Person zählen am selben Stand vorbei, und ein nicht geschriebenes Protokoll zählt gar nicht. Die Zählung braucht ein contains ohne Groß-/Kleinschreibung auf einem Textfeld. Das bleibt nur tragbar, weil der Index auf createdAt das Fenster eingrenzt.  
*Fix:* Die Bremse aus einer Zeile zählen, die in der Statuswechsel-Transaktion vor dem Versand geschrieben wird. Naheliegend ist der ohnehin entstehende Chronik-Eintrag „Benachrichtigung vorgemerkt“ im AuditLog. Gezählt wird je employeeId über die Anliegen der Person im Zeitfenster, gesperrt wird die Personenzeile wie beim Jahresverbrauch. Für „eine Bestätigung je Absender und Tag“ genügt das EmailLog, weil der Abruf seriell läuft. Dann aber mit kleingeschriebener Adresse vergleichen.

#### F72 · INFO · Performance · nicht gegengeprüft
**Lastansicht und Listen: Mengen unkritisch, aber mehrere geplante Abfragen ohne passenden Index; Median und Vergleichszahl**  
*Ort (Fassung 5):* 9.11, Z. 2573–2631; 11.2, Z. 3116 und 3130–3134; 11.5, Z. 3426–3428; 2, Z. 402  
*Problem:* Bei 600–1.200 Portal-Anliegen plus Mail-Tickets im Jahr sind die Aggregationen unkritisch. Mehreren geplanten Abfragen fehlt aber ein passender Index:
- „Mir zugewiesen“ (bearbeiterId)
- Eingang je Woche, 30 Tage und Jahr (erstelltAm, quelle)
- „14 E-Mails heute übernommen“ (AnliegenAntwort: kanal + erstelltAm)
- sortierte Chronik (AuditLog: anliegenId + createdAt)

Den Median kann Prisma nicht aggregieren. „vor 30 Tagen: 19“ lässt sich aus erledigtAm nicht stabil rekonstruieren, weil eine Wiedereröffnung erledigtAm auf null setzt. Graph-Drosselung ist dagegen kein Mengenproblem: höchstens ~150 Aufrufe je Lauf, seriell, bei einer Grenze von 10.000 je 10 Minuten und Postfach. Es zählt nur die 429-Behandlung aus dem Finding zur Startbedingung.  
*Warum:* Heute sind das Sequenzscans im Millisekundenbereich, also kein Lastproblem. Bei drei Jahren Aufbewahrung und wachsendem Katalog sind sie aber die naheliegende Stelle für spätere Langsamkeit. Der Median verleitet dazu, alle Zeilen zu laden und in JavaScript zu sortieren, und die Vergleichszahl kann springen.  
*Fix:* Im Delta ergänzen: Anliegen @@index([bearbeiterId, status]) und @@index([erstelltAm]); AnliegenAntwort @@index([kanal, erstelltAm]); AuditLog @@index([anliegenId, createdAt]) statt [anliegenId]. Den Median per percentile_cont in einer $queryRaw-Abfrage rechnen. Die Vergleichszahl entweder auf „eingegangen in den letzten 30 Tagen“ umstellen oder die Wiedereröffnung mit eigenem Datum führen, statt erledigtAm zu leeren.

#### F73 · MINOR · Architecture · nicht gegengeprüft
**Abruf-Sperre erbt die 2-Stunden-Verwaisung des Zeitplaners**  
*Ort (Fassung 5):* 10.1 (Z. 2765-2771), 11.5 (Z. 3403), 9.6 (Z. 2337-2339)  
*Problem:* abrufLaeuftSeit folgt dem „Muster laufBeanspruchen“. Dort gilt eine Sperre erst nach 2 Stunden als verwaist. Bricht ein Abruf ab, weil der Container mitten im Lauf neu startet (jeder Deploy mit Schema-Abgleich), ruht der Abruf bis zu 2 Stunden. Die rote Störungszeile erscheint schon nach 60 Minuten, ohne zu unterscheiden, ob der Abruf hängt oder ausfällt. Eine Laufzeitgrenze je Abruf fehlt.  
*Warum:* Nach jedem Deploy zur Unzeit gibt es einen Fehlalarm und Mails bleiben bis zu 2 Stunden liegen. Die Sachbearbeitung lernt, die rote Zeile zu ignorieren, und genau das soll sie vermeiden.  
*Fix:* Für den Abruf eine eigene Verwaisungsfrist festlegen (z. B. 15 Minuten, passend zum Takt), dazu AbortSignal-Timeouts auf alle Graph-Aufrufe und die Freigabe im finally. Der Hinweis unterscheidet „Abruf hängt seit …“ von „letzter Abruf fehlgeschlagen“.

#### F74 · INFO · Architecture · nicht gegengeprüft
**Bei Weg C trägt Keycloak wenig – der Zielkonflikt Einfachheit/Vorgabe sollte im Plan stehen**  
*Ort (Fassung 5):* 4.5 (Z. 739-746), 13 S1 (Z. 3761-3776, 3886-3887), E-S5 (Z. 4000-4016)  
*Problem:* Nach E-S5 melden sich alle über Entra ID an. Passwort, zweiter Faktor und Sperre liegen bei Microsoft, die Zuordnung liegt im Portal. Keycloak bleibt als reiner Vermittler, braucht aber einen eigenen Dienst, eine eigene Datenbank, Sicherung, Theme, Proxy-Härtung, quartalsweise Updates und eine benannte Person. openid-client ist schon gewählt und könnte direkt gegen Entra ID laufen. Die wenigen Externen deckt das Portal heute schon mit eigenem Passwort-Setup ab (BEM_BEAUFTRAGTER). Keycloak ist Vorgabe des Auftraggebers (Z. 339-340), deshalb nur ein Hinweis.  
*Warum:* Der Auftraggeber stellt Wartbarkeit und Einfachheit an erste Stelle. Der Plan begründet Keycloak gegen Auth.js, nennt aber nicht die naheliegende Alternative, die einen ganzen Dienst samt Daueraufwand einspart.  
*Fix:* In E-S2/E-S5 einen Absatz ergänzen: Alternative „openid-client direkt gegen Entra ID“, Ersparnis (ein großer Teil von S1, dazu ein halber Tag je Quartal), Verlust (Anmeldestatistik aus Keycloak, eine zentrale Stelle für weitere Anwendungen). Die Wahl dokumentiert bestätigen lassen.

#### F75 · MINOR · Testing · nicht gegengeprüft
**lastansicht.test.ts prüft nur Art. 9, nicht „keine Zahl je Bearbeiterin“ und nicht den Fall ohne Mandant**  
*Ort (Fassung 5):* 9.11 (Z. 2563–2564), 11.2 (Z. 3145–3147), 14/E-S19 (Z. 4223), 13/S5 (Z. 3872–3873)  
*Problem:* Der Test prüft nur besondereKategorie. Nicht abgesichert sind die Zusage aus der Dienstvereinbarung (keine Auswertung je Bearbeiterin) und die Pflicht, Anliegen mit organizationId = null in jeder Zählung mitzunehmen. Es fehlt auch die Gegenprobe, dass die Gesamtzahl der Summe der Teile entspricht und Art.-9-Fälle in keiner Zahl stecken.  
*Warum:* Ein später ergänztes Bearbeiterfeld in der Antwort wäre ein Verstoß gegen die Mitbestimmung (§ 40 MVG-EKD), und niemand würde es bemerken. Nicht zugeordnete Tickets fehlen sonst unbemerkt in „offen“.  
*Fix:* lastansicht.test.ts ergänzen: Die Antwort enthält keinen Schlüssel mit Bezug auf Bearbeiter oder User (feste Liste erlaubter Felder). NICHT_ZUGEORDNET zählt in „offen“ mit. Gesamt = Summe je Art = Summe je Mandant plus „ohne Mandant“, und Art.-9-Fälle stecken in keiner dieser Zahlen.

#### F76 · MINOR · Testing · nicht gegengeprüft
**Barrierefreiheit: Tastatur und Fokus als Abnahmekriterium nicht prüfbar**  
*Ort (Fassung 5):* 12.5 (Z. 3676–3687), 13 Abnahme (Z. 3732–3733)  
*Problem:* Von den vier „harten“ Punkten hat nur der Kontrast einen Test (ui-kontrast.test.ts auf ux-umbau). Für Tastaturbedienung, Fokusführung und -rückkehr sowie „nie nur Farbe“ nennt der Plan weder Test noch Prüfprotokoll, obwohl jede Abnahme sie verlangt. Auf ux-umbau ist jest-axe schon eingebunden.  
*Warum:* Abnahmekriterien, die sich nicht messen lassen, werden unter Zeitdruck abgehakt. Rund 600 Beschäftigte haben kein anderes Werkzeug.  
*Fix:* Je Maske 9.2–9.5 einen Komponententest (jsdom) anlegen: jest-axe ohne Verstöße, Dialog gibt den Fokus an den Auslöser zurück, Statuspille trägt Text. Dazu eine kurze manuelle Tastatur-Checkliste im Abnahmeprotokoll von S2 und S4.

#### F77 · MINOR · Error Handling · nicht gegengeprüft
**Bestandsaussage zur P2002-Lücke ist unvollständig**  
*Ort (Fassung 5):* 8.5 (Z. 1830–1838); 15 Befund (1) (Z. 4363)  
*Problem:* Der Plan nennt Vertragsende, BEM und Elternzeit als Module, die eine gleichzeitige Nummernvergabe nicht abfangen. Dieselbe Lücke haben auch Offboarding und Mutterschutz: Sie prüfen vor dem Schreiben und behandeln P2002 nicht.  
*Warum:* Die Folgeaufgabe aus Abschnitt 15 würde zu eng geschnitten. Gerade das Offboarding wird häufig angelegt und endet dann mit einer 500.  
*Fix:* In 8.5 und 15 „Vertragsende, BEM, Elternzeit, Mutterschutz und Offboarding“ nennen.

#### F78 · MINOR · Code Quality · nicht gegengeprüft
**Schema-Delta weicht von den Bestandskonventionen ab und enthält ungenutzte Zähler**  
*Ort (Fassung 5):* 11.2–11.4 (Z. 3050–3362), 6.2 (Z. 1105–1106)  
*Problem:* (a) Zeitstempel heißen erstelltAm/aktualisiertAm; im Bestand kommt das 0× vor, createdAt 83×. Ein Modell mischt sogar: SonderurlaubRegelwerk hat isActive, istStandard und erstelltAm, AnliegenZugriff grantedById/revokedAt und erstelltAm. (b) Derselbe Wertebereich PORTAL|MAIL heißt einmal quelle, einmal kanal. (c) „Tage“ ist dreifach typisiert: Float, Decimal(4,2) und Int (jahresDeckel). (d) User-Bezüge haben keine Relation (autorUserId, entschiedenVonId, erstelltVonId, AnliegenZugriff.userId), obwohl die genannten Vorbilder OnboardingNote und BemZugriff Relationen haben. (e) zugewiesenAm, ersteAntwortAm, beitraegeMitarbeiter und bearbeiterWechsel nutzt keine Maske und keine Kennzahl. Das widerspricht der eigenen Regel aus 11.4, und bearbeiterWechsel macht genau die Auswertung je Bearbeiterin möglich, die 12.2 ausschließt. Die Kennzahl „ohne Rückfrage“ hat dagegen keine Quelle. (f) 6.2 verweist auf das Muster der Beurteilungsvorlagen (null = globaler Rückfall); das Regelwerk ist aber bewusst ohne Rückfall gebaut.  
*Warum:* Gewohnte Abfragen und Helfer (orderBy createdAt, Aufräumläufe) greifen bei Anliegen ins Leere. Beim Jahresdeckel drohen Rundungs- und Vergleichsfehler. Ohne Relation braucht jeder Autorenname einen eigenen Join.  
*Fix:* createdAt/updatedAt verwenden; einheitlich kanal; Decimal(4,2) für alle Tageswerte einschließlich jahresDeckel. Relationen zu User wie in den Vorbildern (benannt, onDelete: SetNull). Ungenutzte Zähler streichen und „ohne Rückfrage“ aus dem AuditLog ableiten. 6.2 auf „Zuordnung am Mandanten, ohne globalen Rückfall“ korrigieren.

#### F79 · verworfen · UI/UX
**Eingangsbestätigung: Tagesgrenze aus E-S18 widerspricht „immer sofort“ und der Kontrolle bei der Bankverbindung** — nach Gegenprüfung verworfen: Ich halte das Finding als MAJOR nicht für haltbar. Inhaltlich hat der Plan die Frage entschieden, nur nicht in einem Satz zusammengefasst.

(1) Wo die Tagesgrenze steht: Sie kommt ausschließlich im Mailkanal vor.
- E-S18 fragt ausdrücklich nach Mails (Z. 4200: „Soll jede eingehende E-Mail eine automatische Eingangsbestätigung bekommen?").
- 10.2 Schritt 5 (Z. 2796) nennt sie als letzten Schritt der Postfachverarbeitung.
- 10.3 (Z. 2910) führt sie als Schutz gegen die Antwortschleife.
- Gebaut wird sie in S3b als „Schleifenschutz" (Z. 3829), also erst nach den Portalbenachrichtigungen aus S3.
- Der Satz „Dieselbe Vorlage dient der Eingangsbestätigung aus dem Portal" (Z. 4209) betrifft nur den

#### F80 · verworfen · UI/UX
**Formularbausteine fehlen auf ux-umbau und stehen in keinem Paket** — nach Gegenprüfung verworfen: Widerlegt in der Kernaussage („stehen in keinem Paket“). Übrig bleibt nur, dass die neuen Bausteine nicht beim Namen genannt sind.

(1) Bestand stimmt: Auf origin/ux-umbau liegen genau die 14 genannten Dateien in src/components/ui/. TextfeldTyp ist nur "text" | "email" | "tel" | "url" (textfeld.tsx, Typzeile nach TEXTFELD_FARBEN). Im UX-Logbuch steht unter F4: „Datumsfeld → erstes Formular, das es braucht“.

(2) Die Lücke ist aber das gewollte Vorgehen des Hauses. textfeld.tsx sagt selbst: „Datum und Auswahl sind eigene Bausteine und kommen mit ihrem ersten Aufrufer.“ Dass solche Bausteine mit dem ersten Formular entstehen, ist also kein Versehen. Es ist die Regel des UX-Umbaus.

(3) Die Qua

#### F81 · verworfen · Architecture
**Tagesgrenze der Eingangsbestätigung kann den Bankverbindungs-Eingang unterdrücken** — nach Gegenprüfung verworfen: Ich habe den ganzen Plan durchsucht. Danach ist der Kern des Findings, die unterdrückte Eingangsmeldung der Bankverbindung, im Plan bereits gelöst. Als MAJOR ist es überbewertet.

(1) Wofür die Tagesgrenze gilt, ergibt sich aus dem Zusammenhang. E-S18 fragt ausdrücklich „Soll jede eingehende E-Mail eine automatische Eingangsbestätigung bekommen?“ (Z. 4200). Die Grenze steht sonst nur in der Mail-Abrufkette: 10.2 Schritt 5 (Z. 2796) und die Schleifenschutz-Tabelle in 10.3 (Z. 2910).

(2) Für Portal-Eingänge legt 8.6 ohne Einschränkung fest: „Immer sofort, nie unterdrückt: Eingangsbestätigung“ (Z. 1934). Matrixzeile 1 sagt ebenfalls „immer sofort“ (Z. 1880).

(3) Für die Bankverbindung gibt es

#### F82 · verworfen · Testing
**Bankverbindung: die zwei Pflichtmeldungen sind gegen Tagesgrenze und Bremse nicht abgesichert** — nach Gegenprüfung verworfen: Das Finding trifft in seinem Kern nicht zu. Der Plan regelt zwei der drei behaupteten Lücken ausdrücklich, und auch die dritte ist im Wesentlichen geregelt.

(1) Bremse: Z. 1953 sagt zur neuen Bremse je Empfängeradresse „Die Nachrichten mit ‚immer sofort' sind davon ausgenommen“. Laut Z. 1934 gehören dazu Eingangsbestätigung und Erledigt (die Umsetzung). Diese Lücke besteht also nicht.

(2) Sperrzeit: Nach Z. 1937–1942 gilt die Sperrzeit „nur die Zwischenstufen“: In Bearbeitung, Genehmigt, Bearbeiterwechsel, Weiterleitung. Eingang und Erledigt fallen nicht darunter. Zusätzlich verlangen Z. 1943–1946 für die Bankverbindung, Eingang und Umsetzung „immer einzeln“ zu melden. Begründet wird das a

#### F83 · verworfen · Testing
**Genehmigungs-Link „Ja/Nein mit einem Klick“ ohne Test gegen Mailscanner** — nach Gegenprüfung verworfen: Ich halte das Finding als MAJOR nicht für haltbar. Ein kleiner Kern bleibt: Die Formulierung im Plan ist mehrdeutig.

(1) Der Plan verweist ausdrücklich auf das Bestandsmuster. E-S13 (Z. 4121–4126) nennt „das Muster, mit dem Abteilungsaufgaben, Modalitäten und Vertragsende heute arbeiten“. Dazu kommt „dasselbe Verfahren wie die Unterlagen-Links“, ebenso in 11.3 (Z. 3285–3288). Zu diesem Verfahren gehört im Bestand, dass ein GET nichts schreibt (src/lib/unterlagen-upload.ts:703-704, Test src/__tests__/api/unterlagen-upload.test.ts:683). Das passendste Vorbild ist die Leiter-Genehmigung per Magic Link in src/app/api/elternzeit-leiter/[token]/route.ts. GET (Z. 23–78) liest dort nur. POST (Z. 80
