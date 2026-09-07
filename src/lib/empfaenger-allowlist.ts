/**
 * Die gepflegte Freigabeliste aus der Datenbank — die SERVER-Seite der
 * Empfaengerfreigabe.
 *
 * Hier steht nur noch `ladeErlaubteDomains`, der einzige Teil, der prisma
 * braucht. Die REGEL selbst (domainVon, normalisiereDomains,
 * empfaengerFreigegeben, MAX_ERLAUBTE_DOMAINS) liegt importfrei in
 * src/lib/empfaenger-freigabe.ts, damit der Versand-Dialog ("use client") sie
 * benutzen kann, ohne den Prisma-Client ins Browser-Bundle zu ziehen — sie
 * stand sonst doppelt im Repo und waere beim naechsten Mal nur an einer der
 * beiden Stellen geaendert worden.
 *
 * Der Re-Export haelt die bestehenden Server-Importe (`@/lib/empfaenger-allowlist`
 * in dokumentenpaket.ts und in der SMTP-Einstellungsroute) unveraendert
 * lauffaehig. Neuer Code darf ebenso gut direkt aus empfaenger-freigabe
 * importieren; wer im Browser ist, MUSS das tun.
 *
 * Warum die Regel ueberhaupt existiert und warum eine leere Liste nichts
 * einschraenkt, steht am Kopf von empfaenger-freigabe.ts.
 */
import { prisma } from "@/lib/db";
import { normalisiereDomains } from "@/lib/empfaenger-freigabe";

export {
  MAX_ERLAUBTE_DOMAINS,
  domainVon,
  normalisiereDomains,
  empfaengerFreigegeben,
} from "@/lib/empfaenger-freigabe";

/**
 * Die gepflegte Liste aus der SMTP-Konfiguration.
 *
 * Sie steht dort, weil das Portal keinen generischen Einstellungs-Speicher hat
 * und die SMTP-Seite bereits SUPER_ADMIN und HR_LEITUNG vorbehalten ist — also
 * genau eine Stufe ueber den HR_EDIT_ROLES, die versenden duerfen. Wer
 * versendet, kann die Schranke damit nicht selbst entfernen.
 *
 * Erneut normalisiert, weil der Wert auch von Hand direkt in der Datenbank
 * stehen koennte — die Pruefung darf sich nicht darauf verlassen, dass nur die
 * Einstellungs-Route schreibt.
 *
 * Fehlt die Singleton-Zeile (frische Installation), gibt es keine Liste und
 * damit keine Einschraenkung. Das ist derselbe Auslieferungszustand wie eine
 * leere Liste.
 *
 * Bewusst NICHT geprueft wird hier `leerTrotzEingabe` — also der Fall, dass in
 * der Spalte etwas steht, aber keine Domain daraus wird. Diesen Fall faengt die
 * Einstellungs-Route beim Speichern ab (400); haette ihn jemand von Hand direkt
 * in die Datenbank geschrieben, bliebe hier nur die Wahl zwischen "keine
 * Einschraenkung" und "gar kein Versand mehr" — und ein Lesevorgang, der den
 * Versand fuer alle 16 Mandanten stilllegt, waere die schlechtere Antwort auf
 * einen Konfigurationsfehler.
 */
export async function ladeErlaubteDomains(): Promise<string[]> {
  const config = await prisma.smtpConfig.findUnique({
    where: { id: "default" },
    select: { allowedRecipientDomains: true },
  });
  return normalisiereDomains(config?.allowedRecipientDomains ?? "").domains;
}
