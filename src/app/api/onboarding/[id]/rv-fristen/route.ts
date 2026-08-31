/**
 * API: /api/onboarding/:id/rv-fristen — der Arbeitgeberteil des RV-Antrags.
 *
 * GET   liefert den erfassten Stand **und** die berechneten Vorschlaege.
 * PATCH speichert, was HR bestaetigt oder von Hand gesetzt hat.
 *
 * Warum die Vorschlaege vom Server kommen und nicht im Browser gerechnet
 * werden: Sie haengen an Groessen, die die Oberflaeche nicht alle hat (dem
 * Abrechnungstermin des Mandanten, dem Vertragsbeginn aus den
 * Vorgesetzten-Angaben) — und sie sollen an genau einer Stelle entstehen. Zwei
 * Rechenwege, die auseinanderlaufen, waeren bei Beitragsfolgen das Letzte, was
 * man gebrauchen kann.
 *
 * **Berechnet wird ein Vorschlag, gespeichert wird eine Entscheidung.** Das
 * Wirkungsdatum wird nie automatisch gesetzt: HR uebernimmt es bewusst oder
 * traegt ein anderes ein. Die Daten wirken unmittelbar auf die Beitragspflicht
 * und landen nach § 8 Abs. 2 Nr. 4a BVV in den Entgeltunterlagen.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, PORTAL_ROLES } from "@/lib/permissions";
import {
  type Kalendertag,
  berlinerKalendertag,
  istKalendertag,
  meldefristEnde,
  widerspruchsfristEnde,
  wirkungAufhebung,
  wirkungDerBefreiung,
} from "@/lib/minijob-fristen";

/**
 * Kalendertag aus einer **`@db.Date`-Spalte**.
 *
 * Nur dafuer ist dieser Weg richtig: Solche Spalten kommen als UTC-Mitternacht
 * an und tragen keine Ortszeit. Fuer einen echten Zeitstempel (`DateTime` ohne
 * `@db.Date`) waere er falsch — dort gehoert `berlinerKalendertag()` hin. Der
 * Unterschied kostet einen ganzen Monat, weil alle Regeln auf dem
 * Kalendermonat aufsetzen.
 */
function tagAusDateSpalte(d: Date | null | undefined): Kalendertag | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Kalendertag -> Prisma-Datum.
 *
 * Bewusst mit `T00:00:00Z`: Die Spalte ist ein `date`, es gibt keine Uhrzeit.
 * Ohne das Z wuerde die Zeitzone des Servers mitgerechnet und der Tag koennte
 * kippen.
 */
function alsDatum(tag: Kalendertag | null): Date | null {
  return tag ? new Date(`${tag}T00:00:00Z`) : null;
}

async function ladeVorgang(id: string) {
  return prisma.onboardingProcess.findUnique({
    where: { id },
    select: {
      id: true,
      organization: {
        select: { id: true, name: true, betriebsnummer: true, entgeltabrechnungTag: true },
      },
      supervisorData: { select: { vertragsbeginn: true } },
      personalData: {
        select: {
          rvEntscheidung: true,
          rvEntscheidungAm: true,
          rvAntragEingangAm: true,
          rvWirkungAb: true,
          rvMeldungAm: true,
          rvBearbeitetAm: true,
          rvBearbeitetVonId: true,
        },
      },
    },
  });
}

type Vorgang = NonNullable<Awaited<ReturnType<typeof ladeVorgang>>>;

/** Baut den Antwortkoerper: erfasste Werte plus Vorschlaege. */
function baueAntwort(v: Vorgang) {
  const pd = v.personalData;
  const eingang = tagAusDateSpalte(pd?.rvAntragEingangAm);
  const meldung = tagAusDateSpalte(pd?.rvMeldungAm);
  // `vertragsbeginn` ist ein Zeitstempel, keine date-Spalte.
  const beginn = v.supervisorData?.vertragsbeginn
    ? berlinerKalendertag(v.supervisorData.vertragsbeginn)
    : null;
  const entscheidung = pd?.rvEntscheidung ?? null;

  const istBefreiung = entscheidung === "BEFREIUNG_BEANTRAGT";
  const istAufhebung = entscheidung === "AUFHEBUNG_BEANTRAGT";

  // Beim Aufhebungsantrag ist die Antragstellung die Erklaerung im Fragebogen;
  // sie darf elektronisch erfolgen. Liegt ein abweichender Papiereingang vor,
  // hat HR ihn erfasst — der geht dann vor.
  // `rvEntscheidungAm` ist ein echter Zeitstempel (`new Date()` beim Absenden),
  // keine date-Spalte. Ohne die Umrechnung ueber Berlin schlaegt eine Absendung
  // am Monatsersten kurz nach Mitternacht einen um einen ganzen Monat zu
  // fruehen Wirkungsbeginn vor — und fuer die elektronisch erklaerte Aufhebung
  // ist dieser Rueckfall der Normalfall, weil es dort gar keinen Papiereingang
  // gibt.
  const antragstellung = istAufhebung
    ? eingang ??
      (pd?.rvEntscheidungAm ? berlinerKalendertag(pd.rvEntscheidungAm) : null)
    : eingang;

  const frist = istBefreiung
    ? meldefristEnde(eingang, v.organization?.entgeltabrechnungTag ?? null, beginn)
    : null;

  // Die Fallentscheidung Regelfall/Verspaetung trifft der Rechenkern, nicht die
  // Oberflaeche — sonst haetten zwei Stellen dieselbe Regel auszulegen.
  const wirkung = istBefreiung
    ? wirkungDerBefreiung({
        eingangBeimArbeitgeber: eingang,
        beschaeftigungsbeginn: beginn,
        meldungBeiMinijobzentrale: meldung,
        meldefrist: frist?.datum ?? null,
      })
    : istAufhebung
      ? wirkungAufhebung(antragstellung, beginn)
      : null;

  return {
    entscheidung,
    // Zeitstempel der Entscheidung, damit die Oberflaeche einordnen kann,
    // wann der Beschaeftigte sich erklaert hat.
    entscheidungAm: pd?.rvEntscheidungAm
      ? berlinerKalendertag(pd.rvEntscheidungAm)
      : null,
    vertragsbeginn: beginn,
    mandant: {
      name: v.organization?.name ?? null,
      betriebsnummerVorhanden: Boolean(v.organization?.betriebsnummer),
      entgeltabrechnungTag: v.organization?.entgeltabrechnungTag ?? null,
    },
    erfasst: {
      antragEingangAm: eingang,
      wirkungAb: tagAusDateSpalte(pd?.rvWirkungAb),
      meldungAm: meldung,
      bearbeitetAm: pd?.rvBearbeitetAm?.toISOString() ?? null,
    },
    vorschlag: {
      wirkungAb: wirkung,
      // Ob der Verspaetungsfall gilt, hat der Rechenkern schon entschieden.
      verspaetet: wirkung && "verspaetet" in wirkung ? wirkung.verspaetet : false,
      meldefrist: frist,
      widerspruchsfrist: widerspruchsfristEnde(meldung),
    },
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    // Bewusst die gemeinsame Liste statt einer eigenen: Die frueher hier
    // stehende Liste fuehrte "VIEWER" — eine Rolle, die es im Schema gar
    // nicht gibt.
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const vorgang = await ladeVorgang(id);
    if (!vorgang) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ data: baueAntwort(vorgang) });
  } catch (error) {
    console.error("Fehler beim Laden der RV-Fristen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

/** Nimmt einen Wert entgegen: gueltiger Tag, leer (= loeschen) oder Fehler. */
function lies(
  wert: unknown,
  feld: string
): { ok: true; tag: Kalendertag | null } | { ok: false; fehler: string } {
  if (wert === null || wert === "") return { ok: true, tag: null };
  if (istKalendertag(wert)) return { ok: true, tag: wert };
  return { ok: false, fehler: `Ungültiges Datum im Feld „${feld}“.` };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const vorgang = await ladeVorgang(id);
    if (!vorgang) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!vorgang.personalData) {
      return NextResponse.json(
        { error: "Zu diesem Vorgang liegen noch keine Angaben vor." },
        { status: 409 }
      );
    }

    const daten: Record<string, Date | null | string> = {};
    const geaendert: string[] = [];

    for (const [feld, label] of [
      ["antragEingangAm", "Eingang beim Arbeitgeber"],
      ["wirkungAb", "Wirkung ab"],
      ["meldungAm", "Meldung an die Minijob-Zentrale"],
    ] as const) {
      if (body[feld] === undefined) continue;
      const geprueft = lies(body[feld], label);
      if (!geprueft.ok) {
        return NextResponse.json({ error: geprueft.fehler }, { status: 400 });
      }
      const spalte =
        feld === "antragEingangAm"
          ? "rvAntragEingangAm"
          : feld === "wirkungAb"
            ? "rvWirkungAb"
            : "rvMeldungAm";
      daten[spalte] = alsDatum(geprueft.tag);
      geaendert.push(label);
    }

    if (geaendert.length === 0) {
      return NextResponse.json({ error: "Nichts zu speichern." }, { status: 400 });
    }

    // Plausibilitaet, die keine Rechtsfrage ist: Eine Meldung kann nicht vor dem
    // Eingang des Antrags liegen, den sie meldet.
    const neuerEingang =
      daten.rvAntragEingangAm !== undefined
        ? tagAusDateSpalte(daten.rvAntragEingangAm as Date | null)
        : tagAusDateSpalte(vorgang.personalData.rvAntragEingangAm);
    const neueMeldung =
      daten.rvMeldungAm !== undefined
        ? tagAusDateSpalte(daten.rvMeldungAm as Date | null)
        : tagAusDateSpalte(vorgang.personalData.rvMeldungAm);

    if (neuerEingang && neueMeldung && neueMeldung < neuerEingang) {
      return NextResponse.json(
        {
          error:
            "Die Meldung an die Minijob-Zentrale kann nicht vor dem Eingang des " +
            "Antrags liegen. Bitte prüfen Sie die beiden Daten.",
        },
        { status: 400 }
      );
    }

    daten.rvBearbeitetVonId = session.userId;
    daten.rvBearbeitetAm = new Date();

    await prisma.personalData.update({
      where: { onboardingId: id },
      data: daten,
    });

    // Diese Daten wirken auf die Beitragspflicht und gehen in die
    // Entgeltunterlagen. Jede Aenderung muss nachvollziehbar sein — mit dem
    // alten Wert, nicht nur mit dem neuen.
    await prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          processType: "ONBOARDING",
          onboardingId: id,
          action: "RV_FRISTEN_UPDATED",
          details: {
            geaendert,
            vorher: {
              antragEingangAm: tagAusDateSpalte(
                vorgang.personalData.rvAntragEingangAm
              ),
              wirkungAb: tagAusDateSpalte(vorgang.personalData.rvWirkungAb),
              meldungAm: tagAusDateSpalte(vorgang.personalData.rvMeldungAm),
            },
            nachher: {
              antragEingangAm: neuerEingang,
              wirkungAb:
                daten.rvWirkungAb !== undefined
                  ? tagAusDateSpalte(daten.rvWirkungAb as Date | null)
                  : tagAusDateSpalte(vorgang.personalData.rvWirkungAb),
              meldungAm: neueMeldung,
            },
          },
          ipAddress:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            null,
        },
      })
      .catch(() => {
        // Die Aenderung selbst ist wichtiger als ihr Protokoll.
      });

    const frisch = await ladeVorgang(id);
    return NextResponse.json({ data: frisch ? baueAntwort(frisch) : null });
  } catch (error) {
    console.error("Fehler beim Speichern der RV-Fristen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
