import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ContractEndDetailContent } from "./contract-end-detail-content";

export default async function ContractEndDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  return <ContractEndDetailContent contractEndId={id} user={session} />;
}
