import Image from "next/image";
import Link from "next/link";
import { CredoLinie } from "@/components/credo-linie";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
        {/* Header mit CREDO Logo */}
        <div className="space-y-6 p-8 text-center">
          <div className="mx-auto">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO - Freie Evangelische Schulen Minden"
              width={240}
              height={80}
              className="mx-auto"
              priority
            />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground">HR-Portal</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Digitaler Personalfragebogen &amp; Einstellungsmanagement
            </p>
          </div>
        </div>

        {/* Login Button */}
        <div className="space-y-4 px-8 pb-8">
          <Link
            href="/login"
            className="block w-full rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            HR-Login
          </Link>
        </div>

        {/* CREDO-Linie am unteren Rand */}
        <CredoLinie />
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
        &middot; Powered by helex.it
      </p>
    </div>
  );
}
