import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { istVorgangsModul, vorgangslistePfad, VORGANGS_MODULE, VORGANGS_MODUL_NAMEN } from "@/lib/adressen";
import { DashboardContent } from "@/app/(portal)/dashboard/dashboard-content";
import { OffboardingDashboardContent } from "@/app/(portal)/dashboard/offboarding-dashboard-new";
import { ContractEndDashboardContent } from "@/app/(portal)/dashboard/contract-end-dashboard-new";
import { CivilServiceDashboardContent } from "@/app/(portal)/dashboard/civil-service-dashboard";
import { MutterschutzDashboardContent } from "@/app/(portal)/dashboard/mutterschutz-dashboard";
import { ElternzeitDashboardContent } from "@/app/(portal)/dashboard/elternzeit-dashboard";

/**
 * Vorgangsliste eines Moduls (Server Component) — `/vorgaenge/<modul>`.
 *
 * Bis U1 stand das Modul als `?tab=…` an der alten Listenadresse; die Reiter sind jetzt
 * echte Adressen (src/lib/adressen.ts). Die Listen selbst liegen unveraendert
 * unter `src/app/(portal)/dashboard/` und werden mit U3 umgebaut. Ein
 * unbekannter Modulname zeigt „Seite nicht gefunden".
 */
export default async function VorgangslistePage({ params }: { params: Promise<{ modul: string }> }) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { modul } = await params;
  if (!istVorgangsModul(modul)) notFound();

  return (
    <div>

      {/* Die Listen tragen nur Zwischenueberschriften; bis U3 sie umbaut, gibt
          diese (unsichtbare) Hauptueberschrift der Seite ihren Namen. */}
      <h1 className="sr-only">Vorgänge: {VORGANGS_MODUL_NAMEN[modul]}</h1>

      {/* Reiter der Module — am Handy waagerecht rollend statt umbrechend */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4">
          <nav aria-label="Module" className="-mb-px flex gap-1 overflow-x-auto">
            {VORGANGS_MODULE.map((m) => (
              <Link
                key={m}
                href={vorgangslistePfad(m)}
                aria-current={m === modul ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  m === modul
                    ? "border-credo-gruen text-credo-gruen"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {VORGANGS_MODUL_NAMEN[m]}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {modul === "onboarding" ? (
        <DashboardContent user={session} />
      ) : modul === "offboarding" ? (
        <OffboardingDashboardContent user={session} />
      ) : modul === "vertragsende" ? (
        <ContractEndDashboardContent user={session} />
      ) : modul === "verbeamtung" ? (
        <CivilServiceDashboardContent user={session} />
      ) : modul === "mutterschutz" ? (
        <MutterschutzDashboardContent user={session} />
      ) : (
        <ElternzeitDashboardContent user={session} />
      )}
    </div>
  );
}
