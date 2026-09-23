/**
 * API: Einstellungsmodalitaeten (Vorgesetzter)
 *
 * GET  /api/modalitaeten/:token  → Lade Vorgesetzten-Daten + MA-Info
 * PUT  /api/modalitaeten/:token  → Speichere/Aktualisiere Daten (Auto-Save)
 * POST /api/modalitaeten/:token  → Modalitaeten endgültig absenden
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateSupervisorToken } from "@/lib/auth";
import {
  HR_STATUS,
  MITARBEITER_NEUTRAL,
  mitarbeiterName,
  vorgesetzteAbgesendet,
} from "@/lib/onboarding-spuren";
import { statusAbgleichen } from "@/lib/onboarding-status-abgleich";
import type { StatusAbgleich } from "@/lib/onboarding-status-abgleich";
import { faelligkeitenSetzen } from "@/lib/abteilungsaufgaben-onboarding";
import { triggerN8nWebhook } from "@/lib/n8n";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";
import { BEFRISTUNGSARTEN } from "@/lib/validations/supervisor-data";
import {
  kostenstellenListeSchema,
  summenFehler,
  zuDatensatz,
} from "@/lib/validations/kostenstellen";

// =============================================
// Zod-Schema für Modalitaeten-Validierung (serverseitig)
// =============================================
const modalitaetenFieldsSchema = z.object({
  betriebsstaette: z.string().max(500).optional(),
  stellenbeschreibung: z.string().max(200).optional(),
  vertragsbeginn: z.string().optional(),
  befristet: z.boolean().optional(),
  befristungsart: z.enum(BEFRISTUNGSARTEN).or(z.literal("")).optional(),
  vertragsende: z.string().optional(),
  befristungZweck: z.string().max(500).optional(),
  vertragsendeVoraussichtlich: z.string().optional(),
  befristungSachgrund: z.string().max(500).optional(),
  vollzeit: z.boolean().optional(),
  wochenstunden: z.number().min(0).max(60).nullable().optional(),
  tageProWoche: z.number().min(1).max(7).nullable().optional(),
  hauptarbeitgeberId: z.string().max(200).optional(),
  hauptarbeitgeberStunden: z.number().min(0).max(60).nullable().optional(),
  nebenarbeitgeberId: z.string().max(200).optional(),
  nebenarbeitgeberStunden: z.number().min(0).max(60).nullable().optional(),
  svPflichtig: z.boolean().optional(),
  minijob: z.boolean().optional(),
  ehrenamt: z.boolean().optional(),
  kostenstelle: z.string().max(100).optional(),
  kostenstelleAnteil: z.number().min(0).max(100).nullable().optional(),
  // Die Aufteilung des Gehalts auf mehrere Kostenstellen. Ohne diesen Eintrag
  // faellt `kostenstellen` wegen `.strip()` weiter unten STILL aus dem Aufruf
  // heraus — gespeichert wuerde nichts, gemeldet auch nichts.
  // Dieselbe Datei prueft das Formular: zwei Rechenwege fuer dieselbe Regel
  // waeren zwei Wahrheiten.
  kostenstellen: kostenstellenListeSchema.optional(),
  kostenstellenBemerkung: z.string().max(2000).optional(),
  probezeit: z.boolean().optional(),
  probezeitMonate: z.number().min(0).max(12).nullable().optional(),
  verguetungsmodell: z.enum(["TV_L", "TV_L_S", "HAUSTARIF", "SONSTIGES"]).optional(),
  entgeltgruppe: z.string().max(50).optional(),
  stufe: z.string().max(50).optional(),
  festgehalt: z.number().min(0).nullable().optional(),
  stundenlohn: z.number().min(0).nullable().optional(),
  bemerkungVerguetung: z.string().max(2000).optional(),
  jahressonderzahlung: z.boolean().optional(),
  sonderzahlungProzent: z.number().min(0).max(100).nullable().optional(),
  sachbezuege: z.boolean().optional(),
  sachbezuegeBetrag: z.number().min(0).nullable().optional(),
  zulage: z.boolean().optional(),
  zulageBetrag: z.number().min(0).nullable().optional(),
  urlaubstageProJahr: z.number().min(0).max(50).nullable().optional(),
  masernschutzErforderlich: z.boolean().optional(),
  masernschutzVorArbeitsbeginn: z.boolean().optional(),
  zeiterfassung: z.boolean().optional(),
  zusatzvereinbarungen: z.string().max(5000).optional(),
  currentStep: z.number().min(1).max(10).optional(),
}).strip();

// =============================================
// GET – Modalitaeten-Daten laden
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate Limiting gegen Token-Enumeration
  const clientIp = getClientIp(_request);
  const rlCheck = tokenRateLimiter.check(clientIp);
  if (!rlCheck.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie." },
      { status: 429 }
    );
  }

  const { token } = await params;

  // GET erlaubt auch nach der eigenen Abgabe (Anzeige der eingereichten Daten)
  const result = await validateSupervisorToken(token, { allowSubmitted: true });
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;

  // Alle Einrichtungen laden (für Haupt-/Nebenarbeitgeber Dropdown)
  const organizations = await prisma.organization.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, mandantNumber: true, name: true, shortName: true, type: true },
  });

  return NextResponse.json({
    onboardingId: onboarding.id,
    // Frueher standen hier zusaetzlich `email` und als Namensersatz ebenfalls
    // die E-Mail-Adresse der Person — beim Onboarding meist eine private
    // Freemail-Adresse. Die Fuehrungskraft braucht sie fuer die Modalitaeten
    // nicht (Datensparsamkeit), und die Seite hat `email` nie angezeigt.
    //
    // Der Name faellt seit dem parallelen Ablauf haeufig leer aus: Die
    // Fuehrungskraft oeffnet ihren Link oft, bevor die Person im Fragebogen
    // ihren Namen eingetragen hat. Dann gilt der Name am Vorgang, sonst eine
    // neutrale Bezeichnung — nicht „für  · FES Gymnasium" mit leerem Namen.
    employeeName: mitarbeiterName(onboarding) ?? MITARBEITER_NEUTRAL,
    organization: {
      name: onboarding.organization.name,
      mandantNumber: onboarding.organization.mandantNumber,
      type: onboarding.organization.type,
    },
    organizations,
    supervisorData: onboarding.supervisorData || null,
    status: onboarding.status,
    // Die Seite zeigt „Vielen Dank!" an DIESEM Feld und nicht mehr am Status:
    // Sendet die Fuehrungskraft vor der Person ab, bleibt der Status
    // INVITED/IN_PROGRESS (er folgt dann der Fragebogen-Spur), und die Seite
    // zeigte sonst wieder das Formular.
    vorgesetzteAbgesendet: vorgesetzteAbgesendet(onboarding),
  });
}

// =============================================
// PUT – Auto-Save (Daten speichern)
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate-Limiting
  const clientIp = getClientIp(request);
  const rlCheck = tokenRateLimiter.check(clientIp);
  if (!rlCheck.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie." },
      { status: 429 }
    );
  }

  const { token } = await params;

  const result = await validateSupervisorToken(token);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;
  const body = await request.json();

  // Serverseitige Zod-Validierung
  const parsed = modalitaetenFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { currentStep, ...data } = parsed.data;

  // Whitelist erlaubter Felder (Mass-Assignment-Schutz)
  const ALLOWED_FIELDS = new Set([
    "betriebsstaette", "stellenbeschreibung",
    "vertragsbeginn", "befristet", "befristungsart", "vertragsende",
    "befristungZweck", "vertragsendeVoraussichtlich", "befristungSachgrund",
    "vollzeit", "wochenstunden", "tageProWoche",
    "hauptarbeitgeberId", "hauptarbeitgeberStunden",
    "nebenarbeitgeberId", "nebenarbeitgeberStunden",
    "svPflichtig", "minijob", "ehrenamt",
    // `kostenstellen` steht hier BEWUSST NICHT: Die Zeilen liegen in einer
    // eigenen Tabelle. Stuenden sie in der Liste, landete ein Array in
    // `updateData` und damit unveraendert in `supervisorData.update` — Prisma
    // kennt dort kein solches Feld.
    //
    // `kostenstelle` und `kostenstelleAnteil` stehen hier EBENFALLS NICHT
    // MEHR. Sie haben kein Eingabefeld mehr; das Formular reichte nur den
    // GELADENEN Altwert unveraendert zurueck. Genau daraus entstand der
    // Wiedergaenger: Wer die Aufteilung leerte, loeschte die Zeilen — und
    // schrieb im selben Aufruf den alten Einzelwert erneut fest. Geschrieben
    // werden die beiden Spalten ab jetzt an genau EINER Stelle, unten aus der
    // Aufteilung abgeleitet. Ein Aufruf kann sie nicht mehr selbst setzen.
    "kostenstellenBemerkung",
    "probezeit", "probezeitMonate",
    "verguetungsmodell", "entgeltgruppe", "stufe",
    "festgehalt", "stundenlohn", "bemerkungVerguetung",
    "jahressonderzahlung", "sonderzahlungProzent",
    "sachbezuege", "sachbezuegeBetrag",
    "zulage", "zulageBetrag",
    "urlaubstageProJahr",
    "masernschutzErforderlich", "masernschutzVorArbeitsbeginn",
    "zeiterfassung", "zusatzvereinbarungen",
  ]);

  const updateData: Record<string, unknown> = {};

  // Nur gesetzte UND erlaubte Felder uebernehmen
  for (const [key, value] of Object.entries(data)) {
    if (ALLOWED_FIELDS.has(key) && value !== undefined) {
      updateData[key] = value;
    }
  }

  // Datumsfelder konvertieren – leere Strings MUESSEN zu null werden,
  // sonst lehnt Prisma den Wert fuer die DateTime-Spalte ab (Formular blieb haengen).
  const DATE_FIELDS = ["vertragsbeginn", "vertragsende", "vertragsendeVoraussichtlich"] as const;
  for (const field of DATE_FIELDS) {
    const value = data[field];
    if (value === undefined) continue;
    if (!value) {
      updateData[field] = null;
      continue;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: `Ungültiges Datum im Feld "${field}".` },
        { status: 400 }
      );
    }
    updateData[field] = parsed;
  }

  // Befristung konsistent halten: nur die Felder der gewaehlten Art speichern.
  // Nur ausfuehren, wenn der Schritt "Stelle & Vertrag" gesendet wurde.
  if (data.befristet !== undefined) {
    if (!data.befristet) {
      updateData.befristungsart = null;
      updateData.vertragsende = null;
      updateData.befristungZweck = null;
      updateData.vertragsendeVoraussichtlich = null;
      updateData.befristungSachgrund = null;
    } else if (data.befristungsart === "ZWECK") {
      // Zweckbefristung: kein bindendes Enddatum (§ 3 Abs. 1 S. 2 TzBfG)
      updateData.vertragsende = null;
    } else if (data.befristungsart === "KALENDER") {
      updateData.befristungZweck = null;
      updateData.vertragsendeVoraussichtlich = null;
    }
  }
  // Leere Auswahl nicht als "" ablegen
  if (updateData.befristungsart === "") updateData.befristungsart = null;

  // Booleans explizit setzen
  const boolFields = [
    "befristet", "vollzeit", "svPflichtig", "minijob", "ehrenamt",
    "probezeit", "jahressonderzahlung", "sachbezuege", "zulage",
    "masernschutzErforderlich", "masernschutzVorArbeitsbeginn", "zeiterfassung",
  ] as const;
  for (const field of boolFields) {
    if (typeof data[field] === "boolean") {
      updateData[field] = data[field];
    }
  }

  if (typeof currentStep === "number") {
    updateData.currentStep = currentStep;
  }

  /**
   * KOSTENSTELLEN-ZEILEN: nur anfassen, wenn der Aufruf sie mitschickt.
   *
   * `Array.isArray` und NICHT `if (zeilen.length)` — das ist der Unterschied
   * zwischen "dazu sage ich nichts" und "keine mehr":
   *   - `undefined` (die Schritte 1 bis 3 speichern) laesst die Aufteilung
   *     stehen. Sonst loeschte jedes Zwischenspeichern sie mit.
   *   - `[]` (alle Zeilen entfernt) MUSS loeschen. Ein Widerruf, der nicht
   *     ankommt, laesst die alte Aufteilung in der Personalakte stehen — im
   *     Widerspruch zu dem, was die vorgesetzte Person auf dem Schirm hatte.
   * Denselben Fehler hatte der Fragebogen schon einmal; die Begruendung steht
   * ausfuehrlich in src/app/api/fragebogen/[token]/route.ts.
   */
  const zeilen = parsed.data.kostenstellen;

  /**
   * DIE ALT-SPALTEN MITFUEHREN — sonst ersteht eine geloeschte Aufteilung
   * beim naechsten Oeffnen des Links wieder auf.
   *
   * Solange `kostenstelle`/`kostenstelleAnteil` neben der Aufteilung stehen
   * (dieses eine Release, siehe Kommentar an SupervisorData in
   * prisma/schema.prisma), gibt es ZWEI Quellen fuer dieselbe Angabe. Die
   * Maske braucht deshalb einen Rueckfall auf die Alt-Spalte
   * (`mitKostenstellenRueckfall` in src/app/modalitaeten/[token]/page.tsx) —
   * ein Bestandsvorgang, dessen Datenmigration noch nicht gelaufen ist, soll
   * seine Kostenstelle nicht verlieren.
   *
   * Dieser Rueckfall kann am Ergebnis aber nicht unterscheiden, ob nie eine
   * Aufteilung gepflegt wurde oder ob sie gerade bewusst geleert worden ist:
   * beide Male steht dort "keine Zeile, aber ein Altwert". Blieb die
   * Alt-Spalte beim Loeschen stehen, setzte er die entfernte Zeile beim
   * naechsten Laden wieder ein, und das naechste "Weiter" schrieb sie erneut
   * in die Datenbank — der Widerruf hielt keinen Reload.
   *
   * Geheilt wird das hier, auf der SCHREIBSEITE: Sobald ein Aufruf die
   * Aufteilung mitschickt, folgt ihr die Alt-Spalte.
   *   - Zeilen vorhanden -> erste Zeile (Bezeichnung und Anteil). Dieselbe
   *     Lesart benutzt der CSV-Export fuer die eine LOGA-Spalte
   *     "Kostenstelle"; zwei Lesarten waeren zwei Wahrheiten.
   *   - Keine Zeile mehr -> null. Damit findet der Rueckfall nichts mehr
   *     vor, und der Widerruf haelt.
   * Danach heisst "Altwert ohne Zeile" nur noch das eine, was es heissen
   * soll: Dieser Vorgang ist noch nicht migriert.
   *
   * `Array.isArray` und nicht `zeilen?.length`: Ein Aufruf, der die
   * Aufteilung gar nicht erwaehnt (die Schritte 1 bis 3), darf die Alt-Spalte
   * so wenig anfassen wie die Zeilen selbst — sonst raeumte jedes
   * Zwischenspeichern sie mit weg. Dieselbe Unterscheidung wie unten.
   */
  if (Array.isArray(zeilen)) {
    // `bezeichnung` ist durch `kostenstellenListeSchema` bereits getrimmt und
    // nicht leer; `?? null` greift also nur, wenn es keine Zeile mehr gibt.
    updateData.kostenstelle = zeilen[0]?.bezeichnung ?? null;
    updateData.kostenstelleAnteil = zeilen[0]?.anteil ?? null;
  }

  // Interaktive Transaktion statt eines Arrays von Operationen: Die id des
  // Upserts wird fuer die Zeilen gebraucht, und beim ersten Speichern gibt es
  // sie vorher noch nicht.
  await prisma.$transaction(async (tx) => {
    const gespeichert = await tx.supervisorData.upsert({
      where: { onboardingId: onboarding.id },
      create: {
        onboardingId: onboarding.id,
        ...updateData,
      },
      update: updateData,
    });

    if (!Array.isArray(zeilen)) return;

    // Ersetzen statt Abgleichen: Die Zeilen haben keine stabile Kennung im
    // Formular, und die Reihenfolge ist Teil der Angabe.
    await tx.supervisorKostenstelle.deleteMany({
      where: { supervisorDataId: gespeichert.id },
    });
    if (zeilen.length > 0) {
      await tx.supervisorKostenstelle.createMany({
        data: zeilen.map((zeile, index) =>
          zuDatensatz(zeile, gespeichert.id, index)
        ),
      });
    }
  });

  return NextResponse.json({ success: true, currentStep });
}

// =============================================
// POST – Modalitaeten endgültig absenden
// =============================================
/**
 * Ein zweiter Absender war schneller (zweiter Tab, Retry nach Timeout).
 *
 * Eigene Klasse, weil die Beanspruchung INNERHALB der Transaktion passiert:
 * Der einzige Weg, eine begonnene Transaktion zurueckzurollen, ist eine
 * Ausnahme. Der Aufrufer antwortet 409.
 */
class BereitsEingereicht extends Error {}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate-Limiting
  const clientIp = getClientIp(request);
  const rlCheck = tokenRateLimiter.check(clientIp);
  if (!rlCheck.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie." },
      { status: 429 }
    );
  }

  const { token } = await params;

  const result = await validateSupervisorToken(token);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;

  // Server-Enforcement: Befristungsangaben muessen zusammenpassen
  const sd = onboarding.supervisorData;
  if (!sd) {
    return NextResponse.json(
      { error: "Bitte füllen Sie das Formular zuerst aus." },
      { status: 400 }
    );
  }
  if (sd.befristet) {
    if (sd.befristungsart === "ZWECK") {
      if (!sd.befristungZweck?.trim()) {
        return NextResponse.json(
          { error: "Bitte beschreiben Sie, wodurch der befristete Vertrag endet." },
          { status: 400 }
        );
      }
    } else if (!sd.vertragsende) {
      return NextResponse.json(
        {
          error:
            "Bitte geben Sie das Vertragsende an – oder wählen Sie die Zweckbefristung, wenn kein Datum feststeht.",
        },
        { status: 400 }
      );
    }
  }

  /**
   * Die harte Sperre fuer die Kostenstellen-Aufteilung.
   *
   * Im Formular ist "Weiter" gesperrt, solange die Summe nicht stimmt — das
   * laesst sich im Browser aber wieder freischalten, und ein Aufruf muss diese
   * Route auch ohne Formular erreichen duerfen. Gerechnet wird in ganzen
   * Hundersteln, sonst wiese `=== 100` ausgerechnet 33,33 + 33,33 + 33,34 ab.
   *
   * Keine Zeile ist ausdruecklich in Ordnung: Wer die Kostenstelle beim
   * Ausfuellen noch nicht kennt, soll nicht am Absenden gehindert werden.
   */
  const summenProblem = summenFehler(sd.kostenstellen ?? []);
  if (summenProblem) {
    return NextResponse.json(
      {
        error: `${summenProblem} Bitte teilen Sie das Gehalt auf genau 100 % auf oder entfernen Sie die Kostenstellen.`,
      },
      { status: 400 }
    );
  }

  /**
   * Der Abschluss — atomar, und ohne den Status hart zu setzen.
   *
   * Frueher schrieb diese Route drei Saetze einzeln und setzte den Status IMMER
   * auf SUPERVISOR_SUBMITTED, gleich ob der Fragebogen schon da war. Sendete
   * die Fuehrungskraft zuerst ab, sperrte das den Fragebogen-Link der Person:
   * Seite, Gate und Absenden lasen den Status als „bereits eingereicht". Der
   * Vorgang hing dauerhaft fest.
   *
   * Jetzt in EINER Transaktion und in dieser Reihenfolge:
   *   1. Die eigene Spur beanspruchen: bedingtes updateMany auf
   *      `supervisorSubmittedAt: null`. Das ist die verbindliche Sperre gegen
   *      Doppel-Absenden (zwei Tabs, Retry) und sperrt die Zeile bis zum
   *      Commit. `supervisorToken: token` gehoert ins WHERE: Hat HR den Link
   *      inzwischen an eine andere Adresse neu vergeben, darf der alte Link
   *      im Fenster zwischen Pruefung und Schreiben nicht mehr absenden.
   *   2. `isComplete` setzen (Altfall-Merker, den Detailansicht und Export lesen).
   *   3. `statusAbgleichen`: liest den Vorgang NACH der Sperre neu. Ist der
   *      Fragebogen offen, bleibt der Status INVITED/IN_PROGRESS; ist er da,
   *      wird er SUPERVISOR_SUBMITTED („Bereit zur Prüfung").
   *   4. Der Protokolleintrag — Nachweis der Abgabe, also im selben Commit.
   */
  const abgegebenAm = new Date();

  // Der Abgleich wird aus der Transaktion HERAUSGEREICHT: Die HR-Mail unten
  // braucht den Status, den DIESELBE Transaktion aus beiden Spuren berechnet
  // hat. Der Lesestand von vor der Transaktion kennt eine gleichzeitige
  // Abgabe des Fragebogens nicht.
  let abgleich: StatusAbgleich | null = null;
  try {
    abgleich = await prisma.$transaction(async (tx) => {
      const beansprucht = await tx.onboardingProcess.updateMany({
        where: {
          id: onboarding.id,
          supervisorToken: token,
          supervisorSubmittedAt: null,
          status: { notIn: [...HR_STATUS] },
        },
        data: { supervisorSubmittedAt: abgegebenAm },
      });
      if (beansprucht.count === 0) throw new BereitsEingereicht();

      await tx.supervisorData.update({
        where: { onboardingId: onboarding.id },
        data: { isComplete: true },
      });

      const ergebnis = await statusAbgleichen(tx, onboarding.id);

      await tx.auditLog.create({
        data: {
          onboardingId: onboarding.id,
          action: "SUPERVISOR_DATA_SUBMITTED",
          details: {
            supervisorEmail: onboarding.supervisorEmail,
            submittedAt: abgegebenAm.toISOString(),
            status: { von: ergebnis.von, nach: ergebnis.nach },
          },
        },
      });

      return ergebnis;
    });
  } catch (error) {
    if (error instanceof BereitsEingereicht) {
      return NextResponse.json(
        { error: "Die Einstellungsmodalitäten wurden bereits eingereicht." },
        { status: 409 }
      );
    }
    console.error("[Modalitaeten] Absenden fehlgeschlagen:", error);
    return NextResponse.json(
      {
        error:
          "Die Einstellungsmodalitäten konnten nicht eingereicht werden. " +
          "Bitte versuchen Sie es erneut.",
      },
      { status: 500 }
    );
  }

  /**
   * Jetzt — und nur jetzt — steht der Vertragsbeginn fest: Der Modalitaeten-Link
   * ist mit der Abgabe gesperrt (auth.ts), das Datum aendert sich nicht mehr.
   * Also die Faelligkeiten der Checkliste EINMAL ausrechnen (Vertragsbeginn +
   * Tagesangabe aus der Vorlage). Punkte ohne Tagesangabe bleiben ohne Frist.
   *
   * Bewusst NACH dem Commit der Abgabe und in einer eigenen Transaktion: Die
   * Abgabe darf daran nicht scheitern. Und bewusst OHNE Versand — Abteilungen
   * informiert nur HR per Knopf (Entscheidung Paket 5). Geht es hier schief,
   * holt das erste „Abteilungen informieren" es nach.
   */
  try {
    await prisma.$transaction((tx) => faelligkeitenSetzen(tx, onboarding.id));
  } catch (err) {
    console.error("[Modalitaeten] Faelligkeiten konnten nicht gesetzt werden:", err);
  }

  // HR-Benachrichtigung „Einstellungsmodalitaeten eingereicht".
  //
  // Nach der Beanspruchung der eigenen Spur kann `nach` nur
  // SUPERVISOR_SUBMITTED (beides da) oder INVITED/IN_PROGRESS (Fragebogen
  // offen) sein — die HR-Status nimmt das `updateMany` aus. Die Merker sind
  // Zeichenketten, keine Wahrheitswerte: `renderTemplate` kennt nur
  // „nicht leer", und String(false) waere nicht leer.
  //
  // Die Rueckfallrichtung ist bewusst asymmetrisch: Ohne `abgleich` gilt
  // „Fragebogen offen" — nie eine unbelegte „bereit zur Prüfung"-Aussage.
  const bereit = abgleich?.nach === "SUPERVISOR_SUBMITTED";
  await triggerN8nWebhook("supervisor-completed", {
    onboardingId: onboarding.id,
    displayId: onboarding.displayId || onboarding.id.substring(0, 8).toUpperCase(),
    // bleibt fuer bestehende Webhook-Abnehmer
    email: onboarding.email,
    supervisorEmail: onboarding.supervisorEmail,
    // Ausdruecklich gesetzt und nie leer: {{mitarbeiter_name}} faellt in
    // `extractVariables` sonst auf `payload.email` zurueck — die private
    // Adresse der Person im Betreff der HR-Mail.
    mitarbeiter_name: mitarbeiterName(onboarding) ?? MITARBEITER_NEUTRAL,
    organization: onboarding.organization.name,
    fragebogen_eingereicht: bereit ? "ja" : "",
    fragebogen_offen: bereit ? "" : "ja",
  });

  return NextResponse.json({
    success: true,
    message: "Einstellungsmodalitaeten wurden erfolgreich eingereicht.",
  });
}
