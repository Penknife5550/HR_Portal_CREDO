"use client";

/**
 * Musterseite: die Prozessleiste in den Lagen, die es wirklich gibt.
 *
 * Gespeist aus dem ECHTEN Adapter des Vertragsendes (`vertragsendeProzessStand`,
 * `vertragsendeMenue`) mit festen Beispieldaten und einem festen `JETZT` — so
 * zeigt die Seite, was die Detailseite zeigen wird, und die Screenshots aendern
 * sich nicht von Tag zu Tag.
 *
 * Die Knoepfe sind gespielt: Ein Klick zeigt nur einen Hinweis. Welche Handlung
 * als Knopf erscheint und welche im „…"-Menue des Seitenkopfs steht, kommt aus
 * dem Adapter; die Texte dazu stehen hier (`AKTION_TEXT`), spaeter auf der Seite.
 */
import { Button } from "@/components/ui/button";
import { Prozessleiste } from "@/components/ui/prozessleiste";
import { toast } from "@/components/ui/toast";
import {
  vertragsendeMenue,
  vertragsendeProzessStand,
  type VertragsendeAktion,
  type VertragsendeStand,
} from "@/lib/prozess/vertragsende";

/** Fest, damit die Tageszahlen („in 4 Tagen") stehen bleiben. */
const JETZT = new Date("2026-09-26T08:00:00Z");

const FUEHRUNGSKRAFT = "schulleitung@beispiel.invalid";
const OFFBOARDING = { id: "muster-offboarding", displayId: "OFF-2026-BK-007" };

/** Handlungsschluessel → Text des Knopfs bzw. Menuepunkts. Was einen Dialog oeffnet, endet auf „…". */
const AKTION_TEXT: Record<VertragsendeAktion, string> = {
  "anfrage-senden": "Anfrage senden …",
  erinnern: "Erinnerung senden",
  "anfrage-neu-senden": "Anfrage neu senden …",
  "offboarding-anlegen": "Offboarding anlegen …",
  "vertrag-erfassen": "Vertrag erfassen …",
  dokumente: "Zu den Dokumenten",
  "zum-offboarding": "Zum Offboarding",
  abschliessen: "Vorgang abschließen …",
  stornieren: "Vorgang stornieren …",
};

function vorgang(teil: Partial<VertragsendeStand>): VertragsendeStand {
  return {
    status: "ANGELEGT",
    decision: "OFFEN",
    contractEndDate: "2027-07-31T00:00:00.000Z",
    createdAt: "2026-09-01T07:30:00.000Z",
    supervisorEmail: null,
    supervisorLinkSentAt: null,
    supervisorTokenExpiresAt: null,
    supervisorRespondedAt: null,
    lastSupervisorReminderAt: null,
    supervisorReminderCount: 0,
    contractSignedReturnedAt: null,
    mavStatus: null,
    completedAt: null,
    offboarding: null,
    ...teil,
  };
}

/** Anfrage ist hinausgegangen, der Link gilt noch. */
const angefragt = (teil: Partial<VertragsendeStand>) =>
  vorgang({
    status: "ANFRAGE_VORGESETZTER",
    supervisorEmail: FUEHRUNGSKRAFT,
    supervisorLinkSentAt: "2026-09-08T09:00:00.000Z",
    supervisorTokenExpiresAt: "2026-10-08T09:00:00.000Z",
    ...teil,
  });

const BEISPIELE: { name: string; vorgang: VertragsendeStand }[] = [
  { name: "Angelegt – die Anfrage an die Führungskraft ist offen", vorgang: vorgang({}) },
  {
    name: "Wartet auf die Führungskraft – zweimal erinnert, Frist naht",
    vorgang: angefragt({
      contractEndDate: "2027-01-31T00:00:00.000Z",
      supervisorReminderCount: 2,
      lastSupervisorReminderAt: "2026-09-22T06:00:00.000Z",
    }),
  },
  {
    name: "Link der Führungskraft abgelaufen – HR ist wieder dran",
    vorgang: angefragt({
      contractEndDate: "2026-12-31T00:00:00.000Z",
      // Frueher angelegt als die uebrigen Beispiele: Die Anfrage liegt sonst vor dem Anlegen.
      createdAt: "2026-08-03T07:30:00.000Z",
      supervisorLinkSentAt: "2026-08-10T09:00:00.000Z",
      supervisorTokenExpiresAt: "2026-09-09T09:00:00.000Z",
      supervisorReminderCount: 3,
      lastSupervisorReminderAt: "2026-09-01T06:00:00.000Z",
    }),
  },
  {
    name: "Übernahme, Vertragsende in 4 Tagen – Entfristungsrisiko",
    vorgang: angefragt({
      status: "RUECKMELDUNG_UEBERNAHME",
      decision: "UEBERNAHME",
      contractEndDate: "2026-09-30T00:00:00.000Z",
      supervisorRespondedAt: "2026-09-15T11:20:00.000Z",
    }),
  },
  {
    name: "Abgelehnt – Offboarding anlegen",
    vorgang: angefragt({
      status: "RUECKMELDUNG_KEINE_UEBERNAHME",
      decision: "KEINE_UEBERNAHME",
      contractEndDate: "2026-10-31T00:00:00.000Z",
      supervisorRespondedAt: "2026-09-15T11:20:00.000Z",
    }),
  },
  {
    name: "Keine Übernahme ohne Anfrage – übersprungene Schritte, Verweis zum Offboarding",
    vorgang: vorgang({
      status: "ENTSCHEIDUNG_KEINE_UEBERNAHME",
      decision: "KEINE_UEBERNAHME",
      contractEndDate: "2026-10-31T00:00:00.000Z",
      offboarding: OFFBOARDING,
    }),
  },
  {
    name: "Abgeschlossen",
    vorgang: angefragt({
      status: "ABGESCHLOSSEN",
      decision: "UEBERNAHME",
      contractEndDate: "2026-09-30T00:00:00.000Z",
      supervisorRespondedAt: "2026-09-12T11:20:00.000Z",
      contractSignedReturnedAt: "2026-09-19T08:00:00.000Z",
      mavStatus: "ZUGESTIMMT",
      completedAt: "2026-09-23T13:45:00.000Z",
    }),
  },
  {
    name: "Storniert – abgebrochen nach der Anfrage",
    vorgang: angefragt({ status: "STORNIERT" }),
  },
];

/**
 * EINMAL beim Laden des Moduls gerechnet, nicht bei jedem Zeichnen: Der Adapter
 * zaehlt Kalendertage ueber `tageZwischen`, und das kostet unter Jest rund
 * 10 ms je Aufruf.
 */
const LAGEN = BEISPIELE.map((beispiel) => ({
  name: beispiel.name,
  stand: vertragsendeProzessStand(beispiel.vorgang, JETZT),
  menue: vertragsendeMenue(beispiel.vorgang, JETZT),
}));

export function ProzessleisteMuster() {
  const gewaehlt = (aktion: VertragsendeAktion) => toast.hinweis(`Handlung „${AKTION_TEXT[aktion]}“ gewählt.`);

  return (
    <div className="space-y-6">
      {LAGEN.map(({ name, stand, menue }) => {
        const haupt = stand.jetztDran?.aktion;
        const neben = stand.jetztDran?.nebenAktion;
        const kritisch = stand.jetztDran?.dringlichkeit === "critical";
        return (
          <div key={name} className="space-y-2">
            <p className="px-1 text-xs font-semibold text-ink-2">{name}</p>
            <Prozessleiste
              stand={stand}
              label={`Ablauf: ${name}`}
              onReiter={(reiter) => toast.hinweis(`Reiter „${reiter}“ würde geöffnet.`)}
              aktion={
                haupt && (
                  <Button variante={kritisch ? "critical" : "primary"} onClick={() => gewaehlt(haupt)}>
                    {AKTION_TEXT[haupt]}
                  </Button>
                )
              }
              nebenAktion={neben && <Button onClick={() => gewaehlt(neben)}>{AKTION_TEXT[neben]}</Button>}
            />
            {menue.length > 0 && (
              <p className="px-1 text-xs text-ink-2">
                Im „…“-Menü des Seitenkopfs: {menue.map((aktion) => AKTION_TEXT[aktion]).join(" · ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
