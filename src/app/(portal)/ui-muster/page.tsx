import { vorgangslistePfad } from "@/lib/adressen";
import Link from "next/link";
import { Inbox, SearchX } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Gruppe, Zeile } from "@/components/ui/gruppe";
import { Leerzustand } from "@/components/ui/leerzustand";
import { STATUS_TOENE, Statuspille, type StatusTon } from "@/components/ui/statuspille";
import { DialogMuster, LadeMuster, MusterKopf, SegmentMuster, ToastMuster } from "./dialog-muster";
import { ProzessleisteMuster } from "./prozessleiste-muster";
import { ReiterMuster } from "./reiter-muster";

/**
 * Musterseite der Oberflaechen-Bausteine (UX-Umbau „Klarer Weg", U0)
 *
 * Zeigt jeden Baustein aus `src/components/ui/` in allen Varianten und
 * Zustaenden. Sie ist die Abnahmegrundlage des Fundaments — bis U1 sieht keine
 * andere Seite anders aus — und das Motiv fuer die Screenshots.
 *
 * Nur SUPER_ADMIN, bewusst OHNE Eintrag in der Navigation (Entscheidung F3):
 * erreichbar ueber die Adresse /ui-muster, auch auf dem Server.
 *
 * Wer einen Baustein baut oder aendert, traegt ihn hier ein.
 */
export const metadata = { title: "UI-Muster" };

// `satisfies Record<StatusTon, …>`: Ein neuer Ton in STATUS_TOENE, der hier
// fehlt, ist ein Typfehler — die Musterseite zeigt immer alle.
const TON_BEISPIELE = {
  ok: { text: "Erledigt", wofuer: "abgeschlossen, eingereicht, zugestellt" },
  wait: { text: "Wartet", wofuer: "liegt bei jemand anderem, Frist naht" },
  critical: { text: "Überfällig", wofuer: "Frist verstrichen, Fehler, nicht zugestellt" },
  info: { text: "Hinweis", wofuer: "zur Kenntnis, kein Handlungsbedarf" },
  neutral: { text: "Entwurf", wofuer: "alles Übrige" },
} satisfies Record<StatusTon, { text: string; wofuer: string }>;
const TOENE = Object.keys(STATUS_TOENE) as StatusTon[];

const FARBEN: { name: string; klasse: string; hinweis: string }[] = [
  { name: "surface", klasse: "bg-surface", hinweis: "Seitengrund" },
  { name: "card", klasse: "bg-card", hinweis: "Gruppen, Dialoge" },
  { name: "ink", klasse: "bg-ink", hinweis: "Text" },
  { name: "ink-2", klasse: "bg-ink-2", hinweis: "Nebentext, Platzhalter" },
  { name: "ink-3", klasse: "bg-ink-3", hinweis: "kein Text: Gesperrtes, Trennzeichen" },
  { name: "action", klasse: "bg-action", hinweis: "Primärknopf, aktiv" },
  { name: "ok", klasse: "bg-ok", hinweis: "Zustand" },
  { name: "wait", klasse: "bg-wait", hinweis: "Zustand" },
  { name: "critical", klasse: "bg-critical", hinweis: "Zustand" },
  { name: "info", klasse: "bg-info", hinweis: "Zustand" },
];

export default async function UiMusterPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect(vorgangslistePfad());

  return (
    <div className="min-h-screen bg-surface">

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <MusterKopf />

        <Gruppe titel="Farben" beschreibung="Vier Gruppen, nie vermischt: Marke, Einrichtung, Interaktion, Zustand.">
          <Zeile>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {FARBEN.map((farbe) => (
                <li key={farbe.name} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`h-9 w-9 shrink-0 rounded-lg ring-1 ring-hairline ${farbe.klasse}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{farbe.name}</span>
                    <span className="block text-xs text-ink-2">{farbe.hinweis}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Zeile>
        </Gruppe>

        <Gruppe titel="Knöpfe" beschreibung="Je Ansicht höchstens ein Primärknopf.">
          <Zeile>
            <div className="flex flex-wrap items-center gap-3">
              <Button variante="primary">Primär</Button>
              <Button>Sekundär</Button>
              <Button variante="ghost">Unauffällig</Button>
              <Button variante="critical">Stornieren</Button>
            </div>
          </Zeile>
          <Zeile>
            <div className="flex flex-wrap items-center gap-3">
              <Button variante="primary" groesse="sm">
                Klein
              </Button>
              <Button groesse="sm">Klein</Button>
              <Button variante="primary" laedt>
                Wird gesendet …
              </Button>
              <Button disabled>Gesperrt</Button>
              <Button aria-disabled>Gesperrt, fokussierbar</Button>
              <Button asChild>
                <Link href={vorgangslistePfad()}>Als Verweis</Link>
              </Button>
            </div>
          </Zeile>
        </Gruppe>

        <Gruppe titel="Statuspillen" beschreibung="Immer mit Text, nie nur Farbe.">
          {TOENE.map((ton) => (
            <Zeile key={ton} className="flex items-center justify-between gap-4">
              <Statuspille ton={ton}>{TON_BEISPIELE[ton].text}</Statuspille>
              <span className="text-right text-xs text-ink-2">{TON_BEISPIELE[ton].wofuer}</span>
            </Zeile>
          ))}
        </Gruppe>

        <Gruppe
          titel="Segment-Schalter"
          beschreibung="Wählt eine Sicht derselben Liste. Pfeiltasten wechseln; die Zahl gehört zum Namen der Sicht."
        >
          <Zeile>
            <SegmentMuster />
          </Zeile>
        </Gruppe>

        <Gruppe
          titel="Dialoge"
          beschreibung="Ersatz für die Rückfrage des Browsers. Während die Aktion läuft, schließt nichts; ein Fehler bleibt im Dialog."
        >
          <Zeile>
            <DialogMuster />
          </Zeile>
        </Gruppe>

        <Gruppe
          titel="Meldungen"
          beschreibung="Ersatz für das Hinweisfenster des Browsers. Erfolg verschwindet nach 5 Sekunden, ein Fehler bleibt stehen."
        >
          <Zeile>
            <ToastMuster />
          </Zeile>
        </Gruppe>

        {/* Die Prozessleiste ist selbst eine Karte, die Reiter bringen ihre
            Gruppen mit — beide stehen deshalb wie der Ladezustand direkt auf
            dem Seitengrund, nicht in einer Gruppe (sonst Karte in Karte). */}
        <section aria-labelledby="muster-prozessleiste" className="space-y-2">
          <div className="px-1">
            <h2 id="muster-prozessleiste" className="font-heading text-2xs font-semibold uppercase tracking-label text-ink-2">
              Prozessleiste
            </h2>
            <p className="mt-0.5 text-xs text-ink-2">
              Wo der Vorgang steht, bei wem er liegt und die eine Handlung. Die Lagen kommen aus dem Vertragsende; die
              Leiste selbst kennt kein Modul.
            </p>
          </div>
          <ProzessleisteMuster />
        </section>

        <section aria-labelledby="muster-reiter" className="space-y-2">
          <div className="px-1">
            <h2 id="muster-reiter" className="font-heading text-2xs font-semibold uppercase tracking-label text-ink-2">
              Reiter
            </h2>
            <p className="mt-0.5 text-xs text-ink-2">
              Teilen eine Seite in Bereiche mit eigenem Inhalt. Pfeiltasten wechseln; die Zahl gehört zum Namen des
              Reiters.
            </p>
          </div>
          <ReiterMuster />
        </section>

        <section aria-labelledby="muster-ladezustand" className="space-y-2">
          <div className="px-1">
            <h2 id="muster-ladezustand" className="font-heading text-2xs font-semibold uppercase tracking-label text-ink-2">
              Ladezustand
            </h2>
            <p className="mt-0.5 text-xs text-ink-2">
              Das Skelett hat die Form dessen, was kommt – die Seite springt nicht, wenn die Daten eintreffen.
            </p>
          </div>
          <LadeMuster />
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <Gruppe titel="Leerzustand in einer Gruppe" beschreibung="Sagt, was leer ist und wie es weitergeht.">
            <Leerzustand symbol={Inbox} titel="Keine offenen Aufgaben" aktion={<Button groesse="sm">Neuen Vorgang anlegen</Button>}>
              Sobald eine Abteilung etwas zurückmeldet, steht es hier.
            </Leerzustand>
          </Gruppe>

          <Gruppe titel="Leerzustand nach einem Filter" beschreibung="Ein eigener Text – nicht derselbe wie „es gibt noch nichts“.">
            <Leerzustand symbol={SearchX} titel="Kein Vorgang passt zu diesem Filter" aktion={<Button groesse="sm">Filter zurücksetzen</Button>}>
              In „Kritisch“ steht gerade nichts.
            </Leerzustand>
          </Gruppe>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <Gruppe titel="Gruppe mit Beschriftung und Wert" aktion={<Button groesse="sm">Ändern</Button>}>
            <Zeile label="Einrichtung">Berufskolleg</Zeile>
            <Zeile label="Vertragsbeginn">01.02.2027</Zeile>
            <Zeile label="Umfang">25,5 Stunden</Zeile>
            <Zeile label="Personalnummer" />
            <Zeile label="Bankverbindung">DE89370400440532013000 · COBADEFFXXX</Zeile>
            <Zeile label="Voraussichtliches Ende der Zweckbefristung (Vertretung)">31.07.2027</Zeile>
          </Gruppe>

          <Gruppe titel="Gruppe als Liste">
            <Zeile className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-semibold">Muster, Maria</span>
                <span className="block text-xs text-ink-2">Onboarding · Berufskolleg</span>
              </span>
              <Statuspille ton="wait">Wartet auf Führungskraft</Statuspille>
            </Zeile>
            <Zeile className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-semibold">Beispiel, Jonas</span>
                <span className="block text-xs text-ink-2">Vertragsende · Gesamtschule</span>
              </span>
              <Statuspille ton="critical">Frist verstrichen</Statuspille>
            </Zeile>
            <Zeile className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-semibold">Langer Zustand</span>
                <span className="block text-xs text-ink-2">bricht um, wird nie abgeschnitten</span>
              </span>
              <Statuspille ton="wait">Wartet auf Einstellungsmodalitäten der Führungskraft</Statuspille>
            </Zeile>
          </Gruppe>
        </div>
      </main>
    </div>
  );
}
