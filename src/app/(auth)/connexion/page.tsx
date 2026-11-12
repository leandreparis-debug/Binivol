import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FlaskConical, Lock } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Chip } from "@/components/ui/Chip";
import { getEnv, isDemoLoginEnabled } from "@/lib/env";
import { getActor } from "@/server/auth/actor";
import { listDemoAccounts } from "@/server/auth/demo";
import { signInErrorMessage } from "@/server/auth/signIn";
import { getDb } from "@/server/db";
import { DemoAccounts, PasswordSignInForm } from "./SignInForms";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Sign-in page: identifier + password (ADR-070), plus the demo accounts when enabled. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; acces?: string | string[] }>;
}) {
  if (await getActor()) redirect("/");
  const env = getEnv();
  const params = await searchParams;
  const message = signInErrorMessage(first(params.error));
  const passwordSet = first(params.acces) === "ok";
  const demo = isDemoLoginEnabled(env);
  const demoAccounts = demo ? await listDemoAccounts(getDb()) : [];

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

      {passwordSet && !message && (
        <p
          role="status"
          data-testid="signin-notice"
          className="mt-6 rounded-inner bg-ok-soft px-4 py-3 text-body font-medium text-ok-ink"
        >
          Mot de passe enregistré. Connectez-vous avec votre identifiant.
        </p>
      )}

      <div className="mt-6">
        <PasswordSignInForm />
      </div>
      <p className="mt-3 text-center text-small text-muted">
        Mot de passe oublié ? Demandez un nouveau lien au DLUS.
      </p>

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
