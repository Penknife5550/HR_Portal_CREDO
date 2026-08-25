# Onboarding-Fixes August 2026 — Zweckbefristung & Dokument-Typ-Mapping

> **Stand:** 2026-08-19
> **Auf `main`:** `c916f0c` (Merge) · `7af2821` · `360d45d` · `b9dbf93`
> **Verifikation auf dem gemergten Stand:** 475 Tests grün (42 Suites) · `tsc --noEmit` ✅ · `npm run lint` ✅ (0 Errors) · `npm run build` ✅
> **Offen:** Deploy auf dem Server · Entscheidung zu Bestandsdaten (siehe unten)

Zwei unabhängige Fehler im Onboarding, beide von Anwendern gemeldet, beide mit
demselben Muster: Das Portal meldete Erfolg oder schwieg — und blockierte
trotzdem den weiteren Weg.

---

## Übersicht

| # | Problem | Melder | Typ | Commit |
|---|---|---|---|---|
| 1 | Befristeter Vertrag ohne Enddatum nicht erfassbar, Formular blieb stehen | Christliche Familienhilfe Minden | Bug + Feature | `360d45d` |
| 2 | Geburtsurkunde/Masernschutz wurden im Abschluss erneut verlangt | intern | Bug | `b9dbf93` |

---

## 1 — Zweckbefristung im Modalitäten-Formular

**Gemeldet:** Bei einer projektbezogenen Sachgrundbefristung (Kostenzusage des
Jugendamtes) gibt es kein Enddatum. Ohne Datum ging es in Schritt 1 „Stelle &
Vertrag" nicht weiter.

**Ursache:** `PUT /api/modalitaeten/[token]` reichte ein leeres Datumsfeld als
leeren String an die `DateTime`-Spalte durch. Prisma lehnte den Wert ab
(`premature end of input`), die Route antwortete mit 500 — und das Formular
verschluckte den Fehler (`if (!res.ok) return false`), sodass der Weiter-Button
wirkungslos wirkte. Betroffen war **jeder** leere Datumswert, also auch
unbefristete Verträge. Der Schwester-Endpunkt `/api/fragebogen/[token]` filtert
leere Strings und war deshalb nie betroffen.

**Geändert:**

- Leere Datumsfelder werden zu `null`; unplausible Datumsangaben liefern 400
  statt eines Serverfehlers.
- Serverfehler erscheinen rot im Formularkopf, statt still verworfen zu werden.
- Neue Auswahl **Art der Befristung**: festes Enddatum (kalendermäßig) oder
  **Zweckbefristung** (Ende bei Zweckerreichung, § 3 Abs. 1 S. 2 TzBfG).
- Pflichtlogik je Art — im Formular und serverseitig beim Absenden erzwungen.
- Neue Felder `SupervisorData.befristungsart`, `befristungZweck`,
  `vertragsendeVoraussichtlich` (unverbindliche Wiedervorlage für HR).
- Anzeige in Zusammenfassung, Vorgangsansicht und PDF-Export; neue Platzhalter
  `{befristung_art}`, `{befristung_zweck}`, `{befristung_sachgrund}`,
  `{vertragsende_voraussichtlich}`.
- CSV-Export (LOGA): drei neue Spalten **am Ende**, die bestehenden 44
  Spaltenpositionen bleiben unverändert.
- Datumsfelder in Schritt 1 werden beim Zurückspringen wieder vorbelegt
  (ISO-Zeitstempel passte nicht in `<input type="date">`).

**Bewusst so gelöst:** `{vertragsende}` bleibt strikt dem Kalenderdatum
vorbehalten und ist bei einer Zweckbefristung leer — sonst stünde im
Arbeitsvertrag ein Datum, das es rechtlich nicht gibt.

**Ansichten des Formulars:** [`zweckbefristung-formular-mockup.html`](zweckbefristung-formular-mockup.html)

---

## 2 — Dokument-Upload legte Nachweise als `SONSTIGES` ab

**Gemeldet:** Die in Schritt 4 hochgeladene Geburtsurkunde des Kindes wurde im
Abschluss-Schritt erneut verlangt.

**Ursache:** Die Upload-Route ordnete den Dokumenttyp über `DOCUMENT_TYPE_MAP`
zu, deren Schlüssel kleingeschrieben sind. Schritt 4 (Geburtsurkunde Kind) und
Schritt 9 (Masernschutz) sendeten die Enum-Schreibweise — der Treffer blieb aus,
die Datei landete still als `SONSTIGES`. Der Upload meldete Erfolg, das
Pflichtdokument galt weiter als fehlend, und das Absenden blieb blockiert, bis
dieselbe Datei ein zweites Mal hochgeladen wurde.

**Geändert:**

- Die Route nimmt beide Schreibweisen an (`docType.toLowerCase()`), damit auch
  künftige Aufrufer nicht in dieselbe Falle laufen.
- Beide Clients senden den kanonischen Kategorie-Schlüssel.
- Regressionstest ergänzt — die Route hatte vorher keinen einzigen Test.

---

## Prüfung vor dem Merge

Fix 1 durchlief vor dem Commit einen Code-Review: ein eigener Durchgang plus
fünf unabhängige Prüfer mit adversarischer Gegenprüfung. Keine
Korrektheitsfehler; sechs Verdachtsfälle wurden am Code widerlegt. Zwei Befunde
wurden eingearbeitet:

- Die drei neuen CSV-Spalten standen zunächst in der Mitte und hätten zwölf
  nachfolgende Spalten verschoben — ein Risiko für positionsbasierte
  LOGA-Importprofile. Jetzt stehen sie am Ende.
- Der Regressionstest für die Datumsnormalisierung griff nicht: Nimmt man die
  Fix-Zeile heraus, blieb die Suite grün, weil ein nachgelagerter
  Aufräum-Block die Felder ohnehin leerte. Zwei Fälle ergänzt (Zweckbefristung
  mit leerem optionalem Ende, leerer Vertragsbeginn) — per Mutationstest
  nachgewiesen, dass sie jetzt anschlagen.

---

## Offen

| Punkt | Bemerkung |
|---|---|
| **Deploy** | `sudo docker compose up -d --build` — die drei neuen Spalten legt der Entrypoint per `prisma db push` selbst an. |
| **Vorgang Christliche Familienhilfe** | Der Magic Link bleibt gültig. Die Angaben aus Schritt 1 wurden nie gespeichert und müssen einmal neu erfasst werden. |
| **Bestandsdaten `SONSTIGES`** | Nachweise, die vor Fix 2 falsch abgelegt wurden, bleiben so in der Datenbank — es wurde **nicht** rückwirkend korrigiert. Ob eine einmalige Korrektur nötig ist, ist noch nicht entschieden. |
| **Branch** | `fix/dokument-typ-mapping` besteht lokal und auf GitHub weiter und kann nach dem Deploy gelöscht werden. |
