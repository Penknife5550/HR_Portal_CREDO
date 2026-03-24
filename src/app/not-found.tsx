import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-muted-foreground/30">404</h1>
        <h2 className="mb-2 text-2xl font-semibold text-foreground">
          Seite nicht gefunden
        </h2>
        <p className="mb-8 text-muted-foreground">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          href="/"
          className="inline-flex items-center rounded-lg bg-primary px-6 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}
