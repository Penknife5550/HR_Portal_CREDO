# Plan: Finale Features vor Go-Live

## Uebersicht der 4 Aenderungen

### 1. Detail-Ansicht: Sidebar → Vollbild-Seite (UI-Redesign)
**Problem:** Die Sidebar (max-w-md = 448px) ist zu eng und unuebersichtlich.
**Loesung:** Neue eigenstaendige Detail-Seite `/dashboard/[id]` mit Vollbild-Layout.

**Layout-Konzept:**
- **Oben:** Header mit Vorgangs-ID, Status-Badge, Person-Info, Zurueck-Button
- **Darunter:** Tab-Navigation mit 4 Tabs:
  - **Uebersicht** – Person, Personalfragebogen-Status, Links
  - **Dokumente** – Dokumente-Liste mit Download-Buttons
  - **Checkliste** – Alle Items mit Notiz-Funktion
  - **Vorgesetzter** – Einstellungsmodalitaeten-Daten uebersichtlich angezeigt
- **2-Spalten-Layout** wo sinnvoll (z.B. Uebersicht links, Quick-Actions rechts)
- CREDO CI: Farben #6BAA24 (Gruen), #009AC6 (Blau), #DADADA (Grau)

**Dateien:**
- NEU: `src/app/(portal)/dashboard/[id]/page.tsx` (Server Component)
- NEU: `src/app/(portal)/dashboard/[id]/detail-content.tsx` (Client Component)
- EDIT: `dashboard-content.tsx` – Klick auf Zeile navigiert zu `/dashboard/{id}` statt Sidebar oeffnen

### 2. Notizen-System fuer Checklisten-Items
**Problem:** Keine Moeglichkeit Notizen zu hinterlegen.
**Loesung:** Nutze das bereits vorhandene `notes`-Feld im ChecklistItem-Model + neues `OnboardingNote`-Model fuer allgemeine Notizen.

**a) Checklisten-Item Notizen (bereits im Schema vorhanden!):**
- Klappbarer Notiz-Bereich unter jedem Checklist-Item
- Inline-Textfeld zum Bearbeiten
- Speichern via PATCH `/api/onboarding/{id}/checklist/{itemId}` mit `{ notes: "..." }`
- Zeigt an wer die Notiz zuletzt bearbeitet hat

**b) Neues Model `OnboardingNote` fuer allgemeine Vorgang-Notizen:**
```prisma
model OnboardingNote {
  id            String            @id @default(uuid())
  onboardingId  String
  onboarding    OnboardingProcess @relation(...)
  content       String
  createdById   String
  createdBy     User              @relation(...)
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  @@map("onboarding_notes")
}
```

**c) Dashboard-Indikator:**
- Im Dashboard-Tabelle: Kleines Notiz-Icon neben dem Namen wenn Notizen vorhanden sind
- Zaehler: "3 Notizen" als Badge

**Dateien:**
- EDIT: `prisma/schema.prisma` – OnboardingNote Model + Relationen
- NEU: `src/app/api/onboarding/[id]/notes/route.ts` – CRUD fuer Notizen
- EDIT: `src/app/api/onboarding/route.ts` – `_count.onboardingNotes` mitzaehlen
- UI in der neuen Detail-Seite (Checkliste-Tab)

### 3. Dokument-Download fuer HR-Team
**Problem:** HR kann Dokumente sehen aber nicht herunterladen.
**Loesung:** Neue Download-API-Route + Download-Button in der UI.

**API:**
- NEU: `src/app/api/onboarding/[id]/documents/[docId]/route.ts`
  - GET → Datei als Stream mit korrektem Content-Type + Content-Disposition: attachment
  - Auth-Check (nur HR-Portal-User)
  - Path-Traversal-Schutz

**UI:**
- Download-Icon-Button neben jedem Dokument
- "Alle herunterladen" Button (optional als ZIP, oder einzeln)

### 4. Vorgesetzter-Antworten in Details anzeigen
**Problem:** SupervisorData ist in der DB aber wird nicht in den Details angezeigt.
**Loesung:** Neuer "Vorgesetzter"-Tab in der Detail-Seite.

**Anzeige (read-only, uebersichtlich in Sektionen):**
- **Stelle & Vertrag:** Betriebsstaette, Stellenbeschreibung, Vertragsbeginn, Befristung
- **Arbeitszeit:** Vollzeit/Teilzeit, Wochenstunden, Tage/Woche, Haupt-/Nebenarbeitgeber
- **Verguetung:** Verguetungsmodell, Entgeltgruppe, Stufe, Gehalt, Zulagen
- **Zusaetzliches:** Kostenstelle, Probezeit, Urlaub, Masernschutz, Zeiterfassung
- Jede Sektion als Card mit Label-Value Paaren
- Grauer Hintergrund wenn noch nicht ausgefuellt

**API:**
- EDIT: `src/app/api/onboarding/[id]/route.ts` – supervisorData komplett mitsenden (alle Felder)

---

## Implementierungs-Reihenfolge (3 parallele Agents)

### Agent A: UI-Redesign (Detail-Vollbild-Seite + Notiz-Indikator im Dashboard)
1. Detail-Seite mit Tabs erstellen
2. Dashboard-Tabelle: Navigation statt Sidebar
3. Notiz-Badge im Dashboard

### Agent B: Notizen-System + Dokument-Download
1. Prisma-Schema: OnboardingNote Model
2. Migration + API-Routes fuer Notizen
3. Download-API fuer Dokumente
4. Notizen-UI im Checkliste-Tab
5. Download-Buttons im Dokumente-Tab

### Agent C: Vorgesetzter-Daten-Anzeige
1. API erweitern: alle SupervisorData-Felder zurueckgeben
2. Vorgesetzter-Tab UI mit allen Sektionen
3. TypeScript-Pruefung + Build-Check

---

## Technische Hinweise
- Dev-Server: `npx next dev` (KEIN --turbopack auf Windows)
- TypeScript: `npx tsc --noEmit`
- Build: `npx next build`
- DB Migration: `npx prisma migrate dev --name add_onboarding_notes`
- Prisma Generate: `npx prisma generate`
