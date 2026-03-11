import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DashboardContent } from "./dashboard-content";

/**
 * HR-Dashboard (Server Component)
 * Prueft die Session und leitet zum Login um wenn nicht angemeldet.
 */
export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <DashboardContent user={session} />;
}
