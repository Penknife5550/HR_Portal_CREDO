import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DetailContent } from "./detail-content";

export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  return <DetailContent onboardingId={id} user={session} />;
}
