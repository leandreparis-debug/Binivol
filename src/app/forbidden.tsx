import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { BinivolLogo } from "@/components/brand/BinivolLogo";
import { Button } from "@/components/ui/Button";

/** 403: shown by `forbidden()` when the policy refuses a page. */
export default function Forbidden() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-gutter py-12 text-center">
      <BinivolLogo size={32} />
      <div className="flex flex-col items-center rounded-card bg-surface px-6 py-10 sm:px-12">
        <span
          aria-hidden="true"
          className="inline-flex size-12 items-center justify-center rounded-pill bg-veil text-muted [&>svg]:size-6"
        >
          <ShieldOff />
        </span>
        <p className="mt-4 font-mono text-mono text-muted">Erreur 403</p>
        <h1 className="mt-2 text-title text-ink">Vous n'avez pas accès à cette page</h1>
        <p className="mt-2 max-w-md text-body text-muted">
          Vos profils ne permettent pas d'afficher cette page. Si vous pensez que c'est une erreur,
          contactez le DLUS.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Retour à l'accueil</Link>
        </Button>
      </div>
    </div>
  );
}
