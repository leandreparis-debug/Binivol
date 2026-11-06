import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FlaskConical, Lock } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Chip } from "@/components/ui/Chip";
import { getEnv, isDemoLoginEnabled, isGoogleConfigured } from "@/lib/env";
import { getActor } from "@/server/auth/actor";
import { listDemoAccounts } from "@/server/auth/demo";
import { signInErrorMessage } from "@/server/auth/signIn";
import { getDb } from "@/server/db";
import { DemoAccounts, GoogleButton } from "./SignInButtons";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

/** Sign-in page: Google (@croix-rouge.fr), plus the demo accounts when enabled. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (await getActor()) redirect("/");
  const env = getEnv();
  const { error } = await searchParams;
  const message = signInErrorMessage(
    Array.isArray(error) ? error[0] : error,
    env.AUTH_ALLOWED_DOMAIN,
  );
  const demo = isDemoLoginEnabled(env);
  const demoAccounts = demo ? await listDemoAccounts(getDb()) : [];
  const google = isGoogleConfigured(env);

  return (
    <div className="w-full max-w-md rounded-card bg-surface p-6 sm:p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={34} />
        <h1 className="text-title text-ink">Connexion</h1>
        <p className="text-body text-muted">
          Espace réservé aux responsables de l'unité locale de Versailles.
        </p>
      </div>

      {message && (
        <p
          role="alert"
          data-testid="signin-error"
          className="mt-6 rounded-inner bg-danger-soft px-4 py-3 text-body font-medium text-danger-ink"
        >
          {message}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <GoogleButton enabled={google} />
        {!google && (
          <p className="text-center text-small text-muted">
            La connexion Google n'est pas configurée sur cet environnement.
          </p>
        )}
      </div>

      {demo && (
        <section
          aria-labelledby="demo-title"
          className="mt-6 flex flex-col gap-3 border-t border-line pt-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="demo-title" className="text-section text-ink">
              Comptes de démonstration
            </h2>
            <Chip tone="warn" icon={<FlaskConical />} data-testid="demo-banner">
              Mode démonstration
            </Chip>
          </div>
          <p className="text-small text-muted">Données fictives. Indisponible en production.</p>
          <DemoAccounts accounts={demoAccounts} />
        </section>
      )}

      <p className="mt-8 flex items-center justify-center gap-2 border-t border-line pt-4 text-small text-muted">
        <Lock aria-hidden="true" className="size-4" />
        Données confidentielles (C3)
      </p>
    </div>
  );
}
