/**
 * Bremse fuer Mails mit Personalunterlagen aus einem Vorgang — gemeinsam fuer
 * das Dokumentenpaket (POST /api/dokumentenpaket/versenden) und die
 * individuelle E-Mail (POST /api/individuelle-mail).
 *
 * Gemeinsam und nicht je Weg: Beide schicken Anhaenge an eine Adresse, die HR
 * waehlt. Getrennte Kontingente verdoppelten, was ein missbrauchtes Konto an
 * eine eigene Adresse abziehen koennte.
 *
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
 * Minute haelt und damit sonst 600 Versendungen je Stunde schaffte. 60 pro
 * Stunde liegt deutlich ueber dem, was ein Personalbuero an einem starken
 * Onboarding-Tag von Hand versendet.
 *
 * Was die Bremse (429) wirklich zusagt, je Benutzerkonto: 10 pro Minute und 60
 * pro Stunde als NACHFUELLRATE — nicht als Deckel des ersten Zeitfensters.
 * Beide Eimer starten voll, und ein voller Eimer ist ein Schubkontingent, das
 * zum laufenden Nachfuellen HINZUKOMMT: Wer eine Stunde lang nichts versendet
 * hat, hat 60 Token liegen und bekommt in der folgenden Stunde 60 weitere dazu
 * — in dieser Stunde sind also bis zu 120 Versendungen moeglich. So arbeitet
 * ein Token-Bucket, und so ist es gewollt: Ein Personalbuero versendet
 * stossweise.
 *
 * BEWUSST prozesslokal: Das Portal laeuft als ein Container. Wird es je
 * waagerecht skaliert, traegt diese Bremse nicht mehr und muss durch eine
 * gemeinsame Ablage (Datenbank/Redis) ersetzt werden.
 *
 * Die Namen der beiden Speicher sind die von vor der Zusammenlegung — sie
 * bleiben, damit ein laufender Zaehler beim Umbau nicht verloren geht.
 */
import { NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";

const proMinute = createRateLimiter("dokumentenpaket-versand", {
  maxRequests: 10,
  windowMs: 60_000,
});
const proStunde = createRateLimiter("dokumentenpaket-versand-stunde", {
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

/**
 * Verbraucht je Aufruf ein Kontingent — VOR allem anderen, auch ein
 * abgewiesener Versuch zaehlt. Sonst liesse sich ueber die Fehlerpfade beliebig
 * oft probieren, und gerade sie verraten, welche Vorgangs-ID existiert.
 *
 * @returns die 429-Antwort, oder null, wenn der Versand weitergehen darf.
 */
export function versandBremsen(userId: string): NextResponse | null {
  const minute = proMinute.check(userId);
  if (!minute.allowed) {
    return zuVieleAnfragen(minute.retryAfterMs, "Zu viele Versendungen in kurzer Zeit. Bitte einen Moment warten.");
  }
  const stunde = proStunde.check(userId);
  if (!stunde.allowed) {
    return zuVieleAnfragen(
      stunde.retryAfterMs,
      "In der letzten Stunde wurden ungewöhnlich viele E-Mails mit Unterlagen versendet. Bitte später erneut versuchen.",
    );
  }
  return null;
}
