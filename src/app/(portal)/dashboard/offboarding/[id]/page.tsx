import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OffboardingDetailContent } from "./offboarding-detail-content";

export default async function OffboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  return <OffboardingDetailContent offboardingId={id} user={session} />;
}
