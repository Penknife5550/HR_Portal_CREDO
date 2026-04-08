import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ElternzeitDetailContent } from "./elternzeit-detail-content";

export default async function ElternzeitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  return <ElternzeitDetailContent prozessId={id} user={session} />;
}
