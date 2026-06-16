# Feature-Plan: Dokumente im Vorgang & Starterpaket

**Status:** In Umsetzung (Phase 0 gestartet)
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
2. **Ausloesung:** Manueller Button im Abschluss-Schritt (HR-Kontrolle, Nachweis, Resend).
3. **Zustellung:** Einzelne PDF-Anhaenge je Dokument (→ **kein Gotenberg-Merge im MVP**
   noetig, robuster).
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

### Saeule C — Variablen-Katalog im Vorlagen-Editor
- In `brief-vorlagen` (Upload-/Edit-/Generate-Modal): bei Modulwahl die verfuegbaren
  Variablen aus dem Katalog anzeigen, klick-zum-Einfuegen/Kopieren.

### Starterpaket im Detail
- **Datenmodell:** `StarterpaketDokument` (Pool, Scope GLOBAL/MANDANT, mit Hash) +
  `StarterpaketAuswahl` (Markierung je Mandant + `orderIndex`).
  `OnboardingProcess.starterPacketSentAt/SentCount`.
- **Versand:** `POST /api/onboarding/[id]/starterpaket` (`HR_EDIT_ROLES` + `canAccessProcess`):
  markierte aktive Dokumente in Reihenfolge → je PDF ein Anhang → Versand ueber Event
  `onboarding-starter-packet-sent` (editierbare Vorlage, CREDO-CI, EmailLog).
- **Nachweis (rechtssicher):** `starterPacketSentAt` + AuditLog (Dokumentnamen **+ Hashes**)
  + EmailLog (messageId). Leere Konfig → 409.
- **E-Mail-Pfad:** `sendEventEmail` wird um optionale `attachments` erweitert
  (`sendEmailDetailed` kann Anhaenge bereits).

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
- **#13** Hub + Resolver auf Offboarding/Verbeamtung *(nach #8, #10)*

**Aufwand Phase 0+1 ≈ 31 h (~4–4,5 Tage).**

## 5. Risiken & offene Punkte
- **Masernschutz-Formular:** amtliches NRW-Original. Wird layout-treu als `.docx`
  nachgebaut und visuell gegen das Original geprueft. **Fallback:** als fixes System-PDF
  beibehalten (mit Ruecksprache), falls Layout-Treue nicht sicher erreichbar.
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

## Umsetzungsstand (final, 2026-06-16)

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
Empfangs-/Kenntnisnahme-Quittung des MA (Phase-2-Idee), #13 (Rollout).
