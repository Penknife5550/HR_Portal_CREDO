import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CivilServiceDetailContent } from "./civil-service-detail-content";

export default async function CivilServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  return <CivilServiceDetailContent processId={id} user={session} />;
}
