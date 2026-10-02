/**
 * Duenne Seiten-Datei (UX-Umbau U1): Die Adresse ist neu, der Inhalt liegt
 * weiter unter `src/app/(portal)/dashboard/` und zieht erst mit dem Umbau des
 * Moduls um (U4) — siehe docs/module/ux-ui/u1-feinplan.md, 3.2.
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { MutterschutzDetailContent } from "@/app/(portal)/dashboard/mutterschutz/[id]/mutterschutz-detail-content";

export default async function MutterschutzDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  return <MutterschutzDetailContent prozessId={id} user={session} />;
}
