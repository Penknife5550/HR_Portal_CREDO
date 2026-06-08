import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BemDetailContent } from "./bem-detail-content";

export default async function BemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  return <BemDetailContent bemFallId={id} user={session} />;
}
