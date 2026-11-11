"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateTime } from "@/lib/dates";
import { USERNAME_HINT } from "@/lib/username";
import { completeAccessLinkAction, inspectAccessLinkAction } from "./actions";

type LinkState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | {
      kind: "ready";
      token: string;
      purpose: "INVITE" | "RESET";
      name: string;
      username: string | null;
      expiresAt: string;
    };

const INVALID_TEXT =
  "Ce lien n'est plus valable : il a déjà servi, il a expiré ou il a été remplacé par un plus récent. Demandez-en un nouveau au DLUS.";

/**
 * Reads the token from the fragment and removes it from the address bar and
 * history before anything else, then shows the identifier (or asks for one)
 * and the new password. On success, goes to /connexion.
 */
export function AccessLinkForm() {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<LinkState>({ kind: "loading" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    inspectAccessLinkAction({ token })
      .then((result) => {
        if (result.ok && result.data.ok) {
          setState({ kind: "ready", token, ...result.data });
        } else {
          setState({ kind: "invalid" });
        }
      })
      .catch(() => {
        setState({ kind: "invalid" });
      });
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <Spinner />
        <p className="text-body text-ink-2">Vérification du lien…</p>
        <noscript>
          <p className="text-body text-ink">Activez JavaScript pour utiliser ce lien.</p>
        </noscript>
      </div>
    );
  }

  if (state.kind === "invalid") {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="alert"
          data-testid="access-invalid"
          className="rounded-inner bg-danger-soft px-4 py-3 text-body font-medium text-danger-ink"
        >
          {INVALID_TEXT}
        </p>
        <Link href="/connexion" className="text-center text-body text-ink underline">
          Aller à la page de connexion
        </Link>
      </div>
    );
  }

  const invite = state.purpose === "INVITE";
  return (
    <form
      className="flex flex-col gap-4"
      aria-label={invite ? "Activer mon accès" : "Choisir un nouveau mot de passe"}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await completeAccessLinkAction({
            token: state.token,
            username: state.username === null ? username : undefined,
            password,
            confirmation,
          });
          if (result.ok) {
            router.replace("/connexion?acces=ok");
            return;
          }
          if (result.code === "INVALID_LINK") {
            setState({ kind: "invalid" });
            return;
          }
          setError(result.error);
        });
      }}
    >
      <p className="text-body text-ink-2">
        Bonjour {state.name}.{" "}
        {invite
          ? "Choisissez vos identifiants pour vous connecter à Binivol."
          : "Choisissez un nouveau mot de passe."}{" "}
        Ce lien ne sert qu'une fois ; il expire le{" "}
        <span className="font-mono text-mono">{formatDateTime(state.expiresAt)}</span>.
      </p>
      {state.username === null ? (
        <Field label="Identifiant" hint={USERNAME_HINT} required>
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
      ) : (
        <div>
          <p className="text-small font-medium text-ink">Identifiant</p>
          <p className="font-mono text-mono text-ink" data-testid="access-username">
            {state.username}
          </p>
          {/* Lets password managers save the pair. */}
          <input type="hidden" name="username" autoComplete="username" value={state.username} />
        </div>
      )}
      <Field
        label="Nouveau mot de passe"
        hint="Au moins 12 caractères. Une phrase de plusieurs mots est idéale."
        required
      >
        <Input
          name="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      </Field>
      <Field label="Confirmer le mot de passe" required>
        <Input
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => {
            setConfirmation(e.target.value);
          }}
        />
      </Field>
      {error && (
        <p role="alert" className="text-small font-medium text-danger-ink">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {invite ? "Activer mon accès" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}
