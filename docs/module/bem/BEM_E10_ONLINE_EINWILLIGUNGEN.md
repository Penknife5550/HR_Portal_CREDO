# BEM E10 — Online-Einwilligungen (alle Arten) + editierbare Vorlagen

Status: **✅ UMGESETZT** (2026-06-09, Commit 7ff1723, gepusht). Adversariell reviewt
(Workflow, 17 Findings — alle wesentlichen behoben, u.a. HIGH: Einladungs-Modal sendete
weiter DATENSCHUTZ → Auto-Flow startete nie; HIGH: Nachweis nur per Versionsnummer →
unveraenderlicher Text-Snapshot am Einwilligungs-Datensatz). Build/Lint grün, 220/221 Tests.

**Server-Deploy:** `prisma db push` (via entrypoint) zieht die neuen Felder
(Organization.hatBetriebsrat/hatSchwerbehindertenvertretung; BemVorlage + BemVorlageTyp;
BemEinwilligung.vorlageVersion/textSnapshot). Danach unter Verwaltung → „BEM-Vorlagen"
ggf. Texte/Checklisten anpassen und je Mandant BR/SBV-Schalter setzen.

**Bewusst offen (low):** partieller Unique-Index für globale Vorlagen (NULL-Distinct in
Postgres) — durch deterministisches orderBy + Text-Snapshot entschärft; Duplikat-Race nur
Admin-seitig/geringe Wahrscheinlichkeit. Spätere BR/SBV-Antwort löst keine separate
Beauftragten-Mail aus (nur Audit).

---


## 1. Ziel & abgestimmte Entscheidungen

Alle Einwilligungsarten werden online angeboten. Nimmt die/der Beschaeftigte das
BEM-Angebot an, werden automatisch die weiteren Einwilligungs-Links versendet.

Abgestimmte Entscheidungen (User, 2026-06-09):
1. **Annahme = Durchfuehrung.** Die Einladung versendet die **Durchfuehrungs**-
   Einwilligung („Moechten Sie am BEM teilnehmen?"). Kein neuer `TEILNAHME`-Enumwert.
2. **Auto-Versand** bei Durchfuehrung-`ERTEILT`: **Datenschutz** (immer), **BR**
   (nur wenn `Organization.hatBetriebsrat`), **SBV** (nur wenn
   `Organization.hatSchwerbehindertenvertretung` UND `BemFall.schwerbehindert`).
3. **Ersetzt** den E9-Sammelweg: die BR/SBV-Checkboxen im Einwilligungsformular
   entfallen. Jede Art = eigener Link/Formular/`BemEinwilligung`-Datensatz.
   Papierweg (`einwilligung/papier`) bleibt unveraendert.
4. **Fall-Status** `EINWILLIGUNG_ERTEILT`, sobald **Datenschutz UND Durchfuehrung**
   erteilt sind. BR/SBV sind ergaenzend und blockieren den Hauptstatus nicht.
5. **Editierbare Vorlagen** (Checklisten + Datenschutz-/Einwilligungstexte):
   **global mit optionalem Mandant-Override**, pflegbar durch SUPER_ADMIN/HR_LEITUNG.
6. **Versand SMTP-direkt** (Entscheidung #9), Vorlagen/Mails/Formulare durchgaengig
   im **CREDO-Verwaltungs-CI**.

## 2. Datenmodell (`prisma/schema.prisma`)

- **Organization**:
  - `hatBetriebsrat Boolean @default(false)`
  - `hatSchwerbehindertenvertretung Boolean @default(false)`
- **BemEinwilligung** (Snapshot fuer Nachweisbarkeit):
  - `vorlageVersion Int?` — Version des angezeigten Textes zum Zeitpunkt der Unterschrift
    (geht in `dokumentHash` ein → spaeter beweisbar, welcher Textstand zugestimmt wurde).
- **Neues Modell `BemVorlage`** (editierbare Vorlagen):
  - `id`, `typ BemVorlageTyp`, `organizationId String?` (null = global), `inhalt Json`
    (Checklisten = `string[]`; Texte = `{ titel?, koerper }` Markdown/Plaintext),
    `version Int @default(1)`, `aktualisiertById String?`, `createdAt`, `updatedAt`.
  - `@@unique([typ, organizationId])` — je Typ eine globale + max. eine pro Mandant.
- **Neues Enum `BemVorlageTyp`**:
  `CHECKLISTE_ERSTGESPRAECH`, `CHECKLISTE_FOLGEGESPRAECH`, `CHECKLISTE_GEDAECHTNISPROTOKOLL`,
  `EINWILLIGUNGSTEXT_DATENSCHUTZ`, `EINWILLIGUNGSTEXT_DURCHFUEHRUNG`,
  `EINWILLIGUNGSTEXT_BR`, `EINWILLIGUNGSTEXT_SBV`.

Schema-Sync per `prisma db push` (kein Migrations-Ordner) via entrypoint.

## 3. Vorlagen-Aufloesung (global + Override) — `src/lib/bem-vorlagen.ts`

- `getBemVorlage(typ, organizationId)`: zuerst Mandant-Override, sonst globale
  Vorlage, sonst **Code-Default** (heutige Inhalte aus `bem-checkliste-template.ts`
  und den bisher hartcodierten Texten). Liefert `{ inhalt, version }`.
- `getBemChecklisteItems(typ, organizationId)` ersetzt den direkten Aufruf von
  `getBemCheckliste(...)` bei der Gespraechs-Anlage.
- Default-Inhalte werden als Seed/Code-Fallback gepflegt → kein Datenverlust, kein Bruch.

## 4. Backend

### 4.1 Versand-Helfer (`src/lib/bem-einladung.ts`)
- Refactor aus `api/bem/[id]/einladung/route.ts`:
  `sendBemEinwilligungLink({ fall, art, recipient, gueltigkeitstage, nachricht, gesendetById })`
  → Token (UUID, nur SHA-256-Hash in DB), alte OFFEN-Links derselben Art entwerten,
  CREDO-CI-Mail mit dem (editierbaren) Einwilligungstext der Art, `BemKommunikation`
  + Audit. SMTP-direkt (`sendEmailDetailed`).

### 4.2 Einladung (`api/bem/[id]/einladung`)
- Initiale Art = `DURCHFUEHRUNG` (statt Default `DATENSCHUTZ`). Nutzt den Helfer.

### 4.3 Auto-Versand (`api/bem/einwilligung/[token]` POST)
- Wird die **Durchfuehrung** auf `ERTEILT` gesetzt → erforderliche Arten ermitteln
  (Datenschutz immer; BR wenn `org.hatBetriebsrat`; SBV wenn
  `org.hatSchwerbehindertenvertretung && fall.schwerbehindert`) und je Art einen Link
  senden (Helfer, einzeln auditiert). BR/SBV-Checkbox-Logik aus E9 entfaellt.
- Snapshot: `vorlageVersion` der angezeigten Vorlage am Datensatz speichern; in
  `dokumentHash` einbeziehen.

### 4.4 Status-Orchestrierung (`src/lib/bem-einwilligung.ts`)
- Neuer Helfer `recomputeFallEinwilligungsStatus(fallId)` (nach jeder Antwort aufgerufen):
  - Durchfuehrung `ABGELEHNT` → Fall `EINWILLIGUNG_ABGELEHNT`.
  - Datenschutz `ERTEILT` UND Durchfuehrung `ERTEILT` → Fall `EINWILLIGUNG_ERTEILT`
    (race-frei via `updateMany` nur aus `EINLADUNG_VERSENDET`).
  - sonst: Fall bleibt `EINLADUNG_VERSENDET` (eine Teil-Zustimmung reicht nicht).
- Ersetzt das heutige direkte „Fall → ERTEILT" im Token-POST.
- `istVerarbeitungGesperrt` (E9) bleibt unveraendert (tragende Arten Datenschutz/Durchfuehrung).

### 4.5 Einzel-Resend je Art
- `POST /api/bem/[id]/einwilligung/resend` (Body: `art`) — HR-Aktion, `canMutateBemContent`,
  nutzt denselben Helfer.

### 4.6 Vorlagen-API (`/api/bem-vorlagen`)
- GET (Liste/Detail), PUT (aktualisieren → `version++`, Audit). Gated `ADMIN_ROLES`.
- Mandant-Override anlegen/entfernen.

## 5. Frontend (alles CREDO-CI)

- **Mandanten-Einstellungen**: Schalter „Betriebsrat vorhanden" / „SBV vorhanden".
- **Verwaltung → „BEM-Vorlagen"** (nur SUPER_ADMIN/HR_LEITUNG): Liste je Typ,
  Editor (Checkliste = Item-Liste, Texte = Textfeld/Markdown), Vorschau im CREDO-Layout,
  „Global"/„fuer Mandant X"-Auswahl, Versionsanzeige.
- **Oeffentliches Formular** (`/bem/einwilligung/[token]`): art-spezifische Ueberschrift +
  Text aus `BemVorlage`; BR/SBV-Checkboxen entfernt. Ansprechpartner-/Vertrauensperson-Wahl
  bleibt beim Durchfuehrungs-Schritt.
- **Detailansicht** (`bem-detail-content`): Einwilligungen-Tab je Art mit Status,
  Versanddatum, „Link (erneut) senden", Fortschritt „x von y erteilt".

## 6. Compliance
- Jede Einwilligung einzeln signiert (`signedAt/Ip/Name`) + `dokumentHash` (inkl.
  `vorlageVersion`) → beweisbar, *welcher* Textstand wann zugestimmt wurde.
- Editierbare Vorlagen versioniert + jede Aenderung auditiert.
- Keine Gesundheitsdaten in Mails; jeder Versand → `BemKommunikation` (NFR 0a).

## 7. Migration / Abwaertskompatibilitaet
- Bestehende offene Faelle: der Status-Helfer wertet vorhandene Einwilligungen
  identisch aus; fehlt eine `BemVorlage`, greift der Code-Default.
- `vorlageVersion` ist optional (Altbestand = null).

## 8. Phasen & Aufwand (~5–6 Tage)
1. Schema (Org-Flags, BemVorlage, vorlageVersion) + `db generate` + Seed/Defaults — ~0,75 T
2. Vorlagen-Aufloesung + Vorlagen-API + Settings-/Verwaltungs-UI — ~1,75 T
3. Versand-Helfer + Einladung=Durchfuehrung + Auto-Versand + Status-Orchestrierung — ~1,25 T
4. Art-bewusstes oeffentliches Formular + Detail-UI (Resend/Fortschritt) — ~1 T
5. Tests + adversarieller Review + Fixes — ~0,75–1 T

## 9. Definition of Done
- Einladung sendet Durchfuehrung; Annahme loest Auto-Versand der erforderlichen Arten aus.
- BR/SBV-Links nur bei vorhandenem Gremium (Org-Flag) bzw. Schwerbehinderung (SBV).
- Fall wird ERTEILT bei Datenschutz+Durchfuehrung; Ablehnung → ABGELEHNT.
- Checklisten + Datenschutz-/Einwilligungstexte in der Verwaltung editierbar (versioniert).
- Alles SMTP-direkt, alles CREDO-CI. Build/Lint/Tests gruen, Review-Findings behoben.
