import Link from "next/link";
import { BinivolLogo } from "@/components/brand/BinivolLogo";

/**
 * Minimal layout for the public candidate flow (phone first): centered logo,
 * no navigation, no user.
 */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex justify-center px-gutter py-5">
        <BinivolLogo size={28} />
      </header>
      <main id="contenu" className="mx-auto w-full max-w-lg flex-1 px-gutter pb-10">
        {children}
      </main>
      <footer className="flex flex-col items-center gap-1 px-gutter py-6 text-center text-small text-muted">
        <span>Croix-Rouge française · Unité locale de Versailles</span>
        <Link
          href="/confidentialite"
          className="inline-flex min-h-11 items-center text-ink-2 underline underline-offset-4 focus-ring"
        >
          Confidentialité et données personnelles
        </Link>
      </footer>
    </div>
  );
}
