# Feature-Plan: Dokumente im Vorgang & Starterpaket

**Status:** Umgesetzt — dieser Plan ist historisch. Der Versandweg wurde am 04.09.2026 abgeloest.
**Nachfolger:** [dokumentenpaket-versand-plan.html](dokumentenpaket-versand-plan.html) (Plan) und
[dokumentenpaket-offene-punkte.md](dokumentenpaket-offene-punkte.md) (was offen blieb). Der
jeweils gueltige Kurzstand steht in `CLAUDE.md`, Abschnitt „Dokumente & Starterpaket".
**Erstellt:** 2026-06-16
**Quelle:** Abstimmung Dimitri Riesen ↔ Claude (HR-Experte + Senior-Entwickler), Klaerungs-Skill `/klaeren`

---

## 1. Ausgangslage & Ziel

Im Onboarding-Abschluss sollen neue Mitarbeiter:innen ein **Starterpaket** erhalten
(Leitbild, Datenschutz, Anlagen — alles fuer eine rechtssichere Gestaltung des
Arbeitsverhaeltnisses). Aus der Abstimmung wurde daraus ein **durchgaengiges
Dokumente-Konzept**, weil die Dokument-Erzeugung heute zersplittert ist:

| Art | Heute | Editierbar? | Problem |
|---|---|---|---|
| Fuehrungszeugnis-Antrag, Masernschutz | hartcodiert (`docx`-Paket), Download im Tab "Fragebogen-Daten" | nein (nur Code) | falsche Stelle, nicht pflegbar |
| Brief-Vorlagen (Vorlagenbibliothek) | eigene Seite, nur BEM nutzt sie | ja | aus dem Vorgang heraus ungenutzt |
| PDF-Exporte / Uploads | Tab "Dokumente", je Modul eigener Code | – | keine Wiederverwendung |

Resolver fuer Platzhalter existieren nur fuer `ALLGEMEIN` + `BEM`; Onboarding/Offboarding/
Verbeamtung haben keinen. Im Vorlagen-Editor sieht man nur die *Anzahl* Platzhalter,
nicht *welche Variablen verfuegbar* sind.

**Ziel:** zentrale, editierbare Ablage aller Vorlagen + sichtbarer Variablen-Katalog je
Prozess + ein wiedererkennbarer "Dokumente"-Hub pro Vorgang mit Prozessschritt-Bezug,
inkl. Starterpaket-Versand. Onboarding zuerst, dann uebergreifend.

## 2. Getroffene Entscheidungen (6 Klaerungsfragen)

1. **Starterpaket-Verwaltung:** Zentraler Pool + Markierung pro Mandant (gruppenweite
   Dokumente einmal pflegen; je Mandant ankreuzen + Reihenfolge).
   *Heute:* je Mandant **und je Modul** (jedes Vorgangsmodul hat im Konfigurationsbild
   einen eigenen Reiter), und neben den Pool-PDFs stehen auch Brief-Vorlagen im Paket.
2. **Ausloesung:** Manueller Button im Abschluss-Schritt (HR-Kontrolle, Nachweis, Resend).
   *Heute:* zusaetzlich die Karte „Dokumente versenden" im Dokumente-Reiter. Beide
   oeffnen denselben Dialog, in dem die Auswahl je Versand geaendert, die
   Empfaengeradresse ueberschrieben und eine persoenliche Nachricht ergaenzt werden
   kann. Vorlagen mit sensiblen Feldern verlangen je Versand eine Bestaetigung
   (Entscheidung vom 02.09.2026); sie wird serverseitig erzwungen.
3. **Zustellung:** Einzelne PDF-Anhaenge je Dokument (→ **kein Gotenberg-Merge im MVP**
   noetig, robuster).
   *Heute:* unveraendert. Gotenberg wird aber gebraucht, sobald eine Brief-Vorlage im
   Paket steckt — sie wird befuellt und einzeln nach PDF gewandelt. Ohne den Dienst
   gehen nur die festen PDFs.
4. **Dokumente-UI:** Eigener "Dokumente"-Hub-Tab pro Vorgang (Erstellen + Versenden +
   Hochgeladenes + Exporte, jede Unterlage mit Prozessschritt-Etikett).
5. **Altbestand:** Fuehrungszeugnis **und** Masernschutz werden editierbare Vorlagen in
   der Ablage (Risiko Masernschutz s. u.).
6. **Rollout:** Fundament + Onboarding zuerst, dann Offboarding/Verbeamtung.

## 3. Architektur (3 Saeulen)

### Saeule A — Zentrale Ablage + Modul-Resolver
- Deklarierter **Platzhalter-Katalog je Modul** (key, label, beispiel) als Single Source;
  fuer Onboarding u. a. aus `src/lib/field-definitions.ts` abgeleitet.
- **Resolver** je Modul (`registerResolver` in `src/lib/doc-template-resolvers.ts`) fuellen
  die Variablen aus den Vorgangsdaten; sensible Felder (IBAN/SV-Nr/Steuer-ID) werden
  entschluesselt und ueber `sensitiveFields` fuer den Audit-Log gemeldet.
- Konsolidierung: Fuehrungszeugnis + Masernschutz werden Seed-Vorlagen
  (`DocumentTemplate`, `isSystem=true`, `modul=ONBOARDING`, global), Erzeugung ueber die
  zentrale Pipeline `generateFromTemplate` (`src/lib/doc-generation.ts`).

### Saeule B — Dokumente-Hub pro Vorgang
- Neuer Tab "Dokumente" (zuerst Onboarding, `detail-content.tsx`): "Sie sind hier"-
  Schrittleiste; Bereiche **Erstellen** (schritt-etikettierte Vorlagen-Karten,
  Word/PDF/E-Mail), **Versenden** (Starterpaket), **Hochgeladenes**, **Exporte**.
- Als gemeinsame Komponente fuer den spaeteren Rollout auf Offboarding/Verbeamtung gedacht.
- *Heute:* Der vollstaendige Hub mit „Sie sind hier"-Schrittleiste steht weiterhin nur
  im Onboarding. Ausgerollt sind die beiden gemeinsamen Bausteine: `TemplateGenerationSection`
  („Dokumente erstellen" samt Liste der bereits erstellten Schreiben) und
  `DokumentenpaketSection` („Dokumente versenden") stehen im Dokumente-Reiter aller vier
  Vorgangsmodule — Onboarding, Offboarding, Verbeamtung, Vertragsverlaengerung.
  Hochgeladenes und Exporte bleiben dort modul-eigener Code.

### Saeule C — Variablen-Katalog im Vorlagen-Editor
- In `brief-vorlagen` (Upload-/Edit-/Generate-Modal): bei Modulwahl die verfuegbaren
  Variablen aus dem Katalog anzeigen, klick-zum-Einfuegen/Kopieren.

### Starterpaket im Detail

> **Stand 04.09.2026:** Der hier geplante Versandweg ist abgeloest. Die Beschreibung
> unten folgt dem heutigen Code; was im Juni geplant war, steht in Klammern dabei.

- **Datenmodell:** `StarterpaketDokument` (Pool fester PDFs, Scope GLOBAL/MANDANT, mit
  Hash) + `StarterpaketAuswahl`. Die Auswahl zeigt entweder auf ein Pool-PDF
  (`dokumentId`) **oder** auf eine Brief-Vorlage (`templateId`) und traegt neben
  `orderIndex` das Feld `modul`, weil jedes Vorgangsmodul ein eigenes Standardpaket hat
  (zwei Unique-Constraints je Mandant und Modul). Den Nachweis fuehrt das eigene Modell
  `DokumentenVersand` (Tabelle `dokumenten_versand`); jedes dabei erzeugte Schreiben
  haengt ueber `GeneratedDocument.versandId` daran.
  `OnboardingProcess.starterPacketSentAt/SentCount` bleibt nur noch als Spur der
  Vorgaenge aus der Zeit vor dem Nachweis stehen — die Karte zeigt dafuer „Bereits
  versendet am … — vor Einfuehrung des Nachweises, ohne Angabe der Dokumente".
- **Bibliothek und Routen:** `src/lib/dokumentenpaket.ts` (modulneutral) hinter drei
  Routen: `GET /api/dokumentenpaket` stellt das Angebot fuer den Dialog zusammen,
  `POST /api/dokumentenpaket/pruefen` rechnet die Vorpruefung (Groesse, leer bleibende
  Platzhalter, Erreichbarkeit des PDF-Dienstes, ob die Mailvorlage die persoenliche
  Nachricht ueberhaupt ausgibt und ob die eingegebene Empfaengeradresse freigegeben ist),
  `POST /api/dokumentenpaket/versenden` verschickt. Alle drei mit `HR_EDIT_ROLES` und
  eigener Mandantenpruefung; die Resolver fallen bei fehlendem Zugriff still auf die
  allgemeinen Platzhalter zurueck, deshalb darf die Pruefung nicht ihnen ueberlassen
  werden. Nur die Versandroute bremst (siehe unten) — die Vorpruefung laeuft nach jeder
  Aenderung im Dialog und persistiert nichts.
  *(Geplant war `POST /api/onboarding/[id]/starterpaket`. Diese Route und die
  Bibliothek `starterpaket.ts` gibt es nicht mehr.)*
- **Versand:** gewaehlte Positionen in der Reihenfolge der Auswahl → Pool-PDFs
  unveraendert, Brief-Vorlagen befuellt und nach PDF gewandelt → je Dokument ein Anhang
  → Versand ueber das Event des Moduls (`onboarding-starter-packet-sent`,
  `offboarding-documents-sent`, `civil-service-documents-sent`,
  `contract-renewal-documents-sent`; editierbare Vorlage, CREDO-CI, EmailLog).
  Groessengrenze: 15 MB fertige Nachricht (`MAX_PAKET_BYTES`, base64 eingerechnet).
- **Empfaengeradresse:** Die im Vorgang hinterlegte Adresse ist immer erlaubt — beim
  Onboarding ist eine private Freemail-Adresse der Regelfall, eine Allowlist ueber alle
  Adressen blockierte also genau ihn. Weicht die Eingabe im Dialog davon ab, muss ihre
  Domain in der gepflegten Liste stehen (`SmtpConfig.allowedRecipientDomains`, Vergleich
  exakt, nicht per `endsWith`); eine leere Liste heisst keine Einschraenkung. Die
  Entscheidung liegt in `src/lib/empfaenger-allowlist.ts` und faellt VOR dem Bauen der
  Anhaenge — danach waere die Mail samt IBAN schon unterwegs. Dazu zwei Bremsen je
  Benutzerkonto auf der Versandroute: 10 pro Minute und 60 pro Stunde, auch fuer
  abgewiesene Versuche.
- **Nachweis (rechtssicher):** erst nach einem echten `SENT` und in EINER Transaktion —
  `DokumentenVersand` (zugestellte Adresse, tatsaechlicher Betreff, Message-ID,
  Positionen mit Hash, Bestaetigungen) + `GeneratedDocument.versandId` + AuditLog
  (Dokumentnamen, Hashes, tatsaechlich entschluesselte Felder) + der Zeitstempel im
  Onboarding. Scheitert die Transaktion, bleibt das Ergebnis `SENT` mit lauter Warnung
  und einem eigenstaendigen Protokolleintrag: Ein gemeldeter Fehlschlag wuerde zum
  Doppelversand verleiten. Statuscodes (zentral in `statusFuerFehler()`): 409 bei leerer
  Auswahl, fehlender Bestaetigung, fehlender Datei, fehlerhafter Vorlage, nicht
  freigegebener Empfaengeradresse oder laufendem Versand; 413 zu gross; 502 PDF-Dienst
  oder SMTP; 429 bei zu vielen Versendungen; 400 bei unbekanntem Modul oder einer
  Position, die nicht zum Paket gehoert; 404 fuer unbekannten Vorgang **und** fremden
  Mandanten (gleicher Text, damit der Code nichts verraet).
- **E-Mail-Pfad:** `sendEventEmail` nimmt optionale `attachments` (`sendEmailDetailed`
  kann Anhaenge bereits) und wird mit `overrideTo` auf die im Dialog bestaetigte Adresse
  festgelegt — ein An/Cc/Bcc aus der Vorlagenverwaltung darf sie nicht ueberstimmen,
  sonst behauptete der Nachweis eine Zustellung, die nie stattfand. Gerufen wird
  `sendEventEmail` hier direkt statt ueber `triggerWebhooks`: Der Dispatcher reicht
  weder Anhaenge noch `overrideTo` durch, und ihn dafuer zu erweitern hiesse, bis zu
  15 MB Personalunterlagen an eine frei konfigurierbare Webhook-URL zu schicken. Preis
  der Ausnahme: Ein Webhook auf eines der vier „*-sent"-Ereignisse feuert nie. Das
  EmailLog schreibt `sendEventEmail` selbst.

## 4. Phasenplan (Tasks #1–#13)

### Phase 0 — Fundament (~5,5 h)
- **#10** Modul-Resolver + Platzhalter-Katalog (Onboarding)
- **#11** Variablen-Katalog-UI im Vorlagen-Editor *(nach #10)*

### Phase 1 — Onboarding: Hub + Konsolidierung + Starterpaket (~25,5 h)
- **#1** Prisma-Schema: Starterpaket-Modelle + `DocumentTemplate.isSystem`
- **#2** Event + E-Mail-Vorlage `onboarding-starter-packet-sent`
- **#3** Mailer: Anhaenge im Event-Pfad durchreichen
- **#4** Pool-Verwaltung Backend *(nach #1)*
- **#5** Pro-Mandant-Markierung Backend *(nach #1)*
- **#12** Konsolidierung Fuehrungszeugnis + Masernschutz → editierbare Vorlagen *(nach #10, #1)*
- **#6** Konfig-UI Mandanten-Unterseite `/mandanten/[id]/starterpaket` *(nach #4, #5)*
- **#7** Versand-Service + Route *(nach #1, #2, #3, #5)*
- **#8** Dokumente-Hub-Tab (Onboarding) *(nach #7, #12, #10)*
- **#9** Tests, Doku, `credo-check`/`edge-cases` *(nach #6, #8, #12)*

### Phase 2 — Rollout (~6–8 h, spaeter)
- **#13** Hub + Resolver auf Offboarding/Verbeamtung *(nach #8, #10)* — **erledigt:**
  Resolver und Vorlagen am 02.09.2026, der Versand am 04.09.2026 (dabei zusaetzlich
  Vertragsverlaengerung). Offen bleibt allein der uebrige Hub — Hochgeladenes, Exporte,
  Schrittleiste — ausserhalb des Onboardings.

**Aufwand Phase 0+1 ≈ 31 h (~4–4,5 Tage).**

## 5. Risiken & offene Punkte
- **Masernschutz-Formular:** amtliches NRW-Original. Wird layout-treu als `.docx`
  nachgebaut und visuell gegen das Original geprueft. **Fallback:** als fixes System-PDF
  beibehalten (mit Ruecksprache), falls Layout-Treue nicht sicher erreichbar.
  — **Erledigt, der Fallback wurde gezogen:** Das amtliche PDF liegt unveraendert unter
  `public/system-dokumente/masernschutz-nrw.pdf` und wird im Reiter verlinkt.
- **Empfangs-/Kenntnisnahme-Bestaetigung** (MA quittiert Datenschutz/Verhaltenskodex):
  bewusst NICHT im MVP. Versandnachweis (EmailLog + Audit-Hashes) deckt "rechtssicher
  zugestellt" ab; "rechtssicher zugestimmt" waere ein Phase-2-Baustein (Lese-/Signatur-
  Quittung).

## 6. Konventionen (Bezug CLAUDE.md)
- Keine Umlaute in Bezeichnern; deutsche UI; `<Link>` statt `<a>`.
- Schema-Sync via `prisma db push` (kein Migrations-Ordner).
- Neues Event MUSS in `src/lib/events.ts` (Test erzwingt das); CREDO-CI greift zentral.
- Multi-Tenant-Scope via `orgFilter`/`canAccessProcess`; Konfiguration `ADMIN_ROLES`.
- Abschluss-Pruefung mit `/credo-check` + `/edge-cases`.

## Umsetzungsstand Phase 0 + 1 (2026-06-16)

**Phase 0 + 1 abgeschlossen** (Tasks #1–#12), getestet (Jest 272 / `tsc` / Lint gruen),
`credo-check` gruen, gegen die Dev-DB live verifiziert. **#13** (Rollout Hub/Resolver auf
Offboarding/Verbeamtung) bleibt bewusst Phase 2.

Praezisierungen ggue. dem urspruenglichen Plan:
- **Masernschutz:** Das gelieferte amtliche NRW-PDF wird als statisches System-Dokument
  bereitgestellt (`public/system-dokumente/masernschutz-nrw.pdf`, im Hub verlinkt) —
  NICHT als .docx nachgebaut (Layout-Treue, vereinbarter Fallback).
- **Fuehrungszeugnis:** Das gelieferte „(Flow)"-.docx (Felder in Word-Inhaltssteuer-
  elementen) wurde zu einer editierbaren docxtemplater-Vorlage konvertiert
  (`{anrede} {vorname} {nachname} {strasse} {plz} {ort}`, Briefkopf erhalten) und wird
  beim Deploy idempotent geseeded (`prisma/seed-check.js`, Asset in `public/system-dokumente/`).
- **Alt-Generatoren** `docx-fuehrungszeugnis.ts` / `docx-masernschutz.ts` + zugehoerige
  Routen wurden entfernt (ersetzt durch Vorlage bzw. statisches PDF).
- **Zustellung Starterpaket:** einzelne PDF-Anhaenge (kein Gotenberg-Merge noetig).

Offene/optionale Punkte: MINOR-CREDO (`confirm()` + Glyphen wie im Bestandscode),
Empfangs-/Kenntnisnahme-Quittung des MA (Phase-2-Idee). **#13 (Rollout) ist seit dem
04.09.2026 erledigt — siehe den folgenden Abschnitt.**

## Umsetzungsstand Phase 2 (2026-09-04)

Der Rollout ist gelaufen — anders als geplant nicht als Kopie des Onboarding-Hubs,
sondern in zwei gemeinsamen Bausteinen:

- **02.09.2026 — Vorlagen und Resolver** fuer Offboarding und Verbeamtung. Ein neues
  Modul braucht seither vier Stellen: Platzhalter-Katalog, Resolver, die Listen
  `UNTERSTUETZTE_MODULE`/`VORGANG_MANDANT` und die Einbindung im Dokumente-Reiter.
- **04.09.2026 — Dokumentenpaket-Versand** (Bausteine 1-15). `starterpaket.ts` und
  `POST /api/onboarding/[id]/starterpaket` sind entfallen; an ihrer Stelle steht
  `src/lib/dokumentenpaket.ts` mit den drei Routen unter `/api/dokumentenpaket/`.
  Verdrahtet sind alle vier Vorgangsmodule mit je eigener Mailvorlage;
  `modulVerdrahtet()` prueft Mailvorlage UND Resolver, damit kein Modul ohne gelesenes
  Anschreiben versendet. Konfiguriert wird unter `/mandanten/[id]/starterpaket`
  („Dokumentenpakete", je Modul ein Reiter).
- **Nachgezogen aus der Abschlussdurchsicht:** Freigabe abweichender Empfaengeradressen
  (`SmtpConfig.allowedRecipientDomains`, gepflegt in den Einstellungen unter SMTP) und
  ein Rate-Limit auf der Versandroute (10 pro Minute, 60 pro Stunde je Benutzerkonto).
  Beide Bremsen sind — wie die Doppelversand-Sperre — prozesslokal und tragen nur,
  solange das Portal als ein Container laeuft.

Was noch aussteht, steht in [dokumentenpaket-offene-punkte.md](dokumentenpaket-offene-punkte.md)
— insbesondere der Deploy und die Verifikation mit echtem SMTP: Der Versand ist bis
heute nie gegen einen echten Mailserver gelaufen.
