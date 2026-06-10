# BEM E11 — Auto-Platzhalter, Platzhalter-Tooltip, Einwilligungs-Dokumente & Signaturblock

Status: **geplant** (Spec, 2026-06-10). Umsetzung am Folgetag, mit adversariellem Review vor Commit (wie E7/E9/E10).

## 1. Ziel & abgestimmte Entscheidungen
1. **Auto-Platzhalter sichtbar:** Im Generieren-Dialog werden aus dem Fall ermittelte
   Werte **vorbefüllt + überschreibbar** angezeigt (als „automatisch" markiert); nur
   nicht-auflösbare Platzhalter bleiben leere Eingabefelder.
2. **Tooltip:** Liste aller automatisch verfügbaren Platzhalter im Generieren-Menü.
3. **Einwilligungs-Dokumente:** Bei Online-Zustimmung wird **für alle 4 Arten**
   (Datenschutz, Durchführung, BR, SBV) ein **CREDO-CI-PDF** erzeugt — **aus dem
   editierbaren Einwilligungstext** (Snapshot, der dem/der Beschäftigten gezeigt wurde)
   + Falldaten + Signaturblock. Es wird **als `BemDokument` abgelegt** und **per Mail
   (SMTP-direkt) an die/den Beschäftigte:n** gesendet.
4. **Signaturblock:** gestalteter, getippter Signaturblock (kein Zeichnen-Feld) —
   Name in Schreibschrift-Optik + Datum + Siegel „elektronisch signiert am … durch …"
   + Bestätigungs-Häkchen + Integritäts-Hash/Zeitstempel/Textversion.

## 2. IST-Zustand (Recherche)
- **Auto-Befüllung gibt es backend-seitig schon:** `generieren`-Route mischt
  `{ ...resolveBemPlaceholders(fall), ...manuelleEingaben }`. Auto-Felder:
  `vorname, nachname, name, fall_nummer, email, personalnummer, fehlzeiten_ab,
  einladung_am, einwilligung_am, erstgespraech_am` (bem-doc.ts) + `mandant,
  mandant_name, mandant_nummer, mandant_kuerzel, datum, jahr, verantwortliche_stelle,
  verantwortliche_strasse, verantwortliche_plz, verantwortliche_ort, empfaenger`
  (doc-template-resolvers.ts → commonPlaceholders).
- **`extractPlaceholders()`** (doc-templates.ts) liest alle Platzhalter einer .docx;
  die `vorlagen`-Liste im Modal kennt `platzhalter` bereits.
- **Problem:** Das Generieren-Modal (`DokumentGenerierenModal`, bem-detail-content.tsx)
  zeigt **alle** Platzhalter als **leere** Eingabefelder — auch die auto-befüllten.
- **Einwilligung (E10):** `BemEinwilligung.textSnapshot` enthält bereits den exakten
  Wortlaut (titel/koerper) zum Zeitpunkt des Versands; `signedName/signedAt/signedIp`,
  `dokumentHash`, `vorlageVersion` sind vorhanden. `sendEmailDetailed` unterstützt
  `attachments`.

## 3. Teil 1 — Auto-Platzhalter vorbefüllt (~0,5 Tag)
- **Neuer/erweiterter Endpunkt:** `GET /api/bem/[id]/dokumente/platzhalter` (oder die
  bestehende `vorlagen`-Antwort erweitern) liefert `verfuegbar: Record<key,value>` —
  die für DIESEN Fall aufgelösten Auto-Werte (via `resolveBemPlaceholders`).
- **Modal:** pro Template-Platzhalter `p`: ist `verfuegbar[p]` gesetzt → Feld
  **vorbefüllt** + Badge „automatisch"; sonst leeres Pflichtfeld („bitte ausfüllen").
  Überschreiben bleibt möglich (Backend nimmt manuelle Eingaben weiterhin vorrangig).
- Datei(en): `bem-detail-content.tsx` (DokumentGenerierenModal), ggf. neuer GET-Endpunkt.

## 4. Teil 2 — Platzhalter-Tooltip (~0,25 Tag)
- Info-/Tooltip im Generieren-Dialog mit der vollständigen Liste der **automatisch
  verfügbaren** Platzhalter (s. §2) zum Verwenden in eigenen Vorlagen.
- Optional pro gewählter Vorlage: Aufteilung „wird automatisch gefüllt" vs.
  „bitte ausfüllen" (aus `platzhalter` ∩/∖ `verfuegbar`).

## 5. Teil 3 — Einwilligungs-Dokumente erzeugen + mailen + ablegen (~2 Tage)
- **Neue Lib `src/lib/bem-einwilligung-pdf.ts`** (pdfkit, CREDO-CI analog
  `bem-export.ts`/`pdf-deckblatt.ts`): rendert ein PDF mit
  - Kopf + CREDO-Linie, Titel = `textSnapshot.titel` (Art),
  - Wortlaut = `textSnapshot.koerper` (exakt der zugestimmte Text),
  - Falldaten (Name, Fall-Nr, Mandant, Datum),
  - **Signaturblock** (s. Teil 4): signedName, signedAt, IP, Hash, Textversion.
- **Auslöser:** in `POST /api/bem/einwilligung/[token]` nach erfolgreicher Zustimmung
  (`neuerStatus === "ERTEILT"`, je Art): PDF rendern →
  - **Ablage:** `BemDokument` (quelle GENERIERT, Aktentrennung via `defaultAblage`;
    typ-Mapping: Datenschutz → `DATENSCHUTZVEREINBARUNG`, sonst neuer Typ
    `EINWILLIGUNG` **oder** `SONSTIGES` — im Schema ergänzen falls nötig),
    Datei unter `bem/{id}/dokumente/{genId}/…pdf`, Hash gespeichert, auditiert.
  - **Mail:** CREDO-CI-Mail an `employeeEmail` mit dem **PDF als Anhang**
    („Ihre Einwilligung – Kopie"), Versandnachweis (`BemKommunikation`).
- **Robustheit:** Erzeugung/Mail laufen NACH der Einwilligungs-Transaktion; ein Fehler
  darf die Zustimmung nicht zurückrollen (Best-Effort + Protokoll-Eintrag).
- Datei(en): neue PDF-Lib, `einwilligung/[token]/route.ts`, ggf. `schema.prisma`
  (neuer BemDokumentTyp), `bem-aktentrennung.ts` (Ablage-Mapping).

## 6. Teil 4 — Gestalteter Signaturblock (~0,5 Tag)
- **Öffentliches Formular** (`einwilligung-content.tsx`): statt schlichtem „Ihr Name"
  ein Signatur-Block: Namensfeld + **Schreibschrift-Vorschau** (z. B. Font „Dancing
  Script"/kursiv, lokal/CSS), Pflicht-**Häkchen** „Ich bestätige mit meiner
  elektronischen Unterschrift, dass ich obige Erklärung gelesen habe und ihr zustimme",
  nach Absenden Anzeige „elektronisch signiert am {Datum} · Nachweis-ID {Hash-Kurz}".
- **Im PDF** (Teil 3): identischer Signaturblock mit signedName (Schreibschrift-Optik),
  „Elektronisch signiert am {signedAt} durch {signedName}", IP, Hash, Textversion,
  CREDO-Siegel-Optik. Keine echte Zeichnung — getippt + Bestätigung + Hash.

## 7. Compliance
- Das Dokument zeigt **exakt** den zugestimmten Wortlaut (`textSnapshot`) → Beleg, dem
  *was* zugestimmt wurde; `dokumentHash` + `vorlageVersion` belegen Integrität.
- Ablage in der versiegelten Akte (Aktentrennung), jede Erzeugung/Mail auditiert
  (`DOKUMENT_GENERIERT`, `BemKommunikation`). Keine Gesundheitsdaten in Mail-Text.

## 8. Aufwand & Phasen (~3–3,5 Tage)
1. Teil 1 (Auto-Platzhalter vorbefüllt) — ~0,5 T
2. Teil 2 (Tooltip) — ~0,25 T
3. Teil 4 (Signaturblock UI) — ~0,5 T
4. Teil 3 (Einwilligungs-PDF + Mail + Ablage, alle 4 Arten) — ~1,75 T
5. Tests + adversarieller Review + Fixes — ~0,5–0,75 T

## 9. Definition of Done
- Generieren-Dialog: Auto-Werte vorbefüllt+überschreibbar; Tooltip listet verfügbare Platzhalter.
- Online-Zustimmung erzeugt je Art ein CREDO-PDF (aus dem Einwilligungstext-Snapshot +
  Signaturblock), legt es in der Akte ab und mailt es der/dem Beschäftigten.
- Signaturblock wirkt offiziell (Schreibschrift + Siegel + Bestätigung + Hash) in Formular & PDF.
- Build/Lint/Tests grün, Review-Findings behoben.

## 10. Offene Kleinigkeiten (bei Umsetzung entscheiden)
- BemDokumentTyp für Durchführung/BR/SBV: neuer Wert `EINWILLIGUNG` vs. `SONSTIGES`.
- Schreibschrift-Font: per CSS/Web-Font (Formular) bzw. eingebettete Font im PDF (pdfkit).
