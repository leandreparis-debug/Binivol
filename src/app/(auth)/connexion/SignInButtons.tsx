"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { demoSignInAction, googleSignInAction } from "./actions";
import type { DemoAccount } from "@/server/auth/demo";

/** « Continuer avec Google », shown disabled when Google is not configured. */
export function GoogleButton({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={!enabled}
      loading={pending}
      onClick={() => {
        startTransition(async () => {
          await googleSignInAction({});
        });
      }}
    >
      Continuer avec Google
    </Button>
  );
}

/** Demo accounts list (development and e2e tests only). */
export function DemoAccounts({ accounts }: { accounts: DemoAccount[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2" aria-label="Comptes de démonstration">
        {accounts.map((account) => (
          <li key={account.email}>
            <Button
              variant="outline"
              className="h-auto min-h-11 w-full flex-wrap justify-between gap-x-3 gap-y-0.5 rounded-inner py-2 text-left whitespace-normal"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await demoSignInAction({ email: account.email });
                  if (!result.ok) setError("Ce compte de démonstration ne peut pas se connecter.");
                });
              }}
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{account.name}</span>
                <span className="text-small font-normal break-all text-muted">{account.email}</span>
              </span>
              <span className="text-small font-normal text-muted">
                {account.profiles.join(" · ").replaceAll("_", " ")}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-small font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
