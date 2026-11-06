"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

export interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for every page. Shows a French message and the error digest
 * (an opaque reference), never the technical stack.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-gutter py-12 text-center">
      <Logo size={28} />
      <div
        className="rounded-card bg-surface px-6 py-10 sm:px-12"
        role="alert"
        data-testid="error-boundary"
      >
        <h1 className="text-title text-ink">Une erreur est survenue</h1>
        <p className="mt-2 max-w-md text-body text-muted">
          Quelque chose s'est mal passé. Vous pouvez réessayer, ou revenir plus tard si le problème
          persiste.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-mono text-muted">Référence : {error.digest}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Réessayer</Button>
          <Button asChild variant="outline">
            <Link href="/">Retour à l'accueil</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
