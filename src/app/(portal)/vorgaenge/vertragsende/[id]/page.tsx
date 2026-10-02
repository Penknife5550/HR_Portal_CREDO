/**
 * Duenne Seiten-Datei (UX-Umbau U1): Die Adresse ist neu, der Inhalt liegt
 * weiter unter `src/app/(portal)/dashboard/` und zieht erst mit dem Umbau des
 * Moduls um (U4) — siehe docs/module/ux-ui/u1-feinplan.md, 3.2.
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ContractEndDetailContent } from "@/app/(portal)/dashboard/contract-end/[id]/contract-end-detail-content";

export default async function VertragsendeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  return <ContractEndDetailContent contractEndId={id} user={session} />;
}
