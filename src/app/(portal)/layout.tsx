/**
 * Portal-Layout: der Rahmen aller Seiten hinter der Anmeldung (UX-Umbau U1).
 *
 * - Der Kopf (`PortalKopf`) haengt EINMAL hier; keine Seite bindet ihn ein.
 * - `#inhalt` ist das Ziel des Sprunglinks „Zum Inhalt springen" und der
 *   Bereich, in dem `globals.css` die Hoehe des Kopfs von `min-h-screen`
 *   abzieht (`.portal-inhalt`).
 * - Der ToastAnbieter zeichnet die Meldungen aus `toast.ok(…)`/`toast.fehler(…)`
 *   (src/components/ui/toast.tsx) — genau einmal, hier.
 *
 * Die Anmeldeseite liegt bewusst NICHT in dieser Gruppe
 * (`src/app/(anmeldung)/login/`): Ein Layout zeichnet Next.js beim Wechsel
 * zwischen seinen Seiten nicht neu — laege `/login` hier, fehlte der Kopf nach
 * dem Anmelden bis zum Neuladen.
 *
 * Ohne Sitzung zeichnet das Layout keinen Kopf; die Seiten leiten dann selbst
 * zur Anmeldung.
 */
import { getSession } from "@/lib/auth";
import { PortalKopf } from "@/components/rahmen/portal-kopf";
import { ToastAnbieter } from "@/components/ui/toast";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <>
      {session && (
        <PortalKopf user={{ firstName: session.firstName, lastName: session.lastName, role: session.role }} />
      )}
      <div id="inhalt" tabIndex={-1} className="portal-inhalt outline-none">
        {children}
      </div>
      <ToastAnbieter />
    </>
  );
}
