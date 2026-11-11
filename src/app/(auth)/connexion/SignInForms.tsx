"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { demoSignInAction, passwordSignInAction } from "./actions";
import type { DemoAccount } from "@/server/auth/demo";

/** Identifier + password form (ADR-070). The password field is emptied after a refusal. */
export function PasswordSignInForm() {
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await passwordSignInAction({ username, password });
          // On success the action redirects; a result means a refusal.
          if (!result.ok) {
            setError(result.error);
            setPassword("");
          }
        });
      }}
    >
      <Field label="Identifiant" required>
        <Input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
          }}
        />
      </Field>
      <Field label="Mot de passe" required>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      </Field>
      {error && (
        <p
          role="alert"
          data-testid="signin-error"
          className="rounded-inner bg-danger-soft px-4 py-3 text-body font-medium text-danger-ink"
        >
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Se connecter
      </Button>
    </form>
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
