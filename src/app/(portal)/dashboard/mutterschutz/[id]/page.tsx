import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MutterschutzDetailContent } from "./mutterschutz-detail-content";

export default async function MutterschutzDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  return <MutterschutzDetailContent prozessId={id} user={session} />;
}
