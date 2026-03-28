import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PortalHeader } from "@/components/portal-header";
import { DashboardContent } from "./dashboard-content";
import { OffboardingDashboardContent } from "./offboarding-dashboard-new";

/**
 * HR-Dashboard (Server Component)
 * Prueft die Session und leitet zum Login um wenn nicht angemeldet.
 * Unterstuetzt Tab-Umschaltung zwischen Onboarding und Offboarding via Query Parameter.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { tab } = await searchParams;
  const activeTab = tab === "offboarding" ? "offboarding" : "onboarding";

  return (
    <div>
      {/* Portal Header */}
      <PortalHeader user={session} />

      {/* Tab Navigation */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4">
          <nav className="-mb-px flex gap-1">
            <Link
              href="/dashboard?tab=onboarding"
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "onboarding"
                  ? "border-credo-gruen text-credo-gruen"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              Onboarding
            </Link>
            <Link
              href="/dashboard?tab=offboarding"
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "offboarding"
                  ? "border-credo-gruen text-credo-gruen"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              Offboarding
            </Link>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "onboarding" ? (
        <DashboardContent user={session} />
      ) : (
        <OffboardingDashboardContent user={session} />
      )}
    </div>
  );
}
