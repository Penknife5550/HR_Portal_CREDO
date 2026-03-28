# UX-Review: Offboarding-UI-Komponenten CREDO HR-Portal

**Reviewer:** Senior UI/UX Designer & Frontend-Entwickler
**Datum:** 2026-03-27
**Scope:** Alle neuen Offboarding-UI-Dateien im Vergleich zum bestehenden Onboarding-Design

---

## Bewertungsskala

| Kategorie | Bewertung |
|-----------|-----------|
| Konsistenz mit bestehendem Design | 9/10 |
| Apple-like UX / Intuitivitaet | 8/10 |
| Responsive Design | 7/10 |
| Accessibility | 5/10 |
| Loading & Error States | 7/10 |
| Interaktions-Design | 8/10 |
| Gesamtbewertung | **7.5/10** |

---

## KRITISCH (UX-Blocker)

### K1: Fehlende `aria-label` und `role`-Attribute durchgaengig

**Datei:** Alle Offboarding-Dateien

Die Modals (`neuer-austritt-modal.tsx`) verwenden kein `role="dialog"`, kein `aria-modal="true"` und kein `aria-labelledby`. Der Backdrop hat keinen `aria-hidden="true"`. Screen-Reader-Nutzer koennen den Modal-Kontext nicht erfassen.

**Im Vergleich:** Das bestehende `neuer-vorgang-modal.tsx` hat dieselben Maengel -- dies ist also ein systemweites Problem, aber fuer neue Komponenten sollte es jetzt geloest werden.

**Empfehlung:**
```tsx
// neuer-austritt-modal.tsx, Zeile 126
<div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/50" onClick={handleClose} aria-hidden="true" />

  {/* Modal */}
  <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card shadow-2xl">
    <div className="flex items-center justify-between border-b px-6 py-4">
      <h2 id="modal-title" className="text-lg font-bold text-foreground">
```

### K2: Keine Fokus-Falle (Focus Trap) in Modals

**Datei:** `neuer-austritt-modal.tsx`

Wenn der Modal offen ist, kann der Nutzer mit Tab aus dem Modal heraus navigieren und mit Hintergrund-Elementen interagieren. Besonders fuer Keyboard-only-Nutzer problematisch.

**Empfehlung:** Focus-Trap-Hook implementieren:
```tsx
useEffect(() => {
  if (!open) return;
  const modal = document.querySelector('[role="dialog"]');
  if (!modal) return;

  const focusable = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;

  first?.focus();

  const handleTab = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  document.addEventListener('keydown', handleTab);
  return () => document.removeEventListener('keydown', handleTab);
}, [open]);
```

### K3: Keine Bestaetigungsdialog bei Rueckgabe-Bestaetigung

**Datei:** `offboarding-detail-content.tsx`, Funktion `confirmReturn`

Die Funktion `confirmReturn` markiert einen Gegenstand als zurueckgegeben ohne jede Bestaetigung. Dies ist eine potenziell schwer rueckgaengig machbare Aktion (es gibt keinen "Undo"-Mechanismus sichtbar).

**Empfehlung:**
```tsx
const confirmReturn = async (itemId: string) => {
  if (!window.confirm("Rueckgabe des Gegenstands bestaetigen?")) return;
  // ... rest der Logik
};
```

---

## WICHTIG (Sollte verbessert werden)

### W1: Inkonsistente Fehlerbehandlung -- "silent" catch-Bloecke

**Dateien:** `offboarding-detail-content.tsx` (Zeilen 445, 468, 490, 512, 526, 609, 631, 655, 673)

Zahlreiche API-Aufrufe (Status-Aenderung, Notizen, Checkliste, Rueckgaben, Dokument-Upload, Department-Links) fangen Fehler mit leeren `catch`-Bloecken. Der Nutzer erhaelt kein Feedback, wenn eine Aktion fehlschlaegt.

**Im Vergleich:** Die Magic-Link-Seite (`offboarding-tasks-form.tsx`) macht es richtig mit Optimistic Updates und sichtbarem Fehler-Rollback + Fehlermeldung.

**Empfehlung:** Mindestens eine Toast-Benachrichtigung oder ein Error-State bei fehlgeschlagenen Aktionen:
```tsx
// Vorschlag: Error-State pro Bereich
const [actionError, setActionError] = useState<string | null>(null);

// In catch-Bloecken:
catch (err) {
  setActionError("Aenderung konnte nicht gespeichert werden. Bitte erneut versuchen.");
  setTimeout(() => setActionError(null), 5000);
}
```

### W2: Doppelter PortalHeader bei Tab-Navigation

**Dateien:** `page.tsx` (Dashboard) + `offboarding-dashboard-content.tsx`

Die `page.tsx` rendert die Tab-Navigation (`<div className="border-b bg-card">`) oberhalb der Dashboard-Inhalte. Die `OffboardingDashboardContent` (sowie `DashboardContent`) rendert aber jeweils den `<PortalHeader />` selbst. Das ergibt die Reihenfolge:

1. Tab-Leiste (Onboarding | Offboarding)
2. PortalHeader (Logo, Navigation, User)
3. Dashboard-Inhalt

**Problem:** Der PortalHeader sollte UEBER den Tabs erscheinen, nicht darunter. Nutzer sehen zuerst die Tabs und dann erst den Header -- das ist eine unkonventionelle Hierarchie.

**Empfehlung:** Den `<PortalHeader />` in `page.tsx` verschieben und aus den Content-Komponenten entfernen:
```tsx
// page.tsx
export default async function DashboardPage({ searchParams }: ...) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { tab } = await searchParams;
  const activeTab = tab === "offboarding" ? "offboarding" : "onboarding";

  return (
    <div>
      <PortalHeader user={session} />
      {/* Tab Navigation */}
      <div className="border-b bg-card">
        ...
      </div>
      {activeTab === "onboarding" ? (
        <DashboardContent user={session} />
      ) : (
        <OffboardingDashboardContent user={session} />
      )}
    </div>
  );
}
```

### W3: Mobile-Optimierung der Tabellen

**Datei:** `offboarding-dashboard-content.tsx`

Die Dashboard-Tabelle hat 8 Spalten (Vorgangs-ID, Name, Einrichtung, Austrittsart, Letzter Arbeitstag, Status, Checkliste, Rueckgaben). Auf Smartphones ist das per horizontalem Scroll zugaenglich (`overflow-x-auto`), aber das ist keine gute Mobile-UX.

Die Onboarding-Tabelle hat dasselbe Problem, aber die Offboarding-Tabelle hat sogar eine Spalte mehr.

**Empfehlung:** Card-Layout fuer mobile Breakpoints:
```tsx
{/* Mobile: Card-Layout (unter sm) */}
<div className="space-y-3 sm:hidden">
  {offboardings.map((ob) => (
    <div
      key={ob.id}
      onClick={() => router.push(`/dashboard/offboarding/${ob.id}`)}
      className="cursor-pointer rounded-lg border bg-card p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">
          {ob.firstName} {ob.lastName}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{ob.workEmail}</div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{exitTypeLabel}</span>
        <span>Letzter Tag: {formatDate(ob.lastWorkingDay)}</span>
      </div>
    </div>
  ))}
</div>

{/* Desktop: Tabelle (ab sm) */}
<div className="hidden overflow-x-auto sm:block">
  <table>...</table>
</div>
```

### W4: Tab-Labels mit Umlauten nicht einheitlich

**Datei:** `offboarding-detail-content.tsx`, Zeile 147-152

Die Tab-Labels verwenden `ae`, `ue` statt der echten Umlaute:
- "Uebersicht" statt "Ubersicht"
- "Rueckgaben" statt "Ruckgaben"

In der Onboarding-Detail-Ansicht werden auch ASCII-Umlaute verwendet, aber im restlichen UI (Buttons, Labels, Status-Labels in `constants.ts`) werden echte Umlaute genutzt ("Kundigungsfrist", "Ubergabe" etc.).

**Empfehlung:** Entweder konsequent echte Umlaute ODER konsequent Umschreibungen. Fuer nutzersichtbare Labels echte Umlaute bevorzugen:
```tsx
const TABS = [
  { id: "overview", label: "\u00DCbersicht" },
  { id: "checklist", label: "Checkliste" },
  { id: "returns", label: "R\u00FCckgaben" },
  { id: "documents", label: "Dokumente" },
  { id: "notes", label: "Notizen" },
] as const;
```

### W5: Status-Dropdown schliesst nicht bei Klick ausserhalb

**Datei:** `offboarding-detail-content.tsx`, Zeile 760-788

Das Status-Aendern-Dropdown (`showStatusDropdown`) wird nur geschlossen durch:
- Auswahl einer Option
- Erneuten Klick auf den Button

Es fehlt ein Click-Outside-Handler, sodass der Nutzer bei Klick neben das Dropdown feststeckt.

**Empfehlung:**
```tsx
useEffect(() => {
  if (!showStatusDropdown) return;
  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-status-dropdown]')) {
      setShowStatusDropdown(false);
    }
  };
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [showStatusDropdown]);
```

### W6: Keine Validierung des Datums "Letzter Arbeitstag"

**Datei:** `neuer-austritt-modal.tsx`, Zeile 321-327

Das Datumsfeld laesst jedes Datum zu, auch solche in der Vergangenheit. Ein HR-Sachbearbeiter koennte versehentlich ein Datum aus dem letzten Jahr eintippen.

**Empfehlung:** `min`-Attribut setzen und optionale Warnung:
```tsx
<input
  type="date"
  value={lastWorkingDay}
  onChange={(e) => setLastWorkingDay(e.target.value)}
  min={new Date().toISOString().split("T")[0]}
  required
  className="..."
/>
{lastWorkingDay && new Date(lastWorkingDay) < new Date() && (
  <p className="text-xs text-orange-600">
    Hinweis: Der gewahlte letzte Arbeitstag liegt in der Vergangenheit.
  </p>
)}
```

### W7: Fehlende `htmlFor`-Attribute bei Labels

**Dateien:** `neuer-austritt-modal.tsx`, `offboarding-detail-content.tsx`

Kein einziges `<label>` hat ein `htmlFor`-Attribut oder umschliesst das zugehoerige Input. Klick auf das Label fokussiert nicht das Eingabefeld. Das ist ein Accessibility- und Usability-Problem.

**Empfehlung:**
```tsx
<div className="space-y-2">
  <label htmlFor="firstName" className="text-sm font-medium text-foreground">
    Vorname <span className="text-destructive">*</span>
  </label>
  <input
    id="firstName"
    type="text"
    value={firstName}
    ...
  />
</div>
```

---

## MINOR (Polish)

### M1: Inkonsistenter `max-w`-Container

**Dateien:**
- Dashboard: `max-w-7xl` (1280px)
- Detail-Ansicht: `max-w-6xl` (1152px)

Die Onboarding-Detail-Ansicht verwendet ebenfalls `max-w-6xl`, also ist dies konsistent innerhalb der Detail-Ansichten. Aber der Wechsel zwischen Dashboard (`7xl`) und Detail (`6xl`) fuehlt sich leicht abrupt an.

**Bewertung:** Akzeptabel, da Detail-Seiten weniger Breite benoetigen.

### M2: Inkonsistente Button-Farben zwischen Onboarding und Offboarding

**Dateien:**
- Onboarding: `bg-primary` fuer primaere Aktionen
- Offboarding Detail: `bg-credo-gruen` fuer primaere Aktionen (Status aendern, Checklist speichern, Rueckgabe, Upload)

Das ist nicht unbedingt falsch (wenn `primary` = `credo-gruen`), aber wenn `primary` eine andere Farbe ist, entsteht eine visuelle Inkonsistenz. Im Dashboard und Modal wird `bg-primary` genutzt, im Detail `bg-credo-gruen`.

**Empfehlung:** Konsequent `bg-primary` verwenden oder sicherstellen, dass `primary` = `credo-gruen` in der Tailwind-Config.

### M3: Hover-Farbe `hover:bg-[#5a9420]` ist hartcodiert

**Datei:** `offboarding-detail-content.tsx` (vielfach)

Die Hover-Variante von `credo-gruen` ist als Hex-Wert `#5a9420` hartcodiert statt als Tailwind-Utility (z.B. `hover:bg-credo-gruen/85`).

**Empfehlung:** In `tailwind.config.ts` eine `credo-gruen-dark` Variante definieren oder Opacity verwenden:
```tsx
// Statt:
className="bg-credo-gruen hover:bg-[#5a9420]"
// Besser:
className="bg-credo-gruen hover:bg-credo-gruen/85"
```

### M4: Tab-Counter-Badges koennten besser sichtbar sein

**Datei:** `offboarding-detail-content.tsx`, Zeile 831-850

Die Badges in den Tabs (z.B. "3/5" fuer Checkliste) nutzen `h-5 w-5` mit `text-[10px]`. Bei laengerem Text wie "12/24" wird der Text abgeschnitten, da die Breite fixiert ist.

**Empfehlung:** Mindestbreite statt fixer Breite:
```tsx
<span className="ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
  {checklistItems.filter((i) => i.isCompleted).length}/{checklistItems.length}
</span>
```

### M5: Copy-Button ohne Feedback

**Datei:** `neuer-vorgang-modal.tsx`, Zeile 183-196

Der "Kopieren"-Button fuer den Fragebogen-Link zeigt kein visuelles Feedback nach erfolgreichem Kopieren. Dasselbe gilt fuer die Offboarding-Erfolgsanzeige (wo allerdings kein Link kopiert wird).

**Empfehlung:** "Kopiert!" als temporaeres Feedback:
```tsx
const [copied, setCopied] = useState(false);

<button onClick={async () => {
  await navigator.clipboard.writeText(link);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}}>
  {copied ? "Kopiert!" : "Kopieren"}
</button>
```

### M6: Dateigroessen-Limit fehlt bei Upload

**Datei:** `offboarding-detail-content.tsx`, Funktion `uploadDocument`

Es gibt keine clientseitige Pruefung der Dateigroesse vor dem Upload. Grosse Dateien koennten zu Timeouts fuehren.

**Empfehlung:**
```tsx
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const uploadDocument = async (file: File) => {
  if (file.size > MAX_FILE_SIZE) {
    alert("Die Datei ist zu gross (max. 10 MB).");
    return;
  }
  // ...
};
```

### M7: Fehlende Leer-Zustand-Illustration bei Notizen

**Datei:** `offboarding-detail-content.tsx`, TabNotes

Im Vergleich zu Checkliste und Rueckgaben fehlt ein visueller Empty-State mit Illustration, wenn noch keine Notizen vorhanden sind (nur das Eingabefeld ist sichtbar, aber kein Hinweis-Text).

---

## POSITIV (Was gut geloest wurde)

### P1: Hervorragende Konsistenz der Tailwind-Klassen

Die Offboarding-UI verwendet durchgaengig identische Klassen wie das bestehende Onboarding:
- Tabellen: `rounded-lg border bg-card`, `divide-y`, `px-4 py-3`
- Buttons: `rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground`
- Inputs: `rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring`
- Status-Badges: `inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium`
- Spinner: `animate-spin rounded-full border-2 border-primary border-t-transparent`

Ein HR-Sachbearbeiter wird keinen visuellen Bruch zwischen Onboarding und Offboarding bemerken.

### P2: Exzellente Magic-Link-Seite (offboarding-tasks-form.tsx)

Die oeffentliche Seite ist vorbildlich:
- **Touch-Targets:** Checkboxen sind `h-7 w-7` auf Mobile, `h-6 w-6` auf Desktop -- deutlich ueber dem Minimum von 44x44 CSS-Pixel
- **Optimistic Updates** mit Fehler-Rollback -- sofortiges Feedback
- **Erfolgs-Animation** (`ring-2 ring-green-400 ring-offset-2`, `animate-bounce`) -- belohnend und klar
- **Countdown** zum letzten Arbeitstag -- Kontext ohne Navigation
- **Fortschrittsbalken** mit Prozentzahl -- sofort verstaendlich
- **Gruppierung** in offene/erledigte Aufgaben -- uebersichtlich
- **Kommentar-Moeglichkeit** pro Aufgabe -- flexibel
- **"Alle erledigt"-Bestaetigung** mit gruener Box -- Abschluss-Erlebnis
- **DSGVO-Hinweis** im Footer -- Vertrauensbildend
- **Sticky Header** mit Logo und Fortschritt -- Orientierung beim Scrollen

Diese Seite koennte einem Hausmeister, IT-Admin oder Abteilungsleiter ohne Schulung vorgelegt werden.

### P3: Durchdachtes Status-Uebergangs-System

Die `STATUS_TRANSITIONS`-Map in der Detail-Ansicht verhindert ungueltige Status-Wechsel. COMPLETED und CANCELLED erfordern `window.confirm()`. Das ist eine sinnvolle Schutzlogik.

### P4: Gut strukturierte Detail-Ansicht mit Sub-Komponenten

Die Aufteilung in `TabOverview`, `TabChecklist`, `TabReturns`, `TabDocuments`, `TabNotes` + wiederverwendbare `Card`, `FieldRow`, `EditableFieldRow`, `StatusMiniCard` ist sauber getrennt und wartbar.

### P5: Konsistente Tab-Navigation (Detail-Seite)

Die Tabs nutzen identisches Styling wie im Onboarding:
```
border-b-2 px-4 py-3 text-sm font-medium
Active: border-credo-gruen text-credo-gruen
Inactive: border-transparent text-muted-foreground hover:border-border hover:text-foreground
```

### P6: Abteilungs-Links mit Tracking

Die Department-Links-Sektion zeigt:
- Versandstatus (Nicht gesendet / Gesendet / Geoeffnet / Fertig)
- Oeffnungszaehler
- Reminder-Funktion mit Zeitstempel des letzten Reminders

Das gibt HR-Sachbearbeitern volle Transparenz ueber den Fortschritt der Abteilungen.

### P7: Inline-Editing fuer Felder in der Uebersicht

`EditableFieldRow` erlaubt Bearbeitung direkt in der Ansicht mit Stift-Icon, Inline-Input, OK/X-Buttons und Escape-Handling. Das spart den Wechsel zu einem separaten Bearbeitungsmodus.

### P8: Drag-and-Drop-Upload fuer Dokumente

Der Upload-Bereich unterstuetzt sowohl Drag-and-Drop als auch Klick-Auswahl. Das visuelle Feedback bei Drag-Over (`border-credo-gruen bg-credo-gruen/5`) ist gut sichtbar.

### P9: Offboarding-Status-Farben passen zum CREDO CI

- Blau (Erfasst) -- #009AC6 / CREDO Blau
- Gelb (Kuendigungsfrist) -- warnendes Signal, passend
- Orange (Uebergabe) -- dringlichere Phase
- Violett (Endabrechnung) -- Unterscheidung von den anderen
- Gruen (Abgeschlossen) -- CREDO Gruen / Erfolg
- Grau (Abgebrochen) -- neutral / inaktiv

### P10: Empty-States mit Illustrationen

Checkliste und Rueckgaben zeigen bei leerer Liste nicht nur Text, sondern auch ein grosses Icon (16x16, dashed Border). Das verhindert das "leere Seite"-Gefuehl.

---

## EMPFEHLUNGEN (Konkrete Verbesserungsvorschlaege)

### E1: Shared Modal-Komponente extrahieren

Beide Modals (`neuer-vorgang-modal.tsx` und `neuer-austritt-modal.tsx`) teilen ~80% derselben Struktur: Backdrop, Container, Header mit Schliessen-Button, Content-Area, Footer. Eine `BaseModal`-Komponente wuerde Code-Duplizierung reduzieren und Accessibility-Fixes (Focus-Trap, ARIA) zentral loesen.

```tsx
// components/base-modal.tsx
export function BaseModal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Escape-Handler, Focus-Trap, ARIA -- einmalig implementiert
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 id="modal-title" className="text-lg font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted" aria-label="Schliessen">
            {/* X Icon */}
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="border-t px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
```

### E2: Toast-Notification-System einfuehren

Anstatt `window.confirm()` und stille Fehler sollte ein zentrales Toast-System eingefuehrt werden. Empfehlung: `sonner` oder `react-hot-toast` (beide <5KB gzipped).

```tsx
// Ersetzt window.confirm durch bessere UX
import { toast } from 'sonner';

// Erfolg
toast.success('Notiz gespeichert');

// Fehler
toast.error('Aenderung konnte nicht gespeichert werden');

// Bestaetigung
toast.promise(confirmReturn(itemId), {
  loading: 'Wird bestaetigt...',
  success: 'Rueckgabe bestaetigt',
  error: 'Fehler bei der Bestaetigung',
});
```

### E3: Keyboard-Shortcut fuer Hauptaktion

Auf der Detail-Seite koennte `Ctrl+S` / `Cmd+S` die aktuelle Bearbeitung speichern und `Ctrl+N` eine neue Notiz oeffnen. Das wuerde Power-User unterstuetzen.

### E4: Skeleton-Loading statt Spinner

Fuer ein Apple-like Erlebnis waere ein Skeleton-Loading (graue Platzhalter-Bloecke die pulsieren) schoener als der zentrierte Spinner. Dies gibt dem Nutzer eine Vorstellung der Seitenstruktur bevor die Daten laden.

```tsx
// Statt:
<div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-border border-t-credo-gruen" />

// Besser:
<div className="space-y-6 animate-pulse">
  <div className="h-20 rounded-xl bg-muted" />
  <div className="grid gap-6 lg:grid-cols-2">
    <div className="h-64 rounded-xl bg-muted" />
    <div className="h-64 rounded-xl bg-muted" />
  </div>
</div>
```

### E5: `<table>` durch `role="table"` mit `<div>` auf Mobile ersetzen

Fuer eine wirklich responsive Loesung waere eine CSS-Grid-basierte Tabelle sinnvoll, die auf Mobile automatisch als Karten-Layout dargestellt wird (siehe W3).

### E6: Checklist-Items nach Abteilung filtern

In der Checkliste der Detail-Ansicht sind die Items nach Phase gruppiert. Ein zusaetzlicher Filter nach Abteilung (IT, HR, Facility etc.) waere hilfreich, wenn die Checkliste lang ist.

---

## ZUSAMMENFASSUNG

Die Offboarding-UI ist insgesamt **sehr gut implementiert** und folgt dem bestehenden Design-System mit hoher Treue. Die groessten Staerken sind:

1. Die Magic-Link-Seite ist vorbildlich fuer externe Nutzer
2. Die Konsistenz mit dem Onboarding-Design ist nahezu perfekt
3. Die Detail-Ansicht ist funktional umfassend und gut strukturiert

Die groessten Schwaechen betreffen:

1. **Accessibility** -- fehlende ARIA-Attribute, Focus-Traps und htmlFor
2. **Fehler-Feedback** -- stille catch-Bloecke ohne Nutzer-Benachrichtigung
3. **Mobile Tabellen** -- nur horizontales Scrollen, keine Card-Alternative

**Prioritaeten fuer die naechste Iteration:**
1. ARIA-Attribute und Focus-Trap in Modals (K1, K2) -- halber Tag
2. Fehler-Feedback statt stiller catch-Bloecke (W1) -- halber Tag
3. htmlFor-Attribute bei allen Labels (W7) -- 1 Stunde
4. Click-Outside-Handler fuer Status-Dropdown (W5) -- 30 Minuten
5. Bestaetigung bei Rueckgabe (K3) -- 15 Minuten
