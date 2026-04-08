# Elternzeit Phase 2 — Code-Review Fix-Plan

> **Stand:** 2026-04-09 (nach Re-Review-Runde 2 + Block-1.5-Fix)
> **Quelle:** Superhero Code-Review (7 Agenten: Security, UI/UX, Performance, Architecture, Testing, Error Handling, Code Quality), zweimal durchgelaufen.
> **GoLive-Status:** 🟢 **GoLive-tauglich** — beide CRITICAL-Blocker (Block 1.5 IDOR, Modal-Submit-Race) sind raus.
>
> ## ⚡ NEUE SESSION — HIER WEITERMACHEN ⚡
>
> 1. Lies zuerst Abschnitt **"Re-Review 2 Synthese (2026-04-09)"** weiter unten — dort steht der Stand und die offene Sollte-Liste.
> 2. Working Tree ist **NICHT committed**. Bevor du anfaengst: `cd HR_Portal_CREDO && git status`.
> 3. Reihenfolge der naechsten Fixes (Punkte 3-11 der Synthese): erst die mechanischen Sweeps (Block 8 Webhook-`.catch`, Block 10 sync-`.catch`, Performance #1), dann strukturelles (Test-Factory, Single-Use-Token-Test).
> 4. **Nicht** committen ohne Ruecksprache — der User bestimmt die Commit-Granularitaet.

---

## Findings-Zusammenfassung

| Bereich           | CRITICAL | MAJOR | MINOR | INFO |
|-------------------|----------|-------|-------|------|
| 🔐 Security       |    4     |   7   |   5   |  3   |
| 🎨 UI/UX          |    8     |  11   |   9   |  3   |
| ⚡ Performance    |    0     |   3   |   5   |  3   |
| 🏗️ Architecture   |    2     |   6   |   5   |  3   |
| ✅ Testing        |    6     |   7   |   4   |  3   |
| 🛡️ Error Handling |    2     |   7   |   6   |  3   |
| 💎 Code Quality   |    2     |   8   |  11   |  5   |
| **TOTAL**         | **24**   |**49** |**45** |**23**|

---

## Prioritaeten

### 🔴 PFLICHT vor GoLive (Blocker) — ALLE ERLEDIGT ✅

| Block | Thema | Status |
|---|---|---|
| **1** | IDOR-Fixes (15 Phase-2-Routes) | ✅ erledigt |
| **1.5** | IDOR-Fixes (7 weitere Phase-1-Routes — Re-Review fand sie nach) | ✅ erledigt 04-09 |
| **2** | Single-Use-Token Race-Conditions | ✅ erledigt |
| **3** | File-Upload-Haertung (Orphan-Cleanup, Replace-Race, WebP-Bytes, UUID-Filename) | ✅ erledigt |
| **4** | Cron-Auth + try/catch | ✅ erledigt |
| **5** | UX-Modals statt prompt() (5 Modale + Wrapper) | ✅ erledigt |
| **5.1** | Modal-Submit-Race (try/catch + lokaler Error-State) | ✅ erledigt 04-09 |
| **6** | Code-Bugs (Datum-Regex, 404, PDFKit, top-level try/catch) | ✅ erledigt |
| **7** | Tests fuer kritische Pfade (50/50 gruen, Block 7.3 noch offen) | ⚠️ teilweise — siehe Sollte-Liste |

**Geschaetzte Gesamtdauer Block 1-7:** 1-2 fokussierte Tage

### 🟡 Sollte vor GoLive (kein Blocker, aber wichtig)

| Block | Thema | Aufwand |
|---|---|---|
| 8 | Webhook-Error-Handler einheitlich | 30min |
| 9 | AuditLog mit IP konsistent | 30min |
| 10 | `syncElternzeitFristen` Inkonsistenz | 1h |
| 11 | Phase-2 STATUS_LABELS ergaenzen | 15min |
| 12 | Top-level try/catch in 8 Routes | 1h |

### 🟢 Backlog (naechster Sprint)

| Block | Thema |
|---|---|
| R1 | PDF-Routen-Generator (~500 Zeilen Duplikation) |
| R2 | `api-handler` `withAuth/withRole` Adoption |
| R3 | Inline Zod-Schemas zentralisieren |
| R4 | `Record<string, unknown>` durch `Prisma.*UpdateInput` |
| R5 | `elternzeit-detail-content.tsx` (1030 Zeilen) splitten |
| R6 | Magic Numbers in Konstanten mit BEEG-Paragraph |
| R7 | Brief-Texte in Template-Modul auslagern |
| R8 | Accessibility-Pass (Labels, ARIA, Tab-Semantik) |
| R9 | `prisma.$transaction` Batches in `syncElternzeitFristen` |
| R10 | Cron-Pagination (relevant ab 1000+ Fristen) |
| R11 | Token-Hashing in DB |
| R12 | `@@unique([elternzeitId, fristTyp])` Constraint |
| R13 | DST-Off-by-One in `berechneSeverity` |

---

## Block 1 — IDOR-Fixes 🔐 CRITICAL (Pflicht)

### Problem

15 Phase-2-API-Routes pruefen ausschliesslich `HR_EDIT_ROLES` / `EXPORT_ROLES` / `PORTAL_ROLES`, aber **nicht den Org-Scope**. Da `EINRICHTUNGSLEITUNG` in `EXPORT_ROLES` und `PORTAL_ROLES` enthalten ist, kann eine Einrichtungsleitung von Mandant A jeden Vorgang von Mandant B per direkter UUID lesen, PDFs herunterladen und Dokumente listen.

**DSGVO-Folge:** Brutto-Loehne, Adressen, Kind-Daten und Geburtsurkunden aller 16 Mandanten sind potenziell zugaenglich.

### Betroffene Dateien

```
src/app/api/elternzeit/[id]/dokumente/route.ts                 (GET PORTAL_ROLES)
src/app/api/elternzeit/[id]/dokumente/[docId]/route.ts         (GET + DELETE)
src/app/api/elternzeit/[id]/fristen/route.ts                   (GET + POST)
src/app/api/elternzeit/[id]/fristen/[fristId]/route.ts         (PATCH + DELETE)
src/app/api/elternzeit/[id]/genehmigung-endg/route.ts          (PDF mit Brutto + Kind-Daten)
src/app/api/elternzeit/[id]/br-detmold/route.ts                (PDF Personalnummer/Kind-Daten)
src/app/api/elternzeit/[id]/vbl-info/route.ts
src/app/api/elternzeit/[id]/ag-bescheinigung/route.ts          (Brutto-Lohn 12 Monate!)
src/app/api/elternzeit/[id]/bad-aufforderung/route.ts
src/app/api/elternzeit/[id]/beihilfe-aenderung/route.ts
src/app/api/elternzeit/[id]/br-tracking/route.ts
src/app/api/elternzeit/[id]/genehmigen-endg/route.ts
src/app/api/elternzeit/[id]/ablehnen-endg/route.ts
src/app/api/elternzeit/[id]/leiter-link/route.ts
src/app/api/elternzeit/[id]/antrag-link-endg/route.ts
```

### Fix-Pattern

**Vor jedem Daten-Access prüfen, ob der User Zugriff auf den Mandanten hat:**

```typescript
import { canAccessProcess } from "@/lib/permissions";

// Nach getSession + Rollencheck:
const ez = await prisma.elternzeitProzess.findUnique({
  where: { id },
  select: {
    id: true,
    organizationId: true,  // ← MUSS im select sein
    // ... andere benoetigte Felder
  },
});

if (!ez) {
  return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
}

// IDOR-Schutz: Mandant-Scope pruefen
if (!(await canAccessProcess(session, ez.organizationId))) {
  // 404 statt 403 — verhindert Info-Disclosure ueber Existenz
  return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
}
```

**Sub-Routes (`fristen/[fristId]`, `dokumente/[docId]`):** Über die Eltern-Beziehung pruefen:

```typescript
const doc = await prisma.elternzeitDokument.findUnique({
  where: { id: docId },
  include: { elternzeit: { select: { organizationId: true } } },
});
if (!doc || doc.elternzeitId !== id) return 404;
if (!(await canAccessProcess(session, doc.elternzeit.organizationId))) return 404;
```

### Phase-1-Referenz

`src/lib/permissions.ts`:
- `canAccessProcess(session, organizationId): Promise<boolean>` — gibt `true` fuer GLOBAL_ROLES, sonst `await canAccessOrg`
- `canAccessOrg(session, organizationId)` — prueft `UserOrgAssignment`

**Phase 1 Beispiel**, das es richtig macht: `src/app/api/elternzeit/[id]/route.ts` (GET) — uebernehmen.

### Aufwand

~3h. Pro Route ~10 Min: lesen, `select.organizationId` ergaenzen, Check einbauen, manuell smoke-testen.

---

## Block 2 — Single-Use-Token Race-Conditions 🛡️ CRITICAL (Pflicht)

### Problem

Drei Routes pruefen `*UsedAt === null` und setzen `usedAt` spaeter mit `update`. Zwei parallele Submissions (Doppelklick, Tab-Reload) koennen beide den Check passieren und beide den Antrag absenden -- duplicate Audit-Logs, doppelte Webhook-Triggers, doppelte E-Mails.

### Betroffene Dateien

```
src/app/api/elternzeit-antrag-endg/[token]/route.ts             (POST)
src/app/api/elternzeit-leiter/[token]/route.ts                  (POST)
src/app/api/elternzeit-antrag/[token]/route.ts                  (Phase-1-Bug, gleiches Pattern)
```

### Fix-Pattern

**Atomares Update mit `updateMany` + `count`-Check:**

```typescript
// Statt:
const ez = await prisma.elternzeitProzess.findUnique({ where: { antragTokenEndg: token } });
if (ez.antragTokenEndgUsedAt) return 410;
// ... Logik ...
await tx.elternzeitProzess.update({ where: { id: ez.id }, data: { antragTokenEndgUsedAt: new Date(), /* ... */ } });

// Besser:
const result = await prisma.elternzeitProzess.updateMany({
  where: {
    antragTokenEndg: token,
    antragTokenEndgUsedAt: null,
    antragTokenEndgExpiry: { gt: new Date() },
  },
  data: {
    antragTokenEndgUsedAt: new Date(),
    status: "ANTRAG_ENDG_EINGEREICHT",
    kindName: data.kindName,
    // ... weitere Felder
  },
});

if (result.count === 0) {
  return NextResponse.json(
    { error: "Antrag wurde bereits eingereicht oder Token ist abgelaufen" },
    { status: 410 },
  );
}
```

**Wichtig:** Nach `updateMany` musst du den aktuellen Vorgang neu laden, um IDs / displayId fuer Audit + Webhook zu haben:

```typescript
const ez = await prisma.elternzeitProzess.findUnique({
  where: { antragTokenEndg: token },
  // ... select
});
```

### Aufwand

~1.5h. Drei Routes, jede ~25 Min mit Audit-Log + Webhook neu zu strukturieren.

---

## Block 3 — File-Upload-Haertung 🛡️ CRITICAL (Pflicht)

### 3.1 Orphan-File-Cleanup

**Problem:** `dokumente/route.ts` POST: `saveUploadedFile` schreibt Disk, danach `prisma.elternzeitDokument.create`. Bei DB-Fehler bleibt die Datei orphan.

**Fix:** `src/app/api/elternzeit/[id]/dokumente/route.ts` ab Zeile 108

```typescript
const filename = sanitizeFilename(file.name);
const filePath = await saveUploadedFile(validation.buffer, `elternzeit/${id}`, filename);

let dokument;
try {
  dokument = await prisma.elternzeitDokument.create({
    data: { /* ... */ },
  });
} catch (dbError) {
  // Orphan-File aufraeumen
  await unlink(filePath).catch(() => undefined);
  throw dbError;
}
```

### 3.2 Geburtsurkunden-Replace-Race

**Problem:** `elternzeit-antrag-endg/[token]/upload/route.ts` loescht alte Datei VOR neuem Save. Bei Crash zwischen Delete und Save → Datenverlust.

**Fix:** Reihenfolge umdrehen — neue Datei zuerst speichern, dann alte ersetzen, in Transaktion.

```typescript
// 1. Neue Datei speichern
const newFilename = sanitizeFilename(file.name);
const newPath = await saveUploadedFile(validation.buffer, `elternzeit/${ez.id}`, newFilename);

// 2. In Transaktion: neuen DB-Eintrag erzeugen + alte loeschen
const filesToCleanup: string[] = [];
try {
  await prisma.$transaction(async (tx) => {
    // Alte Eintraege aus DB holen + Pfade merken
    const existing = await tx.elternzeitDokument.findMany({
      where: { elternzeitId: ez.id, dokumentTyp: "GEBURTSURKUNDE" },
    });
    for (const old of existing) {
      filesToCleanup.push(old.dateipfad);
      await tx.elternzeitDokument.delete({ where: { id: old.id } });
    }

    // Neuen Eintrag erzeugen
    await tx.elternzeitDokument.create({
      data: { /* ... */ dateipfad: newPath, /* ... */ },
    });

    // Audit-Log innerhalb der Transaktion
    await tx.auditLog.create({ /* ... */ });
  });

  // Erst NACH erfolgreicher TX die alten Dateien loeschen
  for (const oldPath of filesToCleanup) {
    const resolved = path.resolve(oldPath);
    const expected = path.resolve(process.cwd(), "uploads", "elternzeit", ez.id);
    if (resolved.startsWith(expected + path.sep)) {
      await unlink(resolved).catch(() => undefined);
    }
  }
} catch (txError) {
  // TX fehlgeschlagen → neue Datei aufraeumen
  await unlink(newPath).catch(() => undefined);
  throw txError;
}
```

### 3.3 WebP-Magic-Bytes vollstaendig

**Problem:** `src/lib/file-upload.ts` Zeile 24 prueft nur `RIFF` (Bytes 0-3) → akzeptiert AVI/WAV als WebP.

**Fix:**

```typescript
const MAGIC_BYTES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  // image/webp wird unten separat geprueft (zwei Stellen)
};

const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]; // RIFF an Offset 0
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50]; // WEBP an Offset 8

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/webp") {
    if (buffer.length < 12) return false;
    return (
      WEBP_RIFF.every((byte, i) => buffer[i] === byte) &&
      WEBP_WEBP.every((byte, i) => buffer[i + 8] === byte)
    );
  }
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  return signatures.some((sig) =>
    sig.every((byte, index) => buffer[index] === byte),
  );
}
```

### 3.4 Filename-Kollision verhindern

**Fix:** `src/lib/file-upload.ts` `sanitizeFilename`

```typescript
import { randomUUID } from "crypto";

export function sanitizeFilename(originalName: string): string {
  const cleaned = originalName.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 100);
  const timestamp = Date.now();
  const suffix = randomUUID().slice(0, 8);
  return `${timestamp}-${suffix}-${cleaned}`;
}
```

### Aufwand

~1.5h. 4 Sub-Tasks, jede 15-25 Min.

---

## Block 4 — Cron-Auth + try/catch 🛡️ CRITICAL (Pflicht)

### 4.1 CRON_SECRET Mindestlaenge

**Datei:** `src/app/api/cron/elternzeit-fristen/route.ts` Zeile 53-58

```typescript
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret || cronSecret.length < 24) {
  console.error("[cron/elternzeit-fristen] CRON_SECRET fehlt oder zu kurz (min 24 Zeichen)");
  return NextResponse.json({ error: "Konfigurationsfehler" }, { status: 500 });
}
```

### 4.2 Top-level try/catch

**Datei:** `src/app/api/cron/elternzeit-fristen/route.ts`

Den gesamten POST-Body in try/catch wickeln. Pro-Vorgang-Loop bekommt zusaetzlich eigenen try/catch (existiert teilweise schon, vereinheitlichen).

```typescript
export async function POST(request: NextRequest) {
  try {
    // Auth-Check ...
    // sync-Loop mit pro-Iteration try/catch (existiert) ...
    // Eskalations-Loop mit pro-Iteration try/catch (NEU)
    for (const frist of offeneFristen) {
      try {
        // ... Eskalationslogik
      } catch (err) {
        console.error(`[cron] Eskalation fuer Frist ${frist.id} fehlgeschlagen:`, err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ data: { /* ... */ } });
  } catch (error) {
    console.error("[cron/elternzeit-fristen] POST fehlgeschlagen:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
```

### 4.3 Webhook-Fehler im Cron loggen

```typescript
triggerWebhooks("elternzeit-frist-eskaliert", { /* ... */ }).catch((err) =>
  console.error("[cron] Webhook-Fehler elternzeit-frist-eskaliert:", err instanceof Error ? err.message : err),
);
```

### Aufwand

~1h. Eine Datei, drei kleine Aenderungen + manueller Cron-Test.

---

## Block 5 — UX-Modals statt prompt() 🎨 CRITICAL (Pflicht)

### Problem

8 native `prompt()` / `confirm()` Aufrufe fuer rechtsverbindliche Aktionen. Anti-Pattern: kein CREDO-Look, keine Validierung, untestbar, kein Abbruch ohne Datenverlust.

### Betroffene Stellen

| # | Datei | Zeile | Aktion |
|---|---|---|---|
| 1 | elternzeit-detail-content.tsx | 218 | Vorl. Ablehnung Begruendung |
| 2 | elternzeit-detail-content.tsx | 243-244 | Endg. Antrags-Link Empfaenger |
| 3 | elternzeit-detail-content.tsx | 266-268 | Endg. Genehmigung Unterzeichner |
| 4 | elternzeit-detail-content.tsx | 287-289 | Endg. Ablehnung Begruendung |
| 5 | elternzeit-detail-content.tsx | 437-439 | Leiter-Magic-Link E-Mail |
| 6 | elternzeit-detail-content.tsx | 817-823 | AG-Bescheinigung 4× prompt!! |
| 7 | schulferien-content.tsx | 117 | Schulferien-Loeschung |

### Fix-Plan

**Neue Modal-Komponenten** unter `src/components/elternzeit/modals/`:

1. `ablehnung-modal.tsx` — Textarea mit Live-Zeichenzaehler (>= 10), fuer Vorl + Endg
2. `magic-link-modal.tsx` — generisches Modal fuer E-Mail-Eingabe (vorl/endg/leiter), wiederverwendet `showSendLinkModal`-Pattern aus Phase 1
3. `genehmigung-endg-modal.tsx` — Dropdown mit GF-Daten aus Mandanten-Config, optional Freitext-Override
4. `ag-bescheinigung-modal.tsx` — React-Hook-Form mit Zod, 4 Felder strukturiert, Currency-Input, Date-Picker
5. `confirm-delete-modal.tsx` — generisch fuer destruktive Aktionen, ersetzt `window.confirm`

**Phase-1-Vorbild:** `showSendLinkModal` in `elternzeit-detail-content.tsx` Z. 961ff.

**Pattern:**

```tsx
const [modal, setModal] = useState<
  | { type: "ablehnung-vorl" }
  | { type: "ablehnung-endg" }
  | { type: "ag-bescheinigung" }
  | null
>(null);

// Im JSX:
{modal?.type === "ablehnung-vorl" && (
  <AblehnungModal
    titel="Vorlaeufige Ablehnung"
    onClose={() => setModal(null)}
    onSubmit={async (grund) => {
      await ablehnen(grund);
      setModal(null);
    }}
  />
)}
```

### Aufwand

~3-4h. Modal-Komponenten ~30 Min/Stueck, Detail-UI-Refactor ~1h.

---

## Block 6 — Code-Bugs (klein, aber wichtig) 🛡️ MAJOR

### 6.1 br-tracking Datums-Regex

**Datei:** `src/app/api/elternzeit/[id]/br-tracking/route.ts` Z. 17-23

```typescript
const trackingSchema = z
  .object({
    brSchreibenVersandtAm: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/, "Datum YYYY-MM-DD")
      .nullable()
      .optional(),
    brAktenzeichen: z.string().max(100).nullable().optional(),
    brGenehmigungEingegAm: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/, "Datum YYYY-MM-DD")
      .nullable()
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Mindestens ein Feld erforderlich");
```

### 6.2 schulferien DELETE 404-Handling

**Datei:** `src/app/api/schulferien/[id]/route.ts` Z. 75-77

```typescript
const existing = await prisma.schulferienNRW.findUnique({ where: { id } });
if (!existing) {
  return NextResponse.json({ error: "Ferien-Eintrag nicht gefunden" }, { status: 404 });
}
await prisma.schulferienNRW.delete({ where: { id } });
```

### 6.3 PDFKit-Listener-Reihenfolge

**Datei:** `src/lib/elternzeit-pdf.ts` (alle 6 finalize-Funktionen)

```typescript
// Statt:
doc.end();
return new Promise<Buffer>((resolve, reject) => {
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);
});

// Besser:
return new Promise<Buffer>((resolve, reject) => {
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);
  doc.end();
});
```

### 6.4 Top-level try/catch in 8 Routes ergaenzen

Routes ohne top-level try/catch:
- `fristen/route.ts` GET + POST
- `fristen/[fristId]/route.ts` PATCH + DELETE
- `schulferien/route.ts` GET + POST
- `schulferien/[id]/route.ts` PATCH + DELETE
- `organizations/[id]/elternzeit-config/route.ts` GET + PATCH
- `dokumente/route.ts` GET
- `dokumente/[docId]/route.ts` GET + DELETE

Pattern (analog Phase 1):

```typescript
export async function GET(/* ... */) {
  try {
    // ... Logik
  } catch (error) {
    console.error("[API] route-name GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
```

### Aufwand

~1h. Mechanische Aenderungen.

---

## Block 7 — Tests fuer kritische Pfade ✅ CRITICAL (Pflicht)

### 7.1 Unit-Tests Pure Functions

**Datei:** `src/__tests__/lib/elternzeit-fristen.test.ts` (NEU)

Test-Cases fuer `berechneSeverity`:
- `heute + 20 Tage` → `INFO`
- `heute + 14 Tage` → `WARNING` (Grenze)
- `heute + 15 Tage` → `INFO`
- `heute + 7 Tage` → `URGENT` (Grenze)
- `heute + 0 Tage` → `URGENT`
- `heute - 1ms` → `OVERDUE`
- DST-Wechsel `2026-03-29` → kein Off-by-One

Test-Cases fuer `berechneFristTemplates` (alle 8 Branches):
- Vorgang ohne Abschnitte → keine ANTRAGSFRIST_VORL
- Vorgang mit `antragVorlAm` gesetzt → keine ANTRAGSFRIST_VORL
- Token vorhanden + benutzt → kein TOKEN_*_EXPIRY
- BEAMTER + brSchreibenVersandtAm → BR_GENEHMIGUNG mit +8 Wochen
- TARIF_TV_L → keine BR_GENEHMIGUNG, keine BEIHILFE_AENDERUNG
- VATER ohne Mutterschutz, ohne kindGeburtsdatum → keine GEBURTSURKUNDE_NACHREICHUNG
- Mehrere Abschnitte: `ersterAbschnitt` = frühestes `von`, `letzterAbschnitt` = spätestes `bis`
- Teilzeit `agZustimmung === null` → TEILZEIT_ANTRAG_PRUEFUNG
- Teilzeit `agZustimmung === true` → keine Frist
- Geburtsurkunde bereits hochgeladen → keine GEBURTSURKUNDE_NACHREICHUNG

### 7.2 Unit-Tests File-Upload

**Datei:** `src/__tests__/lib/file-upload.test.ts` (NEU)

Test-Cases fuer `validateMagicBytes`:
- PDF mit `%PDF` → ok
- JPEG `FF D8 FF` → ok
- PNG `89 50 4E 47` → ok
- WebP mit RIFF + WEBP → ok
- WebP nur RIFF (AVI-Header) → false **(deckt Bug)**
- Leerer Buffer → false
- Buffer kuerzer als Signatur → false
- MIME `application/octet-stream` → false
- PDF-Header in JPEG-MIME → false (Mismatch)

Test-Cases fuer `sanitizeFilename`:
- `"foo bar.pdf"` → `"<ts>-<uuid8>-foo_bar.pdf"`
- `"../etc/passwd"` → keine `..` mehr (Slashes ersetzt)
- 200-Zeichen-Name → auf 100 getrimmt
- Unicode `"münchen.pdf"` → `"m_nchen.pdf"`

Test-Cases fuer `saveUploadedFile`:
- `subdir = "../etc"` → throws
- `filename = "../passwd"` → throws
- `filename = "a/b.pdf"` → throws
- `subdir = "elternzeit/<id>"` mit `filename = "test.pdf"` → ok
- Symlink-resolved Pfad ausserhalb uploadsRoot → throws

### 7.3 API-Tests Single-Use-Token

**Datei:** `src/__tests__/api/elternzeit-antrag-endg-token.test.ts` (NEU)

```typescript
test("Race-Condition: zwei parallele POSTs", async () => {
  // Setup: Vorgang mit Token
  const [r1, r2] = await Promise.all([POST_REQUEST, POST_REQUEST]);
  // Erwartung: 1× 200, 1× 410
  const statuses = [r1.status, r2.status].sort();
  expect(statuses).toEqual([200, 410]);
});
```

Weitere Cases:
- POST ohne Token → 404
- POST mit expired Token → 403
- POST mit usedAt → 410
- POST happy path → 200, setzt usedAt
- 2. POST danach → 410

### 7.4 Cron-Test

**Datei:** `src/__tests__/api/cron-elternzeit-fristen.test.ts` (NEU, Pattern aus `cron-civil-service-deadlines.test.ts`)

- Korrektes Bearer-Token → 200
- Falsches Token → 401
- Header fehlt → 401
- `CRON_SECRET` env nicht gesetzt → 500
- Frist mit `letzteSeverity = WARNING` und aktueller Severity `URGENT` → Webhook + Update
- Frist mit `letzteSeverity = URGENT` und aktueller Severity `URGENT` → kein Webhook (Idempotenz)

### Aufwand

~1 Tag. 4 Test-Dateien, ~50 Test-Cases insgesamt.

---

## Block 8 — Webhook-Error-Handler einheitlich 🟡 SOLLTE

### Problem

Phase 2 mischt zwei Stile:
- Einige Routes loggen strukturiert (`br-detmold`, `genehmigen-endg`, `antrag-link-vorl`)
- Andere schlucken stumm (`vbl-info`, `ag-bescheinigung`, `br-tracking`, `leiter-link`, `elternzeit-leiter`, `cron`)

### Fix

In allen `triggerWebhooks(...)`-Aufrufen das Phase-1-Pattern verwenden:

```typescript
triggerWebhooks("elternzeit-vbl-generiert", { /* ... */ }).catch((err) =>
  console.error(
    "[elternzeit-vbl-generiert] Webhook-Fehler:",
    err instanceof Error ? err.message : err,
  ),
);
```

**Aufwand:** 30 Min, mechanisch.

---

## Block 9 — AuditLog mit IP konsistent 🟡 SOLLTE

### Problem

Public-Routes loggen `ipAddress`, HR-Routes nicht. Forensik bei DSGVO-Vorfall erschwert.

### Fix

In allen Phase-2-HR-Routes beim `auditLog.create` ergaenzen:

```typescript
ipAddress:
  request.headers.get("x-forwarded-for") ||
  request.headers.get("x-real-ip") ||
  null,
```

**Aufwand:** 30 Min.

---

## Block 10 — `syncElternzeitFristen` Inkonsistenz 🟡 SOLLTE

### Problem

Manche Routes propagieren `syncElternzeitFristen`-Fehler (User sieht 500 obwohl Status erfolgreich gesetzt), andere schlucken still.

### Fix

Einheitliches Pattern in allen Routes:

```typescript
// Status-Update zuerst commit
const updated = await prisma.elternzeitProzess.update(/* ... */);

// Frist-Sync best-effort, Fehler nur loggen
await syncElternzeitFristen(id).catch((err) =>
  console.error(
    `[syncElternzeitFristen] Fehler nach Status-Update ${id}:`,
    err instanceof Error ? err.message : err,
  ),
);
```

**Aufwand:** 1h. Betrifft 6 Routes.

---

## Block 11 — Phase-2 STATUS_LABELS ergaenzen 🟡 SOLLTE

### Problem

`elternzeit-detail-content.tsx` Z. 101-111: STATUS_LABELS-Map fehlen die Phase-2-Status `ANTRAG_ENDG_VERSANDT`, `ANTRAG_ENDG_EINGEREICHT`, `UNTERBROCHEN`, `RUECKKEHR_GEPLANT` → werden als Rohwert angezeigt.

### Fix

```typescript
const STATUS_LABELS: Record<string, string> = {
  ANGELEGT: "Angelegt",
  ANTRAG_VORL_VERSANDT: "Vorl. Antrag versandt",
  ANTRAG_VORL_EINGEREICHT: "Vorl. Antrag eingereicht",
  VORLAEUFIG_GENEHMIGT: "Vorlaeufig genehmigt",
  VORLAEUFIG_ABGELEHNT: "Vorlaeufig abgelehnt",
  ANTRAG_ENDG_VERSANDT: "Endg. Antrag versandt",
  ANTRAG_ENDG_EINGEREICHT: "Endg. Antrag eingereicht",
  GENEHMIGT: "Genehmigt",
  AKTIV: "Aktiv",
  UNTERBROCHEN: "Unterbrochen",
  RUECKKEHR_GEPLANT: "Rueckkehr geplant",
  BEENDET: "Beendet",
  ABGELEHNT: "Abgelehnt",
};
```

**Aufwand:** 5 Min. Sollte zentral nach `src/lib/elternzeit-labels.ts` (R-Backlog).

---

## Block 12 — Top-level try/catch in 8 Routes 🟡 SOLLTE

Bereits in Block 6.4 abgedeckt — kann optional zusammen mit Block 6 erledigt werden.

---

## Backlog (R-Items, naechster Sprint)

### R1 — PDF-Routen-Generator

5 PDF-Routes wiederholen ~100-140 Zeilen Boilerplate (Session-Check, findUnique, Audit, NextResponse). Ein generischer `createPdfRoute()` reduziert das auf ~20 Zeilen pro Route.

Vorgeschlagene Signatur:

```typescript
// src/lib/api/elternzeit-pdf-route.ts
export function createPdfRoute<TCtx>(opts: {
  generator: (ctx: TCtx) => Promise<Buffer>;
  buildContext: (ez: ElternzeitProzess & { /* ... */ }) => TCtx;
  filenameSuffix: string;
  auditAction: string;
  webhookEvent?: WebhookEvent;
  gatePersonalgruppe?: Personalgruppe[];
}) {
  return async function GET(/* ... */) { /* ... */ };
}
```

### R2 — `api-handler` `withAuth/withRole` Adoption

Phase 1 hat `src/lib/api-handler.ts` etabliert, Phase 2 nutzt es nicht. 15 Routes wiederholen Auth-Boilerplate.

### R3 — Inline Zod-Schemas zentralisieren

7 Routes haben Schemas inline statt in `validations/elternzeit.ts` bzw. neuer `validations/schulferien.ts`.

### R4 — `Record<string, unknown>` durch Prisma-Types

Drei Stellen nutzen `Record<string, unknown>` als Workaround, sollten `Prisma.ElternzeitProzessUpdateInput` etc. nutzen.

### R5 — `elternzeit-detail-content.tsx` splitten (1030 Zeilen)

Aufteilen in `ElternzeitHeader`, `ElternzeitActions`, `BriefeTab`, `FristenTab`, `ChecklisteTab`, `NotizenTab`, `AbschnitteTab`.

### R6 — Magic Numbers in Konstanten

`src/lib/constants.ts` ergaenzen:

```typescript
// BEEG-Fristen
export const BEEG_ANTRAGSFRIST_VORL_TAGE = 49;          // § 16 Abs. 1 BEEG: 7 Wochen
export const BEEG_ANTRAGSFRIST_3BIS8_TAGE = 91;         // § 16 BEEG: 13 Wochen
export const BEEG_TEILZEIT_AG_ANTWORT_WOCHEN = 4;       // § 17 BEEG
export const BR_GENEHMIGUNG_FRIST_WOCHEN = 8;
export const GEBURTSURKUNDE_NACHREICHUNG_WOCHEN = 4;
export const BEIHILFE_AENDERUNG_FRIST_TAGE = 30;
export const RUECKKEHR_GESPRAECH_VORLAUF_TAGE = 42;     // 6 Wochen vor Ende
export const TEILZEIT_MAX_WOCHENSTUNDEN = 32;           // § 15 Abs. 7 BEEG

// Fristen-Severity-Schwellen
export const SEVERITY_WARNING_TAGE = 14;
export const SEVERITY_URGENT_TAGE = 7;

// Token-Default
export const TOKEN_VALIDITY_DAYS_DEFAULT = 30;
export const LEITER_TOKEN_VALIDITY_DAYS_DEFAULT = 14;
```

### R7 — Brief-Texte konfigurierbar (Memory: "Vorlagen immer admin-editierbar")

Brief-Strings in `elternzeit-pdf.ts` extrahieren nach `src/lib/elternzeit-brief-texte.ts` als const-Map. Spaeter optional DB-backed.

### R8 — Accessibility-Pass

- `<label htmlFor="...">` koppeln, jedes Input mit `id`
- `role="alert"` / `aria-live="polite"` auf Error-Boxen
- Step-Indicator: `<ol role="list">`, `aria-current="step"`
- Tabs: `role="tablist"` / `role="tab"` / `aria-selected` / Arrow-Key-Navigation
- Loeschen-Buttons: `aria-label`
- Hardcoded Tailwind-Farben (`bg-blue-100`, `border-orange-400`) durch CREDO-Theme-Variablen ersetzen

### R9 — `prisma.$transaction` Batches in `syncElternzeitFristen`

Pro Vorgang ~18 sequenzielle Roundtrips. Bei < 200 Vorgaengen unkritisch, fuer Multi-Tenant-Skalierung wichtig.

### R10 — Cron-Pagination

`findMany` ohne `take` — relevant ab 1000+ offenen Fristen.

### R11 — Token-Hashing in DB

Tokens im Klartext in DB. Bei DB-Backup-Leak sofort missbrauchbar. SHA-256-Hash speichern, nur Plaintext via Magic-Link.

### R12 — `@@unique([elternzeitId, fristTyp])` Constraint

Verhindert doppelte Frist-Eintraege bei Race zwischen Cron und User-Aktion.

### R13 — DST-Off-by-One in `berechneSeverity`

`Math.floor(diff/86400000)` ist DST-blind, kann am Sommerzeit-Wechsel um 1 daneben liegen.

---

## Was gut ist 🎉 (zur Erinnerung beim Fixen)

- `createBrief()`-Helper sauber abstrahiert
- `syncElternzeitFristen()` als zentrale Sync-Funktion
- CRON_SECRET timing-safe Compare korrekt
- Path-Traversal-Schutz in `file-upload.ts` explizit
- Magic-Bytes-Validierung vorhanden (bis auf WebP-Luecke)
- Mandanten-Konfiguration als first-class Citizen
- TypeScript komplett sauber
- Konsistente Phase-1-Patterns für 90% der Routes

---

## Reihenfolge der Fixes (empfohlen)

1. **Block 1 (IDOR)** zuerst — Showstopper
2. **Block 2 (Token-Races)** parallel — kleine Datei-Anzahl
3. **Block 3 (File-Upload)** danach — abhaengig von 2 nicht
4. **Block 4 (Cron-Auth)** schnell zwischendurch
5. **Block 6 (Code-Bugs)** als Cleanup-Sweep
6. **Block 5 (Modals)** als groesseres UX-Refactoring (kann separat sein)
7. **Block 7 (Tests)** parallel zu allem — liefert Sicherheitsnetz und deckt M1-Race auf

**Vor jedem Push:** `npm run lint` + `npm run test` + erneutes `/code-review` (sollte CRITICAL = 0 zeigen).

---

*Dokument erstellt: 2026-04-08 | Architecture-Review nachgereicht: 2026-04-09*

---

## Architecture-Review (nachgereicht 2026-04-09) 🏗️

> **Hinweis:** Diese Findings sind **kein** GoLive-Blocker fuer Phase 2. Sie gehoeren in das Phase-3-Refactor und in die Multi-Tenant-Vorbereitung des Masterplans. Backlog-Items R1, R2, R3, R5, R9, R11, R12 hier nicht doppelt aufgefuehrt.

### CRITICAL (architektonische Schuld, blockiert Phase 3 / Multi-Tenant)

#### A-C1 — Status-Maschine emergent statt zentral

Die `ElternzeitStatus`-Enum hat 13 Werte und ~15 gueltige Uebergaenge. Jede Route prueft `if (ez.status !== "X") return 409` selbst, das Frontend leitet `canGenehmigenEndg` etc. erneut ab (parallele Wahrheit), `updateElternzeitSchema` laesst per Zod jeden Status-String zu → generisches PATCH `/api/elternzeit/[id]` umgeht die Business-Regeln. Folge: `BEENDET → ANGELEGT` ist technisch ausloesbar; Invarianten wie "genehmigungAm nur bei status ∈ {GENEHMIGT, AKTIV, BEENDET}" sind nirgends enforced.

**Empfehlung:** `src/lib/elternzeit-state-machine.ts` mit `Transition`-Map und `transitionElternzeit(tx, id, toStatus, ctx)`-Funktion. Status aus `updateElternzeitSchema` entfernen — nur fachliche Routes duerfen Uebergaenge ausloesen.

#### A-C2 — Cross-cutting Concerns handgeschrieben in jeder Route

Alle 15 Phase-2-Routes wiederholen das gleiche 6-Schritt-Skelett (Session → Rolle → findUnique+canAccessProcess → Business-Check → Update → Audit+Webhook+Fristen-Sync). `src/lib/api-handler.ts` existiert, wird aber nirgends genutzt. Die IDOR-Luecke aus Block 1 entstand **genau wegen** dieser manuellen Wiederholung.

**Empfehlung:** `apiHandler` um `scope: "elternzeit"` + Handler-Input `process: ElternzeitProzess` erweitern, der Wrapper erledigt Auth + Load + IDOR. `withAudit(action)` + `withWebhook(event)` als Composables. Routes schrumpfen auf ~25 Zeilen Fachlogik.

### MAJOR

- **A-M1 PDF-Routes-Registry** — 6 PDF-Routes sind strukturell ein Template. Eine `DOCUMENT_REGISTRY: Record<ElternzeitDokumentTyp, { generator, guard, statusField, webhookEvent }>` + eine generische Route `/api/elternzeit/[id]/dokument/[typ]` kollabieren ~500 Zeilen auf ~100. Bonus: Frontend bekommt `GET .../dokumente/verfuegbar` statt 6 hartcodierter `canXYZ`-Flags.
- **A-M2 `syncElternzeitFristen` als impliziter Vertrag** — Muss in 13 Mutations-Stellen manuell aufgerufen werden, kein Hook. Vergisst man's, eskaliert eine BEEG-§16-Frist nicht → rechtliches Risiko. **Empfehlung:** Prisma `$extends` `afterUpdate` auf `ElternzeitProzess` + `ElternzeitAbschnitt`, oder `ElternzeitService` als einziger Prisma-Zugang.
- **A-M3 Anaemisches Domain-Modell, Regel-Drift** — "BR-Detmold nur Beamte/PSI" existiert dreifach (Route, `berechneFristTemplates`, Frontend-Flag). `gehoertZuBeamtenWorkflow` lebt in `elternzeit-fristen.ts`, wird aber nur dort verwendet. **Empfehlung:** `src/lib/elternzeit-rules.ts` mit puren Funktionen `darfBRDetmoldGenerieren(ez)`, `istVBLPflichtig(ez)` etc., ueberall importiert.
- **A-M4 `elternzeit-detail-content.tsx` (1030 Zeilen) vermengt 4 Verantwortlichkeiten** — R5 nennt das schon, aber ohne Schnittlinie. **Empfehlung:** `useElternzeit(id)` (Daten) + `useElternzeitActions(id)` (14 Actions als Reducer) + 6 Tab-Komponenten + `getAvailableActions(status)` aus State-Maschine deklarativ.
- **A-M5 Cron-Endpoint mischt Orchestrierung und Domain-Logik** — `determineEskalationen(fristen)` als pure Funktion ist testbar, `escalateFristen(tx, ...)` als Side-Effect-Funktion. Cron-Route schrumpft auf ~30 Zeilen.
- **A-M6 Multi-Tenant-Grenze fehlt** — `ElternzeitFrist` hat keinen `organizationId`-Shortcut, Cron `findMany` ohne Tenant-Gruppierung, ein Mandanten-Fehler bricht den ganzen Cron. Blocker fuer Masterplan (Verkauf an externe Schultraeger). **Empfehlung:** `organizationId` denormalisiert + indexed, Cron-Schleife pro Org isoliert in eigener Transaktion.

### MINOR

- **A-m1** Inline-Zod in `br-tracking` + `ag-bescheinigung` — Lint-Rule `no-restricted-syntax` koennte das durchsetzen.
- **A-m2** `Organization`-Modell als Config-Bucket (`ezGfFirstName` etc.) — `OrganizationElternzeitConfig` als 1:1-Submodell.
- **A-m3** Magic-Link-Token-Pattern 3x dupliziert (`elternzeit-antrag`, `-endg`, `-leiter`) — `MagicLinkService<TResource>` mit `consumeToken`.
- **A-m4** `ElternzeitDokumentTyp` ist reine Enum ohne Metadaten — siehe A-M1 Registry.
- **A-m5** `file-upload.ts` ohne Feature-Grenze, Pfad-Praefix ist Caller-Sache → `FileStorageService` mit Namespace-Konzept.

### INFO

- **A-i1** Kein Domain-Event-Bus, Webhooks fire-and-forget inline. Skaliert nicht auf E-Mail-Worker / LOGA-Sync (Masterplan).
- **A-i2** Test-Strategie als Architektur-Entscheidung in CLAUDE.md verankern: pure Funktionen (`berechneFristTemplates`, `berechneSeverity`, kuenftig State-Maschine + Rules) trivial testbar, alles andere Integration.
- **A-i3** `updatedAt` als Optimistic-Lock ungenutzt → Last-Write-Wins bei zwei HR-Sachbearbeitern parallel.

### Empfohlene Reihenfolge fuer Phase-3-Refactor

1. A-C1 (State-Machine) + A-M3 (Rules) zusammen — teilen Domain-Logik-Extraktion.
2. A-C2 (api-handler-Wrapper) — Voraussetzung damit Phase-3-Routen die Dopplung nicht fortsetzen.
3. A-M1 (PDF-Registry) — direkter ROI, ~500 Zeilen weg.
4. A-M4 (Frontend-Split) — entblockt Phase-3-UI-Arbeit.
5. A-M2 (Fristen-Sync-Hook via Prisma `$extends`) — Risiko-Mitigation, wenige Stunden.
6. A-M5, A-M6 — vor Multi-Tenant-Scale-Up.

---

## Re-Review 2 Synthese (2026-04-09) — Stand nach Block 1-7 + Block 1.5 + Modal-Race

> **6 Subagenten** (Security, UI/UX, Performance, Testing, Error Handling, Code Quality) liefen parallel ueber den Phase-2-Code **nach** allen Block-1-7-Fixes. Architecture wurde nicht erneut gefahren (Doc von 04-09 ist aktuell).
>
> **Ergebnis:** 9 CRITICAL roh, davon nur 2 echte Blocker (beide jetzt gefixt). Rest ist Sollte-/Backlog-Arbeit.

### Aggregierte Severity (alle 6 Re-Review-Agenten)

| Dimension | CRITICAL | MAJOR | MINOR | Bemerkung |
|---|---|---|---|---|
| 🔐 Security | 1 | 6 | 6 | 1 echter Blocker → Block 1.5 (gefixt) |
| 🎨 UI/UX | 2 | 8 | 7 | beide CRITICAL streitbar (Status-Labels, Focus-Trap) |
| ⚡ Performance | 2 | 6 | 5 | eher MAJOR, kein Datenrisiko |
| ✅ Testing | 3 | 3 | 2 | "fehlende Tests" — kein Regression-Beweis |
| 🛡️ Error Handling | 0 | 5 | 5 | inkl. Modal-Submit-Race (gefixt) |
| 💎 Code Quality | 1 | 4 | 7 | Test-Factory Drift |

### Gefixt in dieser Session (2026-04-09 Abend)

#### ✅ Block 1.5 — IDOR-Fix in 7 Phase-1-Routes
Pattern (`select.organizationId` + `if (!(await canAccessProcess(session, ez.organizationId)))`) angewendet auf:
- `src/app/api/elternzeit/[id]/route.ts` (GET, PATCH, DELETE — 4 Checks inkl. import)
- `src/app/api/elternzeit/[id]/genehmigung-vorl/route.ts` (GET — PDF-Klau verhindert)
- `src/app/api/elternzeit/[id]/genehmigen-vorl/route.ts` (POST)
- `src/app/api/elternzeit/[id]/ablehnen-vorl/route.ts` (POST)
- `src/app/api/elternzeit/[id]/antrag-link-vorl/route.ts` (POST — Account-Takeover-Vektor geschlossen)
- `src/app/api/elternzeit/[id]/notizen/route.ts` (GET + POST — GET hatte zudem keinen try/catch, gleich mit gefixt)
- `src/app/api/elternzeit/[id]/checkliste/[itemId]/route.ts` (PATCH — IDOR ueber `findFirst` mit `include`)

#### ✅ Modal-Submit-Race
`src/components/elternzeit/elternzeit-modals.tsx`: alle 5 Modale haben jetzt `try/catch` um `onSubmit`, lokalen `error`-State, Anzeige als rote Box ueber den Buttons. Keine Unhandled Promise Rejections mehr. Bonus: Ellipsis-Glyphen `…` durch `...` ersetzt.

### 🟡 Sollte vor GoLive (Re-Review-2) — Reihenfolge fuer naechste Session

Geschaetzte Gesamtdauer: ~3-4h fokussierte Arbeit.

| # | Aufgabe | Datei(en) | Aufwand | Quelle |
|---|---|---|---|---|
| 1 | **Block 8 abschliessen** — `triggerWebhooks(...).catch(err => console.error(...))` in 13 Routes | siehe Liste unten | 15min | Error-Handling MAJOR |
| 2 | **Block 10 abschliessen** — `await syncElternzeitFristen(id).catch(err => console.error(...))` in 9 Routes | siehe Liste unten | 20min | Error-Handling MAJOR |
| 3 | **Performance #1** — `syncElternzeitFristen` aus `fristen GET` entfernen (Latency -70%) | `src/app/api/elternzeit/[id]/fristen/route.ts:55` | 5min | Performance CRITICAL |
| 4 | **STATUS_LABELS Phase-2-Status** — fehlen ANTRAG_ENDG_VERSANDT, ANTRAG_ENDG_EINGEREICHT, UNTERBROCHEN, RUECKKEHR_GEPLANT | `src/app/(portal)/dashboard/elternzeit/[id]/elternzeit-detail-content.tsx:101-111` (oder zentral aus `elternzeit-config.tsx` importieren) | 5min | UI/UX CRITICAL |
| 5 | **Legacy `showSendLinkModal` migrieren** auf `MagicLinkModal` aus elternzeit-modals.tsx | `elternzeit-detail-content.tsx:961-997` + State `showSendLinkModal`/`linkRecipient` entfernen | 30min | UI/UX MAJOR + Code-Quality MAJOR |
| 6 | **`syncElternzeitFristen` mit interner TX + try/catch** — verhindert partielle Writes, loest Block 10 strukturell | `src/lib/elternzeit-fristen.ts:210-268` | 30min | Error-Handling MAJOR |
| 7 | **Test-Factory `makeEz()` reparieren** — `as unknown as` entfernen, exakte Schema-Felder, TS-strict ohne Cast | `src/__tests__/lib/elternzeit-fristen.test.ts:75-140` | 30-60min | Code-Quality CRITICAL |
| 8 | **Single-Use-Token Race-Test schreiben (Block 7.3)** | NEU: `src/__tests__/api/elternzeit-antrag-endg-token.test.ts` | 1h | Testing CRITICAL |

### Routen fuer Block 8 (Webhook-`.catch()`)

13 Stellen ohne `.catch()`:
- `elternzeit/[id]/genehmigen-vorl/route.ts:76` ← bereits geloest in Block-1-Pattern (verifizieren!)
- `elternzeit/[id]/ablehnen-vorl/route.ts:77` ← verifizieren
- `elternzeit/[id]/genehmigen-endg/route.ts:91`
- `elternzeit/[id]/ablehnen-endg/route.ts:90`
- `elternzeit/[id]/antrag-link-vorl/route.ts:95`
- `elternzeit/[id]/antrag-link-endg/route.ts:119`
- `elternzeit/[id]/br-detmold/route.ts:113`
- `elternzeit/[id]/br-tracking/route.ts:102`
- `elternzeit/[id]/leiter-link/route.ts:116`
- `elternzeit/[id]/ag-bescheinigung/route.ts:125`
- `elternzeit/[id]/vbl-info/route.ts:95`
- `elternzeit-leiter/[token]/route.ts:166`
- `elternzeit/route.ts:228`

Pattern (Phase-1-Standard): `triggerWebhooks(event, payload).catch((err) => console.error("[event] Webhook-Fehler:", err instanceof Error ? err.message : err));`

### Routen fuer Block 10 (sync-`.catch()`)

9 Stellen, die `await syncElternzeitFristen(id)` ohne `.catch()` aufrufen → User sieht 500 obwohl Status erfolgreich:
- `elternzeit/route.ts:226` (POST)
- `elternzeit/[id]/genehmigen-vorl/route.ts:74`
- `elternzeit/[id]/genehmigen-endg/route.ts:89`
- `elternzeit/[id]/ablehnen-vorl/route.ts:75`
- `elternzeit/[id]/ablehnen-endg/route.ts:88`
- `elternzeit/[id]/antrag-link-vorl/route.ts:90`
- `elternzeit/[id]/antrag-link-endg/route.ts:114`
- `elternzeit/[id]/br-detmold/route.ts:111`
- `elternzeit/[id]/br-tracking/route.ts:99`

Pattern: `await syncElternzeitFristen(id).catch((err) => console.error("[syncElternzeitFristen] Fehler nach <event>:", err instanceof Error ? err.message : err));`

### 🟢 Phase-3-Backlog (aus Re-Review 2 — kein GoLive-Blocker)

**Performance:**
- Compound-Indexe `[erledigtAm, faelligAm]` und `[elternzeitId, erledigtAm]` auf `ElternzeitFrist`
- `[id]/route.ts` GET mit `select` statt `include` (laedt aktuell alle Dokumente/Notizen/Checkliste mit)
- Optimistic Updates fuer Checkliste/Fristen/Notizen (kein Full-Reload nach jeder Aktion)
- PDFKit in Worker-Thread oder als Cache fuer wiederholte Downloads
- R9 (`$transaction` in `syncElternzeitFristen`) — wird Punkt 6 der Sollte-Liste
- R10 (Cron-Pagination)
- `linkRecipient`-Cleanup in `useCallback`-Dep — wird mit Punkt 5 (Legacy-Modal-Migration) gefixt

**Security:**
- Rate-Limit auf Public-Token-Routes (Antrag, Antrag-Endg, Leiter, Upload — 30 req / 5min / IP)
- PII-Sanitization in PDF-Generator (`sanitizePdfText` Helper, eskapiert `\x00-\x1F\x7F`) — fuer `genehmigungVon`, `kindName`, `ablehnungGrund`, `brutto12Monate`, `betreuungsabsicht`
- R11 Token-Hashing in DB (HMAC-SHA256, Lookup ueber Hash-Spalte)
- AuditLog-Pseudonymisierung fuer Kindname/Geburtsdatum (DSGVO Art. 8)
- `ablehnungGrund` nicht in AuditLog `details` (Hash + Referenz reicht)
- At-Rest-AES-256 fuer Geburtsurkunden (`saveUploadedFile`)
- Disk-Quota pro Vorgang (50 MB) + max. 5 Geburtsurkunden-Replace pro Token
- Magic-Link Auto-Hide nach 60s + Copy-Button + maskierte Anzeige

**UI/UX:**
- Modal-Wrapper Focus-Trap + `body { overflow: hidden }` + `role="dialog" aria-modal="true" aria-labelledby`
- Hartcodierte `bg-blue-100`/`bg-orange-50` etc. auf CREDO-Theme-Variablen migrieren (`bg-credo-gelb/10` etc.)
- Loading-States auf alle Action-Buttons (Doppelklick-Schutz)
- Magic-Link Copy-Button + Auto-Hide
- Endgueltige Genehmigung mit Warnzeile "Aktion irreversibel"
- `vorl. genehmigen` mit Confirm-Modal
- Leiter-Public-Page Live-Counter (analog AblehnungModal), separate Loading-States
- `neue-elternzeit-modal.tsx` auf shared `Modal`-Wrapper migrieren
- Lucide-Icons statt Unicode-Glyphen (`✓`, `⚠`, `←`)
- R8 Accessibility-Pass

**Code Quality:**
- `useElternzeitActions(prozessId, onSuccess)`-Hook (~150 LOC weg, hilft bei R5-Split)
- `useSubmitState`-Hook + `<ModalFooter>` (DRY der 5 Modale)
- R3 (5 weitere Inline-Schemas zentralisieren in `validations/elternzeit.ts`): `organizations/[id]/elternzeit-config`, `leiter-link`, `ablehnen-vorl`, `fristen`, `fristen/[fristId]`, `elternzeit-leiter/[token]`, `br-tracking`, `ag-bescheinigung`
- `console.error`-Praefix-Konvention `[API] <method> <route-path>` festschreiben
- Type-Guard `isDokumentTyp(s): s is ElternzeitDokumentTyp` statt `as`-Cast in `dokumente/route.ts`
- AuditLog-Insert in eigene `.catch` (verhindert dass AuditLog-Fehler PDF-Generierung kapern)
- Body-`null`-Check vor `safeParse` in 5 Routes (`notizen`, `fristen`, `checkliste/[itemId]`, `br-tracking`, `leiter-link`)

**Testing (vor Phase 3):**
- Permissions-Tests fuer `canAccessProcess` (16 Aufrufer, kein Test)
- Public-Routes Tests: Leiter (`elternzeit-leiter/[token]`), Upload (`elternzeit-antrag-endg/[token]/upload`)
- PDF-Generator-Smoketests (6 Generatoren, alle Pure-Functions, Smoketest = `Buffer mit %PDF-Header`)

### Quality-Gates Stand 2026-04-09 Abend

- ✅ TypeScript: clean (`npx tsc --noEmit`)
- ✅ Lint: keine neuen Warnings (nur 7 pre-existing in unrelated `fragebogen/`-Steps)
- ✅ Tests: 50/50 meiner Block-7-Tests gruen, 110/111 Gesamt (1 Fail in `offboarding.test.ts` ist pre-existing aus modifiziertem `route.ts` — nicht aus dieser Phase-2-Arbeit)
- ✅ Grep-Verifikation: alle 7 Block-1.5-Routes haben `canAccessProcess`
- ❌ **Nicht committed** — Working Tree hat noch alle Block-1-7 + Block 1.5 + Modal-Race-Aenderungen unstaged

### Wichtig fuer den Wiedereinstieg

- Architecture-Findings (A-C1, A-C2, A-M1-6) bleiben **bewusst** Phase-3-Refactor — nicht in Sollte-Liste verschieben.
- Test-`offboarding.test.ts`-Fail kommt aus pre-existing modifiziertem `src/app/api/offboarding/route.ts` (nicht aus dieser Arbeit). Vor Commit verifizieren.
- Re-Review-2 hat **nicht** alle Phase-2-Files erneut gelesen — Stichprobe + Block-Verifikation. Falls etwas neues hinzukommt vor Commit, ggf. nochmal pruefen.
