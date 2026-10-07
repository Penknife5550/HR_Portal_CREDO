/**
 * Detailseite Vertragsende — entscheidet zwischen alter und neuer Ansicht
 * (UX-Umbau, Pilot, Feinplan 3.8, docs/module/ux-ui/pilot-feinplan.md).
 *
 * - Die Wahl steht in einem Cookie (`ansicht-vertragsende`, Entscheidung F1):
 *   je Geraet und Browser, kein Schema-Delta, nichts am Benutzerkonto. Name
 *   und Lesen nur ueber `src/lib/ansicht.ts`.
 * - Gelesen wird HIER, auf dem Server: Die Seite liefert genau EINE Ansicht
 *   aus — nichts springt nach dem Laden um, und die andere wird gar nicht erst
 *   geladen.
 * - Vorgabe ist die ALTE Ansicht. Nur der Wert „neu" schaltet um; fehlt der
 *   Cookie oder ist er leer oder unbekannt, bleibt alles wie vor dem Pilot
 *   (bis auf die Zeile des Schalters).
 * - Das Bearbeitungsrecht rechnet die Seite auf dem Server (`HR_EDIT_ROLES`):
 *   `permissions.ts` zieht Prisma mit und darf nicht in Client-Code. Die
 *   Routen pruefen es ohnehin selbst; die Ansicht blendet nur aus.
 * - `?tab=` liest die neue Ansicht selbst aus der Adresse des Browsers
 *   (`useSearchParams` + `reiterAusSuche`), nicht die Seite: Eine Angabe von
 *   hier kennte nur die Adresse des Server-Aufrufs und zeigte nach einem
 *   Reiterwechsel und Zurueck/Vor den alten Reiter.
 * - Deshalb steht die neue Ansicht in einer `<Suspense>`-Grenze — die Regel
 *   von Next.js fuer `useSearchParams` in Client-Komponenten: Ohne sie bricht
 *   `next build` ab, sobald die Route einmal vorgerendert wird. Heute ist sie
 *   dynamisch (Sitzung und Cookie); die Grenze sichert nur ab und kostet
 *   nichts. Der Ersatzinhalt ist leer: Die Ansicht zeigt beim Laden ihr
 *   eigenes Skelett.
 *
 * Die alte Ansicht liegt unveraendert unter `src/app/(portal)/dashboard/` und
 * entfaellt nach dem Pilot zusammen mit Schalter und Cookie in einem Commit.
 */
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { ANSICHT_VERTRAGSENDE_COOKIE, ansichtAusCookie } from "@/lib/ansicht";
import { ContractEndDetailContent } from "@/app/(portal)/dashboard/contract-end/[id]/contract-end-detail-content";
import { AnsichtSchalter } from "./ansicht-schalter";
import { VertragsendeDetailAnsicht } from "./detail";

export default async function VertragsendeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const ansicht = ansichtAusCookie((await cookies()).get(ANSICHT_VERTRAGSENDE_COOKIE)?.value);

  if (ansicht === "neu") {
    const darfBearbeiten = HR_EDIT_ROLES.includes(session.role);
    // Volle Hoehe und Seitengrund um Schalter UND Ansicht zusammen — truege
    // die Ansicht `min-h-screen` selbst, waere die Seite um die Zeile des
    // Schalters hoeher als der Bildschirm.
    return (
      <div className="min-h-screen bg-surface">
        <AnsichtSchalter ansicht="neu" />
        <Suspense fallback={null}>
          <VertragsendeDetailAnsicht vorgangId={id} darfBearbeiten={darfBearbeiten} />
        </Suspense>
      </div>
    );
  }

  return (
    <>
      <AnsichtSchalter ansicht="alt" />
      <ContractEndDetailContent contractEndId={id} user={session} />
    </>
  );
}
