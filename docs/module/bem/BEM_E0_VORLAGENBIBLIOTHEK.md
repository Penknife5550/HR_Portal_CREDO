# E0 — Zentrale Brief-Vorlagenbibliothek

> Moduluebergreifende Word-Vorlagen mit Platzhaltern. Ausgabe als **Word**, **PDF** (mit DMS-QR-Deckblatt) oder **per E-Mail**. Fundament fuer das BEM-Modul (vor E5) und fuer alle anderen Module nutzbar.
>
> Stand: umgesetzt 2026-06-03. Build/Lint/Typecheck gruen, adversariell reviewt.

## Was es kann

- `.docx`-Vorlagen hochladen (nur SUPER_ADMIN + HR_LEITUNG)
- Platzhalter werden beim Upload automatisch erkannt und gespeichert
- Dokument erzeugen (HR-Rollen): Platzhalter manuell befuellen oder automatisch aus Portal-Daten (Datum, Mandant, verantwortliche Stelle)
- Ausgabe: Word-Download, PDF-Download (Deckblatt mit QR-Code zur DMS-Zuordnung), oder Versand per E-Mail mit Anhang
- Mandanten-Scope: global oder pro Mandant
- Jede Erzeugung erzeugt einen `GeneratedDocument`-Eintrag + Audit-Log

## Platzhalter-Syntax (fuer Vorlagen-Autoren)

In der Word-Datei (`.docx`):

| Zweck | Syntax | Beispiel |
|-------|--------|----------|
| Einfacher Platzhalter | `{name}` | `Sehr geehrte/r {vorname} {nachname}` |
| Wenn/Dann (Section) | `{#cond}…{/cond}` | `{#hatKinder}Kinder: {kinderAnzahl}{/hatKinder}` |
| Ausdruck (angular) | `{a > b ? "…" : "…"}` | `{geschlecht == "m" ? "Herr" : "Frau"}` |

**Automatisch befuellte Platzhalter** (ALLGEMEIN-Resolver): `datum`, `jahr`, `mandant`, `mandant_name`, `mandant_kuerzel`, `mandant_nummer`, `verantwortliche_stelle`, `verantwortliche_strasse`, `verantwortliche_plz`, `verantwortliche_ort`. Manuelle Eingaben ueberschreiben diese.

Nicht befuellte Platzhalter werden durch `___` ersetzt und gemeldet (kein Abbruch).

## Architektur / Dateien

```
src/lib/
  doc-templates.ts          docxtemplater-Rendering + Platzhalter-Extraktion (getFullText)
  gotenberg.ts              .docx -> PDF (convertDocxToPdf) + PDF-Merge (mergePdfs)
  pdf-deckblatt.ts          DMS-QR-Deckblatt (pdfkit + qrcode)
  doc-generation.ts         Orchestrator: render -> PDF -> Deckblatt mergen
  doc-template-resolvers.ts Platzhalter-Resolver-Registry (Modul -> Werte); ALLGEMEIN
  validations/brief-vorlagen.ts  Zod-Schemas
  file-upload.ts            + validateDocxUpload (ZIP/Magic-Bytes)
  mailer.ts                 + Attachment-Support

src/app/api/brief-vorlagen/
  route.ts                  GET Liste (org-scoped) / POST Upload (.docx)
  [id]/route.ts             GET Detail / PATCH / DELETE (Soft-Delete)
  [id]/generate/route.ts    POST -> Word | PDF | Mail

src/app/(portal)/brief-vorlagen/
  page.tsx                  Server, Rollen-Gate (HR_EDIT_ROLES)
  brief-vorlagen-content.tsx  Liste + Upload-/Edit-/Generate-Modals

prisma/schema.prisma        DocumentTemplate, GeneratedDocument (+ Back-Relations)
docker-compose.yml          Service "gotenberg" (nur internal-Netz)
```

## Berechtigungen

| Aktion | Rollen |
|--------|--------|
| Vorlage anlegen / bearbeiten / deaktivieren | SUPER_ADMIN, HR_LEITUNG (`ADMIN_ROLES`) |
| Liste sehen / Dokument erzeugen | SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER (`HR_EDIT_ROLES`) |

Mandanten-gebundene Vorlagen sind ueber `orgFilter`/`canAccessOrg` geschuetzt (org-eingeschraenkte Rollen sehen nur globale + zugewiesene).

## Deployment (Server)

`.env` (siehe `.env.production.example`):
```
GOTENBERG_URL=http://gotenberg:3000   # Default, optional
```

`docker compose up -d --build` — dabei passiert automatisch:
1. `prisma db push` (Tabellen `document_templates`, `generated_documents`) via `entrypoint.sh`
2. Gotenberg-Container startet (LibreOffice-Konvertierung, nur internes Netz)

## Teststatus

- ✅ Build / Lint / Typecheck gruen
- ✅ Render-Pipeline (docx-Befuellung, Platzhalter-Extraktion inkl. Wenn/Dann) lokal end-to-end verifiziert
- ⏳ **Braucht laufende DB + Gotenberg (auf dem Server verifizieren):** tatsaechliche `.docx→PDF`-Konvertierung, Mail-Versand, `db push`

## Abhaengigkeiten (neu)

`docxtemplater`, `pizzip`, `angular-expressions` (Peer fuer Wenn/Dann), `@types/pizzip` (dev). In `next.config.ts` als `serverExternalPackages` registriert.

## Review-Findings (alle gefixt)

GET-Liste/-Detail org-gescoped; Mail wird **erst nach erfolgreichem Versand** persistiert (kein falscher "erzeugt"-Eintrag bei Fehler); Platzhalter-Extraktion ignoriert String-Literale in Ausdruecken; Deckblatt-Empfaenger aus gemergten Daten; fehlendes PDF im Mail-Ergebnis sichtbar gemacht; deutsche Fehlermeldungen bei Vorlagen-Syntaxfehlern; Resolver laesst leere Optionalwerte weg (→ `___`-Markierung).

## Bewusst auf E1 verschoben

`BEM_ENCRYPTION_KEY` und der optionale Key-Parameter in `encryption.ts` (`encrypt(text, key?)`) gehoeren zur **versiegelten Akte (E1)** — eine Pflichtpruefung in `entrypoint.sh` jetzt wuerde den Container-Start blockieren, bevor der Key existiert.
