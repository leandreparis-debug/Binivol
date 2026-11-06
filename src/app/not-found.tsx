import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-gutter py-12 text-center">
      <Logo size={28} />
      <div className="rounded-card bg-surface px-6 py-10 sm:px-12">
        <p className="font-mono text-mono text-muted">Erreur 404</p>
        <h1 className="mt-2 text-title text-ink">Page introuvable</h1>
        <p className="mt-2 max-w-md text-body text-muted">
          L'adresse demandée n'existe pas ou a été déplacée.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Retour à l'accueil</Link>
        </Button>
      </div>
    </div>
  );
}
