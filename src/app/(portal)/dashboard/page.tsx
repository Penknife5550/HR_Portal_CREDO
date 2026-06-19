import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PortalHeader } from "@/components/portal-header";
import { DashboardContent } from "./dashboard-content";
import { OffboardingDashboardContent } from "./offboarding-dashboard-new";
import { ContractEndDashboardContent } from "./contract-end-dashboard-new";
import { CivilServiceDashboardContent } from "./civil-service-dashboard";
import { MutterschutzDashboardContent } from "./mutterschutz-dashboard";
import { ElternzeitDashboardContent } from "./elternzeit-dashboard";

/**
 * HR-Dashboard (Server Component)
 * Prueft die Session und leitet zum Login um wenn nicht angemeldet.
 * Unterstuetzt Tab-Umschaltung zwischen Onboarding, Offboarding, Verbeamtung,
 * Mutterschutz und Elternzeit via Query Parameter.
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
  const activeTab =
    tab === "offboarding"
      ? "offboarding"
      : tab === "contract-end"
        ? "contract-end"
        : tab === "civil-service"
          ? "civil-service"
          : tab === "mutterschutz"
            ? "mutterschutz"
            : tab === "elternzeit"
              ? "elternzeit"
              : "onboarding";

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
            <Link
              href="/dashboard?tab=contract-end"
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "contract-end"
                  ? "border-credo-gruen text-credo-gruen"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              Vertragsende
            </Link>
            <Link
              href="/dashboard?tab=civil-service"
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "civil-service"
                  ? "border-credo-gruen text-credo-gruen"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              Verbeamtung
            </Link>
            <Link
              href="/dashboard?tab=mutterschutz"
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "mutterschutz"
                  ? "border-credo-gruen text-credo-gruen"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              Mutterschutz
            </Link>
            <Link
              href="/dashboard?tab=elternzeit"
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "elternzeit"
                  ? "border-credo-gruen text-credo-gruen"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              Elternzeit
            </Link>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "onboarding" ? (
        <DashboardContent user={session} />
      ) : activeTab === "offboarding" ? (
        <OffboardingDashboardContent user={session} />
      ) : activeTab === "contract-end" ? (
        <ContractEndDashboardContent user={session} />
      ) : activeTab === "civil-service" ? (
        <CivilServiceDashboardContent user={session} />
      ) : activeTab === "mutterschutz" ? (
        <MutterschutzDashboardContent user={session} />
      ) : (
        <ElternzeitDashboardContent user={session} />
      )}
    </div>
  );
}
