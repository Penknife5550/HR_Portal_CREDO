/**
 * Versand eines Dokumentenpakets.
 *
 * POST /api/dokumentenpaket/versenden
 *   Body: { modul, refId, positionen[{art,id,bestaetigt?}], empfaenger, nachricht? }
 *
 * Loest POST /api/onboarding/[id]/starterpaket ab — den bisherigen
 * Alles-oder-nichts-Versand. Die Bibliothek traegt die Logik; hier stehen nur
 * die Statuscodes.
 *
 * Fehlerbilder: 403 fremder Mandant, 404 Vorgang, 409 leere Auswahl, fehlende
 * Bestaetigung, fehlende Datei, fehlerhafte Vorlage oder nicht freigegebene
 * Empfaengeradresse, 413 zu gross, 429 zu viele Versendungen, 502 PDF-Dienst
 * oder SMTP. Kein Abbruch hinterlaesst einen Nachweis.
 *
 * Was die Bremse (429) wirklich zusagt, je Benutzerkonto: 10 pro Minute und 60
 * pro Stunde als NACHFUELLRATE — nicht als Deckel des ersten Zeitfensters.
 * Beide Eimer starten voll, und ein voller Eimer ist ein Schubkontingent, das
 * zum laufenden Nachfuellen HINZUKOMMT: Wer eine Stunde lang nichts versendet
 * hat, hat 60 Token liegen und bekommt in der folgenden Stunde 60 weitere dazu
 * — in dieser Stunde sind also bis zu 120 Versendungen moeglich (die
 * Minutenbremse verteilt sie ueber rund elf Minuten). Erst danach pendelt es
 * sich auf 60 je Stunde ein.
 *
 * So arbeitet ein Token-Bucket, und so ist es hier gewollt: Ein Personalbuero
 * versendet stossweise — am Onboarding-Tag viel, danach tagelang nichts. Der
 * Schub faengt genau das ab. Wer eine harte Obergrenze je Kalenderstunde
 * braucht (etwa fuer eine Zusage nach aussen), bekommt sie mit diesem
 * Verfahren nicht; das waere ein Zaehler je festem Zeitfenster.
 *
 * Berechtigung: HR_EDIT_ROLES + Mandant des Vorgangs.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { versendePaket, statusFuerFehler } from "@/lib/dokumentenpaket";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { createRateLimiter, getClientIpOrNull } from "@/lib/rate-limit";
import { versendePaketSchema, type VersendePaket } from "@/lib/validations/dokumentenpaket";

/**
 * Zwei Bremsen, beide auf die userId.
 *
 * Der Schluessel ist die Anmeldung und NICHT die IP: Wer hier Schaden anrichten
 * kann, ist angemeldet. HR_SACHBEARBEITER steht in GLOBAL_ROLES und sieht damit
 * alle 16 Mandanten — dieses Konto koennte die Vorgangs-IDs des Dashboards der
 * Reihe nach abarbeiten und sich Paket fuer Paket an eine eigene Adresse
 * schicken lassen. Eine IP wechselt man mit dem Mobilfunknetz, ein Konto nicht.
 * Ein zusammengesetzter Schluessel `userId:ip` waere sogar schlechter als
 * keiner: Er schenkte genau diesem Aufrufer je Netzwechsel einen frischen
 * Zaehler. Umgekehrt sitzt das Personalbuero hinter einer gemeinsamen Adresse,
 * eine IP-Bremse traefe dort die Kolleginnen mit. Fuer die Nachverfolgung
 * bleibt die IP unberuehrt — sie steht im AuditLog (ipAddress).
 *
 * Zwei Zeitfenster, weil eines nicht reicht: Die Minute faengt den
 * Skript-Sturm; die Stunde den langsamen Abfluss, der sich brav an zehn pro
 * Minute haelt und damit sonst 600 Vorgaenge je Stunde schaffte. 60 pro Stunde
 * liegt deutlich ueber dem, was ein Personalbuero an einem starken
 * Onboarding-Tag von Hand versendet.
 *
 * BEWUSST prozesslokal, genau wie die Doppelversand-Sperre in
 * dokumentenpaket.ts: Das Portal laeuft als ein Container. Wird es je
 * waagerecht skaliert, traegt diese Bremse nicht mehr und muss durch eine
 * gemeinsame Ablage (Datenbank/Redis) ersetzt werden.
 */
const versandLimiterMinute = createRateLimiter("dokumentenpaket-versand", {
  maxRequests: 10,
  windowMs: 60_000,
});
const versandLimiterStunde = createRateLimiter("dokumentenpaket-versand-stunde", {
  maxRequests: 60,
  windowMs: 60 * 60_000,
});

function zuVieleAnfragen(retryAfterMs: number | undefined, text: string): NextResponse {
  return NextResponse.json(
    { error: text },
    {
      status: 429,
      // Retry-After in Sekunden (RFC 9110). Ohne den Kopf raet der Dialog,
      // wann er es wieder versuchen darf — und raet zu frueh.
      headers: { "Retry-After": String(Math.ceil((retryAfterMs ?? 60_000) / 1000)) },
    },
  );
}

export const POST = apiHandler<VersendePaket>(
  {
    roles: HR_EDIT_ROLES,
    bodySchema: versendePaketSchema,
    logLabel: "Dokumentenpaket Versand",
  },
  async ({ request, body, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    // Vor allem anderen — auch ein abgewiesener Versuch (fehlende Bestaetigung,
    // fremder Mandant, nicht freigegebene Adresse) kostet ein Kontingent. Sonst
    // liesse sich ueber die Fehlerpfade beliebig oft probieren, und gerade die
    // Fehlerpfade verraten, welche Vorgangs-ID existiert.
    const proMinute = versandLimiterMinute.check(session.userId);
    if (!proMinute.allowed) {
      return zuVieleAnfragen(
        proMinute.retryAfterMs,
        "Zu viele Versendungen in kurzer Zeit. Bitte einen Moment warten.",
      );
    }
    const proStunde = versandLimiterStunde.check(session.userId);
    if (!proStunde.allowed) {
      return zuVieleAnfragen(
        proStunde.retryAfterMs,
        "In der letzten Stunde wurden ungewoehnlich viele Dokumentenpakete versendet. Bitte spaeter erneut versuchen.",
      );
    }

    const ergebnis = await versendePaket({
      modul: body.modul,
      refId: body.refId,
      positionen: body.positionen,
      empfaenger: body.empfaenger,
      nachricht: body.nachricht,
      session,
      ipAddress: getClientIpOrNull(request),
    });

    if (ergebnis.status === "FEHLER") {
      return NextResponse.json(
        {
          error: ergebnis.detail,
          fehler: ergebnis.fehler,
          // Bei fehlender Bestaetigung: welche Vorlagen es betrifft, damit der
          // Dialog die Haekchen genau dort setzen kann.
          betroffen: ergebnis.betroffen,
        },
        { status: statusFuerFehler(ergebnis.fehler) },
      );
    }

    return NextResponse.json({
      data: {
        versandId: ergebnis.versandId,
        empfaenger: ergebnis.empfaenger,
        dokumente: ergebnis.dokumente,
        warnungen: ergebnis.warnungen,
      },
    });
  },
);
